// Kiểm thử Mây Live bản thử (server/calllive.ts, server/liveconfig.ts): cấu hình, token dùng một lần, tiền mỗi cuộc gọi,
// kịch bản v3, nhấc máy (công tắc, trần phút, xin token) và kết thúc (ghi giây, tiền); dữ liệu Live (riêng tư), lời dặn, bảy công cụ (task 3).
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
import type { ScriptExtras } from './callfacts.ts';

process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'calllive-test-'));
// Log [call-live] của máy chủ gom vào đây (test đọc được, đầu ra test sạch). console.error giữ nguyên để lỗi thật vẫn hiện.
const logs: string[] = [];
console.log = console.warn = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };

const L = await import('./calllive.ts');
const { liveConfig } = await import('./liveconfig.ts');
const { LIVE_FIRST_STORY, STORY_THEMES, themesFor } = await import('../src/shared.ts');
const { seedsFor } = await import('./callfacts.ts');
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
  assert.ok(b.includes('call story_open with its theme and that exact opener as you say it'));
  assert.ok(b.indexOf(c.extras!.seeds[0].hint) < b.indexOf(c.extras!.seeds[1].hint));
  assert.ok(b.indexOf(c.extras!.seeds[1].hint) < b.indexOf(c.extras!.seeds[2].hint));
  assert.ok(b.includes('"id": "r1"'));
  assert.ok(b.trimEnd().endsWith('Reply in Vietnamese.'));
  assert.ok(b.includes('\n\nReply in Vietnamese.'));
  assert.doesNotMatch(b, /[—–]/);
  // Ảnh: gọi ask_photo trước story_close hay ngay sau (phán quyết R5).
  assert.ok(b.includes('ask_photo before story_close or right after it'));
  // Câu hẹn: chỉ là chủ đề chuyện tuần sau, không bao giờ lời nhắn khó nói hay điều riêng, nhạy cảm (phán quyết mang từ task 2).
  assert.ok(b.includes('never the hard-to-say message, and nothing private or sensitive (health, money, conflict, worries)'));
  // Không phải cuộc gọi đầu: không có phần FIRST CALL; DATA không có trial.
  assert.ok(!b.includes('FIRST CALL.'));
  assert.ok(!b.includes('"trial"'));
  // Tiếng Anh, tiếng Hàn: ví dụ theo thứ tiếng ấy, kết bằng đúng tên thứ tiếng.
  const en = L.liveBrief({ ...c, lang: 'en' }, []);
  assert.ok(en.trimEnd().endsWith('Reply in English.'));
  assert.ok(!en.includes('Mẹ cứ từ từ ạ'));
  assert.doesNotMatch(en, /[—–]/);
  const ko = L.liveBrief({ ...c, lang: 'ko' }, []);
  assert.ok(ko.trimEnd().endsWith('Reply in Korean.'));
  assert.doesNotMatch(ko, /[—–]/);
});

test('lời dặn Live: cuộc gọi đầu có phần FIRST CALL; nhà đổi tên linh vật thì không còn chữ Mây', () => {
  const first = L.liveBrief(lanCtx('lan', { extras: extras() }), []);
  assert.ok(first.includes('FIRST CALL.'));
  assert.ok(first.indexOf('FIRST CALL.') < first.indexOf('DATA:'));
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
    assert.doesNotMatch(JSON.stringify(t), /Mây|[—–]/, t.name);
  }
  // Câu hẹn: lời hứa ngắn, ấm về một chủ đề chuyện tuần sau; không bao giờ lời nhắn khó nói, điều riêng hay nhạy cảm.
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
  } finally {
    srv.close(); srv2.close();
  }
});
