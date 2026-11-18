// Kiểm thử dịch tin nhắn chat: quyền (nhà khác nhận 404), bản dịch đã lưu không gọi AI, hạn mức mỗi ngày theo giờ Hàn,
// lời dặn gửi cho Gemini và cách đọc câu trả lời. Không gọi Gemini thật (fetch giả), không cần DB (DB giả theo từng câu lệnh).
// Chạy: node --import tsx --test server/translate.test.ts
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = 'test-key-not-real';
delete process.env.AI_PROVIDER;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TRANSLATE_DAILY_CAP;
process.env.GEMINI_MODEL = 'gemini-test';

const T = await import('./translate.ts');

// i18n-ok-begin: dữ liệu kiểm thử
type Row = { message_id: string; lang: string; text: string; family_id: string; kst_day: string };
let messages: Array<{ id: string; family_id: string; kind: string; text: string | null }> = [];
let cache: Row[] = [];
const queries: string[] = [];
const db = {
  async query(q: string, v: any[] = []) {
    queries.push(q);
    if (q.startsWith('select id, kind, text from messages')) return { rows: messages.filter((m) => m.id === v[0] && m.family_id === v[1]) };
    if (q.startsWith('select text from message_translations')) return { rows: cache.filter((r) => r.message_id === v[0] && r.lang === v[1]) };
    if (q.startsWith('select count(*)::int n from message_translations')) return { rows: [{ n: cache.filter((r) => r.family_id === v[0] && r.kst_day === v[1]).length }] };
    if (q.includes('insert into message_translations')) {
      const old = cache.find((r) => r.message_id === v[0] && r.lang === v[1]);
      if (old) return { rows: [{ text: old.text }] };
      cache.push({ message_id: v[0], lang: v[1], text: v[2], family_id: v[3], kst_day: v[4] });
      return { rows: [{ text: v[2] }] };
    }
    throw new Error(`câu lệnh lạ: ${q}`);
  },
};

type Handler = (url: string, init: RequestInit) => Promise<Response>;
const calls: Array<{ url: string; body: any }> = [];
let handler: Handler;
globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(u), body: JSON.parse(String(init?.body ?? '{}')) });
  return handler(String(u), init ?? {});
}) as typeof fetch;
const gemini = (translation: string): Handler => async () =>
  new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ translation }) }] } }] }), { status: 200 });

const NOW = Date.parse('2026-11-18T03:00:00Z'); // 12:00 ngày 2026-11-18 giờ Hàn
const mine = { family_id: 'f1' };

beforeEach(() => {
  messages = [
    { id: 'm1', family_id: 'f1', kind: 'text', text: '엄마 사랑해요 ❤️' },
    { id: 'm2', family_id: 'f1', kind: 'voice', text: null },
    { id: 'm3', family_id: 'f2', kind: 'text', text: 'chuyện nhà khác' },
  ];
  cache = [];
  queries.length = 0;
  calls.length = 0;
  handler = gemini('Con yêu mẹ ❤️');
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  delete process.env.TRANSLATE_DAILY_CAP;
});

test('dịch thành công: gọi Gemini một lần với lời dặn và tin gốc, lưu bản dịch', async () => {
  const r = await T.translateMessage(db, mine, 'm1', 'vi', NOW);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { text: 'Con yêu mẹ ❤️', lang: 'vi', cached: false });
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.match(c.url, /models\/gemini-test:generateContent$/);
  assert.equal(c.body.systemInstruction.parts[0].text, T.TRANSLATE_SYSTEM);
  assert.match(c.body.systemInstruction.parts[0].text, /faithfully/);
  assert.match(c.body.systemInstruction.parts[0].text, /names, emoji/);
  assert.match(c.body.systemInstruction.parts[0].text, /Output only JSON/);
  assert.equal(c.body.contents[0].parts[0].text, 'Target language: Vietnamese\n\nMessage:\n엄마 사랑해요 ❤️');
  assert.equal(c.body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(cache.map((x) => [x.message_id, x.lang, x.family_id, x.kst_day]), [['m1', 'vi', 'f1', '2026-11-18']]);
});

test('ngày hạn mức tính theo giờ Hàn: 16:00 UTC đã sang ngày sau', async () => {
  await T.translateMessage(db, mine, 'm1', 'en', Date.parse('2026-11-18T16:00:00Z'));
  assert.equal(cache[0].kst_day, '2026-11-19');
});

test('nhà khác không dịch được tin của nhà mình: 404, không gọi AI', async () => {
  const r = await T.translateMessage(db, { family_id: 'f2' }, 'm1', 'vi', NOW);
  assert.equal(r.status, 404);
  assert.equal((r.body as any).code, 'translate_not_found');
  assert.equal(calls.length, 0);
  assert.equal(cache.length, 0);
  // Tin của nhà f2 thì nhà f1 cũng không thấy.
  assert.equal((await T.translateMessage(db, mine, 'm3', 'vi', NOW)).status, 404);
  assert.equal((await T.translateMessage(db, mine, 'không-có', 'vi', NOW)).status, 404);
});

test('tin giọng nói, thứ tiếng lạ: từ chối, không gọi AI', async () => {
  assert.equal((await T.translateMessage(db, mine, 'm2', 'vi', NOW)).status, 400);
  const r = await T.translateMessage(db, mine, 'm1', 'fr', NOW);
  assert.equal(r.status, 400);
  assert.equal((r.body as any).code, 'translate_lang');
  assert.equal(calls.length, 0);
});

test('đã có bản dịch lưu: trả luôn, không gọi AI, không tính hạn mức, kể cả khi hết hạn mức hay mất key', async () => {
  cache.push({ message_id: 'm1', lang: 'vi', text: 'Con yêu mẹ', family_id: 'f1', kst_day: '2026-11-18' });
  process.env.TRANSLATE_DAILY_CAP = '1';
  delete process.env.GEMINI_API_KEY;
  const r = await T.translateMessage(db, mine, 'm1', 'vi', NOW);
  assert.deepEqual(r.body, { text: 'Con yêu mẹ', lang: 'vi', cached: true });
  assert.equal(calls.length, 0);
  assert.ok(!queries.some((q) => q.includes('insert')));
});

test('dịch hai lần cùng thứ tiếng: lần hai lấy từ bản lưu, AI chỉ được gọi một lần', async () => {
  await T.translateMessage(db, mine, 'm1', 'vi', NOW);
  const r = await T.translateMessage(db, mine, 'm1', 'vi', NOW);
  assert.equal((r.body as any).cached, true);
  assert.equal(calls.length, 1);
  // Thứ tiếng khác thì dịch riêng.
  handler = gemini('I love you, Mom ❤️');
  assert.equal((await T.translateMessage(db, mine, 'm1', 'en', NOW)).status, 200);
  assert.equal(calls.length, 2);
  assert.equal(cache.length, 2);
});

test('hạn mức mỗi nhà mỗi ngày: đủ thì 429 translate_limit, nhà khác và ngày sau vẫn dịch được', async () => {
  assert.equal(T.translateDailyCap(), 300);
  process.env.TRANSLATE_DAILY_CAP = '2';
  for (const id of ['a', 'b']) cache.push({ message_id: id, lang: 'vi', text: 'x', family_id: 'f1', kst_day: '2026-11-18' });
  const r = await T.translateMessage(db, mine, 'm1', 'vi', NOW);
  assert.equal(r.status, 429);
  assert.equal((r.body as any).code, 'translate_limit');
  assert.equal(calls.length, 0);
  // Ngày kế tiếp theo giờ Hàn (15:00 UTC đã sang ngày mới).
  assert.equal((await T.translateMessage(db, mine, 'm1', 'vi', Date.parse('2026-11-18T15:00:00Z'))).status, 200);
  // Nhà khác có bộ đếm riêng.
  messages.push({ id: 'm4', family_id: 'f2', kind: 'text', text: 'hello' });
  assert.equal((await T.translateMessage(db, { family_id: 'f2' }, 'm4', 'ko', NOW)).status, 200);
});

test('không có khoá AI: 503 translate_unavailable, không ghi gì', async () => {
  delete process.env.GEMINI_API_KEY;
  const r = await T.translateMessage(db, mine, 'm1', 'vi', NOW);
  assert.equal(r.status, 503);
  assert.equal((r.body as any).code, 'translate_unavailable');
  assert.equal(calls.length, 0);
  assert.equal(cache.length, 0);
});

test('Gemini lỗi, trả rỗng hoặc dài bất thường: 502, không lưu và không tính hạn mức', async () => {
  const silence = console.error;
  console.error = () => {};
  try {
    handler = async () => new Response('boom', { status: 500 });
    assert.equal((await T.translateMessage(db, mine, 'm1', 'vi', NOW)).status, 502);
    handler = gemini('   ');
    assert.equal((await T.translateMessage(db, mine, 'm1', 'vi', NOW)).status, 502);
    handler = gemini('x'.repeat(5000));
    assert.equal((await T.translateMessage(db, mine, 'm1', 'vi', NOW)).status, 502);
  } finally { console.error = silence; }
  assert.equal(cache.length, 0);
});

test('đọc câu trả lời: cắt khoảng trắng, từ chối thiếu trường, sai kiểu, quá dài', () => {
  assert.equal(T.parseTranslation({ translation: '  Xin chào \n' }, 'hello'), 'Xin chào');
  assert.equal(T.parseTranslation({ translation: '' }, 'hello'), null);
  assert.equal(T.parseTranslation({}, 'hello'), null);
  assert.equal(T.parseTranslation(null, 'hello'), null);
  assert.equal(T.parseTranslation({ translation: 42 }, 'hello'), null);
  assert.equal(T.parseTranslation({ translation: 'a'.repeat(300) }, 'hi'), null);
  assert.equal(T.parseTranslation({ translation: 'a'.repeat(300) }, 'x'.repeat(100)), 'a'.repeat(300));
});

test('lời nhắn người dùng ghi đúng thứ tiếng đích', () => {
  assert.match(T.translateUser('ko', 'hi'), /^Target language: Korean\n\nMessage:\nhi$/);
  assert.match(T.translateUser('en', 'hi'), /English/);
});
// i18n-ok-end
