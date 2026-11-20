// Kiểm thử phần chấm câu chuyện, kế hoạch tập, nhịp dựng và xếp cảnh của tập câu chuyện. Không gọi Gemini thật (fetch giả), không đụng DB.
// Chạy: node --import tsx --test server/podcast.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'podcast-test-'));
process.env.GEMINI_API_KEY = 'test-key-not-real';
delete process.env.AI_PROVIDER;

const P = await import('./podcast.ts');
const { storyShots } = await import('./callvideo.ts');

type A = Parameters<typeof P.groupStories>[0][number];
const ans = (idx: number, turn: number, speech: number, transcript: string | null, topic = 'tuoi-tho', question = `q${idx}.${turn}`): A =>
  ({ id: `a${idx}-${turn}`, idx, turn, question, topic, transcript, speech });
const words = (n: number, w = 'nhà') => Array.from({ length: n }, () => w).join(' ');

const realFetch = globalThis.fetch;
function fakeGemini(reply: unknown, seen: string[] = []) {
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    seen.push(init.body);
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
}
test.afterEach(() => { globalThis.fetch = realFetch; });

test('gom câu chuyện theo idx, lượt theo thứ tự, bỏ hẳn lời nhắn', () => {
  const st = P.groupStories([ans(1, 1, 10, 'sau'), ans(0, 0, 12, 'một'), ans(1, 0, 20, 'trước'), ans(2, 0, 30, 'bí mật', 'loi-nhan')]);
  assert.deepEqual(st.map((s) => s.idx), [0, 1]);
  assert.deepEqual(st[1].turns.map((t) => t.turn), [0, 1]);
  assert.equal(st[1].speech, 30);
  assert.equal(st[1].text, 'trước sau');
  assert.equal(st[1].question, 'q1.0');
});

test('câu hỏi thăm không bao giờ thành tập; cuộc gọi v2 chỉ chuyện chính thành tập', () => {
  assert.deepEqual(P.groupStories([ans(0, 0, 30, words(30), 'hoi-tham'), ans(1, 0, 40, words(40))]).map((s) => s.idx), [1]);
  const q = (part?: string, topic = 'mon-an') => ({ text: 't', topic, photo: false, event: 'none', ...(part ? { part } : {}) }) as any;
  assert.deepEqual(P.episodeIdx({ v: 2, questions: [q('checkin', 'hoi-tham'), q('story'), q(undefined, 'loi-nhan')] }), [1]);
  assert.equal(P.episodeIdx({ questions: [q(), q(), q()] }), null);
});

test('tập theo cuộc gọi v3: chỉ các ô chuyện thành tập', () => {
  const qs = [{ part: 'checkin' }, { topic: 'loi-nhan' }, { part: 'story' }, { part: 'story' }] as any;
  assert.deepEqual(P.episodeIdx({ v: 3, questions: qs }), [2, 3]);
  assert.deepEqual(P.episodeIdx({ v: 2, questions: [{ part: 'checkin' }, { part: 'story' }] as any }), [1]);
  assert.equal(P.episodeIdx({ questions: [] as any }), null);
});

test('luật khi không có AI: đủ 25 giây tiếng nói và lời chép đủ dài', () => {
  const [ok, short, few, bare, bareLong] = P.groupStories([
    ans(0, 0, 18, words(30)), ans(0, 1, 9, words(10)), // 27 giây, 40 từ
    ans(1, 0, 12, words(40)),
    ans(2, 0, 40, 'vâng ạ'),
    ans(3, 0, 28, null),
    ans(4, 0, 31, null),
  ]);
  assert.equal(P.ruleGood(ok, 'vi'), true);
  assert.equal(P.ruleGood(short, 'vi'), false);
  assert.equal(P.ruleGood(few, 'vi'), false);
  assert.equal(P.ruleGood(bare, 'vi'), false);
  assert.equal(P.ruleGood(bareLong, 'vi'), true);
  // Tiếng Hàn đếm theo âm tiết.
  const [ko] = P.groupStories([ans(0, 0, 30, '어릴 때 할머니 집 마당에서 동생이랑 매일 놀았어요 '.repeat(4))]);
  assert.equal(P.ruleGood(ko, 'ko'), true);
});

test('kế hoạch theo luật: mỗi chuyện đạt một tập, phần đuôi chỉ chuyện cùng chủ đề, mỗi đoạn một tập', () => {
  const stories = P.groupStories([
    ans(0, 0, 40, words(60), 'tuoi-tho'),
    ans(1, 0, 8, words(12), 'mon-an'),       // đuôi: cùng chủ đề với tập 2 dù tập 0 gần hơn
    ans(2, 0, 35, words(50), 'mon-an'),
    ans(3, 0, 6, words(8), 'mon-an'),        // đuôi: cùng chủ đề, vào tập 2
    ans(6, 0, 7, words(9), 'que-nha'),       // không chuyện nào cùng chủ đề: không nối (không biết có hợp không)
    ans(4, 0, 1, 'ừ', 'tuoi-tho'),           // quá ít, không vào đâu
    ans(5, 0, 50, words(80), 'loi-nhan'),    // lời nhắn, không bao giờ vào
  ]);
  const plan = P.planStories(stories, null, 'vi', '');
  assert.equal(plan.by, 'rule');
  assert.deepEqual(plan.eps.map((e) => e.idx), [0, 2]);
  assert.ok(plan.eps.every((e) => e.title === null));
  const used = plan.eps.flatMap((e) => [e.idx, ...e.tail]);
  assert.equal(new Set(used).size, used.length);
  assert.ok(!used.includes(4) && !used.includes(5) && !used.includes(6));
  assert.deepEqual(plan.eps.find((e) => e.idx === 2)!.tail, [1, 3]);
  assert.deepEqual(plan.eps.find((e) => e.idx === 0)!.tail, []);
});

test('không chuyện nào đạt thì không có tập', () => {
  const plan = P.planStories(P.groupStories([ans(0, 0, 9, words(10)), ans(1, 0, 12, words(20))]), null, 'vi', '');
  assert.equal(plan.eps.length, 0);
});

test('AI chấm (fetch giả): theo lời AI, sàn 15 giây, tên qua lớp lọc chống bịa, phần đuôi theo joins', async () => {
  const stories = P.groupStories([
    ans(0, 0, 22, 'Hồi nhỏ mẹ ở Nam Định, chiều nào cũng ra bờ sông với bà ngoại.'), ans(0, 1, 9, 'Bà hay mua kẹo lạc.'),
    ans(1, 0, 11, 'Món canh cua của bà.'),
    ans(2, 0, 30, 'Năm 1995 bố mẹ cưới ở Hải Phòng, trời mưa to.'),
    ans(3, 0, 12, 'Tuần này con bận lắm.'),
    ans(4, 0, 6, 'Dạ vâng.'),
  ]);
  const seen: string[] = [];
  fakeGemini({ stories: [
    { idx: 0, good: true, title: 'Chiều bên sông với bà', joins: -1 },
    { idx: 1, good: false, title: '', joins: 0 },
    { idx: 2, good: true, title: 'Đám cưới năm 1996 ở Hà Nội', joins: -1 }, // năm và nơi chốn không có trong lời kể: bỏ tên
    { idx: 3, good: true, title: 'Một tuần bận rộn', joins: -1 },            // AI khen nhưng dưới 15 giây
    { idx: 4, good: false, title: '', joins: 7 },                            // joins không phải tập: bỏ
  ] }, seen);
  const verdicts = await P.rateStories(stories, { name: 'Mẹ', role: 'me' }, 'vi');
  assert.ok(verdicts);
  const body = JSON.parse(seen[0]);
  const sent = JSON.parse(body.contents[0].parts[0].text);
  assert.equal(sent.language, 'vi');
  assert.equal(sent.stories.length, 5);
  assert.deepEqual(sent.stories[0].turns.map((t: { said: string }) => t.said), ['Hồi nhỏ mẹ ở Nam Định, chiều nào cũng ra bờ sông với bà ngoại.', 'Bà hay mua kẹo lạc.']);
  const hay = ['Mẹ', ...stories.flatMap((s) => s.turns.flatMap((t) => [t.question, t.transcript ?? '']))].join('\n');
  const plan = P.planStories(stories, verdicts, 'vi', hay);
  assert.equal(plan.by, 'ai');
  assert.deepEqual(plan.eps.map((e) => e.idx), [0, 2]);
  assert.equal(plan.eps[0].title, 'Chiều bên sông với bà');
  assert.equal(plan.eps[1].title, null);
  assert.deepEqual(plan.eps[0].tail, [1]);
  assert.deepEqual(plan.eps[1].tail, []);
});

test('AI lỗi hoặc quá hạn thì trả null, kế hoạch đi theo luật', async () => {
  globalThis.fetch = (async () => { throw new Error('timeout'); }) as unknown as typeof fetch;
  const stories = P.groupStories([ans(0, 0, 40, words(60))]);
  const v = await P.rateStories(stories, { name: 'Bố' }, 'vi');
  assert.equal(v, null);
  assert.deepEqual(P.planStories(stories, v, 'vi', '').eps.map((e) => e.idx), [0]);
});

test('tên tập: bỏ dấu gạch dài, ngoặc kép, chấm cuối; bỏ tên người không có trong dữ liệu', () => {
  assert.equal(P.cleanTitle('“Chiếc xe đạp — của bố.”', 'chiếc xe đạp của bố', 'vi'), 'Chiếc xe đạp, của bố');
  assert.equal(P.cleanTitle('Bố và chú Tuấn đi câu', 'bố đi câu cá', 'vi'), null);
  assert.equal(P.cleanTitle('', 'x', 'vi'), null);
  assert.equal(P.cleanTitle('a'.repeat(80), 'a', 'vi'), null);
});

const clip = (dur: number, text: string) => ({ file: 'x.wav', dur, gain: 0, words: [{ w: text, s: 0.2, e: 0.6 }], text, voiced: [[0, dur]] as Array<[number, number]> });

test('nhịp dựng: các lượt nối liền, phần đuôi sau khoảng nhạc, mục lục theo câu chuyện', () => {
  const G = P.STORY_GAPS;
  const lay = P.layoutStory([
    { clip: clip(10, 'một'), who: 'Mẹ', question: 'Q0', transcript: null, group: 0, tail: false },
    { clip: clip(5, 'hai'), who: 'Mẹ', question: 'Q0b', transcript: null, group: 0, tail: false },
    { clip: clip(4, 'ba'), who: 'Mẹ', question: 'Q3', transcript: null, group: 3, tail: true },
    { clip: clip(2, 'bốn'), who: 'Mẹ', question: 'Q3b', transcript: null, group: 3, tail: true },
  ], true);
  const at = lay.placed.map((p) => p.at);
  assert.equal(at[0], G.leadVideo);
  assert.equal(at[1], G.leadVideo + 10 + G.join);
  assert.equal(at[2], at[1] + 5 + G.toTail);
  assert.equal(at[3], at[2] + 4 + G.tailJoin);
  assert.equal(lay.total, at[3] + 2 + G.outro);
  assert.ok(lay.placed.every((p) => p.fadeIn && p.fadeOut));
  assert.equal(lay.chapters.length, 2);
  assert.equal(lay.chapters[0].question, 'Q0');
  assert.equal(lay.chapters[0].transcript, 'một hai');
  assert.equal(lay.chapters[1].question, 'Q3');
  assert.equal(lay.story.turns.length, 1);
  assert.equal(lay.story.turns[0].question, 'Q3');
  assert.ok(lay.story.turns[0].s < at[2] && lay.story.turns[0].e > at[2]);
  assert.equal(lay.story.voices[1].words[0].s, at[1] + 0.2);
  // Cùng một người kể cả chuyện chính lẫn phần đuôi: một khoảng tên.
  assert.deepEqual(lay.story.names.map((n) => n.name), ['Mẹ']);
  // Chỉ tiếng: mở đầu ngắn hơn.
  assert.equal(P.layoutStory([{ clip: clip(10, 'x'), who: 'Mẹ', question: 'Q', transcript: null, group: 0 }], false).placed[0].at, G.leadAudio);
});

test('tập chủ đề: tên người kể đổi theo từng chuyện', () => {
  const lay = P.layoutStory([
    { clip: clip(8, 'a'), who: 'Mẹ', question: 'Q', transcript: null, group: 0 },
    { clip: clip(6, 'b'), who: 'Bố', question: 'Q', transcript: null, group: 1 },
    { clip: clip(3, 'c'), who: 'Bố', question: 'Q2', transcript: null, group: 2 },
  ], true);
  assert.deepEqual(lay.story.names.map((n) => n.name), ['Mẹ', 'Bố']);
  assert.equal(lay.story.names[0].e, lay.story.names[1].s);
  assert.equal(lay.story.turns.length, 2);
});

test('ảnh của câu chuyện: theo cột story, ảnh kiểu cũ (story trống) thuộc câu hỏi xin ảnh', () => {
  const rows = [{ media: 'a', story: 0 }, { media: 'b', story: null }, { media: 'c', story: 2 }, { media: 'd', story: 0 }];
  assert.deepEqual(P.pickStoryPhotos(rows, 0, 1), ['a', 'd']);
  assert.deepEqual(P.pickStoryPhotos(rows, 1, 1), ['b']);
  assert.deepEqual(P.pickStoryPhotos(rows, 2, -1), ['c']);
  assert.deepEqual(P.pickStoryPhotos(rows, 3, -1), []);
});

test('xếp cảnh: phủ đúng độ dài phim, phim dài thì lặp ảnh, nhiều ảnh quá thì bớt', () => {
  const end = (p: ReturnType<typeof storyShots>) => p.shots[p.shots.length - 1].start + p.L;
  const a = storyShots(40, 3);
  assert.ok(Math.abs(end(a) - 40) < 1e-6);
  assert.ok(a.L <= 9 + a.X + 1e-6);
  assert.deepEqual(a.shots.slice(0, 4).map((s) => s.photo), [0, 1, 2, 0]);
  const one = storyShots(60, 1);
  assert.ok(one.shots.length >= 7 && one.shots.every((s) => s.photo === 0));
  const many = storyShots(10, 12);
  assert.equal(many.used, 5);
  assert.ok(Math.abs(end(many) - 10) < 1e-6);
  for (let i = 1; i < a.shots.length; i++) assert.ok(a.shots[i].start > a.shots[i - 1].start);
});

// ---------- Tập riêng và tập chia sẻ (DB giả theo từng câu trong POD_SQL, MEM_SQL.share, MAY_SQL.insert) ----------

const { MEM_SQL } = await import('./memory.ts');
const { MAY_SQL } = await import('./may.ts');
type Row = Record<string, any>;
const NOW = new Date('2026-11-20T03:00:00Z');

function shareDb() {
  const ep = (id: string, key: string, member_id: string, shared: boolean, topic = 'que-nha', h = 0): Row =>
    ({ id, family_id: 'F', key, kind: 'person', member_id, topic, title: id, media: `/media/podcasts/${id}.m4a`, duration: 30, chapters: '[]', cover: null,
      status: 'ready', shared, created_at: new Date(NOW.getTime() - h * 3600e3), video: null, poster: null, video_status: 'none' });
  const fact = (kind: string, sensitive = false): Row => ({ id: `f-${kind}`, family_id: 'F', kind, call_id: 'c1', visibility: 'self', details: { evidence: 'e', sensitive } });
  const db = {
    calls: { c1: { id: 'c1', family_id: 'F', member_id: 'a1', shared: false } } as Record<string, Row>,
    members: [{ id: 'a1', family_id: 'F', name: 'Lan', role: 'me', lang: 'vi' }, { id: 'a3', family_id: 'F', name: 'Hùng', role: 'bo', lang: 'vi' },
      { id: 'an', family_id: 'F', name: 'An', role: 'con', lang: 'vi' }],
    // Tập của a1 đã chia sẻ, tập riêng của a1 (cuộc gọi c1), tập riêng của a3, tập cũ của a3 (mặc định đã chia sẻ).
    podcasts: [ep('ep-a1-shared', 'story:c0:1', 'a1', true, 'que-nha', 1), ep('ep-a1-private', 'story:c1:1', 'a1', false, 'mon-an', 2),
      ep('ep-a3-private', 'story:c3:1', 'a3', false, 'que-nha', 3), ep('ep-old', 'call:c9', 'a3', true, 'que-nha', 4)],
    answers: [{ call_id: 'c1', idx: 1, turn: 0, topic: 'mon-an', transcript: 'Hồi An còn bé, nhà mình hay ăn canh chua.' },
      { call_id: 'c1', idx: 1, turn: 1, topic: 'mon-an', transcript: null },
      { call_id: 'c1', idx: 2, turn: 0, topic: 'loi-nhan', transcript: 'Hùng ơi, lời nhắn riêng.' }],
    facts: [fact('food'), fact('health'), fact('like', true), fact('worry')],
    signals: [] as Row[],
    async query(q: string, v: any[] = []): Promise<{ rows: Row[]; rowCount: number }> {
      const out = (rows: Row[], n = rows.length) => ({ rows, rowCount: n });
      const S = P.POD_SQL;
      switch (q) {
        case S.list:
          return out(db.podcasts.filter((e) => e.family_id === v[0] && e.status !== 'failed' && e.key !== v[2] && (e.shared || e.member_id === v[3]))
            .sort((a, b) => +b.created_at - +a.created_at).slice(0, v[1]));
        case S.shareCall: {
          const c = db.calls[v[0]];
          if (!c || c.member_id !== v[1]) return out([]);
          c.shared = true;
          return out([{ family_id: c.family_id }]);
        }
        case S.shareEps: {
          const prefix = String(v[1]).replace(/%$/, '');   // key like 'story:<callId>:%'
          const hit = db.podcasts.filter((e) => e.family_id === v[0] && e.key.startsWith(prefix) && !e.shared);
          for (const e of hit) e.shared = true;
          return out(hit.map(({ id, key, topic }) => ({ id, key, topic })));
        }
        case S.family: return out(db.members.filter((m) => m.family_id === v[0]));
        case S.storyText:
          return out(db.answers.filter((a) => a.call_id === v[0] && a.idx === v[1] && !v[2].includes(a.topic)).sort((a, b) => a.turn - b.turn).map(({ transcript }) => ({ transcript })));
        case MEM_SQL.share: {
          const hit = db.facts.filter((f) => f.call_id === v[0] && f.visibility === 'self' && f.kind !== 'health' && f.kind !== 'worry' && f.details?.sensitive !== true);
          for (const f of hit) f.visibility = 'family';
          return out([], hit.length);
        }
        case MAY_SQL.insert: {
          const [id, family_id, from_id, to_id, kind, evidence, call_id, ref, due_at, expires_at] = v;
          if (db.signals.some((s) => s.call_id === call_id && s.to_id === to_id && s.kind === kind)) return out([], 0);
          db.signals.push({ id, family_id, from_id, to_id, kind, evidence, call_id, ref, due_at, expires_at });
          return out([], 1);
        }
      }
      throw new Error(`DB giả chưa biết câu này: ${q}`);
    },
  };
  return db;
}
let db: ReturnType<typeof shareDb>;
let rebuilt: Array<[string, string]>;
let deps: NonNullable<Parameters<typeof P.shareCall>[2]>;
test.beforeEach(() => {
  db = shareDb();
  rebuilt = [];
  deps = { db, rebuildTopic: async (fid, topic) => { rebuilt.push([fid, topic]); }, now: () => NOW };
});

test('danh sách tập: tập riêng chỉ người kể thấy, tập cũ và tập đã chia sẻ ai cũng thấy', async () => {
  // rows: ep-a1-shared (member a1, shared), ep-a1-private (a1, not shared), ep-a3-private (a3), ep-old (a3, shared default)
  assert.deepEqual((await P.listPodcasts('F', 'a3', 60, db)).map((e) => e.id).sort(), ['ep-a1-shared', 'ep-a3-private', 'ep-old']);
  assert.deepEqual((await P.listPodcasts('F', 'a1', 60, db)).map((e) => e.id).sort(), ['ep-a1-private', 'ep-a1-shared', 'ep-old']);
  // Thêm: máy khách biết tập nào còn riêng (để hiện nút chia sẻ).
  assert.deepEqual((await P.listPodcasts('F', 'a1', 60, db)).map((e) => [e.id, e.shared]), [['ep-a1-shared', true], ['ep-a1-private', false], ['ep-old', true]]);
});
test('chia sẻ sau: chỉ người kể bấm được; tập, sự thật đổi sang cả nhà (trừ sức khoẻ, lo lắng, nhạy cảm); báo người được nhắc; dựng lại tập chủ đề', async () => {
  assert.equal(await P.shareCall('c1', 'a3', deps), false);
  assert.equal(db.calls.c1.shared, false);
  assert.equal(await P.shareCall('c1', 'a1', deps), true);
  assert.equal(db.calls.c1.shared, true);
  assert.equal(db.podcasts.find((e) => e.key === 'story:c1:1')!.shared, true);
  assert.deepEqual(db.facts.map((f) => [f.kind, f.visibility]).sort(), [['food', 'family'], ['health', 'self'], ['like', 'self'] /* sensitive */, ['worry', 'self']]);
  assert.deepEqual(db.signals.filter((s) => s.kind === 'story').map((s) => s.to_id), ['an']);   // chuyện có nhắc An
  assert.deepEqual(rebuilt, [['F', 'mon-an']]);
  await P.shareCall('c1', 'a1', deps);
  assert.equal(db.signals.filter((s) => s.kind === 'story').length, 1);
  // Thêm: tin chuyện mới trỏ đúng tập, không mang lời kể; bấm lại không dựng lại tập chủ đề; tập của người khác không đổi.
  assert.deepEqual(db.signals.map((s) => [s.from_id, s.ref, s.evidence]), [['a1', 'ep-a1-private', '']]);
  assert.deepEqual(rebuilt, [['F', 'mon-an']]);
  assert.equal(db.podcasts.find((e) => e.id === 'ep-a3-private')!.shared, false);
});
