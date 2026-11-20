// Kiểm thử Mây Live bản thử (server/calllive.ts, server/liveconfig.ts): cấu hình, token dùng một lần, tiền mỗi cuộc gọi,
// kịch bản v3, nhấc máy (công tắc, trần phút, xin token) và kết thúc (ghi giây, tiền).
// Không cần DB, không gọi mạng: DB giả theo đúng từng câu trong LIVE_SQL, Google thay bằng deps.fetch giả.
// Chạy: node --import tsx --test server/calllive.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LiveDeps } from './calllive.ts';
import type { Ctx } from './call.ts';

process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'calllive-test-'));

const L = await import('./calllive.ts');
const { liveConfig } = await import('./liveconfig.ts');
const { LIVE_FIRST_STORY } = await import('../src/shared.ts');
const { langMiddleware } = await import('./i18n.ts');
const express = (await import('express')).default;
const multer = (await import('multer')).default;

const NOW = new Date('2026-11-21T03:00:00Z');   // 10:00 giờ Việt Nam, thứ Bảy
const ENV = { GEMINI_API_KEY: 'test-key-not-real' };
const TOKEN_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
const USAGE = { n: 3, prompt: 2_000_000, response: 500_000, inText: 1_000_000, inAudio: 1_000_000, outAudio: 500_000, junk: 9 };

/** Lan, mẹ, tiếng Việt, linh vật Mây, chưa gọi xong lần nào. */
const lanCtx = (id = 'lan', o: Partial<Ctx> = {}): Ctx => ({
  lang: 'vi', member: { id, name: 'Lan', role: 'me', intro: {} }, family: [{ name: 'Lan', role: 'me' }, { name: 'An', role: 'con' }],
  events: [], asked: [], stories: [], doneCalls: [], photoCount: 0, captions: [], mascot: 'Mây', ...o,
});

type Row = Record<string, any>;
/** DB giả: đúng từng câu trong LIVE_SQL, điều kiện viết lại bằng JS. */
function fakeDb(t: { members?: Row[]; calls?: Row[] } = {}) {
  const S = L.LIVE_SQL;
  const db = {
    members: t.members ?? [], calls: t.calls ?? [],
    async query(q: string, v: any[] = []): Promise<{ rows: Row[]; rowCount: number }> {
      const out = (rows: Row[], n = rows.length) => ({ rows, rowCount: n });
      switch (q) {
        case S.member: return out(db.members.filter((m) => m.id === v[0]).map((m) => ({ may_live: m.may_live })));
        case S.usedToday:
          return out([{ sec: db.calls.filter((c) => c.live_at != null && +c.live_at >= +v[0]).reduce((s, c) => s + (c.live_sec ?? v[1]), 0) }]);
        case S.insert: {
          const [id, family_id, member_id, week, script, trial, live_at] = v;
          db.calls.push({ id, family_id, member_id, week, script, shared: false, trial, live_at, live_sec: null, live_usd: null, live_usage: null });
          return out([], 1);
        }
        case S.endRow:
          return out(db.calls.filter((c) => c.id === v[0] && c.member_id === v[1] && c.live_at != null && c.live_sec == null).map((c) => ({ live_at: c.live_at })));
        case S.end: {
          const c = db.calls.find((x) => x.id === v[0] && x.member_id === v[1] && x.live_sec == null);
          if (c) Object.assign(c, { live_sec: v[2], live_usd: v[3], live_usage: v[4] });
          return out([], c ? 1 : 0);
        }
      }
      throw new Error(`DB giả chưa biết câu này: ${q}`);
    },
  };
  return db;
}

/** Google giả: ghi lại từng lần gọi, trả token tok-1 (hay lỗi theo status). */
function fakeFetch(status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (u: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(u), init: init ?? {} });
    return status === 200
      ? new Response(JSON.stringify({ name: 'tok-1' }), { status, headers: { 'content-type': 'application/json' } })
      : new Response('boom', { status });
  }) as typeof fetch;
  return Object.assign(f, { calls });
}

/** Đủ mọi khoá của LiveDeps (Task 3 thêm khoá thì chỉ sửa ở đây). */
const deps = (o: Partial<LiveDeps> = {}): LiveDeps => ({
  db: fakeDb(), fetch: fakeFetch(), now: () => NOW, env: ENV, ctx: async (m) => lanCtx(m.id), ...o,
});

/** App express gắn makeLiveRouter(deps) sau middleware đặt req.member từ header x-member, x-family (như may.test.ts). */
async function serve(d: LiveDeps) {
  const app = express();
  app.use(express.json());
  app.use(langMiddleware);
  app.use((req: any, _res, next) => { req.member = { id: String(req.headers['x-member']), family_id: String(req.headers['x-family'] ?? 'F') }; next(); });
  app.use('/api', L.makeLiveRouter(multer(), d));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (p: string, who: string, body?: unknown) => {
    const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'x-member': who, 'x-lang': 'vi', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { post, close: () => server.close() };
}

test('cấu hình Live: mặc định, công tắc tắt, thiếu khoá, đổi bằng biến', () => {
  const c = liveConfig({ GEMINI_API_KEY: 'k' });
  assert.deepEqual(c, { on: true, model: 'models/gemini-3.8-live', voice: 'Zephyr', silenceMs: 1600, ctxTrigger: 12000, ctxTarget: 7000, callMaxSec: 900, dailyMin: 120 });
  assert.equal(liveConfig({ GEMINI_API_KEY: 'k', MAY_LIVE: 'off' }).on, false);
  assert.equal(liveConfig({ GEMINI_API_KEY: 'k', MAY_LIVE: '0' }).on, false);
  assert.equal(liveConfig({}).on, false);
  assert.equal(liveConfig({ GEMINI_API_KEY: 'k', GEMINI_VOICE: 'Leda' }).voice, 'Leda');
  assert.equal(liveConfig({ GEMINI_API_KEY: 'k', GEMINI_VOICE: 'Leda', MAY_LIVE_VOICE: 'Aoede' }).voice, 'Aoede');
  assert.equal(liveConfig({ GEMINI_API_KEY: 'k', GEMINI_LIVE_MODEL: 'x-live' }).model, 'models/x-live');
  // Thêm: các trần đổi được bằng biến; số hỏng thì về mặc định.
  const e = liveConfig({ GEMINI_API_KEY: 'k', MAY_LIVE_SILENCE_MS: '1200', MAY_LIVE_CTX_TRIGGER: '9000', MAY_LIVE_CTX_TARGET: '5000', MAY_CALL_MAX_SEC: '300', MAY_LIVE_DAILY_MIN: '30' });
  assert.deepEqual([e.silenceMs, e.ctxTrigger, e.ctxTarget, e.callMaxSec, e.dailyMin], [1200, 9000, 5000, 300, 30]);
  assert.equal(liveConfig({ GEMINI_API_KEY: 'k', MAY_CALL_MAX_SEC: 'abc' }).callMaxSec, 900);
});

test('token Live: dùng một lần, hết hạn theo trần cuộc gọi cộng 30 giây, khoá giọng, VAD, cuộn ngữ cảnh, chép lời hai chiều', () => {
  const now = new Date('2026-11-21T03:00:00Z');
  const b: any = L.tokenRequest(liveConfig({ GEMINI_API_KEY: 'k' }), { brief: 'BRIEF' }, now, 300);
  assert.equal(b.uses, 1);
  assert.equal(b.expireTime, '2026-11-21T03:05:30.000Z');
  assert.equal(b.newSessionExpireTime, '2026-11-21T03:01:00.000Z');
  const s = b.bidiGenerateContentSetup;
  assert.equal(s.model, 'models/gemini-3.8-live');
  assert.equal(s.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Zephyr');
  assert.equal(s.systemInstruction.parts[0].text, 'BRIEF');
  assert.equal(s.realtimeInputConfig.automaticActivityDetection.silenceDurationMs, 1600);
  assert.deepEqual(s.contextWindowCompression, { triggerTokens: 12000, slidingWindow: { targetTokens: 7000 } });
  assert.deepEqual([s.inputAudioTranscription, s.outputAudioTranscription], [{}, {}]);
  assert.equal(s.tools, undefined);
  // Thêm: có công cụ thì gửi trong một functionDeclarations; danh sách rỗng thì như không có.
  const fn = { name: 'f', description: 'd' };
  assert.deepEqual((L.tokenRequest(liveConfig({ GEMINI_API_KEY: 'k' }), { brief: 'B', tools: [fn] }, now, 300) as any).bidiGenerateContentSetup.tools, [{ functionDeclarations: [fn] }]);
  assert.equal((L.tokenRequest(liveConfig({ GEMINI_API_KEY: 'k' }), { brief: 'B', tools: [] }, now, 300) as any).bidiGenerateContentSetup.tools, undefined);
});

test('tiền mỗi cuộc gọi: cộng token như Nếp, số rác thì bỏ', () => {
  const t = L.cleanUsage(USAGE)!;
  assert.equal(Math.round(L.callUsd(t) * 1000) / 1000, 9.75);   // 0.75 + 3 + 0.5 * 12
  assert.equal(L.cleanUsage({ prompt: -5, response: 'x' }), null);
  assert.equal(L.cleanUsage(null), null);
  // Thêm: khoá lạ bị bỏ, khoá thiếu là 0.
  assert.equal('junk' in t, false);
  assert.equal(t.outText, 0);
});

test('kịch bản v3: ô hỏi thăm và ô lời nhắn luôn có, chuyện bắt đầu từ ô 2, cuộc gọi đầu là cuộc gọi thử', () => {
  const s = L.liveScript(lanCtx());
  assert.equal(s.v, 3);
  assert.equal(s.source, 'live');
  assert.equal(s.questions.length, 2);
  assert.equal(s.questions[0].topic, 'hoi-tham');
  assert.equal(s.questions[1].topic, 'loi-nhan');
  assert.ok(s.questions[1].text.length > 0);
  assert.equal(LIVE_FIRST_STORY, 2);
  assert.equal(LIVE_FIRST_STORY, s.questions.length);
  assert.equal(s.trial, true);
  assert.equal(s.lang, 'vi');
  assert.equal(s.mascot, 'Mây');
  assert.equal(L.liveScript(lanCtx('lan', { doneCalls: ['2026-11-14'] })).trial, undefined);
});

test('nhấc máy Live: công tắc máy chủ tắt thì 503, chưa bật thử thì 403, không xin token', async () => {
  const f = fakeFetch();
  const db = fakeDb({ members: [{ id: 'lan-off', may_live: true }, { id: 'an-off', may_live: false }] });
  const off = await serve(deps({ db, fetch: f, env: { ...ENV, MAY_LIVE: 'off' } }));
  const nokey = await serve(deps({ db, fetch: f, env: {} }));
  const on = await serve(deps({ db, fetch: f }));
  try {
    const a = await off.post('/api/call/live', 'lan-off');
    assert.equal(a.status, 503);
    assert.equal(a.body.code, 'live_off');
    assert.equal((await nokey.post('/api/call/live', 'lan-off')).status, 503);
    const b = await on.post('/api/call/live', 'an-off');
    assert.equal(b.status, 403);
    assert.equal(b.body.code, 'live_not_enabled');
    assert.equal((await on.post('/api/call/live', 'khong-co')).body.code, 'live_not_enabled');
    assert.equal(f.calls.length, 0);
    assert.equal(db.calls.length, 0);
  } finally {
    off.close(); nokey.close(); on.close();
  }
});

test('nhấc máy Live: trần phút trong ngày, cuộc gọi chưa báo về tính đủ trần, còn dưới 60 giây thì 429', async () => {
  assert.equal(L.dayStartVN(NOW).toISOString(), '2026-11-20T17:00:00.000Z');   // 0:00 ngày 21/11 giờ Việt Nam
  const at = new Date('2026-11-21T01:00:00Z');
  const f = fakeFetch();
  // Hôm nay: một cuộc 3000 giây, một cuộc chưa báo về (tính đủ 900); hôm qua 5000 giây không tính.
  const db = fakeDb({ members: [{ id: 'lan-cap', may_live: true }], calls: [
    { id: 'c1', member_id: 'x', live_at: at, live_sec: 3000 },
    { id: 'c2', member_id: 'x', live_at: at, live_sec: null },
    { id: 'c0', member_id: 'x', live_at: new Date('2026-11-20T16:59:00Z'), live_sec: 5000 },
  ] });
  const srv = await serve(deps({ db, fetch: f }));
  try {
    const r1 = await srv.post('/api/call/live', 'lan-cap');   // đã dùng 3900 trên 7200, còn 3300
    assert.equal(r1.status, 200);
    assert.equal(r1.body.maxSec, 900);
    // Cuộc vừa mở chưa báo về (900) + thêm 2100: đã dùng 6900, còn 300.
    db.calls.push({ id: 'c3', member_id: 'x', live_at: at, live_sec: 2100 });
    const r2 = await srv.post('/api/call/live', 'lan-cap');
    assert.equal(r2.status, 200);
    assert.equal(r2.body.maxSec, 300);
    assert.equal(JSON.parse(String(f.calls[1].init.body)).expireTime, '2026-11-21T03:05:30.000Z');   // now + 330 s
    db.calls = [{ id: 'c4', member_id: 'x', live_at: at, live_sec: 7150 }];   // còn 50 giây
    const r3 = await srv.post('/api/call/live', 'lan-cap');
    assert.equal(r3.status, 429);
    assert.equal(r3.body.code, 'live_cap');
    assert.equal(f.calls.length, 2);
    assert.equal(db.calls.length, 1);
  } finally {
    srv.close();
  }
});

test('nhấc máy Live: xin token đúng chỗ, tạo hàng calls chưa chia sẻ có live_at và kịch bản v3; Google lỗi thì 502 và không tạo hàng', async () => {
  const f = fakeFetch();
  const db = fakeDb({ members: [{ id: 'lan-tok', may_live: true }] });
  const srv = await serve(deps({ db, fetch: f }));
  const bad = await serve(deps({ db, fetch: fakeFetch(500) }));
  try {
    const r = await srv.post('/api/call/live', 'lan-tok');
    assert.equal(r.status, 200);
    assert.equal(r.body.token, 'tok-1');
    assert.equal(r.body.model, 'models/gemini-3.8-live');
    assert.equal(r.body.maxSec, 900);
    assert.equal(typeof r.body.id, 'string');
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, TOKEN_URL);
    assert.equal(f.calls[0].init.method, 'POST');
    assert.equal((f.calls[0].init.headers as Record<string, string>)['x-goog-api-key'], ENV.GEMINI_API_KEY);
    const sent = JSON.parse(String(f.calls[0].init.body));
    assert.equal(sent.uses, 1);
    assert.match(sent.bidiGenerateContentSetup.systemInstruction.parts[0].text, /Lan/);
    const row = db.calls.find((c) => c.id === r.body.id)!;
    assert.equal(row.shared, false);
    assert.equal(row.trial, true);
    assert.equal(+row.live_at, +NOW);
    assert.deepEqual([row.member_id, row.family_id, row.week], ['lan-tok', 'F', '2026-11-16']);
    assert.equal(JSON.parse(row.script).v, 3);
    assert.equal(JSON.parse(row.script).source, 'live');
    const e = await bad.post('/api/call/live', 'lan-tok');
    assert.equal(e.status, 502);
    assert.equal(e.body.code, 'live_token');
    assert.equal(db.calls.length, 1);
  } finally {
    srv.close(); bad.close();
  }
});

test('kết thúc Live: ghi giây, tiền, token một lần; không vượt cửa sổ token; cuộc gọi người khác thì không đổi', async () => {
  const db = fakeDb({ calls: [
    { id: 'live-1', family_id: 'F', member_id: 'lan-end', live_at: new Date(NOW.getTime() - 120e3), live_sec: null, live_usd: null, live_usage: null },
    { id: 'live-2', family_id: 'F', member_id: 'lan-end', live_at: new Date(NOW.getTime() - 60e3), live_sec: null, live_usd: null, live_usage: null },
  ] });
  const srv = await serve(deps({ db }));
  const ok = { status: 200, body: { ok: true } };
  try {
    assert.deepEqual(await srv.post('/api/call/live-1/live-end', 'lan-end', { sec: 9999, usage: USAGE, lat: [800, 1200, 1000] }), ok);
    const row = db.calls.find((c) => c.id === 'live-1')!;
    assert.equal(row.live_sec, 150);                       // 120 giây từ lúc phát token + 30 giây dư
    assert.ok(row.live_usd > 0);
    assert.equal(Math.round(row.live_usd * 1000) / 1000, 9.75);
    assert.equal(JSON.parse(row.live_usage).prompt, 2_000_000);
    const snap = { ...row };
    assert.deepEqual(await srv.post('/api/call/live-1/live-end', 'lan-end', { sec: 10, usage: USAGE }), ok);
    assert.deepEqual(row, snap);                           // báo lần hai: không đổi
    // Người khác báo cuộc gọi chưa báo về: không đổi.
    assert.deepEqual(await srv.post('/api/call/live-2/live-end', 'an-end', { sec: 10, usage: USAGE }), ok);
    assert.equal(db.calls.find((c) => c.id === 'live-2')!.live_sec, null);
    // Số rác: 0 giây, không tiền; mã cuộc gọi không có vẫn ok.
    assert.deepEqual(await srv.post('/api/call/live-2/live-end', 'lan-end', { sec: 'x', usage: { prompt: -1 } }), ok);
    assert.deepEqual(db.calls.find((c) => c.id === 'live-2')!.live_sec, 0);
    assert.deepEqual([db.calls[1].live_usd, db.calls[1].live_usage], [0, null]);
    assert.deepEqual(await srv.post('/api/call/khong-co/live-end', 'lan-end', { sec: 5 }), ok);
  } finally {
    srv.close();
  }
});

test('lời dặn thử nghiệm: tên người nghe, xưng hô theo vai, đổi tên linh vật, kết bằng Reply in Vietnamese.', () => {
  const b = L.spikeBrief(lanCtx());
  assert.match(b, /Lan/);
  assert.match(b, /role me/);
  assert.ok(b.endsWith('Reply in Vietnamese.'));
  assert.match(b, /Mây/);
  const bong = L.spikeBrief(lanCtx('lan', { mascot: 'Bông' }));
  assert.doesNotMatch(bong, /Mây/);
  assert.match(bong, /Bông/);
  // Thêm: tiếng Hàn kết bằng Korean; không có gạch dài.
  assert.ok(L.spikeBrief(lanCtx('lan', { lang: 'ko' })).endsWith('Reply in Korean.'));
  assert.doesNotMatch(b, /[—–]/);
});
