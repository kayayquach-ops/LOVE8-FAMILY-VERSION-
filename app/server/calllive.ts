// Mây Live (thử, 21/11/2026): cuộc gọi tuần nói thẳng với Gemini Live như "gọi Nếp", thay cho kịch bản soạn trước và giọng đọc từng câu.
// Máy chủ chỉ làm ba việc: phát token dùng một lần (POST /call/live, lời dặn và giọng khoá sẵn trong token, hết hạn theo trần cuộc gọi),
// giữ trần tiền (công tắc MAY_LIVE, công tắc thử members.may_live của từng người, trần phút cả máy chủ mỗi ngày, trần mỗi cuộc gọi),
// và ghi giây, token, tiền khi máy khách báo xong (POST /call/:id/live-end). Máy khách nối thẳng tới Google (src/CallLive.tsx).
// Người chưa bật thử không bao giờ tới đây: đường cũ (/call/start, Call.tsx) giữ nguyên. Chi tiết: docs/may-moi.md mục "Mây Live (thử)".
// Kiểm bằng server/calllive.test.ts (DB giả theo LIVE_SQL, Google giả qua deps.fetch).
import express from 'express';
import type multer from 'multer';
import { randomUUID } from 'node:crypto';
import { callLines, DEFAULT_MASCOT_NAME, type CallScript } from '../src/shared.ts';
import { emptyUsage, type LiveUsage } from '../src/liveUsage.ts';
import { ADDRESS, checkinQ, context, LANG_NAME, named, type Ctx } from './call.ts';
import { loadScriptExtras } from './callfacts.ts';
import { pool } from './db.ts';
import { errorBody, tServer } from './i18n.ts';
import { Limit, limitBy } from './limit.ts';
import { liveConfig, type LiveConfig } from './liveconfig.ts';
import { DEFAULT_TZ, localParts, zonedTime } from './place.ts';
import { weekKey } from './recap.ts';

export type { LiveUsage };

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// Mỗi câu một dòng: server/members.test.ts đọc các câu add column để dựng lược đồ.
export async function migrateLive(db: Db = pool): Promise<void> {
  await db.query(`
    alter table members add column if not exists may_live boolean not null default false;
    alter table calls add column if not exists live_at timestamptz;
    alter table calls add column if not exists live_sec int;
    alter table calls add column if not exists live_usd real;
    alter table calls add column if not exists live_usage text;
  `);
}

/** Câu SQL của Mây Live, xuất ra để DB giả trong test khớp đúng từng câu. */
export const LIVE_SQL = {
  member: 'select may_live from members where id = $1',
  // Giây Live đã dùng hôm nay (cả máy chủ): cuộc gọi chưa báo về tính đủ trần một cuộc ($2).
  usedToday: 'select coalesce(sum(coalesce(live_sec, $2)), 0)::int as sec from calls where live_at >= $1',
  insert: 'insert into calls (id, family_id, member_id, week, script, shared, trial, live_at) values ($1,$2,$3,$4,$5,false,$6,$7)',
  endRow: 'select live_at from calls where id = $1 and member_id = $2 and live_at is not null and live_sec is null',
  end: 'update calls set live_sec = $3, live_usd = $4, live_usage = $5 where id = $1 and member_id = $2 and live_sec is null',
};

/** Token sống thêm chừng này giây sau trần cuộc gọi; giây báo về cũng không vượt cửa sổ này. */
export const TOKEN_GRACE_SEC = 30;
const TOKEN_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';

// USD mỗi triệu token của model Live, theo bảng giá Google lần đọc gần nhất (chép từ gọi Nếp): giá đổi thì đặt LIVE_USD_*.
export const LIVE_PRICE = {
  inText: Number(process.env.LIVE_USD_IN_TEXT) || 0.75, inAudio: Number(process.env.LIVE_USD_IN_AUDIO) || 3,
  outText: Number(process.env.LIVE_USD_OUT_TEXT) || 4.5, outAudio: Number(process.env.LIVE_USD_OUT_AUDIO) || 12,
};
const USAGE_KEYS = Object.keys(emptyUsage()) as Array<keyof LiveUsage>;

/** Token máy khách cộng (src/liveUsage.ts): chỉ số nguyên dương, mỗi số có trần; không có prompt lẫn response thì null. */
export function cleanUsage(u: unknown): LiveUsage | null {
  if (!u || typeof u !== 'object') return null;
  const t = emptyUsage();
  for (const k of USAGE_KEYS) { const v = Math.round(Number((u as Record<string, unknown>)[k])); t[k] = Number.isFinite(v) && v > 0 ? Math.min(v, 5e7) : 0; }
  return t.prompt || t.response ? t : null;
}

/** Tiền một cuộc gọi. Token Live không tách theo loại thì tính là chữ lúc vào, tiếng lúc ra; thoughts tính như chữ ra. */
export const callUsd = (t: LiveUsage): number => (t.inText * LIVE_PRICE.inText + t.inAudio * LIVE_PRICE.inAudio + Math.max(0, t.prompt + t.tool - t.inText - t.inAudio) * LIVE_PRICE.inText
  + (t.outText + t.thoughts) * LIVE_PRICE.outText + (t.outAudio + Math.max(0, t.response - t.outText - t.outAudio)) * LIVE_PRICE.outAudio) / 1e6;

/** 0:00 hôm nay giờ Việt Nam: trần phút mỗi ngày tính từ đây. */
export function dayStartVN(now: Date): Date {
  return zonedTime(DEFAULT_TZ, localParts(DEFAULT_TZ, now).date, 0);
}

/** Thân yêu cầu auth_tokens (như gọi Nếp): dùng một lần, hết hạn theo trần cuộc gọi cộng TOKEN_GRACE_SEC, phải mở phiên trong 60 giây;
 *  model, giọng, lời dặn, VAD, cuộn ngữ cảnh khoá sẵn trong token nên máy khách không đổi được. */
export function tokenRequest(cfg: LiveConfig, setup: { brief: string; tools?: unknown[] }, now: Date, maxSec: number): Record<string, unknown> {
  const t = now.getTime();
  return {
    uses: 1,
    expireTime: new Date(t + (maxSec + TOKEN_GRACE_SEC) * 1000).toISOString(),
    newSessionExpireTime: new Date(t + 60_000).toISOString(),
    bidiGenerateContentSetup: {
      model: cfg.model,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } } } },
      systemInstruction: { parts: [{ text: setup.brief }] },
      ...(setup.tools?.length ? { tools: [{ functionDeclarations: setup.tools }] } : {}),
      inputAudioTranscription: {}, outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: cfg.silenceMs } },
      contextWindowCompression: { triggerTokens: cfg.ctxTrigger, slidingWindow: { targetTokens: cfg.ctxTarget } },
    },
  };
}

/** Kịch bản v3 lưu vào calls.script: ô hỏi thăm và ô lời nhắn luôn có (chuyện bắt đầu từ ô LIVE_FIRST_STORY); cuộc gọi đầu là cuộc gọi thử.
 *  scriptReusable đòi v2 nên đường cũ không bao giờ dùng lại bộ này. */
export function liveScript(c: Pick<Ctx, 'lang' | 'mascot' | 'member' | 'doneCalls'>): CallScript {
  const relay = callLines(c.member.role, (k, v) => tServer(c.lang, k, v)).relay;
  return {
    v: 3, source: 'live', greeting: '', goodbye: '', lang: c.lang, mascot: c.mascot ?? DEFAULT_MASCOT_NAME,
    questions: [checkinQ(''), { text: relay, topic: 'loi-nhan', photo: false, event: 'none' }],
    ...(c.doneCalls.length === 0 ? { trial: true } : {}),
  };
}

// i18n-ok-begin: lời dặn gửi Gemini Live (tiếng Anh), không phải chữ hiện cho người dùng.
/** Lời dặn bản thử (Task 3 thay bằng liveBrief): tên người nghe và vai điền sau named() để tên người không bị đổi theo tên linh vật. */
export function spikeBrief(c: Pick<Ctx, 'lang' | 'mascot' | 'member'>): string {
  return named(`Mây is the Sweet Home mascot on a live phone call with {name} (role {role}).
${ADDRESS[c.lang]}
Talk like a real family member on the phone: one to three short sentences per turn, warm and natural, no filler, never like an assistant. Greet them by name, ask how they are today, then chat about whatever they bring up. Never say you are an AI.
Reply in ${LANG_NAME[c.lang]}.`, c.mascot ?? DEFAULT_MASCOT_NAME).replace('{name}', () => c.member.name).replace('{role}', () => c.member.role);
}
// i18n-ok-end

export type LiveDeps = { db: Db; fetch: typeof fetch; now: () => Date; env: NodeJS.ProcessEnv; ctx: (m: { id: string; family_id: string }) => Promise<Ctx> };
const DEPS: LiveDeps = {
  db: pool,
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
  env: process.env,
  ctx: async (m) => {
    const c = await context(m.id, m.family_id);
    c.extras = await loadScriptExtras(m, c.lang).catch(() => undefined);
    return c;
  },
};

type Fn = (req: any, res: express.Response, next: express.NextFunction) => Promise<unknown>;
const h = (fn: Fn) => (req: any, res: express.Response, next: express.NextFunction) =>
  fn(req, res, next).catch((err: Error) => {
    console.error(err);
    res.status(500).json(errorBody('server'));
  });

// Mỗi người 10 lần xin token mỗi giờ (bấm Nghe máy liên tục cũng không đốt được phút).
const limitLive = limitBy({ name: 'call-live', per: new Limit(10, 3600e3), key: (req) => (req as express.Request & { member: { id: string } }).member.id, code: 'live_cap' });

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

/** Gắn sau auth. upload để dành cho các bước sau (gửi lượt kể của cuộc gọi Live). */
export function makeLiveRouter(upload: multer.Multer, deps: LiveDeps = DEPS): express.Router {
  void upload;
  const r = express.Router();

  // Nhấc máy: công tắc máy chủ, công tắc thử của người này, rồi mới tính lượt (người chưa bật không tốn lượt), trần phút, xin token.
  r.post('/call/live', h(async (req, res, next) => {
    if (!liveConfig(deps.env).on) return res.status(503).json(errorBody('live_off'));
    const { rows: [m] } = await deps.db.query(LIVE_SQL.member, [req.member.id]);
    if (m?.may_live !== true) return res.status(403).json(errorBody('live_not_enabled'));
    next();
  }), limitLive, h(async (req, res) => {
    const cfg = liveConfig(deps.env);
    const member = req.member as { id: string; family_id: string };
    const now = deps.now();
    const { rows: [u] } = await deps.db.query(LIVE_SQL.usedToday, [dayStartVN(now), cfg.callMaxSec]);
    const left = cfg.dailyMin * 60 - Number(u?.sec ?? 0);
    if (left < 60) return res.status(429).json(errorBody('live_cap'));
    const maxSec = Math.min(cfg.callMaxSec, left);
    const c = await deps.ctx(member);
    let g: Response | null = null, why = '';
    try {
      g = await deps.fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'x-goog-api-key': String(deps.env.GEMINI_API_KEY ?? ''), 'content-type': 'application/json' },
        body: JSON.stringify(tokenRequest(cfg, { brief: spikeBrief(c) }, now, maxSec)),
      });
    } catch (e) { why = (e as Error).message; }
    const token = g?.ok ? String((await g.json().catch(() => null))?.name ?? '') : '';
    if (!token) {
      // Trả 200 mà không có name thì thân đã đọc rồi: log chỉ có "200".
      if (g) why = `${g.status} ${(await g.text().catch(() => '')).slice(0, 200)}`;
      console.warn(`[call-live] không xin được token: ${why}`);
      return res.status(502).json(errorBody('live_token'));
    }
    const id = randomUUID();
    await deps.db.query(LIVE_SQL.insert, [id, member.family_id, member.id, weekKey(now), JSON.stringify(liveScript(c)), c.doneCalls.length === 0, now]);
    res.json({ id, token, model: cfg.model, maxSec });
  }));

  // Kết thúc (máy khách gửi một lần bằng keepalive): giây không vượt cửa sổ token, mỗi cuộc gọi ghi một lần, người khác báo thì không đổi. Luôn ok.
  r.post('/call/:id/live-end', h(async (req, res) => {
    const id = String(req.params.id);
    const { rows: [row] } = await deps.db.query(LIVE_SQL.endRow, [id, req.member.id]);
    if (!row) return res.json({ ok: true });
    const b = req.body ?? {};
    const cap = Math.min(3600, Math.round((deps.now().getTime() - new Date(row.live_at).getTime()) / 1000) + TOKEN_GRACE_SEC);
    const sec = Math.max(0, Math.min(cap, Math.round(Number(b.sec) || 0)));
    const tok = cleanUsage(b.usage);
    const usd = tok ? callUsd(tok) : 0;
    await deps.db.query(LIVE_SQL.end, [id, req.member.id, sec, usd, tok ? JSON.stringify(tok) : null]);
    const lat = (Array.isArray(b.lat) ? b.lat : []).map(Number).filter((x: number) => Number.isFinite(x) && x >= 0);
    console.log(`[call-live] cuộc gọi ${id.slice(0, 8)}: ${sec} s, ${usd.toFixed(4)} USD${lat.length ? `, đáp sau trung vị ${median(lat)} ms` : ''}`);
    res.json({ ok: true });
  }));

  return r;
}
