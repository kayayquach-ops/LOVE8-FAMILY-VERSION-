// Kiểm thử phần hỏi thêm, hỏi ngày, lời nhắn khó nói và kiểm ảnh của cuộc gọi. Không gọi Gemini thật, không cần DB:
// fetch được thay bằng hàm giả trả đúng dạng trả lời của Gemini (generateContent), như server/tts.test.ts.
// Chạy: npm run test:call
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ScriptExtras } from './callfacts.ts';

process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'call-test-'));
process.env.GEMINI_API_KEY = 'test-key-not-real';
delete process.env.AI_PROVIDER;

const call = await import('./call.ts');
const { suspect } = await import('./guard.ts');
const { callLines, relayNone, themesFor } = await import('../src/shared.ts');
const { tServer } = await import('./i18n.ts');

type Handler = (url: string, init: RequestInit) => Promise<Response>;
let handler: Handler = async () => new Response('{}', { status: 500 });
const sent: any[] = [];
globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
  try { sent.push(JSON.parse(String(init?.body ?? '{}'))); } catch { sent.push(null); }
  return handler(String(u), init ?? {});
}) as typeof fetch;
/** Trả lời giả của Gemini: obj là JSON đúng schema mà model sẽ trả. */
const gemini = (obj: unknown): Handler => async () => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }],
}), { status: 200, headers: { 'content-type': 'application/json' } });
/** Nội dung người dùng (JSON) của lần gọi Gemini gần nhất. */
const lastInput = () => JSON.parse(sent.at(-1).contents[0].parts[0].text);

// i18n-ok-begin: dữ liệu kiểm thử
const Q = (text: string, event: any = 'none', topic: any = 'ky-niem') => ({ text, topic, photo: false, event });
const base = {
  lang: 'vi' as const, who: { name: 'Lan', role: 'me' }, bot: 'Mây',
  q: Q('Hồi nhỏ Mẹ hay chơi trò gì nhất?'), turn: 0, max: 4, dated: false, next: null,
  story: [{ asked: 'Hồi nhỏ Mẹ hay chơi trò gì nhất?', answer: 'Mẹ hay đi chợ với bà ngoại, mua cá' }],
};

test('hỏi thêm: câu đáp + câu hỏi thêm gộp thành một câu nói, có cờ chuyện thật', async () => {
  handler = gemini({ reaction: 'Đi chợ với bà ngoại vui quá ạ.', follow_up: 'Ở chợ Mẹ thích nhất món gì ạ?', day: 0, month: 0, year: 0, real_story: true });
  const r = await call.turnAI(base);
  assert.ok(r);
  assert.equal(r.reply, 'Đi chợ với bà ngoại vui quá ạ.');
  assert.equal(r.follow, 'Ở chợ Mẹ thích nhất món gì ạ?');
  assert.equal(r.say, 'Đi chợ với bà ngoại vui quá ạ. Ở chợ Mẹ thích nhất món gì ạ?');
  assert.equal(r.story, true);
  assert.equal(r.date, null);
  assert.equal(lastInput().can_follow, true);
});

test('hỏi thêm: kể đủ thì không hỏi, say chỉ còn câu đáp', async () => {
  handler = gemini({ reaction: 'Nghe vui quá ạ.', follow_up: '', day: 0, month: 0, year: 0, real_story: false });
  const r = await call.turnAI(base);
  assert.equal(r?.follow, null);
  assert.equal(r?.say, 'Nghe vui quá ạ.');
});

test('trần hỏi thêm: chuyện chính tối đa 4 lượt, không còn trần cả cuộc gọi; cuộc gọi thử 2 lượt', async () => {
  handler = gemini({ reaction: 'Dạ.', follow_up: 'Rồi sao nữa ạ?', day: 0, month: 0, year: 0, real_story: false });
  assert.equal((await call.turnAI({ ...base, turn: 3 }))?.follow, 'Rồi sao nữa ạ?');
  assert.equal((await call.turnAI({ ...base, turn: 4 }))?.follow, null);
  assert.equal(lastInput().can_follow, false);
  assert.equal((await call.turnAI({ ...base, turn: 2, max: 2 }))?.follow, null);
});

test('hỏi thăm: không hỏi thêm, câu đáp nối câu mở chuyện chính thành một câu nói', async () => {
  const checkin = { ...Q('Dạo này Mẹ thế nào ạ?', 'none', 'hoi-tham'), part: 'checkin' as const };
  const next = 'Mẹ kể con nghe về một bữa cơm nhà mình mà Mẹ nhớ nhất nhé.';
  handler = gemini({ reaction: 'Mẹ vẫn khoẻ là con vui rồi ạ.', follow_up: 'Mẹ ăn gì chưa ạ?', day: 0, month: 0, year: 0, real_story: false });
  const r = await call.turnAI({ ...base, q: checkin, story: [{ asked: checkin.text, answer: 'Mẹ vẫn khoẻ' }], next });
  assert.equal(lastInput().can_follow, false);
  assert.equal(r?.follow, null);
  assert.equal(r?.say, `Mẹ vẫn khoẻ là con vui rồi ạ. ${next}`);
  assert.equal(r?.joined, true);
  const long = await call.turnAI({ ...base, q: checkin, story: [{ asked: checkin.text, answer: 'Mẹ vẫn khoẻ' }], next: 'a'.repeat(299) });
  assert.equal(long?.say, 'Mẹ vẫn khoẻ là con vui rồi ạ.');
  assert.equal(long?.joined, false);
});

test('đọc trước câu nói: câu đáp gộp câu mở chuyện chính là câu bắt buộc, câu đáp đơn vẫn là câu phụ', async () => {
  const checkin = { ...Q('Dạo này Mẹ thế nào ạ?', 'none', 'hoi-tham'), part: 'checkin' as const };
  const next = 'Mẹ kể con nghe về một bữa cơm nhà mình mà Mẹ nhớ nhất nhé.';
  const seen: Array<{ text: string; optional?: boolean }> = [];
  const speak: Parameters<typeof call.turnReply>[3] = (text, _who, o) => { seen.push({ text, optional: o?.optional }); return null; };
  handler = gemini({ reaction: 'Mẹ vẫn khoẻ là con vui rồi ạ.', follow_up: '', day: 0, month: 0, year: 0, real_story: false });
  const ai = await call.turnReply({ ...base, q: checkin, story: [{ asked: checkin.text, answer: 'Mẹ vẫn khoẻ' }], next }, 'm-me', 'gemini', speak);
  assert.equal(ai?.joined, true);
  assert.deepEqual(seen, [{ text: `Mẹ vẫn khoẻ là con vui rồi ạ. ${next}`, optional: false }]);
  seen.length = 0;
  handler = gemini({ reaction: 'Nghe vui quá ạ.', follow_up: '', day: 0, month: 0, year: 0, real_story: false });
  await call.turnReply(base, 'm-me', 'gemini', speak);
  assert.deepEqual(seen, [{ text: 'Nghe vui quá ạ.', optional: true }]);
});

test('hỏi ngày: câu có event mà AI không hỏi ngày thì dùng câu hỏi ngày mẫu', async () => {
  const wedding = { ...base, q: Q('Bố với Mẹ cưới nhau ngày nào?', 'wedding', 'ngay-cuoi'), story: [{ asked: 'Bố với Mẹ cưới nhau ngày nào?', answer: 'Hồi đó cưới ở quê, đông vui lắm' }] };
  handler = gemini({ reaction: 'Cưới ở quê đông vui quá ạ.', follow_up: 'Hôm đó ai hát ạ?', day: 0, month: 0, year: 0, real_story: true });
  const r = await call.turnAI(wedding);
  assert.equal(lastInput().need_date, true);
  assert.equal(r?.follow, tServer('vi', 'callScript.askDate.parent', { self: 'mẹ', Self: 'Mẹ' }));
  assert.match(r!.say!, /ngày mấy tháng mấy/);
  // AI tự hỏi ngày thì giữ câu của AI.
  handler = gemini({ reaction: 'Dạ.', follow_up: 'Mẹ còn nhớ hôm đó là ngày mấy tháng mấy không ạ?', day: 0, month: 0, year: 0, real_story: false });
  assert.equal((await call.turnAI(wedding))?.follow, 'Mẹ còn nhớ hôm đó là ngày mấy tháng mấy không ạ?');
});

test('hỏi ngày: nghe được ngày thì nhắc lại cho chắc một lần, đã nhắc thì thôi', async () => {
  const wedding = { ...base, q: Q('Bố với Mẹ cưới nhau ngày nào?', 'wedding', 'ngay-cuoi'), turn: 1, story: [
    { asked: 'Bố với Mẹ cưới nhau ngày nào?', answer: 'Cưới ở quê đông vui lắm' },
    { asked: 'Mẹ còn nhớ hôm đó là ngày mấy tháng mấy không ạ?', answer: 'Ngày 12 tháng 3 năm 1995 con ạ' },
  ] };
  handler = gemini({ reaction: 'Dạ, con nhớ rồi ạ.', follow_up: '', day: 12, month: 3, year: 1995, real_story: true });
  const r = await call.turnAI(wedding);
  assert.deepEqual(r?.date, { day: 12, month: 3, year: 1995 });
  assert.equal(r?.confirm, 'Dạ, vậy là ngày 12 tháng 3 năm 1995. Con ghi vào lịch nhà mình nhé.');
  assert.equal(r?.say, 'Dạ, con nhớ rồi ạ. Dạ, vậy là ngày 12 tháng 3 năm 1995. Con ghi vào lịch nhà mình nhé.');
  const again = await call.turnAI({ ...wedding, dated: true });
  assert.equal(again?.confirm, null);
  // Năm vô lý thì bỏ năm, ngày tháng sai thì bỏ hẳn.
  handler = gemini({ reaction: 'Dạ.', follow_up: '', day: 12, month: 3, year: 3000, real_story: false });
  assert.deepEqual((await call.turnAI(wedding))?.date, { day: 12, month: 3, year: null });
  handler = gemini({ reaction: 'Dạ.', follow_up: '', day: 40, month: 3, year: 0, real_story: false });
  assert.equal((await call.turnAI(wedding))?.date, null);
});

test('ngày đọc theo thứ tiếng', () => {
  assert.equal(call.dateText('vi', { day: 12, month: 3, year: 1995 }), 'ngày 12 tháng 3 năm 1995');
  assert.equal(call.dateText('vi', { day: 12, month: 3, year: null }), 'ngày 12 tháng 3');
  assert.equal(call.dateText('en', { day: 12, month: 3, year: 1995 }), 'March 12, 1995');
  assert.equal(call.dateText('ko', { day: 12, month: 3, year: 1995 }), '1995년 3월 12일');
});

test('chống bịa: câu hỏi thêm có tên lạ thì bỏ, câu đáp vẫn dùng', async () => {
  handler = gemini({ reaction: 'Đi chợ với bà ngoại vui quá ạ.', follow_up: 'Hôm đó Lan với Hùng ở chợ có mua gì không ạ?', day: 0, month: 0, year: 0, real_story: false });
  const r = await call.turnAI(base);
  assert.equal(r?.follow, null);
  assert.equal(r?.say, 'Đi chợ với bà ngoại vui quá ạ.');
  handler = gemini({ reaction: 'Lần trước Mẹ cũng kể vậy ạ.', follow_up: '', day: 0, month: 0, year: 0, real_story: false });
  assert.equal((await call.turnAI(base))?.reply, null);
});

test('AI quá hạn, lỗi hay không có khoá: null (đi tiếp như cũ)', async () => {
  assert.equal(call.TURN_AI_MS, 2500);
  handler = (_u, init) => new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
  const t0 = Date.now();
  assert.equal(await call.turnAI(base, 200), null);
  assert.ok(Date.now() - t0 < 1500);
  handler = async () => new Response('{"error":{}}', { status: 500 });
  assert.equal(await call.turnAI(base), null);
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const n = sent.length;
  assert.equal(await call.turnAI(base), null);
  assert.equal(sent.length, n);
  process.env.GEMINI_API_KEY = key;
  // Bước lời nhắn và câu trống không gọi AI.
  assert.equal(await call.turnAI({ ...base, q: Q('Có điều gì Mẹ muốn nhắn các con không?', 'none', 'loi-nhan') }), null);
  assert.equal(await call.turnAI({ ...base, story: [{ asked: 'x', answer: '  ' }] }), null);
});

const fam = [
  { id: 'm-bo', name: 'Hùng', role: 'bo', lang: 'vi' },
  { id: 'm-me', name: 'Lan', role: 'me', lang: 'vi' },
  { id: 'm-an', name: 'An', role: 'con', lang: 'vi' },
];
const fromAn = { sender: fam[2], family: fam.slice(0, 2), ask: 'Có điều gì bạn muốn nhắn bố mẹ mà khó nói không?', bot: 'Mây' };

test('lời nhắn: AI chọn người nhận, câu chuyển lời và câu thông báo qua lớp lọc', async () => {
  handler = gemini({ nothing: false, recipients: [{ member: 1, said: 'An nhắn là dạo này nhớ mẹ lắm mà bận quá. Lát mẹ gọi hay nhắn cho An nhé.', push: 'Mẹ ơi, dạo này con nhớ mẹ lắm, mẹ gọi cho con nhé' }] });
  const plans = await call.planRelays({ ...fromAn, text: 'Con nhớ mẹ lắm mà dạo này bận quá' });
  assert.deepEqual(plans, [{ to: 'm-me', said: 'An nhắn là dạo này nhớ mẹ lắm mà bận quá. Lát mẹ gọi hay nhắn cho An nhé.', push: 'Mẹ ơi, dạo này con nhớ mẹ lắm, mẹ gọi cho con nhé' }]);
  const input = lastInput();
  assert.deepEqual(input.default_recipients, [0, 1]);
  assert.equal(input.family_members.length, 2);
});

test('lời nhắn: không có gì thì không gửi ai', async () => {
  handler = gemini({ nothing: true, recipients: [] });
  assert.deepEqual(await call.planRelays({ ...fromAn, text: 'Thôi không có gì đâu' }), []);
  // AI lỗi: câu chỉ là "không có gì" thì cũng thôi.
  handler = async () => new Response('{}', { status: 500 });
  assert.deepEqual(await call.planRelays({ ...fromAn, text: 'Dạ không có gì đâu ạ' }), []);
});

test('lời nhắn: AI lỗi mà có lời thật thì gửi theo gợi ý (con gửi bố mẹ), Mây nhắc nguyên lời', async () => {
  handler = async () => new Response('{}', { status: 500 });
  const plans = await call.planRelays({ ...fromAn, text: 'Con thương bố mẹ nhiều lắm.' });
  assert.deepEqual(plans.map((p) => p.to), ['m-bo', 'm-me']);
  assert.equal(plans[0].said, 'An nhắn bố là: Con thương bố mẹ nhiều lắm. Lát bố gọi cho An nhé.');
  assert.equal(plans[0].push, null);
  // Gọi đúng một người thì chỉ người đó nhận (lời khó nói không tới tay người khác).
  assert.deepEqual((await call.planRelays({ ...fromAn, text: 'Nhắn bố là con xin lỗi bố' })).map((p) => p.to), ['m-bo']);
  assert.deepEqual((await call.planRelays({ ...fromAn, text: 'Bảo Lan là con thương lắm' })).map((p) => p.to), ['m-me']);
  // Không gọi ai: theo gợi ý.
  assert.deepEqual((await call.planRelays({ ...fromAn, text: 'Dạo này con buồn lắm' })).map((p) => p.to), ['m-bo', 'm-me']);
  // Bố mẹ gửi: "mẹ" là tự xưng nên không tính, "con" là các con.
  const fromMom = await call.planRelays({ sender: fam[1], family: [fam[0], fam[2]], ask: 'x', text: 'Mẹ nhớ con lắm', bot: 'Mây' });
  assert.deepEqual(fromMom.map((p) => p.to), ['m-an']);
  assert.match(fromMom[0].said, /^Lan nhắn bạn là: Mẹ nhớ con lắm\./);
});

test('lời nhắn: câu AI có tên lạ hay mốc thời gian thì thay bằng câu mẫu, chỉ số người nhận sai thì bỏ', async () => {
  handler = gemini({ nothing: false, recipients: [
    { member: 0, said: 'An nhắn là hôm qua An ốm. Bố gọi cho An nhé.', push: 'Bố ơi, Minh nhớ bố' },
    { member: 7, said: 'x', push: 'y' },
    { member: 0, said: 'trùng', push: 'trùng' },
  ] });
  const plans = await call.planRelays({ ...fromAn, text: 'Con ốm mà không dám nói' });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].to, 'm-bo');
  assert.equal(plans[0].said, 'An nhắn bố là: Con ốm mà không dám nói. Lát bố gọi cho An nhé.');
  assert.equal(plans[0].push, null);
});

test('lời nhắn: nhận biết câu "không có gì"', () => {
  for (const s of ['không', 'Dạ không có gì đâu ạ', 'thôi không có gì', 'chưa có đâu', 'Không ạ.', 'thôi']) assert.equal(relayNone(s, 'vi'), true, s);
  for (const s of ['không biết nói sao nhưng con thương mẹ lắm', 'nhắn bố là con nhớ bố', 'con muốn xin lỗi mẹ']) assert.equal(relayNone(s, 'vi'), false, s);
  for (const s of ['no', 'Nope, not really.', "No, I'm good", 'nothing really', 'not now thanks']) assert.equal(relayNone(s, 'en'), true, s);
  for (const s of ['tell mom I love her', 'no one knows how much I miss home']) assert.equal(relayNone(s, 'en'), false, s);
  for (const s of ['없어요', '아니요', '딱히 없어요', '괜찮아요']) assert.equal(relayNone(s, 'ko'), true, s);
  assert.equal(relayNone('엄마한테 보고 싶다고 전해 주세요', 'ko'), false);
  assert.equal(relayNone('', 'vi'), true);
});

test('lớp lọc: câu chuyển lời được nhắc "nhắn cho", vẫn chặn mốc thời gian', () => {
  const hay = 'An Lan con nhớ mẹ';
  assert.ok(suspect('Mẹ nhắn cho An là nhớ An lắm.', hay, { prevCall: false, ownStory: false, photos: false }));
  assert.equal(suspect('Mẹ nhắn cho An là nhớ An lắm.', hay, { prevCall: false, ownStory: false, photos: false, message: true }), null);
  assert.ok(suspect('Hôm qua An nhắn cho mẹ.', hay, { prevCall: false, ownStory: false, photos: false, message: true }));
});

const ctx = (role: string, family: Array<{ name: string; role: string }>) => ({
  lang: 'vi' as const, member: { id: 'x', name: 'Lan', role, intro: {} }, family, events: [], asked: [], stories: [], doneCalls: ['2026-11-01'],
  photoCount: 0, captions: [], mascot: 'Mây',
});
const both = [{ name: 'Hùng', role: 'bo' }, { name: 'Lan', role: 'me' }, { name: 'An', role: 'con' }];
/** Dữ liệu soạn câu lớn dần (loadScriptExtras) của Lan: một sự thật về An, Noel còn 24 ngày. */
const extras: ScriptExtras = {
  age: 52,
  place: { name: 'Hà Nội', country: 'Việt Nam', tz: 'Asia/Ho_Chi_Minh', localTime: '20:00', weather: '18°C, cloudy' },
  family: [],
  memory: [{ id: 'f1', about: 'An', toldBy: 'An', toldByYou: false, private: false, kind: 'food', fact: 'An loves sour soup' }],
  occasions: [{ key: 'noel', name: 'Noel', date: '2026-12-25', inDays: 24, who: null }],
  told: [], themes: themesFor('me', true, false), gaps: [], recent: [],
};

test('bộ câu mẫu v2: hỏi thăm, một chuyện chính mời kể, lời nhắn cuối; nhà một người thì không hỏi lời nhắn', () => {
  const both = [{ name: 'Hùng', role: 'bo' }, { name: 'Lan', role: 'me' }, { name: 'An', role: 'con' }];
  const me = call.templateScript(ctx('me', both), '2026-11-09');
  assert.equal(me.v, 2); assert.equal(me.follow, 4);
  assert.deepEqual(me.questions.map((q) => q.part ?? q.topic), ['checkin', 'story', 'loi-nhan']);
  assert.equal(me.questions[0].topic, 'hoi-tham');
  assert.equal(me.questions[1].theme, 'ngay-cuoi'); assert.equal(me.questions[1].event, 'wedding'); // có đủ bố mẹ, lịch chưa có ngày cưới
  assert.equal(me.goodbye, callLines('me', (k, v) => tServer('vi', k, v)).bye);
  const con = call.templateScript(ctx('con', both), '2026-11-09');
  assert.ok(themesFor('con', true, false).includes(con.questions[1].theme!));
  assert.notEqual(con.questions[1].theme, 'ngay-cuoi');
  assert.deepEqual(call.templateScript(ctx('me', [{ name: 'Lan', role: 'me' }]), '2026-11-09').questions.map((q) => q.part), ['checkin', 'story']);
});

test('cuộc gọi đầu v2: hỏi thăm và một chuyện dễ, 2 lượt hỏi thêm, không hỏi lời nhắn', () => {
  const sc = call.firstScript(ctx('me', both));
  assert.equal(sc.v, 2); assert.equal(sc.trial, true); assert.equal(sc.follow, 2);
  assert.deepEqual(sc.questions.map((q) => q.part), ['checkin', 'story']);
});

test('AI soạn v2: dùng câu hỏi thăm và câu mở của AI; chủ đề sai vai hay câu có tên lạ thì dùng câu mẫu', async () => {
  handler = gemini({ greeting: 'Mẹ ơi, con là Mây đây ạ.', checkin: 'Dạo này Mẹ ngủ có ngon không ạ?',
    story: { text: 'Mẹ kể con nghe về một món Mẹ nấu mà cả nhà thích nhất nhé.', theme: 'mon-an', photo: false, event: 'none' } });
  const sc = (await call.aiScript(ctx('me', both), '2026-11-09'))!;
  assert.deepEqual(sc.questions.map((q) => q.text).slice(0, 2), ['Dạo này Mẹ ngủ có ngon không ạ?', 'Mẹ kể con nghe về một món Mẹ nấu mà cả nhà thích nhất nhé.']);
  assert.equal(sc.questions[1].topic, 'mon-an'); assert.equal(sc.questions.at(-1)!.topic, 'loi-nhan');
  handler = gemini({ greeting: 'Chào An.', checkin: 'Dạo này An thế nào?', story: { text: 'Kể mình nghe về ngày cưới nhé.', theme: 'ngay-cuoi', photo: true, event: 'wedding' } });
  const kid = (await call.aiScript(ctx('con', both), '2026-11-09'))!;
  assert.notEqual(kid.questions[1].theme, 'ngay-cuoi');
  handler = gemini({ greeting: 'Mẹ ơi.', checkin: 'Dạo này Mẹ thế nào ạ?', story: { text: 'Mẹ kể con nghe về bác Minh nhé.', theme: 'que-nha', photo: false, event: 'none' } });
  assert.doesNotMatch((await call.aiScript(ctx('me', both), '2026-11-09'))!.questions[1].text, /Minh/);
});

test('AI soạn v2: chủ đề ngày cưới luôn hỏi ngày cưới, chủ đề khác không bao giờ mang loại ngày cưới', async () => {
  handler = gemini({ greeting: 'Mẹ ơi.', checkin: 'Dạo này Mẹ thế nào ạ?', story: { text: 'Mẹ kể con nghe về ngày cưới của Mẹ nhé.', theme: 'ngay-cuoi', photo: true, event: 'none' } });
  const wed = (await call.aiScript(ctx('me', both), '2026-11-09'))!.questions[1];
  assert.equal(wed.text, 'Mẹ kể con nghe về ngày cưới của Mẹ nhé.');
  assert.equal(wed.event, 'wedding');
  handler = gemini({ greeting: 'Mẹ ơi.', checkin: 'Dạo này Mẹ thế nào ạ?', story: { text: 'Mẹ kể con nghe về một món Mẹ nấu mà cả nhà thích nhất nhé.', theme: 'mon-an', photo: false, event: 'wedding' } });
  const food = (await call.aiScript(ctx('me', both), '2026-11-09'))!.questions[1];
  assert.equal(food.text, 'Mẹ kể con nghe về một món Mẹ nấu mà cả nhà thích nhất nhé.');
  assert.equal(food.theme, 'mon-an');
  assert.equal(food.event, 'none');
});

test('kịch bản soạn trước bản mới (không có v: 2) thì soạn lại, không phát lại kiểu ba câu', () => {
  const v2 = call.templateScript(ctx('me', both), '2026-11-09');
  const old = { ...v2, v: undefined };
  const c = { lang: 'vi' as const, mascot: 'Mây' };
  assert.equal(call.scriptReusable(old, c, false), false);
  assert.equal(call.scriptReusable(v2, c, false), true);
  assert.equal(call.scriptReusable(v2, { ...c, lang: 'en' }, false), false);
  assert.equal(call.scriptReusable(v2, c, true), false);                           // người chưa gọi lần nào cần bộ câu cuộc gọi thử
  assert.equal(call.scriptReusable(call.firstScript(ctx('me', both)), c, true), true);
  assert.equal(call.scriptReusable(null, c, false), false);
});

test('câu cố định nạp sẵn giọng: có câu hỏi chia sẻ, câu nhận lời, câu tạm biệt', () => {
  const L = callLines('me', (k, v) => tServer('vi', k, v));
  for (const s of [L.share, L.shareYes, L.shareNo, L.bye]) assert.ok(call.fixedLines(['vi']).includes(s), s);
});

test('kiểm ảnh theo byte đầu tệp', () => {
  const b = (...xs: number[]) => Uint8Array.from(xs);
  assert.equal(call.imageKind(b(0xff, 0xd8, 0xff, 0xe0, 0, 0)), 'jpg');
  assert.equal(call.imageKind(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), 'png');
  assert.equal(call.imageKind(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')), 'webp');
  assert.equal(call.imageKind(new TextEncoder().encode('GIF89a......')), null);
  assert.equal(call.imageKind(new TextEncoder().encode('\u0000\u0000\u0000\u0018ftypheic')), null);
  assert.equal(call.imageKind(new TextEncoder().encode('<html>')), null);
  assert.equal(call.imageKind(b(0xff, 0xd8)), null);
});

test('người nhận mặc định', () => {
  assert.deepEqual(call.defaultRecipients('con', fam.slice(0, 2)).map((m) => m.id), ['m-bo', 'm-me']);
  assert.deepEqual(call.defaultRecipients('bo', [fam[1], fam[2]]).map((m) => m.id), ['m-an']);
  // Không có ai đúng vai thì gửi mọi người khác.
  assert.deepEqual(call.defaultRecipients('con', [{ id: 'c2', name: 'Bình', role: 'con', lang: null }]).map((m) => m.id), ['c2']);
});

test('dữ liệu soạn câu: sổ nhớ, dịp, chủ đề đã kể, nơi ở; mục trống ghi none yet; không có thời tiết thì không có mục thời tiết', () => {
  const facts = call.scriptFacts({ ...ctx('me', both), extras: { ...extras, memory: [], occasions: [], place: { ...extras.place, weather: null } } });
  assert.match(String(facts.memory), /^none yet/);
  assert.match(String(facts.upcoming_occasions), /^none yet/);
  assert.equal('weather' in (facts.person as any).lives_in, false);
  assert.deepEqual(call.scriptFacts({ ...ctx('me', both), extras }).untold_themes, extras.themes.filter((t) => !extras.told.some((x) => x.theme === t)));
});
test('AI báo đã dùng sự thật nào: chỉ nhận mã có trong dữ liệu', async () => {
  handler = gemini({ greeting: 'Mẹ ơi.', checkin: 'Dạo này Mẹ thế nào ạ?', story: { text: 'Mẹ kể con nghe về món canh chua nhé.', theme: 'mon-an', photo: false, event: 'none' }, used_facts: ['f1', 'zzz'] });
  assert.deepEqual((await call.aiScript({ ...ctx('me', both), extras }, '2026-11-16'))!.used, ['f1']);
});
test('bộ câu mẫu chọn chủ đề chưa kể', () => {
  const told: ScriptExtras['told'] = [{ theme: 'tuoi-tho', times: 1, turns: 3, last: '2026-11-08' }, { theme: 'que-nha', times: 1, turns: 2, last: '2026-11-15' }];
  const sc = call.templateScript({ ...ctx('con', both), extras: { ...extras, told, themes: themesFor('con', true, false) } }, '2026-11-16');
  assert.equal(sc.questions[1].theme, 'mon-an');
});
test('bộ câu mẫu: kể hết mọi chủ đề rồi thì xoay vòng nhưng không chọn lại chủ đề vừa kể gần nhất', () => {
  const kid = ['tuoi-tho', 'que-nha', 'mon-an', 'tet-cac-dip', 'ban-be', 'con-di-xa'] as const;
  for (const newest of kid) {
    const told: ScriptExtras['told'] = kid.map((theme) => ({ theme, times: 1, turns: 3, last: theme === newest ? '2026-11-15' : '2026-11-01' }));
    for (const week of ['2026-11-02', '2026-11-09', '2026-11-16']) {
      const sc = call.templateScript({ ...ctx('con', both), extras: { ...extras, told, themes: themesFor('con', true, false) } }, week);
      assert.notEqual(sc.questions[1].theme, newest, `${newest} ${week}`);
    }
  }
});
test('liên lạc sau lời nhắc: có tên thì đưa cho AI, không có thì none yet', () => {
  assert.deepEqual(call.scriptFacts({ ...ctx('me', both), extras: { ...extras, recent: ['An'] } }).recent_contact, ['An']);
  assert.match(String(call.scriptFacts({ ...ctx('me', both), extras }).recent_contact), /^none yet/);
});
test('sổ nhớ: điều riêng của chính người nghe mang cờ private cho AI', () => {
  const mine = { ...extras.memory[0], id: 'f2', toldByYou: true, private: true, kind: 'worry', fact: 'Lan worries about money' };
  const facts = call.scriptFacts({ ...ctx('me', both), extras: { ...extras, memory: [extras.memory[0], mine] } });
  assert.deepEqual((facts.memory as any[]).map((m) => [m.id, m.private]), [['f1', false], ['f2', true]]);
});
// i18n-ok-end

test('thẻ gọi: người chưa gọi lần nào thấy thẻ cuộc gọi thử sau 10 phút (kể cả thứ Bảy); cuộc gọi thử không chiếm lượt tuần', () => {
  const d = (o: object) => call.dueState({ minutesSinceJoin: 0, hadDone: false, doneThisWeek: false, callTime: false, ...o });
  assert.deepEqual(d({ minutesSinceJoin: 9 }), { due: false, trial: true });
  assert.deepEqual(d({ minutesSinceJoin: 10 }), { due: true, trial: true });
  assert.deepEqual(d({ minutesSinceJoin: 3, callTime: true }), { due: false, trial: true });
  assert.deepEqual(d({ hadDone: true, callTime: true }), { due: true, trial: false });   // chỉ mới gọi thử: thẻ thứ Bảy vẫn hiện
  assert.deepEqual(d({ hadDone: true, callTime: true, doneThisWeek: true }), { due: false, trial: false });
  assert.deepEqual(d({ hadDone: true }), { due: false, trial: false });
});
test('cuộc gọi thử do AI soạn: chuyện dễ, 2 câu bồi, không hỏi lời nhắn; AI lỗi thì bộ câu soạn sẵn', async () => {
  const first = { ...ctx('me', both), doneCalls: [] };
  handler = gemini({ greeting: 'Mẹ ơi, con là Mây đây ạ.', checkin: 'Hôm nay Mẹ thế nào ạ?',
    story: { text: 'Mẹ kể con nghe về món Mẹ nấu ngon nhất nhé.', theme: 'mon-an', photo: false, event: 'none' } });
  const sc = (await call.aiScript(first, '2026-11-16', undefined, { trial: true }))!;
  assert.equal(lastInput().trial, true);
  assert.equal(sc.trial, true); assert.equal(sc.follow, 2);
  assert.equal(sc.questions.some((q) => q.topic === 'loi-nhan'), false);
  handler = async () => new Response('{}', { status: 500 });
  assert.equal(await call.aiScript(first, '2026-11-16', undefined, { trial: true }), null); // nơi gọi dùng firstScript
});

// ---------- Rút ngày vào lịch chung (DB giả theo từng câu trong DATES_SQL) ----------
// i18n-ok-begin: dữ liệu kiểm thử
/** Cuộc gọi của Lan (me): hỏi thăm có một ngày khám bệnh (chuyện riêng), chuyện chính có ngày cưới, lời nhắn khó nói. */
function datesDb(shared: boolean) {
  const S = call.DATES_SQL;
  const script = { lang: 'vi', v: 2, questions: [
    { text: 'Dạo này Mẹ thế nào ạ?', topic: 'hoi-tham', photo: false, event: 'none', part: 'checkin' },
    { text: 'Mẹ kể con nghe về ngày cưới nhé.', topic: 'ngay-cuoi', photo: true, event: 'wedding', part: 'story', theme: 'ngay-cuoi' },
    { text: 'Có điều gì Mẹ muốn nhắn không ạ?', topic: 'loi-nhan', photo: false, event: 'none' },
  ] };
  const answers = [
    { idx: 0, turn: 0, topic: 'hoi-tham', question: script.questions[0].text, transcript: 'Mẹ hơi mệt, ngày 5 tháng 6 mẹ đi khám tim' },
    { idx: 1, turn: 0, topic: 'ngay-cuoi', question: script.questions[1].text, transcript: 'Bố mẹ cưới ngày 12 tháng 3 năm 1995 ở quê, bà ngoại sinh nhật ngày 2 tháng 9' },
    { idx: 2, turn: 0, topic: 'loi-nhan', question: script.questions[2].text, transcript: 'lời nhắn riêng cho An' },
  ];
  const inserted: Array<{ kind: string; title: string; day: number; month: number; year: number | null; note: string }> = [];
  let excluded: string[] = [];
  const db = {
    async query(q: string, v: any[] = []) {
      switch (q) {
        case S.call: return { rows: [{ id: 'c1', family_id: 'F', member_id: 'm-me', script: JSON.stringify(script), shared }] };
        // Chủ đề bị loại là danh sách máy chủ gửi kèm ($2).
        case S.answers: excluded = Array.isArray(v[1]) ? v[1] : []; return { rows: answers.filter((a) => !excluded.includes(a.topic)).map(({ topic: _t, ...a }) => a) };
        case S.events: return { rows: [] };
        case S.member: return { rows: [{ name: 'Lan', role: 'me', lang: 'vi' }] };
        case S.langs: return { rows: [{ lang: 'vi' }, { lang: 'vi' }] };
        case S.insert: {
          const [, , , kind, title, day, month, year, note] = v;
          inserted.push({ kind, title, day, month, year, note });
          return { rows: [], rowCount: 1 };
        }
      }
      throw new Error(`DB giả chưa biết câu này: ${q}`);
    },
  };
  return { db, inserted, excluded: () => excluded };
}
/** AI rút được bốn ngày, tên và ghi chú AI viết từ chuyện. */
const aiDates = { events: [
  { kind: 'wedding', title: 'Ngày cưới của Lan và Hùng ở quê', day: 12, month: 3, year: 1995, note: 'Lan kể hôm cưới ở quê đông vui' },
  { kind: 'birthday', title: 'Sinh nhật bà ngoại', day: 2, month: 9, year: null, note: 'Bà ngoại sinh nhật ngày 2 tháng 9' },
  { kind: 'memory', title: 'Ngày Lan đi khám tim', day: 5, month: 6, year: null, note: 'Lan hơi mệt nên đi khám tim' },
  { kind: 'other', title: 'Một ngày ở quê', day: 1, month: 1, year: null, note: 'Ở quê' },
] };

test('lịch chung: chuyện chưa chia sẻ chỉ ghi tên và ghi chú soạn sẵn, bỏ ngày đáng nhớ và ngày khác', async () => {
  const f = datesDb(false);
  handler = gemini(aiDates);
  await call.saveDates('c1', f.db);
  const note = tServer('vi', 'callEvent.note', { name: 'Lan' });
  assert.deepEqual(f.inserted, [
    { kind: 'wedding', title: tServer('vi', 'callEvent.wedding'), day: 12, month: 3, year: 1995, note },
    { kind: 'birthday', title: tServer('vi', 'callEvent.birthday'), day: 2, month: 9, year: null, note },
  ]);
  assert.doesNotMatch(JSON.stringify(f.inserted), /quê|khám|tim|bà ngoại/i);
});

test('lịch chung: chuyện đã chia sẻ giữ tên và ghi chú AI viết, kể cả ngày đáng nhớ', async () => {
  const f = datesDb(true);
  handler = gemini(aiDates);
  await call.saveDates('c1', f.db);
  assert.deepEqual(f.inserted.map((e) => [e.kind, e.title, e.note]), aiDates.events.map((e) => [e.kind, e.title, e.note]));
});

test('lịch chung: câu hỏi thăm và lời nhắn khó nói không bao giờ đưa cho AI rút ngày', async () => {
  const f = datesDb(true);
  handler = gemini({ events: [] });
  await call.saveDates('c1', f.db);
  assert.ok(f.excluded().includes('hoi-tham') && f.excluded().includes('loi-nhan'), String(f.excluded()));
  assert.deepEqual(lastInput().call.map((a: any) => a.question), ['Mẹ kể con nghe về ngày cưới nhé.']);
  assert.doesNotMatch(JSON.stringify(lastInput()), /khám tim|lời nhắn riêng/);
});
// i18n-ok-end

// i18n-ok-begin: dữ liệu kiểm thử
test('cuộc gọi thử: câu mở AI hỏng thì dùng chuyện của bộ câu thử, không rơi về bộ câu tuần (ngày cưới)', async () => {
  const first = { ...ctx('me', both), doneCalls: [] };
  handler = gemini({ greeting: 'Mẹ ơi, con là Mây đây ạ.', checkin: 'Hôm nay Mẹ thế nào ạ?',
    story: { text: 'Mẹ kể con nghe về bác Minh nhé.', theme: 'que-nha', photo: false, event: 'none' } });
  const sc = (await call.aiScript(first, '2026-11-16', undefined, { trial: true }))!;
  assert.equal(sc.trial, true); assert.equal(sc.follow, 2);
  assert.notEqual(sc.questions[1].theme, 'ngay-cuoi');
  assert.deepEqual(sc.questions[1], call.firstScript(first).questions[1]);
  assert.equal(sc.questions.some((q) => q.topic === 'loi-nhan'), false);
});
// i18n-ok-end

test('giữ riêng: gỡ lời đồng ý của lần thử trước khi cuộc gọi chưa chốt; đã chốt hay cuộc gọi người khác thì không đổi gì', async () => {
  const calls: Record<string, { member_id: string; status: string; shared: boolean }> = {
    c1: { member_id: 'm-me', status: 'ready', shared: true },   // lần trước đã đồng ý, tải lại rồi gọi tiếp cùng cuộc gọi
    c2: { member_id: 'm-me', status: 'done', shared: true },
  };
  const db = {
    async query(q: string, v: any[] = []) {
      if (q !== call.KEEP_SQL) throw new Error(`DB giả chưa biết câu này: ${q}`);
      const c = calls[v[0]];
      if (!c || c.member_id !== v[1] || c.status !== 'ready') return { rows: [], rowCount: 0 };
      c.shared = false;
      return { rows: [], rowCount: 1 };
    },
  };
  assert.equal(await call.keepCall('c1', 'm-an', db), false);
  assert.equal(calls.c1.shared, true);
  assert.equal(await call.keepCall('c1', 'm-me', db), true);
  assert.equal(calls.c1.shared, false);
  assert.equal(await call.keepCall('c2', 'm-me', db), false);
  assert.equal(calls.c2.shared, true);
  assert.match(call.KEEP_SQL, /status = 'ready'/);
});
