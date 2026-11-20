// Kiểm thử Mây Live bản thử (server/calllive.ts, server/liveconfig.ts): cấu hình, token dùng một lần, tiền mỗi cuộc gọi,
// kịch bản v3, nhấc máy (công tắc, trần phút, xin token) và kết thúc (ghi giây, tiền); dữ liệu Live (riêng tư), lời dặn, bảy công cụ (task 3);
// ô chuyện, lượt kể Live, thẻ câu hỏi qua lớp lọc và kiểm điều riêng, câu hẹn và log chống bịa lúc chốt, /answer?live=1 và /finish (task 4).
// Không cần DB, không gọi mạng: DB giả theo đúng từng câu trong LIVE_SQL, Google thay bằng deps.fetch giả; các test qua callRouter ở cuối
// thay pool.query bằng DB giả (như server/missions.test.ts).
// Chạy: node --import tsx --test server/calllive.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LiveCheck, LiveDeps } from './calllive.ts';
import type { Ctx } from './call.ts';
import type { ScriptExtras } from './callfacts.ts';
import type { CallScript, StoryTheme } from '../src/shared.ts';

process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'calllive-test-'));
// Không bao giờ gọi AI thật: lời nhắn rút lúc chốt (saveRelays) đi đường không có AI.
for (const k of ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) delete process.env[k];
// Log [call-live] của máy chủ gom vào đây (test đọc được, đầu ra test sạch). console.error giữ nguyên để lỗi thật vẫn hiện.
const logs: string[] = [];
console.log = console.warn = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };

const L = await import('./calllive.ts');
const { liveConfig } = await import('./liveconfig.ts');
const { LIVE_FIRST_STORY, STORY_THEMES, THEME_TOPIC, themesFor } = await import('../src/shared.ts');
const { seedsFor, topicMap } = await import('./callfacts.ts');
const { langMiddleware, tServer } = await import('./i18n.ts');
const C = await import('./call.ts');
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
type Tables = { members?: Row[]; calls?: Row[]; families?: Row[]; facts?: Row[]; events?: Row[]; answers?: Row[]; relays?: Row[]; photos?: Record<string, number> };
/** DB giả: đúng từng câu trong LIVE_SQL, điều kiện viết lại bằng JS. lenient: câu lạ trả rỗng (việc nền sau /finish của call.ts),
 *  không thì báo lỗi. onCas: chạy một lần ngay trước lần ghi kịch bản kế tiếp (giả một lần ghi khác chen vào giữa). */
function fakeDb(t: Tables = {}, o: { lenient?: boolean } = {}) {
  const S = L.LIVE_SQL;
  const db = {
    members: t.members ?? [], calls: t.calls ?? [], families: t.families ?? [], facts: t.facts ?? [], events: t.events ?? [],
    answers: t.answers ?? [], relays: t.relays ?? [], photos: t.photos ?? {},
    sql: [] as string[], cas: 0, onCas: undefined as undefined | (() => void), fail: undefined as undefined | string,
    async query(q: string, v: any[] = []): Promise<{ rows: Row[]; rowCount: number }> {
      const out = (rows: Row[], n = rows.length) => ({ rows, rowCount: n });
      db.sql.push(q);
      if (q === db.fail) throw new Error('DB giả: lỗi ghi');
      // Câu của call.ts (callRouter, saveRelays) mà test qua HTTP cần.
      if (q.startsWith('insert into relays')) {
        const [id, family_id, call_id, from_id, to_id, transcript, media, said, push] = v;
        db.relays.push({ id, family_id, call_id, from_id, to_id, transcript, media, said, push });
        return out([], 1);
      }
      switch (q) {
        case 'select * from calls where id = $1 and member_id = $2': return out(db.calls.filter((c) => c.id === v[0] && c.member_id === v[1]));
        case `update calls set status = 'done', done_at = now() where id = $1 and member_id = $2 and status = 'ready'`: {
          const c = db.calls.find((x) => x.id === v[0] && x.member_id === v[1] && x.status === 'ready');
          if (c) c.status = 'done';
          return out([], c ? 1 : 0);
        }
        case 'select status from calls where id = $1': return out(db.calls.filter((c) => c.id === v[0]).map((c) => ({ status: c.status })));
        case 'select 1 from relays where call_id = $1 limit 1': return out(db.relays.filter((r) => r.call_id === v[0]).map(() => ({ '?column?': 1 })));
        case 'select id, name, role, lang from members where family_id = $1 order by created_at':
          return out(db.members.filter((m) => m.family_id === v[0]).map((m) => ({ id: m.id, name: m.name, role: m.role, lang: m.lang ?? null })));
        case 'select mascot_name from families where id = $1': return out(db.families.filter((f) => f.id === v[0]).map((f) => ({ mascot_name: f.mascot_name ?? null })));
        case 'delete from call_answers where call_id = $1 and idx = $2 and turn = $3': {
          const n = db.answers.length;
          db.answers = db.answers.filter((a) => !(a.call_id === v[0] && a.idx === v[1] && a.turn === v[2]));
          return out([], n - db.answers.length);
        }
        case 'insert into call_answers (id, call_id, family_id, member_id, idx, turn, question, topic, media, transcript, seconds) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)': {
          const [id, call_id, family_id, member_id, idx, turn, question, topic, media, transcript, seconds] = v;
          db.answers.push({ id, call_id, family_id, member_id, idx, turn, question, topic, media, transcript, seconds });
          return out([], 1);
        }
        case S.script: return out(db.calls.filter((c) => c.id === v[0] && c.member_id === v[1]).map(({ id, family_id, member_id, script }) => ({ id, family_id, member_id, script })));
        case S.cas: {
          const hook = db.onCas;
          db.onCas = undefined;
          hook?.();
          db.cas++;
          const c = db.calls.find((x) => x.id === v[0] && x.script === v[1]);
          if (c) c.script = v[2];
          return out([], c ? 1 : 0);
        }
        case S.checkMember: {
          const m = db.members.find((x) => x.id === v[0]);
          const f = m && db.families.find((x) => x.id === m.family_id);
          return out(m ? [{ name: m.name, role: m.role, intro: m.intro ?? null, mascot_name: f?.mascot_name ?? null }] : []);
        }
        case S.checkFamily: return out(db.members.filter((m) => m.family_id === v[0]).map((m) => ({ name: m.name, city: m.city ?? null })));
        case S.checkFacts:
          return out(db.facts.filter((f) => f.family_id === v[0] && !f.replacement_id && (f.visibility === 'family' || f.source_id === v[1]))
            .map(({ text, text_en, visibility, source_id }) => ({ text, text_en, visibility, source_id })));
        case S.checkEvents: return out(db.events.filter((e) => e.family_id === v[0]).map((e) => ({ title: e.title })));
        case S.checkAnswers:
          return out(db.answers.filter((a) => a.call_id === v[0] && (a.transcript ?? '') !== '').map((a) => ({ topic: a.topic, transcript: a.transcript })));
        case S.checkCounts: return out([{ done: db.calls.filter((c) => c.member_id === v[0] && c.status === 'done').length, photos: db.photos[v[0]] ?? 0 }]);
        case S.slotLen: return out(db.answers.filter((a) => a.call_id === v[0] && a.idx === v[1] && a.turn === v[2]).map((a) => ({ n: (a.transcript ?? '').length })));
        case S.relaySlot:
          return out(db.answers.filter((a) => a.call_id === v[0] && a.idx === 1 && a.topic === 'loi-nhan')
            .sort((a, b) => (b.transcript ?? '').length - (a.transcript ?? '').length).slice(0, 1).map((a) => ({ question: a.question, transcript: a.transcript })));
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
      if (o.lenient) return out([], 0);
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
  db: fakeDb(), fetch: fakeFetch(), now: () => NOW, env: ENV, ctx: async (m) => lanCtx(m.id), relays: async () => [], ...o,
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
  return { post, base, close: () => server.close() };
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
    logs.length = 0;
    const e = await bad.post('/api/call/live', 'lan-tok');
    assert.equal(e.status, 502);
    assert.equal(e.body.code, 'live_token');
    assert.equal(db.calls.length, 1);
    assert.ok(logs.some((l) => l.includes('[call-live] không xin được token: 500 boom')), logs.join('\n'));
    assert.ok(!logs.some((l) => l.includes(ENV.GEMINI_API_KEY)));   // không bao giờ in khoá
  } finally {
    srv.close(); bad.close();
  }
});

test('kết thúc Live: giây tính theo đồng hồ máy chủ, ghi tiền, token một lần; cuộc gọi người khác thì không đổi', async () => {
  const row = (id: string, agoSec: number) => ({ id, family_id: 'F', member_id: 'lan-end', live_at: new Date(NOW.getTime() - agoSec * 1000), live_sec: null, live_usd: null, live_usage: null });
  const db = fakeDb({ calls: [row('live-1', 120), row('live-2', 60), row('live-3', 3600)] });
  const srv = await serve(deps({ db }));
  const ok = { status: 200, body: { ok: true } };
  const get = (id: string) => db.calls.find((c) => c.id === id)!;
  try {
    logs.length = 0;
    assert.deepEqual(await srv.post('/api/call/live-1/live-end', 'lan-end', { sec: 9999, usage: USAGE, lat: [800, 1200, 1000] }), ok);
    const one = get('live-1');
    assert.equal(one.live_sec, 120);                       // máy báo 9999 giây: tính 120 giây thật từ lúc phát token
    assert.ok(one.live_usd > 0);
    assert.equal(Math.round(one.live_usd * 1000) / 1000, 9.75);
    assert.equal(JSON.parse(one.live_usage).prompt, 2_000_000);
    assert.ok(logs.some((l) => /\[call-live\] cuộc gọi live-1: 120 s .*9999.*9\.7500 USD, đáp sau trung vị 1000 ms/.test(l)), logs.join('\n'));
    const snap = { ...one };
    assert.deepEqual(await srv.post('/api/call/live-1/live-end', 'lan-end', { sec: 10, usage: USAGE }), ok);
    assert.deepEqual(one, snap);                           // báo lần hai: không đổi
    // Người khác báo cuộc gọi chưa báo về: không đổi.
    assert.deepEqual(await srv.post('/api/call/live-2/live-end', 'an-end', { sec: 10, usage: USAGE }), ok);
    assert.equal(get('live-2').live_sec, null);
    // Máy cố báo 0 giây (hay số rác): vẫn tính đủ 60 giây đã trôi; token rác thì không tiền.
    assert.deepEqual(await srv.post('/api/call/live-2/live-end', 'lan-end', { sec: 0, usage: { prompt: -1 } }), ok);
    assert.deepEqual([get('live-2').live_sec, get('live-2').live_usd, get('live-2').live_usage], [60, 0, null]);
    // Cuộc gọi treo một giờ rồi mới báo: chỉ tính tới trần một cuộc gọi cộng 30 giây dư (900 + 30), không ăn nửa trần ngày.
    assert.deepEqual(await srv.post('/api/call/live-3/live-end', 'lan-end', { sec: 3600, usage: USAGE }), ok);
    assert.equal(get('live-3').live_sec, 930);
    assert.deepEqual(await srv.post('/api/call/khong-co/live-end', 'lan-end', { sec: 5 }), ok);
  } finally {
    srv.close();
  }
});

test('kết thúc Live: trần một cuộc gọi đổi bằng MAY_CALL_MAX_SEC thì giây tính cũng theo', async () => {
  const db = fakeDb({ calls: [{ id: 'live-4', family_id: 'F', member_id: 'lan-end2', live_at: new Date(NOW.getTime() - 3600e3), live_sec: null }] });
  const srv = await serve(deps({ db, env: { ...ENV, MAY_CALL_MAX_SEC: '300' } }));
  try {
    await srv.post('/api/call/live-4/live-end', 'lan-end2', { sec: 0 });
    assert.equal(db.calls[0].live_sec, 330);
  } finally {
    srv.close();
  }
});

/** Dữ liệu lớn dần của Lan (dựng như ScriptExtras trong call.test.ts) thêm mức độ, mồi chuyện, giọng ấm, thời tiết thành cảm giác (task 2).
 *  Lan ở Hải Phòng, An ở Busan; mồi đầu là chuyện An kể với Mây. */
const extras = (o: Partial<ScriptExtras> = {}): ScriptExtras => ({
  age: 52,
  place: { name: 'Hải Phòng', country: 'Việt Nam', tz: 'Asia/Ho_Chi_Minh', localTime: '10:00', weather: '12°C, rain', feel: 'cold and rainy' },
  family: [{ name: 'An', role: 'con', place: 'Busan, Hàn Quốc', hoursApart: 2, km: 2600 }],
  memory: [{ id: 'f1', about: 'An', toldBy: 'An', toldByYou: false, private: false, kind: 'food', fact: 'An loves sour soup' }],
  occasions: [{ key: 'birthday', name: 'Sinh nhật An', date: '2026-12-01', inDays: 10, who: 'An' }],
  told: [{ theme: 'mon-an', times: 1, turns: 2, last: '2026-11-14' }],
  themes: themesFor('me', false, false), gaps: [], recent: ['An'],
  depth: 1,
  seeds: [
    { kind: 'heard', hint: 'An told Mây: An loves sour soup. Ask their side of it and say who told it.', theme: null },
    { kind: 'person', hint: 'A story about An (their child): a moment with them they remember well.', theme: null },
    { kind: 'together', hint: 'A time the whole family was together: a trip, a Tet, a meal.', theme: 'tet-cac-dip' },
  ],
  hook: null, warm: false,
  ...o,
});

/** Mồi khi không nạp được dữ liệu lớn dần: seedsFor với đầu vào rỗng, chỉ có vai và chủ đề hợp vai. */
const seedsForEmpty = (role: string) => seedsFor({ depth: 0, role, intro: {}, place: null, far: false, family: [], memory: [], occasions: [], told: [],
  themes: themesFor(role, false, false), hook: null, hasPair: false });

test('dữ liệu Live: không có điều chưa nói, không có câu thương chưa nói thành lời, chỉ cờ giọng ấm', () => {
  const intro = { kid: 'con trai', seen: 'vài tháng rồi', food: 'canh chua', love: 'chưa nói thành lời bao giờ', unsaid: 'Con xin lỗi mẹ chuyện năm ngoái' };
  const c = lanCtx('lan', { member: { id: 'lan', name: 'Lan', role: 'me', intro }, extras: extras({ warm: true }) });
  const d: any = L.liveData(c, []);
  const s = JSON.stringify(d);
  assert.doesNotMatch(s, /xin lỗi/);
  assert.doesNotMatch(s, /chưa nói thành lời/);
  assert.ok(s.includes('"warm_tone":true'));
  assert.ok(s.includes('canh chua'));
  assert.deepEqual(d.person.intro, { kid: 'con trai', seen: 'vài tháng rồi', food: 'canh chua' });   // chỉ ba nhãn này
  // Lời dặn (có cả DATA) cũng không có.
  assert.doesNotMatch(L.liveBrief(c, []), /xin lỗi|chưa nói thành lời|unsaid/);
  // Không giọng ấm thì không có cờ (không bao giờ là false); không có câu khảo sát nào trong ba câu thì không có mục intro.
  const plain: any = L.liveData({ ...c, extras: extras() }, []);
  assert.equal('warm_tone' in plain.person, false);
  const bare: any = L.liveData(lanCtx('lan', { member: { id: 'lan', name: 'Lan', role: 'me', intro: { love: 'thường xuyên', unsaid: 'X' } }, extras: extras() }), []);
  assert.equal('intro' in bare.person, false);
});

test('dữ liệu Live: điều riêng của người khác không bao giờ vào, điều riêng của chính người nghe có cờ private', () => {
  const memory: ScriptExtras['memory'] = [
    { id: 'o1', about: 'An', toldBy: 'An', toldByYou: false, private: true, kind: 'worry', fact: 'OTHER-SECRET' },
    { id: 'm1', about: 'Lan', toldBy: 'Lan', toldByYou: true, private: true, kind: 'health', fact: 'MY-SECRET' },
    { id: 'f1', about: 'An', toldBy: 'An', toldByYou: false, private: false, kind: 'food', fact: 'An loves sour soup' },
  ];
  const c = lanCtx('lan', { extras: extras({ memory }) });
  const d: any = L.liveData(c, []);
  assert.doesNotMatch(JSON.stringify(d), /OTHER-SECRET/);
  assert.deepEqual(d.memory, [
    { about: 'Lan', told_by: 'Lan', told_by_you: true, private: true, kind: 'health', fact: 'MY-SECRET' },
    { about: 'An', told_by: 'An', told_by_you: false, private: false, kind: 'food', fact: 'An loves sour soup' },
  ]);
  const b = L.liveBrief(c, []);
  assert.doesNotMatch(b, /OTHER-SECRET/);
  // Điều riêng của chính người nghe chỉ được chạm nhẹ lúc hỏi thăm, không bao giờ trong câu mở chuyện hay trong chuyện.
  assert.ok(b.includes('you may touch it gently only during the check-in, before your first story_open, never in a story opener or inside a story'));
});

test('dữ liệu Live: thời tiết là cảm giác, không có số; không có cảm giác thì không có mục thời tiết', () => {
  const d: any = L.liveData(lanCtx('lan', { extras: extras() }), []);
  assert.equal(d.person.weather, 'cold and rainy');
  assert.doesNotMatch(JSON.stringify(d), /°/);   // chuỗi số của bộ câu cũ ("12°C, rain") không vào
  assert.equal(d.person.lives_in, 'Hải Phòng, Việt Nam');
  assert.equal(d.local_time, '10:00');
  const none: any = L.liveData(lanCtx('lan', { extras: extras({ place: { ...extras().place, feel: null } }) }), []);
  assert.equal('weather' in none.person, false);
  // Lời dặn: nhắc tối đa một lần, chỉ như lời quan tâm, không số.
  const b = L.liveBrief(lanCtx('lan', { extras: extras() }), []);
  assert.ok(b.includes('Never say a number and never read it like a forecast.'));
});

test('dữ liệu Live: đủ các mục theo thứ tự, lời nhắn có mã, cuộc gọi trước và ảnh theo cùng một cờ', () => {
  const c = lanCtx('lan', { doneCalls: ['2026-11-14'], photoCount: 3, extras: extras() });
  const d: any = L.liveData(c, [{ id: 'r1', said: 'An nhắn là nhớ mẹ lắm' }]);
  assert.deepEqual(Object.keys(d), ['today', 'local_time', 'person', 'family_members', 'depth', 'seeds', 'memory', 'upcoming_occasions',
    'told_themes', 'allowed_themes', 'previous_calls', 'saved_photos', 'recent_contact', 'pending_messages']);
  assert.match(d.today, /^\d{4}-\d{2}-\d{2}$/);
  // Ngày theo giờ Việt Nam của now truyền vào: 17:30 UTC ngày 31/1 đã là 0:30 ngày 1/2 ở Việt Nam.
  assert.equal((L.liveData(c, [], new Date('2027-01-31T17:30:00Z')) as any).today, '2027-02-01');
  assert.equal((L.liveData(c, [], new Date('2027-01-31T16:30:00Z')) as any).today, '2027-01-31');
  assert.deepEqual(d.person, { name: 'Lan', role: 'me', age: 52, lives_in: 'Hải Phòng, Việt Nam', weather: 'cold and rainy' });
  assert.deepEqual(d.family_members, [{ name: 'An', role: 'con', lives_in: 'Busan, Hàn Quốc', hours_apart: 2, distance_km: 2600 }]);
  assert.equal(d.depth, 1);
  assert.deepEqual(d.seeds, c.extras!.seeds);
  assert.deepEqual(d.upcoming_occasions, [{ name: 'Sinh nhật An', date: '2026-12-01', in_days: 10, who: 'An' }]);
  assert.deepEqual(d.told_themes, [{ theme: 'mon-an', times: 1, depth: 'short', last: '2026-11-14' }]);
  assert.deepEqual(d.allowed_themes, c.extras!.themes);
  assert.deepEqual(d.previous_calls, { count: 1 });
  assert.equal(d.saved_photos, 3);
  assert.deepEqual(d.recent_contact, ['An']);
  assert.deepEqual(d.pending_messages, [{ id: 'r1', said: 'An nhắn là nhớ mẹ lắm' }]);
  assert.deepEqual(L.liveAllow(c.doneCalls.length, c.photoCount), { prevCall: true, photos: true });
  // Chưa gọi lần nào, chưa có ảnh: "none yet", cờ tắt, có trial.
  const first: any = L.liveData(lanCtx('lan', { extras: extras() }), []);
  assert.equal(first.previous_calls, 'none yet: no previous call');
  assert.equal(first.saved_photos, 'none yet: no photos');
  assert.equal(first.trial, true);
  assert.deepEqual(first.pending_messages, []);
  assert.deepEqual(L.liveAllow(0, 0), { prevCall: false, photos: false });
});

test('dữ liệu Live: không có dữ liệu lớn dần thì mức 0, mồi chung, cả nhà trừ người nghe; không bao giờ có lời kể cũ', () => {
  const c = lanCtx('lan', { stories: [{ question: 'Q', answer: 'OLD-ANSWER' }], asked: ['OLD-QUESTION'], captions: ['OLD-CAPTION'] });
  const d: any = L.liveData(c, []);
  assert.equal(d.depth, 0);
  assert.deepEqual(d.seeds, seedsForEmpty('me'));
  assert.ok(d.seeds.length > 0);
  assert.deepEqual(d.family_members, [{ name: 'An', role: 'con' }]);
  assert.deepEqual(d.person, { name: 'Lan', role: 'me' });
  assert.equal('local_time' in d, false);
  assert.deepEqual([d.memory, d.upcoming_occasions, d.told_themes, d.recent_contact], [[], [], [], []]);
  assert.deepEqual(d.allowed_themes, themesFor('me', false, false));
  assert.doesNotMatch(JSON.stringify(d), /OLD-ANSWER|OLD-QUESTION|OLD-CAPTION/);
});

test('lời dặn Live: đủ các phần, ví dụ của người dùng, mồi theo thứ tự, lời nhắn có mã, kết bằng Reply in Vietnamese.', () => {
  const c = lanCtx('lan', { doneCalls: ['2026-11-14'], extras: extras() });
  const b = L.liveBrief(c, [{ id: 'r1', said: 'An nhắn là nhớ mẹ lắm' }]);
  const heads = ['HOW YOU TALK.', 'ANSWER WHAT WAS SAID.', 'STORIES.', 'WEATHER.', 'DEPTH AND SEEDS.', 'WHAT IS TRUE.', 'PRIVACY.', 'ORDER OF THE CALL.', 'TOOLS.', 'APP MESSAGES.', 'DATA:'];
  for (const h of heads) assert.ok(b.includes(h), h);
  for (let i = 1; i < heads.length; i++) assert.ok(b.indexOf(heads[i - 1]) < b.indexOf(heads[i]), `${heads[i - 1]} trước ${heads[i]}`);
  for (const ex of ['Mẹ kể ngày nào cũng được ạ', 'Mẹ cứ từ từ ạ', 'Ơ mẹ ơi, hôm nay chỗ mẹ lạnh lắm đấy, mẹ mặc đủ ấm không ạ?', 'Dạ, con nghe đây ạ', 'kể gì bây giờ?', 'gợi ý đi',
    'Mẹ ơi, mẹ kể con nghe về tuổi thơ của mẹ được không?', 'An kể là ...']) assert.ok(b.includes(ex), ex);
  assert.ok(b.startsWith('You are Mây, the little mascot of Sweet Home'));
  assert.ok(b.includes('call story_open with its theme and that exact opener right before you say it'));
  assert.ok(b.includes('(copy its shape; the topic comes from the seeds)'));
  // Đào chuyện như đứa cháu tò mò, không như điền phiếu; không phải lượt nào cũng hỏi.
  for (const w of ['never walk through these like a form', 'pick up the most alive detail they just gave', 'the way a curious grandchild would',
    'Not every turn needs a question', 'There is no limit on questions.', 'then, if a question helps, ask only one.',
    'laugh along in a few words, then carry on with the story', 'never the same line twice in a row',
    'say one warm line about something specific they told', 'ideally one that grows out of what they just said',
    'treat it as the first story', 'instead of forcing the hook seed']) assert.ok(b.includes(w), w);
  assert.ok(!b.includes('at most one question'));
  assert.ok(!b.includes('how it felt then, how they see it now'));
  // Gọi điện chỉ có giọng: không có luật danh sách, tiêu đề, gạch dài; tên là "nói" cho đúng.
  assert.ok(!b.includes('No lists, no headings'));
  assert.ok(b.includes('Say every name exactly as in DATA'));
  // Chỉ nói tiếng của người nghe dù lời dặn và tin của app bằng tiếng Anh; ví dụ viết cho mẹ, phải đổi xưng hô.
  assert.ok(b.includes('Speak only Vietnamese for the whole call, even though these notes and the app messages are in English.'));
  assert.ok(b.indexOf('Speak only Vietnamese') < b.indexOf('HOW YOU TALK.'));
  assert.ok(b.includes('written for a mother: with this person always swap Mẹ/mẹ, con and ạ for the address above; An stands for whoever told it.'));
  // Điều thật: DATA và điều người nghe kể trong cuộc gọi này.
  assert.ok(b.includes('Only DATA and what they tell you in this call are true. Never bring up a call, story, photo, message or detail that is in neither.'));
  // Công cụ gọi ngay trước câu nói đi kèm, không sau (kết quả công cụ mở lượt mới, Mây dễ nói lặp).
  for (const w of ['call ask_photo right before you ask', 'call relay_heard with its id right before you pass it on', 'call end_call with that promise as next_hook right before you say it',
    'Call each tool right before the words it goes with']) assert.ok(b.includes(w), w);
  assert.ok(b.indexOf(c.extras!.seeds[0].hint) < b.indexOf(c.extras!.seeds[1].hint));
  assert.ok(b.indexOf(c.extras!.seeds[1].hint) < b.indexOf(c.extras!.seeds[2].hint));
  assert.ok(b.includes('"id": "r1"'));
  assert.ok(b.trimEnd().endsWith('Reply in Vietnamese.'));
  assert.ok(b.includes('\n\nReply in Vietnamese.'));
  assert.doesNotMatch(b, /[—–]/);
  // Ảnh: gần cuối chuyện, trước story_close hay ngay sau (phán quyết R5).
  assert.ok(b.includes('near its end (before story_close or right after it)'));
  // Câu hẹn: chỉ là chủ đề chuyện tuần sau, không bao giờ lời nhắn khó nói hay điều riêng, nhạy cảm (phán quyết mang từ task 2).
  assert.ok(b.includes('never the hard-to-say message, and nothing private or sensitive (health, money, conflict, worries)'));
  // Không phải cuộc gọi đầu: không có phần FIRST CALL; DATA không có trial.
  assert.ok(!b.includes('FIRST CALL.'));
  assert.ok(!b.includes('"trial"'));
  // Tiếng Anh, tiếng Hàn: ví dụ theo thứ tiếng ấy, kết bằng đúng tên thứ tiếng.
  const en = L.liveBrief({ ...c, lang: 'en' }, []);
  assert.ok(en.trimEnd().endsWith('Reply in English.'));
  assert.ok(en.includes('Speak only English for the whole call'));
  assert.ok(en.includes('with this person always swap Mom for the address above'));
  assert.ok(!en.includes('Mẹ cứ từ từ ạ'));
  assert.doesNotMatch(en, /[—–]/);
  const ko = L.liveBrief({ ...c, lang: 'ko' }, []);
  assert.ok(ko.trimEnd().endsWith('Reply in Korean.'));
  assert.ok(ko.includes('Speak only Korean for the whole call'));
  assert.doesNotMatch(ko, /[—–]/);
});

test('lời dặn Live: cuộc gọi đầu có phần FIRST CALL; nhà đổi tên linh vật thì không còn chữ Mây', () => {
  const first = L.liveBrief(lanCtx('lan', { extras: extras() }), []);
  assert.ok(first.includes('FIRST CALL.'));
  assert.ok(first.indexOf('FIRST CALL.') < first.indexOf('DATA:'));
  assert.ok(first.includes('start with easy everyday stories from the seeds, nothing heavy'));   // không giới hạn số chuyện
  assert.ok(!first.includes('one or two easy'));
  assert.ok(first.includes('"trial": true'));
  const later = lanCtx('lan', { doneCalls: ['2026-11-14'], extras: extras() });
  assert.ok(!L.liveBrief(later, []).includes('FIRST CALL.'));
  const bong = L.liveBrief({ ...later, mascot: 'Bông' }, []);
  assert.doesNotMatch(bong, /Mây/);
  assert.ok(bong.startsWith('You are Bông,'));
  assert.ok(bong.includes('An told Bông: An loves sour soup.'));   // mồi trong DATA cũng đổi tên (phán quyết R2)
  const ko = L.liveBrief({ ...later, lang: 'ko', mascot: 'Bông' }, []);
  assert.doesNotMatch(ko, /Mây/);
  assert.ok(ko.includes('writes its own name exactly as Bông'));
  // Không có dữ liệu lớn dần vẫn đổi tên (mồi chung).
  assert.doesNotMatch(L.liveBrief(lanCtx('lan', { mascot: 'Bông' }), []), /Mây/);
});

test('công cụ Live: đúng bảy công cụ, story_open bắt buộc theme trong danh sách chủ đề và opener', () => {
  assert.deepEqual(L.LIVE_TOOLS.map((t) => t.name), ['story_open', 'story_close', 'ask_photo', 'ask_share', 'relay_heard', 'relay_open', 'end_call']);
  const so: any = L.LIVE_TOOLS[0].parameters;
  assert.equal(so.type, 'OBJECT');
  assert.deepEqual(so.required, ['theme', 'opener']);
  assert.deepEqual(so.properties.theme.enum, [...STORY_THEMES]);
  assert.deepEqual([so.properties.theme.type, so.properties.opener.type], ['STRING', 'STRING']);
  const by = Object.fromEntries(L.LIVE_TOOLS.map((t) => [t.name, t]));
  const rh: any = by.relay_heard.parameters;
  assert.deepEqual([rh.type, rh.required, rh.properties.id.type], ['OBJECT', ['id'], 'STRING']);
  const ec: any = by.end_call.parameters;
  assert.deepEqual([ec.type, ec.required, ec.properties.next_hook.type], ['OBJECT', ['next_hook'], 'STRING']);
  for (const n of ['story_close', 'ask_photo', 'ask_share', 'relay_open']) assert.equal(by[n].parameters, undefined, n);
  // Mỗi mô tả một câu tiếng Anh nói khi nào gọi; không tên linh vật (công cụ không qua named), không gạch dài.
  for (const t of L.LIVE_TOOLS) {
    assert.match(t.description, /^Call this [^.!?]+\.$/, t.name);
    assert.ok(t.description.includes('right before'), t.name);   // ngay trước câu nói đi kèm, không sau
    assert.doesNotMatch(JSON.stringify(t), /Mây|[—–]/, t.name);
  }
  // Câu hẹn: lời hứa ngắn, ấm về một chủ đề chuyện tuần sau; không bao giờ lời nhắn khó nói, điều riêng hay nhạy cảm.
  assert.equal(by.story_open.description, 'Call this right before you say the opener of a new story, with its theme and that exact opener.');
  assert.equal(by.ask_photo.description, 'Call this right before you invite them to share an old photo, near the end of a story with real people or places (before story_close or right after it).');
  assert.equal(by.relay_heard.description, "Call this right before you pass on a pending message in your own words, with that message's id.");
  assert.equal(by.end_call.description, 'Call this once, right before your goodbye, with the promise for next week you are about to make.');
  assert.ok(so.properties.theme.description.includes('que-nha home and hometown, then and now'));
  const hook = ec.properties.next_hook.description;
  for (const w of ['short, warm promise about a story topic for next week', 'never the hard-to-say message', 'nothing private or sensitive (health, money, conflict, worries)']) assert.ok(hook.includes(w), w);
});

test('nhấc máy Live: token mang lời dặn thật và bảy công cụ; trả lời có lời nhắn, chủ đề được hỏi, cờ chống bịa, số người', async () => {
  const f = fakeFetch();
  const db = fakeDb({ members: [{ id: 'lan-brief', may_live: true }, { id: 'lan-brief2', may_live: true }] });
  const relays = [{ id: 'r1', said: 'An nhắn là nhớ mẹ lắm' }];
  const asked: string[] = [];
  const srv = await serve(deps({ db, fetch: f, relays: async (id) => { asked.push(id); return relays; } }));
  // Người đã gọi, có ảnh, có dữ liệu lớn dần, nhà ba người; lời nhắn theo mặc định của deps (không có).
  const three = [{ name: 'Hùng', role: 'bo' }, { name: 'Lan', role: 'me' }, { name: 'An', role: 'con' }];
  const srv2 = await serve(deps({ db, fetch: f, ctx: async (m) => lanCtx(m.id, { family: three, doneCalls: ['2026-11-14'], photoCount: 3, extras: extras({ themes: ['mon-an', 'que-nha'] }) }) }));
  // Đọc lời nhắn lỗi: vẫn nhấc máy được, không có lời nhắn. Đồng hồ máy chủ (deps.now) lúc 0:30 ngày 1/2 giờ Việt Nam.
  const srv3 = await serve(deps({ db: fakeDb({ members: [{ id: 'lan-brief3', may_live: true }] }), fetch: f, now: () => new Date('2027-01-31T17:30:00Z'),
    relays: async () => { throw new Error('db down'); } }));
  try {
    const r = await srv.post('/api/call/live', 'lan-brief');
    assert.equal(r.status, 200);
    assert.deepEqual(asked, ['lan-brief']);
    const s = JSON.parse(String(f.calls[0].init.body)).bidiGenerateContentSetup;
    assert.equal(s.tools[0].functionDeclarations.length, 7);
    assert.deepEqual(s.tools[0].functionDeclarations, L.LIVE_TOOLS);
    const text = s.systemInstruction.parts[0].text;
    assert.ok(text.includes('ORDER OF THE CALL.'));
    assert.ok(text.includes('"id": "r1"'));
    assert.ok(text.includes('FIRST CALL.'));
    assert.ok(text.trimEnd().endsWith('Reply in Vietnamese.'));
    assert.deepEqual(Object.keys(r.body).sort(), ['allow', 'family', 'id', 'maxSec', 'model', 'relays', 'themes', 'token']);
    assert.deepEqual(r.body.relays, relays);
    assert.ok(r.body.themes.length > 0);
    assert.deepEqual(r.body.themes, themesFor('me', false, false));   // không có dữ liệu lớn dần: theo vai, nhà chưa đủ bố mẹ
    assert.deepEqual(r.body.allow, { prevCall: false, photos: false });
    assert.equal(r.body.family, 2);
    const r2 = await srv2.post('/api/call/live', 'lan-brief2');
    assert.equal(r2.status, 200);
    assert.deepEqual(r2.body.relays, []);
    assert.deepEqual(r2.body.themes, ['mon-an', 'que-nha']);
    assert.deepEqual(r2.body.allow, { prevCall: true, photos: true });
    assert.equal(r2.body.family, 3);
    const text2 = JSON.parse(String(f.calls[1].init.body)).bidiGenerateContentSetup.systemInstruction.parts[0].text;
    assert.ok(!text2.includes('FIRST CALL.'));
    const r3 = await srv3.post('/api/call/live', 'lan-brief3');
    assert.equal(r3.status, 200);
    assert.deepEqual(r3.body.relays, []);
    const text3 = JSON.parse(String(f.calls[2].init.body)).bidiGenerateContentSetup.systemInstruction.parts[0].text;
    assert.ok(text3.includes('"today": "2027-02-01"'));
    assert.ok(text3.includes('"pending_messages": []'));
  } finally {
    srv.close(); srv2.close(); srv3.close();
  }
});

// ---------- Task 4: ô chuyện, lượt kể Live, thẻ câu hỏi, câu hẹn ----------

/** Bộ kiểm câu của Lan: tên trong nhà, linh vật, nơi ở; điều riêng là đau lưng; chưa có cuộc gọi trước, chưa có ảnh. */
const K: LiveCheck = { hay: 'Lan An Mây Hải Phòng', privates: ['Mẹ bị đau lưng mấy tháng nay'], allow: { prevCall: false, ownStory: true, photos: false },
  lang: 'vi', role: 'me', name: 'Lan', mascot: 'Mây' };
/** Một ô chuyện như saveStory lưu (chữ mặc định là mã chủ đề). */
const story = (theme: StoryTheme, text: string = theme) => ({ text, topic: THEME_TOPIC[theme], photo: false, event: 'none' as const, part: 'story' as const, theme });

/** Nhà của Lan cho các test có DB giả: Lan (mẹ) và An (con), điều riêng của Lan là đau lưng, cuộc gọi v3 c1 đang mở (call ghi đè các cột của c1). */
const lanHome = (o: Tables = {}, call: Row = {}) => fakeDb({
  members: [{ id: 'lan', family_id: 'F', name: 'Lan', role: 'me', intro: '{}' }, { id: 'an', family_id: 'F', name: 'An', role: 'con' }],
  families: [{ id: 'F', mascot_name: null }],
  facts: [{ family_id: 'F', text: 'Mẹ bị đau lưng mấy tháng nay', text_en: 'Mom has had back pain for months', visibility: 'self', source_id: 'lan' }],
  calls: [{ id: 'c1', family_id: 'F', member_id: 'lan', status: 'ready', script: JSON.stringify(L.liveScript(lanCtx())), ...call }],
  ...o,
});
const scriptOf = (db: { calls: Row[] }, id = 'c1'): CallScript => JSON.parse(db.calls.find((c) => c.id === id)!.script);

test('ô chuyện: thêm cuối, gửi lại thì như cũ, khác chủ đề thì thay, tới trước thì lấp chỗ trống, ngoài khoảng thì không nhận', () => {
  const s = L.liveScript(lanCtx());                                  // 2 ô
  const q = (theme: StoryTheme) => story(theme);
  const a = L.placeStory(s, 2, q('mon-an'))!;
  assert.equal(a.questions.length, 3);
  assert.equal(L.placeStory(a, 2, q('mon-an')), a);
  assert.equal(L.placeStory(a, 2, q('que-nha'))!.questions[2].theme, 'que-nha');
  const gap = L.placeStory(s, 4, q('ban-be'))!;
  assert.deepEqual(gap.questions.slice(2).map((x) => x.theme), ['ban-be', 'ban-be', 'ban-be']);
  assert.equal(L.placeStory(gap, 3, q('tuoi-tho'))!.questions[3].theme, 'tuoi-tho');
  assert.equal(L.placeStory(s, 1, q('mon-an')), null);
  assert.equal(L.placeStory(s, 22, q('mon-an')), null);
  assert.equal(L.placeStory({ ...s, v: 2 }, 2, q('mon-an')), null);
  // Thêm: ô cuối nhận được là 21 (20 chuyện); không sửa kịch bản truyền vào; ô 0, 1 giữ nguyên; ô lấp chỗ trống nhận câu mở thật khi tới
  // (cùng chủ đề, khác câu); ô không phải số nguyên thì không nhận.
  assert.equal(L.placeStory(s, 21, q('mon-an'))!.questions.length, 22);
  assert.equal(s.questions.length, 2);
  assert.deepEqual(gap.questions.slice(0, 2), s.questions);
  assert.equal(L.placeStory(gap, 2, story('ban-be', 'Câu mở thật'))!.questions[2].text, 'Câu mở thật');
  assert.equal(L.placeStory(s, 2.5, q('mon-an')), null);
  // Bản đồ chủ đề (task 2, phán quyết R3) đọc đúng ô chuyện v3: mỗi ô tính lượt riêng, hai ô cùng chủ đề lấy ô sâu nhất.
  const told = topicMap([{ script: L.placeStory(gap, 3, q('tuoi-tho'))!, doneAt: '2026-11-21', storyTurns: 9, turnsByIdx: { 2: 1, 3: 4, 4: 2 } }]);
  assert.deepEqual(told.map((t) => [t.theme, t.turns]).sort(), [['ban-be', 2], ['tuoi-tho', 4]]);
});

test('chủ đề lượt Live: hỏi thăm, lời nhắn, ô có sẵn, ô chưa tới thì theo theme, theme lạ thì ký ức', () => {
  const s = L.placeStory(L.liveScript(lanCtx()), 2, story('mon-an'))!;
  assert.equal(L.liveTopic(s, 0, 'tuoi-tho'), 'hoi-tham');
  assert.equal(L.liveTopic(s, 1, 'tuoi-tho'), 'loi-nhan');
  assert.equal(L.liveTopic(s, 2, 'abc'), 'mon-an');           // theme gửi kèm sai hay thiếu: theo ô có sẵn
  assert.equal(L.liveTopic(s, 2, undefined), 'mon-an');
  // Vòng sửa 1: theme gửi kèm hợp lệ thắng ô có sẵn, vì ô có thể là bản sao lấp chỗ trống của chuyện sau (máy khách biết ô này mở chủ đề gì).
  const gap = L.placeStory(L.liveScript(lanCtx()), 4, story('mon-an'))!;   // ô 2, 3 là bản sao món ăn
  assert.equal(L.liveTopic(gap, 3, 'tuoi-tho'), 'tuoi-tho');
  assert.equal(L.liveTopic(gap, 3, 'abc'), 'mon-an');
  assert.equal(L.liveTopic(s, 5, 'tuoi-tho'), 'tuoi-tho');
  assert.equal(L.liveTopic(s, 5, 'que-nha'), 'ky-niem');      // theo THEME_TOPIC
  assert.equal(L.liveTopic(s, 5, 'abc'), 'ky-niem');
  assert.equal(L.liveTopic(s, 5, undefined), 'ky-niem');
});

test('điều riêng: trùng một cặp chữ của điều riêng là trúng, cặp chữ toàn chữ thường gặp thì không', () => {
  assert.equal(L.privateHit('Dạo này mẹ còn đau lưng không ạ?', ['Mẹ bị đau lưng mấy tháng nay']), true);
  assert.equal(L.privateHit('Mẹ kể con nghe về bữa cơm của mẹ nhé', ['Chuyện của mẹ với bà']), false);
  assert.equal(L.privateHit('Mẹ kể con nghe đi', []), false);
  // Thêm: không phân biệt hoa thường, dấu câu; một chữ trùng thì không; đúng ranh giới chữ ("anh" không khớp trong "canh"); tiếng Anh cũng vậy.
  assert.equal(L.privateHit('ĐAU LƯNG, mẹ ơi', ['Mẹ bị đau lưng']), true);
  assert.equal(L.privateHit('Mẹ có đau không', ['Mẹ bị đau lưng']), false);
  assert.equal(L.privateHit('canh chua', ['anh chuan bi']), false);
  assert.equal(L.privateHit('Mom, how is your back pain?', ['Mom has had back pain for months']), true);
  assert.equal(L.privateHit('Tell me about your mom', ['Mom has had back pain for months']), false);
});

test('thẻ câu hỏi: câu sạch giữ nguyên; tên lạ hay điều riêng thì dùng câu mở; câu mở cũng hỏng thì tên chủ đề', () => {
  assert.equal(L.cardText('Hồi đó Mẹ ở với ai ạ?', 'OPENER', K, 'tuoi-tho'), 'Hồi đó Mẹ ở với ai ạ?');
  assert.equal(L.cardText('Hồi đó Mẹ ở với cô Thảo ạ?', 'Mẹ kể con nghe về tuổi thơ nhé', K, 'tuoi-tho'), 'Mẹ kể con nghe về tuổi thơ nhé');
  assert.equal(L.cardText('Mẹ còn đau lưng không ạ?', 'Lần trước mẹ kể...', K, 'tuoi-tho'), tServer('vi', 'topic.tuoi-tho'));
  // Thêm: gạch dài thành dấu phẩy, bỏ ngoặc kép, một dòng, tối đa 300 chữ; câu rỗng thì câu mở; đã có cuộc gọi trước thì "lần trước" được;
  // tên chủ đề theo thứ tiếng của người nghe.
  assert.equal(L.cardText('Hồi đó — Mẹ ở "với" ai ạ?\nDòng hai', 'X', K, 'tuoi-tho'), 'Hồi đó, Mẹ ở với ai ạ?');
  assert.equal(L.cardText('a'.repeat(400), 'X', K, 'tuoi-tho').length, 300);
  assert.equal(L.cardText('  ', 'Mẹ kể con nghe về tuổi thơ nhé', K, 'tuoi-tho'), 'Mẹ kể con nghe về tuổi thơ nhé');
  assert.equal(L.cardText('Lần trước mẹ kể chuyện bà, rồi sao nữa ạ?', 'X', { ...K, allow: { ...K.allow, prevCall: true } }, 'tuoi-tho'), 'Lần trước mẹ kể chuyện bà, rồi sao nữa ạ?');
  assert.equal(L.cardText('', '', { ...K, lang: 'en' }, 'mon-an'), tServer('en', 'topic.mon-an'));
});

test('câu mở mẫu: đúng câu và biến của bộ câu mẫu theo vai; chủ đề không có câu mẫu thì tên chủ đề', () => {
  const me = { lang: 'vi' as const, role: 'me', name: 'Lan', mascot: 'Mây' };
  assert.equal(C.templateOpener(me, 'tuoi-tho'), 'Hồi nhỏ mẹ hay chơi ở đâu, với ai? Mẹ kể con nghe một buổi chiều ngày ấy nhé.');
  assert.equal(C.templateOpener({ ...me, role: 'con', name: 'An' }, 'ban-be'), 'Kể mình nghe về một người bạn thân hồi đi học đi. Hai người hay làm gì cùng nhau?');
  assert.equal(C.templateOpener(me, 'cong-viec'), tServer('vi', 'topic.cuoc-song'));
  assert.equal(C.templateOpener({ ...me, role: 'con', name: 'An' }, 'ngay-cuoi'), tServer('vi', 'topic.ngay-cuoi'));   // con không có câu mẫu ngày cưới
  // Cùng câu với bộ câu mẫu (templateScript) ở chủ đề nó chọn, mọi vai và thứ tiếng: LiveCheck dùng thẳng làm p được.
  for (const lang of ['vi', 'en', 'ko'] as const) {
    for (const [role, name] of [['me', 'Lan'], ['bo', 'Hùng'], ['con', 'An']]) {
      const st = C.templateScript(lanCtx('x', { lang, member: { id: 'x', name, role, intro: {} } }), '2026-11-16').questions[1];
      assert.equal(C.templateOpener({ ...K, lang, role, name }, st.theme!), st.text, `${lang} ${role}`);
    }
  }
});

test('lượt Live: không trần 4 lượt, lời nhắn luôn lượt 0, ô chưa có vẫn đúng chủ đề, ngoài khoảng thì bỏ, kịch bản cũ thì bỏ', () => {
  const s = L.liveScript(lanCtx());
  const body = { idx: '2', turn: '7', question: 'Hồi đó Mẹ ở với ai ạ?', transcript: 'ở với bà', seconds: '4.2', theme: 'tuoi-tho', opener: 'Mẹ kể con nghe về tuổi thơ nhé' };
  assert.deepEqual(L.liveAnswerRow(s, body, K), { idx: 2, turn: 7, topic: 'tuoi-tho', question: 'Hồi đó Mẹ ở với ai ạ?', transcript: 'ở với bà', seconds: 4.2 });
  assert.equal(L.liveAnswerRow(s, { ...body, turn: '250' }, K)!.turn, 199);
  const relay = L.liveAnswerRow(s, { ...body, idx: '1', turn: '3' }, K)!;
  assert.deepEqual([relay.turn, relay.topic], [0, 'loi-nhan']);
  assert.equal(L.liveAnswerRow(s, { ...body, idx: '22' }, K), null);
  assert.equal(L.liveAnswerRow({ ...s, v: 2 }, body, K), null);
  // Thêm: câu Mây hỏi trong chuyện qua lớp lọc (tên lạ: câu mở; câu mở cũng hỏng: câu mẫu của chủ đề); ô có sẵn thì theo chủ đề của ô.
  assert.equal(L.liveAnswerRow(s, { ...body, question: 'Hồi đó Mẹ ở với cô Thảo ạ?' }, K)!.question, 'Mẹ kể con nghe về tuổi thơ nhé');
  assert.equal(L.liveAnswerRow(s, { ...body, question: 'Mẹ còn đau lưng không ạ?', opener: 'Lần trước mẹ kể...' }, K)!.question, C.templateOpener(K, 'tuoi-tho'));
  const inSlot = L.liveAnswerRow(L.placeStory(s, 2, story('mon-an'))!, { ...body, theme: undefined, question: 'x cô Thảo', opener: '' }, K)!;
  assert.deepEqual([inSlot.topic, inSlot.question], ['mon-an', C.templateOpener(K, 'mon-an')]);
  // Ô 3 là bản sao lấp chỗ trống (món ăn) mà lượt gửi kèm tuổi thơ: chủ đề và câu mẫu theo tuổi thơ.
  const copy = L.liveAnswerRow(L.placeStory(s, 4, story('mon-an'))!, { ...body, idx: '3', question: 'x cô Thảo', opener: '' }, K)!;
  assert.deepEqual([copy.topic, copy.question], ['tuoi-tho', C.templateOpener(K, 'tuoi-tho')]);
  assert.equal(L.liveAnswerRow(s, { ...body, theme: 'abc', question: '', opener: '' }, K)!.question, C.templateOpener(K, 'que-nha'));
  // Hỏi thăm và lời nhắn không thành thẻ chuyện: chỉ làm sạch (thiếu câu thì câu của ô); hỏi thăm cũng không trần lượt; chưa có lời chép thì null.
  assert.equal(L.liveAnswerRow(s, { idx: '0', turn: '12', question: 'Dạo này mẹ — khoẻ không ạ?' }, K)!.question, 'Dạo này mẹ, khoẻ không ạ?');
  assert.equal(L.liveAnswerRow(s, { idx: '0', turn: '12' }, K)!.turn, 12);
  assert.equal(L.liveAnswerRow(s, { idx: '1' }, K)!.question, s.questions[1].text);
  const bare = L.liveAnswerRow(s, { idx: 0 }, K)!;
  assert.deepEqual([bare.transcript, bare.seconds, bare.turn], [null, null, 0]);
  for (const idx of ['-1', 'abc', '1.5', '']) assert.equal(L.liveAnswerRow(s, { ...body, idx }, K), null, idx);
});

test('lượt ô 0: câu Mây chạm điều riêng (nhắc lại lời nhắn khó nói vừa nghe) không vào sổ nhớ, thay bằng câu của ô (v3 để trống)', () => {
  const s = L.liveScript(lanCtx());
  assert.equal(s.questions[0].text, '', 'ô hỏi thăm của kịch bản v3 không có câu sẵn');
  const k = { ...K, privates: [...K.privates, 'Mẹ thương bố nhiều lắm'] };
  const echo = L.liveAnswerRow(s, { idx: '0', turn: '3', question: 'Dạ con sẽ nhắn bố là mẹ thương bố nhiều lắm. Chào mẹ nhé', transcript: 'Chào con' }, k)!;
  assert.equal(echo.question, s.questions[0].text, 'nhắc lại lời nhắn: câu của ô');
  assert.equal(echo.transcript, 'Chào con', 'lời người kể giữ nguyên');
  assert.equal(L.liveAnswerRow(s, { idx: '0', turn: '1', question: 'Mẹ còn đau lưng không ạ?' }, k)!.question, s.questions[0].text, 'chạm điều riêng của người nghe: câu của ô');
  assert.equal(L.liveAnswerRow(s, { idx: '0', turn: '2', question: 'Hôm nay mẹ ăn gì ạ?' }, k)!.question, 'Hôm nay mẹ ăn gì ạ?', 'câu thường giữ nguyên');
  assert.equal(L.liveAnswerRow(s, { idx: '1', question: 'Mẹ có điều gì khó nói muốn nhắn không ạ?' }, k)!.question, 'Mẹ có điều gì khó nói muốn nhắn không ạ?', 'ô lời nhắn không vào sổ nhớ: chỉ làm sạch');
});

test('ô lời nhắn giữ lời dài nhất (phán quyết R6): lượt sau ngắn hơn không đè, dài hơn thì thay; ô chuyện thì lượt nào cũng ghi, gửi lại thì thay', async () => {
  const db = lanHome();
  const call = db.calls[0] as { id: string; family_id: string; member_id: string };
  const s = L.liveScript(lanCtx());
  const ask ='Mẹ có điều gì khó nói muốn con nhắn ai không ạ?';
  const relay = (transcript: string) => L.liveAnswerRow(s, { idx: '1', turn: '0', question: ask, transcript }, K)!;
  const msg = 'Con nhắn An là mẹ thương con lắm, con nhớ giữ sức khoẻ nhé';
  assert.equal(await L.storeLiveAnswer(call, relay('Dạ có'), '/media/a1.webm', db), true);
  assert.equal(await L.storeLiveAnswer(call, relay(msg), '/media/a2.webm', db), true);
  assert.equal(await L.storeLiveAnswer(call, relay('Dạ vâng, tạm biệt con'), '/media/a3.webm', db), false);
  assert.equal(await L.storeLiveAnswer(call, relay(msg), '/media/a2b.webm', db), false);   // gửi lại y hệt: giữ hàng cũ
  const rows = db.answers.filter((a) => a.idx === 1);
  assert.equal(rows.length, 1);
  // Lời nhắn khó nói không bao giờ có media ở call_answers (podcast chỉ lấy hàng có media).
  assert.deepEqual([rows[0].transcript, rows[0].topic, rows[0].turn, rows[0].media, rows[0].question], [msg, 'loi-nhan', 0, null, ask]);
  // Lời nhắn để rút người nhận lúc chốt là đúng hàng ấy; cuộc gọi không có lời nhắn thì null.
  // Vòng sửa 1: chỉ cuộc gọi v3 của chính người này.
  assert.deepEqual(await L.relayAnswer('c1', 'lan', db), { call: { id: 'c1', family_id: 'F', member_id: 'lan' }, question: ask, transcript: msg });
  assert.equal(await L.relayAnswer('khong-co', 'lan', db), null);
  assert.equal(await L.relayAnswer('c1', 'an', db), null);
  const v2 = lanHome({ answers: [{ call_id: 'c1', idx: 1, turn: 0, topic: 'loi-nhan', question: ask, transcript: msg }] }, { script: JSON.stringify(C.templateScript(lanCtx(), '2026-11-16')) });
  assert.equal(await L.relayAnswer('c1', 'lan', v2), null);
  // Ô chuyện: mỗi (ô, lượt) một hàng có media, lượt sau ngắn hơn vẫn ghi; gửi lại thì thay hàng cũ.
  const turn = (t: string, transcript: string) => L.liveAnswerRow(s, { idx: '2', turn: t, question: 'Hồi đó Mẹ ở với ai ạ?', transcript, theme: 'tuoi-tho', opener: '' }, K)!;
  assert.equal(await L.storeLiveAnswer(call, turn('0', 'dài lắm lắm lắm'), '/media/s0.webm', db), true);
  assert.equal(await L.storeLiveAnswer(call, turn('1', 'ngắn'), '/media/s1.webm', db), true);
  assert.equal(await L.storeLiveAnswer(call, turn('1', 'ngắn'), '/media/s1b.webm', db), true);
  assert.deepEqual(db.answers.filter((a) => a.idx === 2).map((a) => [a.turn, a.media, a.topic]), [[0, '/media/s0.webm', 'tuoi-tho'], [1, '/media/s1b.webm', 'tuoi-tho']]);
});

test('bộ kiểm câu: điều riêng là điều self của chính người nghe và điều chưa nói; dữ liệu thật không có lời nhắn khó nói; cờ theo cuộc gọi xong và ảnh', async () => {
  const db = lanHome({
    members: [{ id: 'lan', family_id: 'F', name: 'Lan', role: 'me', intro: JSON.stringify({ kid: 'son', food: 'canh chua', love: 'never', unsaid: 'Con xin lỗi mẹ chuyện năm ngoái' }) },
      { id: 'an', family_id: 'F', name: 'An', role: 'con', city: 'hanoi' }],
    families: [{ id: 'F', mascot_name: 'Bông' }],
    facts: [
      { family_id: 'F', text: 'Mẹ bị đau lưng mấy tháng nay', text_en: 'Mom has had back pain for months', visibility: 'self', source_id: 'lan' },
      { family_id: 'F', text: 'An thích canh chua', text_en: 'An loves sour soup', visibility: 'family', source_id: 'an' },
      { family_id: 'F', text: 'BÍ MẬT CỦA AN', text_en: 'AN SECRET', visibility: 'self', source_id: 'an' },
      { family_id: 'F', text: 'Câu cũ đã thay', text_en: 'Old replaced', visibility: 'family', source_id: 'an', replacement_id: 'x' },
    ],
    events: [{ family_id: 'F', title: 'Sinh nhật An' }],
    answers: [
      { call_id: 'c1', idx: 2, turn: 0, topic: 'tuoi-tho', transcript: 'hồi đó có cô Thảo ở cạnh nhà' },
      { call_id: 'c1', idx: 1, turn: 0, topic: 'loi-nhan', transcript: 'nhắn chị Hoa là em xin lỗi' },
    ],
  });
  const call = { id: 'c1', family_id: 'F', member_id: 'lan', script: db.calls[0].script };
  const k = await L.loadLiveCheck(call, db);
  // Vòng sửa 1: lời nhắn khó nói của chính cuộc gọi này cũng là điều riêng (chỉ ở privates, không bao giờ ở hay).
  assert.deepEqual(k.privates, ['Mẹ bị đau lưng mấy tháng nay', 'Mom has had back pain for months', 'Con xin lỗi mẹ chuyện năm ngoái', 'nhắn chị Hoa là em xin lỗi']);
  for (const w of ['Lan', 'An', 'Bông', 'Hà Nội', 'An thích canh chua', 'An loves sour soup', 'Sinh nhật An', 'cô Thảo', 'son', 'canh chua']) assert.ok(k.hay.includes(w), w);
  for (const w of ['đau lưng', 'back pain', 'BÍ MẬT', 'AN SECRET', 'Câu cũ', 'Hoa', 'xin lỗi', 'never']) assert.ok(!k.hay.includes(w), w);
  assert.deepEqual(k.allow, { prevCall: false, ownStory: true, photos: false });
  assert.deepEqual([k.lang, k.role, k.name, k.mascot], ['vi', 'me', 'Lan', 'Bông']);
  // Tên người nghe vừa kể trong cuộc gọi này thì thẻ giữ được; tên chỉ có trong lời nhắn khó nói thì không.
  assert.equal(L.cardText('Cô Thảo hồi đó ở cạnh nhà mẹ ạ?', 'X', k, 'tuoi-tho'), 'Cô Thảo hồi đó ở cạnh nhà mẹ ạ?');
  assert.equal(L.cardText('Mẹ nhắn chị Hoa điều gì ạ?', 'X', k, 'tuoi-tho'), 'X');
  // Có cuộc gọi đã xong và có ảnh: được nhắc cuộc gọi trước và ảnh (liveAllow, một chỗ tính).
  db.calls.push({ id: 'c0', family_id: 'F', member_id: 'lan', status: 'done', script: '{}' });
  db.photos.lan = 2;
  assert.deepEqual((await L.loadLiveCheck(call, db)).allow, { prevCall: true, ownStory: true, photos: true });
  // DB giả (không phải pool) thì không nhớ đệm: mỗi lần đều đọc lại.
  const reads = () => db.sql.filter((q) => q === L.LIVE_SQL.checkMember).length;
  const n = reads();
  await L.liveCheckFor(call, db);
  assert.equal(reads(), n + 1);
});

test('lưu ô chuyện: câu mở qua lớp lọc, hỏng thì câu mẫu; ghi đè đồng thời thì thử lại; cuộc gọi người khác thì missing', async () => {
  const db = lanHome();
  assert.equal(await L.saveStory('c1', 'lan', { idx: '2', theme: 'tuoi-tho', opener: 'Hồi đó Mẹ ở với cô Thảo ạ?' }, db), 'ok');
  let s = scriptOf(db);
  assert.deepEqual(s.questions[2], { text: C.templateOpener(K, 'tuoi-tho'), topic: 'tuoi-tho', photo: false, event: 'none', part: 'story', theme: 'tuoi-tho' });
  // Một /story khác (ô 4) ghi chen vào giữa lúc đọc và lúc ghi: lần ghi đầu hụt, đọc lại rồi ghi lên bản mới, không mất ô nào.
  db.onCas = () => {
    const c = db.calls[0];
    c.script = JSON.stringify(L.placeStory(JSON.parse(c.script), 4, story('ban-be', 'Mẹ kể con nghe về bạn thân hồi nhỏ nhé')));
  };
  const before = db.cas;
  assert.equal(await L.saveStory('c1', 'lan', { idx: '3', theme: 'mon-an', opener: 'Mẹ kể con nghe về món canh chua nhé' }, db), 'ok');
  assert.equal(db.cas - before, 2);
  s = scriptOf(db);
  assert.deepEqual(s.questions.map((q) => q.theme ?? null), [null, null, 'tuoi-tho', 'mon-an', 'ban-be']);
  assert.equal(s.questions[3].text, 'Mẹ kể con nghe về món canh chua nhé');   // câu mở sạch giữ nguyên
  // Gửi lại đúng như cũ (hàng chờ thử lại): không ghi gì.
  const n = db.cas;
  assert.equal(await L.saveStory('c1', 'lan', { idx: 3, theme: 'mon-an', opener: 'Mẹ kể con nghe về món canh chua nhé' }, db), 'ok');
  assert.equal(db.cas, n);
  // Câu mở chạm điều riêng của chính người nghe: câu mẫu, điều riêng không bao giờ thành thẻ.
  await L.saveStory('c1', 'lan', { idx: '5', theme: 'que-nha', opener: 'Dạo này mẹ còn đau lưng không, kể con nghe về quê mình nhé' }, db);
  assert.equal(scriptOf(db).questions[5].text, C.templateOpener(K, 'que-nha'));
  assert.doesNotMatch(db.calls[0].script, /đau lưng/);
  // Chuyện ngày cưới mang loại ngày cưới cho lịch chung, như bộ câu cũ.
  await L.saveStory('c1', 'lan', { idx: '6', theme: 'ngay-cuoi', opener: 'Mẹ kể con nghe ngày cưới của mẹ nhé' }, db);
  assert.equal(scriptOf(db).questions[6].event, 'wedding');
  assert.equal(await L.saveStory('c1', 'an', { idx: '7', theme: 'mon-an', opener: 'x' }, db), 'missing');
  assert.equal(await L.saveStory('khong-co', 'lan', { idx: '7', theme: 'mon-an', opener: 'x' }, db), 'missing');
  for (const b of [{ idx: '7', theme: 'abc' }, { idx: '1', theme: 'mon-an' }, { idx: '22', theme: 'mon-an' }, { idx: 'x', theme: 'mon-an' }, { theme: 'mon-an' }]) {
    assert.equal(await L.saveStory('c1', 'lan', { ...b, opener: 'x' }, db), 'invalid', JSON.stringify(b));
  }
  // Kịch bản cũ (v2) không có ô chuyện Live.
  const old = lanHome({}, { script: JSON.stringify(C.templateScript(lanCtx(), '2026-11-16')) });
  assert.equal(await L.saveStory('c1', 'lan', { idx: '2', theme: 'mon-an', opener: 'x' }, old), 'invalid');
});

test('chốt cuộc gọi Live: lưu câu hẹn sạch; câu hẹn có tên lạ hay điều riêng thì bỏ; đếm câu nghi bịa', async () => {
  const db = lanHome();
  const hook = 'Tuần sau Mẹ kể tiếp chuyện bà ngoại nhé';
  const may = JSON.stringify(['Chào Mẹ ạ', 'Lần trước Mẹ kể chuyện bà']);
  logs.length = 0;
  assert.deepEqual(await L.finishLive('c1', 'lan', { may, hook }, db), { lines: 2, flagged: 1, hook: true });
  assert.equal(scriptOf(db).next_hook, hook);
  assert.ok(logs.includes('[call-live] câu nghi bịa (nhắc cuộc gọi trước không có): "Lần trước Mẹ kể chuyện bà"'), logs.join('\n'));
  assert.ok(logs.some((l) => l.includes('[call-live] cuộc gọi c1: 2 câu của Mây, 1 câu nghi bịa')), logs.join('\n'));
  // Vòng sửa 1: log chỉ chép lý do và 40 chữ đầu; câu chạm điều riêng thì không chép chữ nào.
  logs.length = 0;
  await L.finishLive('c1', 'lan', { may: JSON.stringify(['Lần trước Mẹ kể chuyện bà ngoại hồi còn ở quê với cả nhà', 'Lần trước mẹ kể mẹ bị đau lưng']) }, db);
  assert.ok(logs.includes('[call-live] câu nghi bịa (nhắc cuộc gọi trước không có): "Lần trước Mẹ kể chuyện bà ngoại hồi còn…"'), logs.join('\n'));
  assert.ok(logs.includes('[call-live] câu nghi bịa (nhắc cuộc gọi trước không có)'), logs.join('\n'));
  assert.ok(!logs.some((l) => l.includes('đau lưng')), logs.join('\n'));
  for (const bad of ['Tuần sau kể con nghe chuyện cô Thảo', 'Tuần sau mẹ hết đau lưng chưa']) {
    logs.length = 0;
    assert.equal((await L.finishLive('c1', 'lan', { may: '[]', hook: bad }, db)).hook, false, bad);
    assert.equal(scriptOf(db).next_hook, hook, bad);   // câu hỏng không được ghi
    assert.ok(logs.some((l) => l.startsWith('[call-live] bỏ câu hẹn')), logs.join('\n'));
    assert.ok(!logs.some((l) => l.includes('đau lưng')));   // log không chép điều riêng
  }
  // may là mảng (thân JSON) cũng được, tối đa 120 câu; không có câu hẹn thì không ghi gì; gửi lại cùng câu hẹn thì không ghi lại.
  const n = db.cas;
  assert.deepEqual(await L.finishLive('c1', 'lan', { may: Array(130).fill('Dạ vâng ạ') }, db), { lines: 120, flagged: 0, hook: false });
  assert.deepEqual(await L.finishLive('c1', 'lan', { may: 'không phải JSON', hook }, db), { lines: 0, flagged: 0, hook: true });
  assert.equal(db.cas, n);
  // Câu hẹn dài thì cắt còn tối đa 200 chữ.
  await L.finishLive('c1', 'lan', { hook: `Tuần sau mẹ kể tiếp nhé ${'à '.repeat(200)}` }, db);
  const long = scriptOf(db).next_hook!;
  assert.ok(long.startsWith('Tuần sau mẹ kể tiếp nhé à') && long.length <= 200 && long.length >= 190, long);
  // Cuộc gọi người khác, không có, hay kịch bản cũ: không làm gì.
  const zero = { lines: 0, flagged: 0, hook: false };
  assert.deepEqual(await L.finishLive('c1', 'an', { may, hook }, db), zero);
  assert.deepEqual(await L.finishLive('khong-co', 'lan', { may, hook }, db), zero);
  const old = lanHome({}, { script: JSON.stringify(C.templateScript(lanCtx(), '2026-11-16')) });
  assert.deepEqual(await L.finishLive('c1', 'lan', { may, hook }, old), zero);
  assert.equal(scriptOf(old).next_hook, undefined);
  // Đã có cuộc gọi xong: "lần trước" không còn là câu nghi bịa.
  const later = lanHome();
  later.calls.push({ id: 'c0', family_id: 'F', member_id: 'lan', status: 'done', script: '{}' });
  assert.equal((await L.finishLive('c1', 'lan', { may }, later)).flagged, 0);
});

test('lời nhắn khó nói của cuộc gọi này là điều riêng: thẻ, câu mở, câu hẹn nhắc lại lời nhắn thì bỏ; câu không liên quan vẫn giữ', async () => {
  // An (con) gọi; lời nhắn khó nói (ô 1) là xin lỗi bố chuyện cãi nhau hôm Tết.
  const msg = 'con xin lỗi bố chuyện cãi nhau hôm tết';
  const db = lanHome({ answers: [{ call_id: 'c1', idx: 1, turn: 0, topic: 'loi-nhan', question: 'q', transcript: msg }] }, { member_id: 'an' });
  const call = { id: 'c1', family_id: 'F', member_id: 'an', script: db.calls[0].script };
  const k = await L.loadLiveCheck(call, db);
  assert.ok(k.privates.includes(msg));
  assert.ok(!k.hay.includes('cãi nhau'));   // không bao giờ thành dữ liệu thật
  // Câu nói lại lời nhắn bằng chữ khác vẫn bị bắt; câu chuyện không liên quan giữ nguyên.
  assert.equal(L.cardText('Hôm tết con với bố cãi nhau chuyện gì vậy?', 'X', k, 'tuoi-tho'), 'X');
  assert.equal(L.cardText('Hồi nhỏ bạn hay chơi gì nhất?', 'X', k, 'tuoi-tho'), 'Hồi nhỏ bạn hay chơi gì nhất?');
  // Câu mở nhắc lại lời nhắn: câu mẫu; câu mở khác vẫn lưu nguyên.
  await L.saveStory('c1', 'an', { idx: '2', theme: 'tet-cac-dip', opener: 'Kể mình nghe chuyện hôm tết cãi nhau với bố đi' }, db);
  assert.equal(scriptOf(db).questions[2].text, C.templateOpener(k, 'tet-cac-dip'));
  await L.saveStory('c1', 'an', { idx: '3', theme: 'mon-an', opener: 'Kể mình nghe về món ăn ở nhà mà bạn nhớ nhất đi' }, db);
  assert.equal(scriptOf(db).questions[3].text, 'Kể mình nghe về món ăn ở nhà mà bạn nhớ nhất đi');
  // Câu Mây hỏi trong chuyện nhắc lại lời nhắn: thẻ là câu mở của ô.
  const row = L.liveAnswerRow(scriptOf(db), { idx: '2', turn: '1', question: 'Hôm tết con với bố cãi nhau chuyện gì vậy?', theme: 'tet-cac-dip' }, k)!;
  assert.equal(row.question, C.templateOpener(k, 'tet-cac-dip'));
  // Câu hẹn nhắc lại lời nhắn: bỏ, log không chép câu; câu hẹn khác vẫn lưu.
  logs.length = 0;
  assert.equal((await L.finishLive('c1', 'an', { hook: 'Tuần sau kể tiếp chuyện cãi nhau hôm tết nhé' }, db)).hook, false);
  assert.equal(scriptOf(db).next_hook, undefined);
  assert.ok(!logs.some((l) => l.includes('cãi nhau')), logs.join('\n'));
  assert.equal((await L.finishLive('c1', 'an', { hook: 'Tuần sau kể mình nghe về món ăn ở nhà nhé' }, db)).hook, true);
  assert.equal(scriptOf(db).next_hook, 'Tuần sau kể mình nghe về món ăn ở nhà nhé');
});

test('POST /call/:id/story: thân JSON hay multipart (hàng chờ gửi FormData) đều được; sai thì 400 live_story_invalid, cuộc gọi người khác 404', async () => {
  const db = lanHome();
  const srv = await serve(deps({ db }));
  try {
    assert.deepEqual(await srv.post('/api/call/c1/story', 'lan', { idx: 2, theme: 'mon-an', opener: 'Mẹ kể con nghe về món canh chua nhé' }), { status: 200, body: { ok: true } });
    const fd = new FormData();
    fd.set('idx', '3'); fd.set('theme', 'tuoi-tho'); fd.set('opener', 'Mẹ kể con nghe về tuổi thơ nhé');
    const r = await fetch(`${srv.base}/api/call/c1/story`, { method: 'POST', headers: { 'x-member': 'lan', 'x-lang': 'vi' }, body: fd });
    assert.deepEqual([r.status, await r.json()], [200, { ok: true }]);
    assert.deepEqual(scriptOf(db).questions.slice(2).map((q) => [q.theme, q.text]),
      [['mon-an', 'Mẹ kể con nghe về món canh chua nhé'], ['tuoi-tho', 'Mẹ kể con nghe về tuổi thơ nhé']]);
    const bad = await srv.post('/api/call/c1/story', 'lan', { idx: 4, theme: 'abc', opener: 'x' });
    assert.deepEqual([bad.status, bad.body.code, bad.body.error], [400, 'live_story_invalid', 'Câu chuyện không hợp lệ']);
    const miss = await srv.post('/api/call/c1/story', 'an', { idx: 4, theme: 'mon-an', opener: 'x' });
    assert.deepEqual([miss.status, miss.body.code], [404, 'call_not_found']);
  } finally {
    srv.close();
  }
});

// ---------- Qua callRouter (pool giả): /answer?live=1 và /finish. Để cuối tệp: pool.query bị thay tới hết tệp. ----------

const { pool } = await import('./db.ts');
const until = async (ok: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  return ok();
};

/** App express gắn callRouter thật (multer ghi tệp vào MEDIA_DIR); pool.query là DB giả; req.member như lớp auth (nhà theo bảng members). */
async function serveCall(db: ReturnType<typeof fakeDb>) {
  (pool as any).query = db.query;
  const app = express();
  app.use(express.json());
  app.use(langMiddleware);
  app.use((req: any, _res, next) => {
    const id = String(req.headers['x-member']);
    req.member = { id, family_id: db.members.find((m) => m.id === id)?.family_id ?? 'F' };
    next();
  });
  app.use('/api', C.callRouter(multer({ dest: process.env.MEDIA_DIR! })));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const form = async (p: string, who: string, fields: Record<string, string>, file = false) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    if (file) fd.set('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }), 'turn.webm');
    const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'x-member': who, 'x-lang': 'vi' }, body: fd });
    return { status: r.status, body: await r.json() };
  };
  return { form, base, close: () => server.close() };
}

test('/answer?live=1: đúng ô và lượt (không trần 4), thẻ qua lớp lọc, không chép lời, không AI; trần riêng 120; ?live=1 không mở đường cũ; đường cũ giữ nguyên', async () => {
  const v3 = L.placeStory(L.liveScript(lanCtx()), 2, story('tuoi-tho', 'Mẹ kể con nghe về tuổi thơ nhé'))!;
  const v2 = JSON.stringify(C.templateScript(lanCtx(), '2026-11-16'));
  const db = fakeDb({
    members: [{ id: 'lan-a', family_id: 'FA', name: 'Lan', role: 'me', intro: '{}' }, { id: 'hung-a', family_id: 'FA', name: 'Hùng', role: 'bo', intro: '{}' }],
    families: [{ id: 'FA' }],
    calls: [
      { id: 'live-a', family_id: 'FA', member_id: 'lan-a', status: 'ready', script: JSON.stringify(v3) },
      { id: 'v2-a', family_id: 'FA', member_id: 'lan-a', status: 'ready', script: v2 },
      { id: 'old-a', family_id: 'FA', member_id: 'hung-a', status: 'ready', script: v2 },
    ],
  }, { lenient: true });
  const srv = await serveCall(db);
  const files = () => readdirSync(process.env.MEDIA_DIR!).length;
  try {
    const r = await srv.form('/call/live-a/answer?live=1', 'lan-a',
      { live: '1', idx: '2', turn: '7', question: 'Hồi đó Mẹ ở với cô Thảo ạ?', transcript: '', seconds: '4.2', theme: 'tuoi-tho', opener: 'Mẹ kể con nghe về tuổi thơ nhé' }, true);
    assert.deepEqual(r, { status: 200, body: { ok: true, transcript: null, reply: null, ai: null } });
    const row = db.answers.find((a) => a.call_id === 'live-a')!;
    assert.deepEqual([row.idx, row.turn, row.topic, row.question, row.transcript, row.seconds], [2, 7, 'tuoi-tho', 'Mẹ kể con nghe về tuổi thơ nhé', null, 4.2]);
    assert.match(row.media, /^\/media\/\w+$/);
    // Trần riêng của lượt Live: thêm 40 lượt trong 10 phút vẫn nhận (trần cũ 30 đã chặn).
    for (let i = 0; i < 40; i++) {
      const x = await srv.form('/call/live-a/answer?live=1', 'lan-a', { live: '1', idx: '0', turn: String(i), question: 'Dạo này mẹ khoẻ không ạ?', transcript: 'khoẻ' });
      assert.equal(x.status, 200, `lượt ${i}`);
    }
    assert.equal(db.answers.filter((a) => a.call_id === 'live-a' && a.idx === 0).length, 40);
    // ?live=1 mà không phải lượt Live trên kịch bản v3: 400, tệp bị xoá, không đi đường cũ (đường cũ có chép lời và AI).
    const n = files();
    const notV3 = await srv.form('/call/v2-a/answer?live=1', 'lan-a', { live: '1', idx: '1', turn: '0', transcript: 'x' }, true);
    assert.deepEqual([notV3.status, notV3.body.code], [400, 'question_not_found']);
    assert.equal((await srv.form('/call/live-a/answer?live=1', 'lan-a', { idx: '2', turn: '0', transcript: 'x' }, true)).status, 400);
    // Ô ngoài khoảng: 400, tệp bị xoá.
    const out = await srv.form('/call/live-a/answer?live=1', 'lan-a', { live: '1', idx: '22', turn: '0', transcript: 'x' }, true);
    assert.deepEqual([out.status, out.body.code], [400, 'question_not_found']);
    assert.equal(files(), n);
    assert.ok(!db.answers.some((a) => a.call_id === 'v2-a'));
    // Đường cũ (không ?live=1, kịch bản v2): như trước, lượt trần 4, câu hỏi thêm theo câu máy gửi, trần 30 lượt mỗi 10 phút.
    const o = await srv.form('/call/old-a/answer', 'hung-a', { idx: '1', turn: '7', question: 'Câu hỏi thêm', transcript: 'chuyện cũ' });
    assert.deepEqual(o, { status: 200, body: { ok: true, transcript: 'chuyện cũ', reply: null, ai: null } });
    const orow = db.answers.find((a) => a.call_id === 'old-a')!;
    assert.deepEqual([orow.idx, orow.turn, orow.question, orow.topic], [1, 4, 'Câu hỏi thêm', JSON.parse(v2).questions[1].topic]);
    for (let i = 1; i < 30; i++) assert.equal((await srv.form('/call/old-a/answer', 'hung-a', { idx: '1', turn: '1', transcript: 'x' })).status, 200, `cũ ${i}`);
    const cap = await srv.form('/call/old-a/answer', 'hung-a', { idx: '1', turn: '1', transcript: 'x' });
    assert.deepEqual([cap.status, cap.body.code], [429, 'slow_down']);
  } finally {
    srv.close();
  }
});

test('ô lời nhắn qua /answer?live=1 rồi /finish: giữ lời dài nhất, rút lời nhắn lúc chốt từ đúng lời ấy; /finish lưu câu hẹn, ghi log chống bịa; /finish không thân thì như cũ', async () => {
  const db = fakeDb({
    members: [{ id: 'lan-b', family_id: 'FB', name: 'Lan', role: 'me', intro: '{}', lang: 'vi' }, { id: 'an-b', family_id: 'FB', name: 'An', role: 'con', lang: 'vi' }],
    families: [{ id: 'FB' }],
    calls: [
      { id: 'live-b', family_id: 'FB', member_id: 'lan-b', status: 'ready', script: JSON.stringify(L.liveScript(lanCtx())) },
      { id: 'old-b', family_id: 'FB', member_id: 'lan-b', status: 'ready', script: JSON.stringify(C.templateScript(lanCtx(), '2026-11-16')) },
    ],
  }, { lenient: true });
  const srv = await serveCall(db);
  const ask = 'Mẹ có điều gì khó nói muốn con nhắn ai không ạ?';
  const relay = (transcript: string) => srv.form('/call/live-b/answer?live=1', 'lan-b', { live: '1', idx: '1', turn: '0', question: ask, transcript, seconds: '2' }, true);
  const update = `update calls set status = 'done', done_at = now() where id = $1 and member_id = $2 and status = 'ready'`;
  try {
    const msg = 'Con nhắn An là mẹ thương con lắm, con nhớ giữ sức khoẻ nhé';
    const n = readdirSync(process.env.MEDIA_DIR!).length;
    for (const t of ['Dạ có', msg, 'Dạ vâng, tạm biệt con']) assert.equal((await relay(t)).status, 200, t);
    // Tiếng của lời nhắn khó nói không giữ lại tệp nào (relays.media chưa nơi nào đọc; tệp không hàng nào trỏ tới thì xoá người không dọn được).
    assert.equal(readdirSync(process.env.MEDIA_DIR!).length, n);
    assert.deepEqual(db.answers.filter((a) => a.call_id === 'live-b').map((a) => [a.idx, a.transcript, a.media]), [[1, msg, null]]);
    // Cuộc gọi chưa chốt: chưa rút lời nhắn (lượt sau có thể mới là lời thật).
    assert.ok(!db.sql.includes('select 1 from relays where call_id = $1 limit 1'));
    logs.length = 0;
    const f = await srv.form('/call/live-b/finish', 'lan-b', { hook: 'Tuần sau Mẹ kể tiếp chuyện bà ngoại nhé', may: JSON.stringify(['Chào Mẹ ạ', 'Lần trước Mẹ kể chuyện bà']) });
    assert.deepEqual(f, { status: 200, body: { ok: true } });
    const call = db.calls.find((c) => c.id === 'live-b')!;
    assert.equal(call.status, 'done');
    assert.equal(JSON.parse(call.script).next_hook, 'Tuần sau Mẹ kể tiếp chuyện bà ngoại nhé');
    assert.ok(logs.includes('[call-live] câu nghi bịa (nhắc cuộc gọi trước không có): "Lần trước Mẹ kể chuyện bà"'), logs.join('\n'));
    // Câu hẹn và log ghi trước khi chốt.
    assert.ok(db.sql.lastIndexOf(L.LIVE_SQL.cas) < db.sql.indexOf(update));
    assert.ok(await until(() => db.relays.length > 0), 'lời nhắn được rút lúc chốt');
    assert.deepEqual(db.relays.map((x) => [x.call_id, x.from_id, x.to_id, x.transcript]), [['live-b', 'lan-b', 'an-b', msg]]);
    // Gửi lại /finish (hàng chờ thử lại): không chốt lại, không rút lại.
    assert.deepEqual(await srv.form('/call/live-b/finish', 'lan-b', { hook: 'Tuần sau Mẹ kể tiếp chuyện bà ngoại nhé', may: '[]' }), { status: 200, body: { ok: true } });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(db.relays.length, 1);
    // /finish không thân (màn cũ): chốt như trước, không đọc kịch bản, không rút lời nhắn kiểu Live, không log Live.
    logs.length = 0;
    const before = db.sql.length;
    const r = await fetch(`${srv.base}/call/old-b/finish`, { method: 'POST', headers: { 'x-member': 'lan-b' } });
    assert.deepEqual([r.status, await r.json()], [200, { ok: true }]);
    assert.equal(db.calls.find((c) => c.id === 'old-b')!.status, 'done');
    await new Promise((r) => setTimeout(r, 50));
    const mine = db.sql.slice(before);
    // Đường đi của yêu cầu như cũ (câu đầu là câu chốt); sau khi chốt chỉ đọc kịch bản một lần ở nền để biết có phải v3 không.
    assert.equal(mine[0], update);
    assert.ok(mine.indexOf(L.LIVE_SQL.script) > 0 && !mine.includes(L.LIVE_SQL.relaySlot), mine.join('\n'));
    assert.ok(!logs.some((l) => l.includes('[call-live]')));
  } finally {
    srv.close();
  }
});

test('/finish rút lời nhắn theo kịch bản v3, không theo trường gửi kèm: Live không có hook, may vẫn rút; v2 giả trường Live không vào; lỗi DB lúc ghi ô lời nhắn không để lại tệp', async () => {
  const ask = 'Mẹ có điều gì khó nói muốn con nhắn ai không ạ?';
  const msg = 'Con nhắn An là mẹ thương con lắm, con nhớ giữ sức khoẻ nhé';
  const db = fakeDb({
    members: [{ id: 'lan-c', family_id: 'FC', name: 'Lan', role: 'me', intro: '{}', lang: 'vi' }, { id: 'an-c', family_id: 'FC', name: 'An', role: 'con', lang: 'vi' }],
    families: [{ id: 'FC' }],
    calls: [
      { id: 'live-c', family_id: 'FC', member_id: 'lan-c', status: 'ready', script: JSON.stringify(L.liveScript(lanCtx())) },
      { id: 'v2-c', family_id: 'FC', member_id: 'lan-c', status: 'ready', script: JSON.stringify(C.templateScript(lanCtx(), '2026-11-16')) },
    ],
    // Hàng giả ở ô 1 của cuộc gọi v2: nếu /finish chỉ nhìn trường gửi kèm thì sẽ rút nhầm.
    answers: [{ call_id: 'v2-c', idx: 1, turn: 0, topic: 'loi-nhan', question: ask, transcript: msg }],
  }, { lenient: true });
  const srv = await serveCall(db);
  const relay = (transcript: string) => srv.form('/call/live-c/answer?live=1', 'lan-c', { live: '1', idx: '1', turn: '0', question: ask, transcript }, true);
  const files = () => readdirSync(process.env.MEDIA_DIR!).length;
  try {
    // DB lỗi lúc ghi ô lời nhắn: 500 (hàng chờ thử lại), tệp tiếng đã xoá trước đó.
    const n = files();
    db.fail = L.LIVE_SQL.slotLen;
    const err = console.error;
    console.error = () => {};   // lỗi giả, không in ra đầu ra test
    try { assert.equal((await relay(msg)).status, 500); } finally { console.error = err; db.fail = undefined; }
    assert.equal(files(), n);
    assert.equal((await relay(msg)).status, 200);
    // v2 giả trường Live: không ghi câu hẹn, không log Live, không rút lời nhắn.
    logs.length = 0;
    assert.deepEqual(await srv.form('/call/v2-c/finish', 'lan-c', { hook: 'Tuần sau kể tiếp nhé', may: '["Lần trước Mẹ kể"]' }), { status: 200, body: { ok: true } });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(db.calls.find((c) => c.id === 'v2-c')!.status, 'done');
    assert.equal(JSON.parse(db.calls.find((c) => c.id === 'v2-c')!.script).next_hook, undefined);
    assert.ok(!logs.some((l) => l.includes('[call-live]')), logs.join('\n'));
    assert.ok(!db.sql.includes(L.LIVE_SQL.relaySlot));
    assert.equal(db.relays.length, 0);
    // Cuộc gọi Live chốt mà không gửi hook, may (không thân): vẫn rút lời nhắn từ ô 1.
    const r = await fetch(`${srv.base}/call/live-c/finish`, { method: 'POST', headers: { 'x-member': 'lan-c' } });
    assert.deepEqual([r.status, await r.json()], [200, { ok: true }]);
    assert.ok(await until(() => db.relays.length > 0), 'lời nhắn được rút');
    assert.deepEqual(db.relays.map((x) => [x.call_id, x.to_id, x.transcript, x.media]), [['live-c', 'an-c', msg, null]]);
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    srv.close();
  }
});
