// Kiểm thử sổ nhớ của Mây (server/memory.ts): gấp chữ, câu gốc chống bịa, kiểm sự thật và tín hiệu AI trả về,
// rồi cả đường rút sổ nhớ sau cuộc gọi và rút bù. Không cần Postgres: DB giả chạy đúng từng câu trong MEM_SQL và MAY_SQL.insert
// (điều kiện viết lại bằng JS, như server/chat.test.ts). Gemini là fetch giả (như server/call.test.ts).
// Chạy: node --import tsx --test server/memory.test.ts
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { ExtractInput, MemoryDeps } from './memory.ts';

process.env.GEMINI_API_KEY = 'test-key-not-real';
delete process.env.AI_PROVIDER;

const M = await import('./memory.ts');
const { MAY_SQL } = await import('./may.ts');
const { askJSON } = await import('./ai.ts');

type Handler = (url: string, init: RequestInit) => Promise<Response>;
let handler: Handler = async () => new Response('{}', { status: 500 });
let sent: any[] = [];
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

// ---------- Phần thuần ----------

test('foldText: chữ hoa, dấu câu, khoảng trắng, NFD về một dạng', () => {
  assert.equal(M.foldText('  Mẹ  hay nấu, CANH chua!! '), 'mẹ hay nấu canh chua');
  assert.equal(M.foldText('Mẹ nấu'.normalize('NFD')), 'mẹ nấu');
});
const answers = [{ id: 'a1', question: 'q', transcript: 'Hồi đó mẹ hay nấu canh chua cá lóc,  mỗi lần An được điểm cao.' }];
test('câu gốc: khớp lời chép dù khác chữ hoa, dấu câu, khoảng trắng; diễn ý lại hay quá ngắn thì không', () => {
  assert.equal(M.findEvidence('mẹ hay nấu Canh chua cá lóc mỗi lần An được điểm cao', answers), 'a1');
  assert.equal(M.findEvidence('Mẹ hay nấu canh chua cá lóc mỗi lần An được điểm cao.'.normalize('NFD'), answers), 'a1');
  assert.equal(M.findEvidence('Mẹ thường nấu canh chua khi An học giỏi', answers), null);
  assert.equal(M.findEvidence('canh', answers), null);
});
// Dùng chung cho các test dưới: Lan (me) kể, nhà có Hùng (bo), Lan, An (con).
const hung = { id: 'hung', name: 'Hùng', role: 'bo' }, lan = { id: 'lan', name: 'Lan', role: 'me' }, an = { id: 'an', name: 'Nguyễn Văn An', role: 'con' };
const p: ExtractInput = { lang: 'vi', speaker: lan, family: [hung, lan, an], answers, known: [{ id: 'old1', kind: 'food', text_en: 'Mom cooks sour soup' }] };
test('sự thật: phải có câu gốc, tên và số có trong câu gốc, đúng loại, đúng người', () => {
  const ok = { kind: 'food', about: 2 /* An */, text: 'Mẹ hay nấu canh chua cá lóc mỗi khi An được điểm cao',
    text_en: 'Mom cooks sour fish soup whenever An gets good marks', evidence: 'mẹ hay nấu canh chua cá lóc', private: false, occasion: 'none', same_as: '', replaces: '' };
  const f = M.checkFact(ok, p) as any;
  assert.equal(f.aboutId, an.id); assert.equal(f.answerId, 'a1'); assert.equal(f.replaces, null);
  assert.equal(f.occasion, null);                                                     // AI trả 'none' là không gắn dịp nào
  assert.equal((M.checkFact({ ...ok, occasion: 'tet' }, p) as any).occasion, 'tet');
  assert.equal((M.checkFact({ ...ok, occasion: 'halloween' }, p) as any).occasion, null);
  assert.equal(M.checkFact({ ...ok, kind: 'gossip' }, p), null);
  assert.equal(M.checkFact({ ...ok, evidence: 'mẹ nấu phở' }, p), null);
  assert.equal(M.checkFact({ ...ok, text: 'Mẹ hay nấu canh chua cá lóc cho Minh' }, p), null); // tên lạ giữa câu (suspect không kiểm chữ đầu câu tiếng Việt)
  assert.equal(M.checkFact({ ...ok, text_en: 'Mom cooked it 3 times' }, p), null);        // số lạ
  assert.equal(M.checkFact({ ...ok, about: 9 }, p), null);
  assert.equal((M.checkFact({ ...ok, about: -1 }, p) as any).aboutId, null);
  assert.equal((M.checkFact({ ...ok, replaces: 'old1' }, p) as any).replaces, 'old1');
  assert.equal((M.checkFact({ ...ok, replaces: 'zzz' }, p) as any).replaces, null);
  assert.equal(M.checkFact({ ...ok, same_as: 'old1' }, p), 'same');
  assert.doesNotMatch((M.checkFact({ ...ok, text: ok.text.replace(' mỗi', ' — mỗi') }, p) as any).text, /[—–]/);
});
test('ai thấy được: sức khoẻ, lo lắng, chuyện nhạy cảm, chuyện chưa chia sẻ thì chỉ người kể', () => {
  assert.equal(M.visibilityOf('food', false, true), 'family');
  assert.equal(M.visibilityOf('health', false, true), 'self');
  assert.equal(M.visibilityOf('worry', false, true), 'self');
  assert.equal(M.visibilityOf('food', true, true), 'self');
  assert.equal(M.visibilityOf('food', false, false), 'self');
});
test('tín hiệu: low, good_news, upcoming chỉ về chính người kể; upcoming cần ngày tháng; người được nhắc phải có trong câu gốc', () => {
  const s = (o: any) => M.checkSignal({ kind: 'miss', target: 'An', evidence: 'mỗi lần An được điểm cao', day: 0, month: 0, ...o }, p);
  assert.equal(s({})?.target, 'An');
  assert.equal(s({ target: 'Bình' }), null);
  assert.equal(s({ kind: 'low', target: 'An' }), null);
  assert.equal(s({ kind: 'good_news', target: '' })?.kind, 'good_news');
  assert.equal(s({ kind: 'upcoming', target: '' }), null);
  assert.deepEqual(s({ kind: 'upcoming', target: '', day: 25, month: 11 })?.date, { day: 25, month: 11 });
  assert.equal(s({ evidence: 'không có câu này' }), null);
});
test('câu gốc trọn từ: "Mẹ nhớ an" cắt từ "Mẹ nhớ anh Hùng lắm" không được nhận, không thành sự thật hay tín hiệu cho An', () => {
  const q: ExtractInput = { ...p, answers: [{ id: 'a2', question: 'q', transcript: 'Mẹ nhớ anh Hùng lắm' }] };
  assert.equal(M.findEvidence('Mẹ nhớ an', q.answers), null);
  assert.equal(M.findEvidence('Mẹ nhớ anh Hùng', q.answers), 'a2');
  assert.equal(M.checkSignal({ kind: 'miss', target: 'An', evidence: 'Mẹ nhớ an', day: 0, month: 0 }, q), null);
  assert.equal(M.checkFact({ kind: 'person', about: 2, text: 'Mẹ nhớ An', text_en: 'Mom misses An', evidence: 'Mẹ nhớ an',
    private: false, occasion: 'none', same_as: '', replaces: '' }, q), null);
});

// ---------- Rút sổ nhớ sau cuộc gọi (DB giả) ----------

const NOW = new Date('2026-11-20T03:00:00Z');
type Row = Record<string, any>;

/** DB giả: mỗi câu trong MEM_SQL, MAY_SQL.insert một nhánh, điều kiện viết lại bằng JS. Hàng members trả đủ cột (kể cả intro) để bắt chỗ lỡ đưa intro cho AI. */
class FakeDb {
  members: Row[] = [];
  calls: Record<string, Row> = {};
  answers: Row[] = [];
  facts: Row[] = [];
  signals: Row[] = [];
  private clock = NOW.getTime();
  private tick() { return new Date(this.clock += 1000); }

  async query(q: string, v: any[] = []): Promise<{ rows: Row[]; rowCount: number }> {
    const res = (rows: Row[], n = rows.length) => ({ rows, rowCount: n });
    const S = M.MEM_SQL;
    const fromCall = (id: string) => new Set(this.facts.filter((f) => f.call_id === id).map((f) => f.id));
    switch (q) {
      case S.call: return res(this.calls[v[0]] ? [this.calls[v[0]]] : []);
      case S.members: return res(this.members.filter((m) => m.family_id === v[0]));
      case S.answers:
        return res(this.answers.filter((a) => a.call_id === v[0] && a.topic !== 'loi-nhan' && (a.transcript ?? '') !== '')
          .sort((a, b) => a.idx - b.idx || a.turn - b.turn).map(({ id, question, transcript }) => ({ id, question, transcript })));
      case S.known: {
        const mine = fromCall(v[2]);
        return res(this.facts.filter((f) => f.family_id === v[0] && (f.source_id === v[1] || (f.about_id === v[1] && f.visibility === 'family'))
          && f.call_id !== v[2] && (f.replacement_id == null || mine.has(f.replacement_id)))
          .sort((a, b) => +b.created_at - +a.created_at).slice(0, 60).map(({ id, kind, text_en }) => ({ id, kind, text_en })));
      }
      case S.unreplace: {
        const mine = fromCall(v[0]);
        const hit = this.facts.filter((f) => f.replacement_id != null && mine.has(f.replacement_id));
        for (const f of hit) f.replacement_id = null;
        return res([], hit.length);
      }
      case S.clear: {
        const n = this.facts.length;
        this.facts = this.facts.filter((f) => f.call_id !== v[0]);
        return res([], n - this.facts.length);
      }
      case S.insert: {
        const [id, family_id, about_id, source_id, kind, text, text_en, details, call_id, answer_id, visibility] = v;
        this.facts.push({ id, family_id, about_id, source_id, kind, text, text_en, details: JSON.parse(details), call_id, answer_id, visibility, replacement_id: null, created_at: this.tick() });
        return res([], 1);
      }
      case S.replace: {
        const hit = this.facts.filter((f) => f.id === v[0]);
        for (const f of hit) f.replacement_id = v[1];
        return res([], hit.length);
      }
      case S.share: {
        const hit = this.facts.filter((f) => f.call_id === v[0] && f.visibility === 'self' && f.kind !== 'health' && f.kind !== 'worry' && f.details?.sensitive !== true);
        for (const f of hit) f.visibility = 'family';
        return res([], hit.length);
      }
      case S.done: this.calls[v[0]].memory_at = this.tick(); return res([], 1);
      case S.failed: this.calls[v[0]].memory_tries++; return res([], 1);
      case S.next:
        return res(Object.values(this.calls).filter((c) => c.status === 'done' && c.memory_at == null && c.memory_tries < 3)
          .sort((a, b) => +a.done_at - +b.done_at).slice(0, 1).map(({ id }) => ({ id })));
      case MAY_SQL.insert: {
        const [id, family_id, from_id, to_id, kind, evidence, call_id, ref, due_at, expires_at] = v;
        if (this.signals.some((s) => s.call_id === call_id && s.to_id === to_id && s.kind === kind)) return res([], 0);
        this.signals.push({ id, family_id, from_id, to_id, kind, evidence, call_id, ref, due_at, expires_at });
        return res([], 1);
      }
    }
    throw new Error(`DB giả chưa biết câu này: ${q}`);
  }
}

// Lời kể của Lan trong câu chuyện chính (ans2); sự thật và tín hiệu dưới đây chép câu gốc từ đây.
const STORY = 'Hồi An còn ở nhà, mẹ hay nấu canh chua cá lóc mỗi lần An được điểm cao. Giờ mẹ hay làm bánh xèo vào cuối tuần. Dạo này mẹ hay bị đau lưng. Mẹ nhớ An lắm, muốn gọi cho An.';
const fact = (o: Row): Row => ({ about: 1, private: false, occasion: 'none', same_as: '', replaces: '', ...o });
const foodFact = fact({ kind: 'food', about: 2, text: 'Mẹ hay nấu canh chua cá lóc mỗi khi An được điểm cao', text_en: 'Mom cooks sour fish soup whenever An gets good marks', evidence: 'mẹ hay nấu canh chua cá lóc mỗi lần An được điểm cao' });
const foodFact2 = fact({ kind: 'food', text: 'Giờ mẹ hay làm bánh xèo vào cuối tuần', text_en: 'Mom now makes banh xeo on weekends', evidence: 'Giờ mẹ hay làm bánh xèo vào cuối tuần' });
const healthFact = fact({ kind: 'health', text: 'Dạo này mẹ hay bị đau lưng', text_en: 'Mom often has back pain lately', evidence: 'Dạo này mẹ hay bị đau lưng', private: true });
const missSignal = { kind: 'miss', target: 'An', evidence: 'Mẹ nhớ An lắm, muốn gọi cho An', day: 0, month: 0 };
const reply = { facts: [foodFact, healthFact, { ...foodFact2, replaces: 'old1' }], signals: [missSignal] };

let db: FakeDb;
let deps: MemoryDeps;
function seed() {
  db = new FakeDb();
  sent = [];
  const member = (id: string, name: string, role: string, intro: string | null = null) =>
    ({ id, family_id: 'F', name, role, lang: 'vi', city: 'hanoi', loc_share: false, loc_lat: null, loc_lon: null, loc_at: null, may_nudge: true, intro });
  db.members = [member('hung', 'Hùng', 'bo'), member('lan', 'Lan', 'me', JSON.stringify({ food: 'canh chua', unsaid: 'bí mật không nói' })), member('an', 'Nguyễn Văn An', 'con')];
  db.calls.c1 = { id: 'c1', family_id: 'F', member_id: 'lan', status: 'done', shared: true, script: JSON.stringify({ lang: 'vi', questions: [] }), done_at: NOW, memory_at: null, memory_tries: 0 };
  const answer = (id: string, idx: number, topic: string, transcript: string) => ({ id, call_id: 'c1', idx, turn: 0, question: `câu ${idx}`, topic, transcript });
  db.answers = [answer('ans1', 0, 'hoi-tham', 'Dạ mẹ vẫn khoẻ, trời Hà Nội mát rồi.'), answer('ans2', 1, 'ky-niem', STORY), answer('ans3', 2, 'loi-nhan', 'lời nhắn riêng')];
  db.facts = [{ id: 'old1', family_id: 'F', about_id: null, source_id: 'lan', kind: 'food', text: 'Mẹ hay nấu canh chua', text_en: 'Mom cooks sour soup',
    details: {}, call_id: 'c0old', answer_id: null, visibility: 'family', replacement_id: null, created_at: new Date('2026-11-01') }];
  deps = { db, ask: askJSON, now: () => NOW };
}
beforeEach(seed);

const mine = () => db.facts.filter((f) => f.call_id === 'c1');
test('rút sổ nhớ: không đọc lời nhắn khó nói, không có điều chưa nói; chia sẻ thì cả nhà, sức khoẻ thì riêng; thay sự thật cũ', async () => {
  assert.match(M.MEM_SQL.answers, /topic <> 'loi-nhan'/);
  assert.doesNotMatch(M.MEM_SQL.members, /intro|\*/);
  handler = gemini(reply);
  assert.equal(await M.extractCall('c1', { signals: true }, deps), 'done');
  assert.doesNotMatch(JSON.stringify(lastInput()), /lời nhắn riêng|bí mật không nói/);
  // Schema gửi Gemini không có enum chuỗi rỗng: không gắn dịp là 'none', lưu lại là null.
  const occ: string[] = sent.at(-1).generationConfig.responseJsonSchema.properties.facts.items.properties.occasion.enum;
  assert.ok(occ.includes('none') && !occ.includes(''));
  assert.ok(mine().every((f) => f.details.occasion === null));
  assert.deepEqual(mine().map((f) => [f.kind, f.visibility]).sort(), [['food', 'family'], ['food', 'family'], ['health', 'self']]);
  assert.equal(db.facts.find((f) => f.id === 'old1')!.replacement_id, mine().find((f) => f.text === foodFact2.text)!.id);
  assert.deepEqual(db.signals.map((s) => [s.to_id, s.kind]), [['an', 'miss']]);
  assert.ok(db.calls.c1.memory_at);
});
test('rút hai lần cùng một cuộc gọi: sự thật một lần, tín hiệu một lần', async () => {
  handler = gemini(reply);
  await M.extractCall('c1', { signals: true }, deps); await M.extractCall('c1', { signals: true }, deps);
  assert.equal(mine().length, 3);
  assert.equal(db.signals.length, 1);
  // Lần rút sau vẫn thấy sự thật cũ mà lần trước đã thay, nên thay lại đúng sự thật mới, không treo mã đã xoá.
  assert.equal(db.facts.find((f) => f.id === 'old1')!.replacement_id, mine().find((f) => f.text === foodFact2.text)!.id);
});
test('câu gốc cắt giữa từ (anh thành an): rút xong mà không có sự thật, không có tín hiệu gửi nhầm cho An', async () => {
  db.answers.find((a) => a.id === 'ans2')!.transcript = 'Mẹ nhớ anh Hùng lắm';
  handler = gemini({ facts: [fact({ kind: 'person', about: 2, text: 'Mẹ nhớ An', text_en: 'Mom misses An', evidence: 'Mẹ nhớ an' })],
    signals: [{ kind: 'miss', target: 'An', evidence: 'Mẹ nhớ an', day: 0, month: 0 }] });
  assert.equal(await M.extractCall('c1', { signals: true }, deps), 'done');
  assert.equal(mine().length, 0); assert.equal(db.signals.length, 0);
});
test('chưa đồng ý chia sẻ: mọi sự thật của cuộc gọi là riêng', async () => {
  handler = gemini(reply); db.calls.c1.shared = false;
  await M.extractCall('c1', { signals: false }, deps);
  assert.ok(mine().length && mine().every((f) => f.visibility === 'self'));
});
test('chia sẻ sau: sự thật riêng của cuộc gọi sang cả nhà, trừ sức khoẻ, lo lắng, nhạy cảm; cuộc gọi khác giữ nguyên', async () => {
  const f = (id: string, call_id: string, kind: string, visibility: string, sensitive = false): Row => ({ id, family_id: 'F', about_id: null, source_id: 'lan', kind,
    text: id, text_en: id, details: { evidence: 'e', sensitive, occasion: null, lang: 'vi' }, call_id, answer_id: null, visibility, replacement_id: null, created_at: NOW });
  db.facts = [f('food', 'c1', 'food', 'self'), f('health', 'c1', 'health', 'self'), f('worry', 'c1', 'worry', 'self'), f('secret', 'c1', 'like', 'self', true),
    f('place', 'c1', 'place', 'family'), f('other', 'c2', 'food', 'self')];
  assert.equal(await M.shareFacts(db, 'c1'), 1);
  assert.deepEqual(db.facts.map((x) => [x.id, x.visibility]), [['food', 'family'], ['health', 'self'], ['worry', 'self'], ['secret', 'self'], ['place', 'family'], ['other', 'self']]);
  assert.equal(await M.shareFacts(db, 'c1'), 0);   // bấm lại không đổi gì
});
test('người kể tắt "Mây nhắc mình liên lạc": vẫn có sự thật, không có tín hiệu', async () => {
  handler = gemini(reply); db.members.find((m) => m.id === 'lan')!.may_nudge = false;
  await M.extractCall('c1', { signals: true }, deps);
  assert.equal(mine().length, 3); assert.equal(db.signals.length, 0);
});
test('AI hỏng: đếm lần thử, không ghi gì; rút bù đi từ cuộc gọi cũ nhất, bỏ cuộc gọi đã thử 3 lần, không tín hiệu', async () => {
  handler = async () => new Response('{}', { status: 500 });
  assert.equal(await M.extractCall('c1', { signals: true }, deps), 'failed');
  assert.equal(db.calls.c1.memory_tries, 1); assert.equal(mine().length, 0);
  handler = gemini(reply);
  db.calls.c0 = { ...db.calls.c1, id: 'c0', done_at: new Date('2026-10-01'), memory_at: null, memory_tries: 0 };   // cũ hơn c1
  db.calls.c9 = { ...db.calls.c1, id: 'c9', done_at: new Date('2026-09-01'), memory_at: null, memory_tries: 3 };   // đã thử đủ
  assert.equal(await M.backfillOnce(deps), true);  assert.ok(db.calls.c0.memory_at);
  assert.equal(await M.backfillOnce(deps), true);  assert.ok(db.calls.c1.memory_at);
  assert.equal(await M.backfillOnce(deps), false); assert.equal(db.calls.c9.memory_at, null);
  assert.equal(db.signals.length, 0);
});
test('AI hỏng giữa lúc rút bù: dừng ngay sau cuộc gọi lỗi đầu tiên, không đốt lượt thử của cuộc gọi khác', async () => {
  handler = async () => new Response('{}', { status: 500 });
  db.calls.c0 = { ...db.calls.c1, id: 'c0', done_at: new Date('2026-10-01') };   // cũ hơn c1, có câu trả lời
  db.answers.push({ ...db.answers.find((a) => a.id === 'ans2')!, id: 'ans0', call_id: 'c0' });
  let runs = 0;
  while (await M.backfillOnce(deps)) runs++;   // đúng vòng của startMemoryBackfill: chỉ chạy tiếp khi true
  assert.equal(runs, 0);
  assert.equal(sent.length, 1);                // một lần gọi AI rồi dừng
  assert.equal(db.calls.c0.memory_tries, 1);
  assert.equal(db.calls.c1.memory_tries, 0);
  assert.equal(db.calls.c1.memory_at, null);
});
