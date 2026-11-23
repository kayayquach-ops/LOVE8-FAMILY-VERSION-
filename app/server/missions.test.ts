// Kiểm thử nhiệm vụ tuần tự đánh dấu (server/missions.ts) và giấy gấp sao không còn bán lẻ (server/jar.ts).
// Không cần Postgres: DB giả trong bộ nhớ trả lời đúng các câu SQL hai file này gửi, giữ khoá chính (member_id, mission, week)
// của missions_done như Postgres (on conflict do nothing). Cách làm theo server/members.test.ts và server/shot.test.ts.
// Chạy: node --import tsx --test server/missions.test.ts
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const M = await import('./missions.ts');
const J = await import('./jar.ts');
const { pool } = await import('./db.ts');
const { langMiddleware } = await import('./i18n.ts');
const express = (await import('express')).default;

const here = path.dirname(fileURLToPath(import.meta.url));
const dict = (side: string, l: string) => JSON.parse(readFileSync(path.join(here, side, `${l}.json`), 'utf8'));

/** Giờ Việt Nam. */
const vn = (s: string) => new Date(`${s}+07:00`);
// Thứ Tư 18/11/2026: tuần này bắt đầu thứ Hai 16/11, tuần trước 9/11.
const NOW = vn('2026-11-18T10:00:00');
const WEEK = '2026-11-16';
const PREV = '2026-11-09';

type Row = Record<string, any>;
class FakeDb {
  members: Row[] = [
    { id: 'bo1', family_id: 'F', role: 'bo' },
    { id: 'me1', family_id: 'F', role: 'me' },
    { id: 'con1', family_id: 'F', role: 'con' },
    { id: 'con2', family_id: 'F', role: 'con' },
    { id: 'x1', family_id: 'G', role: 'me' },
  ];
  posts: Row[] = [];
  replies: Row[] = [];
  messages: Row[] = [];
  letters: Row[] = [];
  done: Row[] = [];
  seeds: Row[] = [];
  sql: string[] = [];
  query = async (q: string, v: any[] = []): Promise<any> => {
    this.sql.push(q);
    const since = (rows: Row[]) => rows.filter((r) => r.family_id === v[0] && r.created_at >= v[1]);
    if (q.includes('insert into missions_done')) {
      const [fid, mid, mission, week, at] = v;
      if (q.includes('from members') && !this.members.some((m) => m.id === mid && m.family_id === fid)) return { rows: [], rowCount: 0 };
      if (this.done.some((d) => d.member_id === mid && d.mission === mission && d.week === week)) return { rows: [], rowCount: 0 };
      this.done.push({ family_id: fid, member_id: mid, mission, week, created_at: at });
      return { rows: [], rowCount: 1 };
    }
    if (q.includes('select who, at from')) {
      const ev = [...this.posts.map((p) => ({ who: p.author_id, at: p.created_at })), ...this.replies.map((r) => ({ who: r.author_id, at: r.created_at })),
        ...this.done.filter((d) => d.family_id === v[0]).map((d) => ({ who: d.member_id, at: d.created_at }))];
      return { rows: ev.sort((a, b) => a.at - b.at) };
    }
    if (q.includes('insert into member_seed')) { this.seeds = [...this.seeds.filter((s) => s.member_id !== v[0]), { member_id: v[0], seed: v[1] }]; return { rows: [], rowCount: 1 }; }
    if (q.includes('from member_seed')) return { rows: this.seeds };
    if (q.includes('from missions_done')) return { rows: this.done.filter((d) => d.family_id === v[0] && d.week >= v[1]) };
    if (q.includes('from members')) return { rows: this.members.filter((m) => m.family_id === v[0]) };
    if (q.includes('from replies')) return { rows: since(this.replies).filter((r) => r.text != null) };
    if (q.includes('from posts')) return { rows: since(this.posts) };
    if (q.includes('from messages')) return { rows: since(this.messages).filter((r) => r.text != null || r.sticker != null) };
    if (q.includes('from letters')) return { rows: since(this.letters) };
    if (q.includes('from brand_coupons')) return { rows: [] };
    throw new Error(`câu SQL lạ: ${q}`);
  };
  /** Nhiệm vụ đã xong theo dạng "người:nhiệm vụ:tuần", xếp sẵn. */
  list = () => this.done.map((d) => `${d.member_id}:${d.mission}:${d.week}`).sort();
}
const post = (author_id: string, kind: string, at: string, extra: Row = {}) => ({ family_id: 'F', author_id, kind, caption: null, meal: false, created_at: vn(at), ...extra });
const msg = (author_id: string, text: string | null, at: string, extra: Row = {}) => ({ family_id: 'F', author_id, kind: 'text', text, sticker: null, created_at: vn(at), ...extra });
const roles = new Map([['bo1', 'bo'], ['me1', 'me'], ['con1', 'con'], ['con2', 'con']]);
const act = (a: Partial<import('./missions.ts').Act>) => M.missionsOf({ by: 'con1', at: NOW, ...a }, roles);

// ---------- Chữ ----------

test('nói thương: nhận đủ ba thứ tiếng, bỏ chữ trùng mặt (yêu cầu, bị thương, missed)', () => {
  for (const s of ['Thương mẹ nhiều', 'con yêu bố', 'Nhớ cả nhà quá', 'đáng yêu ghê', 'Love you mom', 'I MISS you', 'luv u',
    '엄마 사랑해요', '보고 싶어요', '보고싶다', '할머니가 그리워요', 'thương mẹ' /* "thương mẹ" dạng tách dấu (NFD) */]) assert.ok(M.saysLove(s), s);
  for (const s of ['Con gửi yêu cầu rồi', 'Bố bị thương nhẹ thôi', 'đi thương lượng giá', 'bình thường mà', 'Lovely weather',
    'I missed the bus', 'ghi nhớ nhé', 'Ăn cơm chưa', '', null, undefined]) assert.equal(M.saysLove(s), false, String(s));
  // Chỉ một từ trùng mặt bị bỏ, từ thương thật vẫn tính.
  assert.ok(M.saysLove('Mẹ gửi yêu cầu rồi, thương con'));
});

test('hỏi kỷ niệm: cần dấu hỏi và từ chuyện cũ, ba thứ tiếng', () => {
  for (const s of ['Bố còn nhớ ngày cưới không ạ?', 'Hồi nhỏ con nghịch lắm hả mẹ?', 'Kể con nghe chuyện ngày xưa đi?', 'kỉ niệm đẹp nhất của mẹ là gì?',
    'Do you remember our first trip?', 'Favorite memory from back then?', '엄마 어릴 때 기억나요?', '옛날 얘기 해 줘요？']) assert.ok(M.asksMemory(s), s);
  for (const s of ['Bố còn nhớ ngày cưới không ạ', 'Hôm nay ăn gì?', 'Ghi nhớ giúp con lịch này?', 'I remember that.', '', null]) assert.equal(M.asksMemory(s), false, String(s));
});

test('khác thế hệ: bố/mẹ với con, không tính bố với mẹ hay con với con', () => {
  assert.ok(M.otherGeneration('bo', 'con'));
  assert.ok(M.otherGeneration('con', 'me'));
  assert.equal(M.otherGeneration('bo', 'me'), false);
  assert.equal(M.otherGeneration('con', 'con'), false);
  assert.equal(M.otherGeneration('con', undefined), false);
  assert.equal(M.otherGeneration('khach', 'con'), false);
});

// ---------- Từng nhiệm vụ ----------

test('video: bài kind video; ảnh không tính', () => {
  assert.deepEqual(act({ post: 'video' }), ['video']);
  assert.deepEqual(act({ post: 'photo' }), []);
  assert.deepEqual(act({ post: 'voice' }), []);
});

test('bữa cơm: ảnh có meal = true; ảnh thường hay video có meal không tính bữa cơm', () => {
  assert.deepEqual(act({ post: 'photo', meal: true }), ['meal']);
  assert.deepEqual(act({ post: 'photo', meal: false }), []);
  assert.deepEqual(act({ post: 'video', meal: true }), ['video']);
});

test('nói thương: bấm ôm, chữ thương ở tin nhắn/trả lời/thư/lời kèm, nhãn dán thương', () => {
  assert.deepEqual(act({ post: 'hug' }), ['love']);
  assert.deepEqual(act({ text: 'thương bố mẹ' }), ['love']);
  assert.deepEqual(act({ text: 'thương bố mẹ', to: 'me1' }), ['love']);
  assert.deepEqual(act({ post: 'photo', text: 'Yêu cả nhà' }), ['love']);
  assert.deepEqual(act({ stickers: ['love'] }), ['love']);
  assert.deepEqual(act({ stickers: ['rice', 'sun'] }), []);
  assert.deepEqual(act({ text: 'ăn cơm chưa' }), []);
});

test('hỏi kỷ niệm: gửi cả nhà thì tính; gửi riêng phải khác thế hệ', () => {
  assert.deepEqual(act({ text: 'Mẹ kể chuyện hồi xưa đi?' }), ['memory']);
  assert.deepEqual(act({ text: 'Mẹ kể chuyện hồi xưa đi?', to: 'me1' }), ['memory']);
  assert.deepEqual(act({ text: 'Mẹ kể chuyện hồi xưa đi?', to: 'con2' }), []);
  assert.deepEqual(M.missionsOf({ by: 'bo1', at: NOW, text: 'Con còn nhớ chuyến đi biển không?', to: 'me1' }, roles), ['love']);
  // "nhớ ... ?" vừa là thương vừa là hỏi chuyện cũ.
  assert.deepEqual(act({ text: 'Mẹ còn nhớ không?' }), ['love', 'memory']);
});

test('tuần: tính từ 0 giờ thứ Hai giờ Việt Nam, mỗi người mỗi nhiệm vụ mỗi tuần một dòng, lấy lần sớm nhất', () => {
  assert.equal(M.weekKey(vn('2026-11-15T23:59:59')), PREV);
  assert.equal(M.weekKey(vn('2026-11-16T00:00:00')), WEEK);
  assert.equal(M.weekKey(new Date('2026-11-15T17:00:00Z')), WEEK);
  assert.equal(M.weekKey(vn('2026-11-22T23:59:59')), WEEK);
  assert.equal(M.weekStart(WEEK).toISOString(), '2026-11-15T17:00:00.000Z');
  const got = M.detect([
    { by: 'con1', at: vn('2026-11-18T09:00:00'), post: 'video' },
    { by: 'con1', at: vn('2026-11-16T08:00:00'), post: 'video' },
    { by: 'con1', at: vn('2026-11-15T23:00:00'), post: 'video' },
    { by: 'nguoi-la', at: vn('2026-11-17T08:00:00'), post: 'video' },
  ], roles);
  assert.deepEqual(got.map((d) => `${d.memberId}:${d.mission}:${d.week}:${d.at.toISOString()}`).sort(), [
    `con1:video:${PREV}:2026-11-15T16:00:00.000Z`,
    `con1:video:${WEEK}:2026-11-16T01:00:00.000Z`,
  ]);
});

// ---------- Ghi vào missions_done ----------

test('syncMissions: đọc việc cả nhà, ghi đúng tuần, giờ ghi là giờ làm, chạy lại không thêm sao', async () => {
  const db = new FakeDb();
  db.posts.push(
    post('con1', 'video', '2026-11-17T20:00:00'),
    post('me1', 'photo', '2026-11-18T07:30:00', { meal: true }),
    post('bo1', 'hug', '2026-11-16T06:00:00'),
    post('con2', 'video', '2026-11-15T22:00:00'), // tối Chủ nhật tuần trước, chưa ai mở app: vẫn tính cho tuần trước
    post('con2', 'video', '2026-11-08T22:00:00'), // hai tuần trước: không quét
    { ...post('x1', 'video', '2026-11-17T10:00:00'), family_id: 'G' }, // nhà khác
  );
  db.replies.push({ family_id: 'F', author_id: 'me1', text: 'Thương con!', created_at: vn('2026-11-17T21:00:00') });
  db.messages.push(msg('con1', 'Bố ơi hồi nhỏ bố có hay trốn học không?', '2026-11-18T08:00:00'));
  db.letters.push({ family_id: 'F', from_id: 'con2', to_id: 'bo1', body: 'Gửi bố', title: null, footer: null,
    items: [{ type: 'sticker', sticker: 'heart' }], created_at: vn('2026-11-16T12:00:00') });

  assert.equal(await M.syncMissions('F', db, NOW), 7);
  assert.deepEqual(db.list(), [
    `bo1:love:${WEEK}`, `con1:memory:${WEEK}`, `con1:video:${WEEK}`, `con2:love:${WEEK}`, `con2:video:${PREV}`, `me1:love:${WEEK}`, `me1:meal:${WEEK}`,
  ]);
  const video = db.done.find((d) => d.member_id === 'con1' && d.mission === 'video')!;
  assert.equal(video.created_at.toISOString(), vn('2026-11-17T20:00:00').toISOString());
  assert.equal(video.family_id, 'F');

  // Chạy lại (mở lọ, mở trang chủ...) không thêm dòng nào: mỗi nhiệm vụ một sao.
  const before = db.list();
  assert.equal(await M.syncMissions('F', db, NOW), 0);
  assert.deepEqual(db.list(), before);
});

test('syncMissions: dấu tích tay cũ tuần này vẫn giữ và không bị nhân đôi sao', async () => {
  const db = new FakeDb();
  db.done.push({ family_id: 'F', member_id: 'con1', mission: 'love', week: WEEK, created_at: vn('2026-11-16T09:00:00') });
  db.done.push({ family_id: 'F', member_id: 'con1', mission: 'call', week: WEEK, created_at: vn('2026-11-16T09:00:00') });
  db.messages.push(msg('con1', 'yêu cả nhà', '2026-11-17T09:00:00'));
  assert.equal(await M.syncMissions('F', db, NOW), 0);
  assert.deepEqual(db.list(), [`con1:call:${WEEK}`, `con1:love:${WEEK}`]);
  assert.equal(db.done.find((d) => d.mission === 'love')!.created_at.toISOString(), vn('2026-11-16T09:00:00').toISOString());
});

test('syncMissions: tin nhắn riêng (cột to_id) kiểm thế hệ; chưa có cột thì coi như gửi cả nhà; nhãn dán thương trong chat', async () => {
  const db = new FakeDb();
  db.messages.push(
    msg('con1', 'Anh còn nhớ hồi bé mình đi câu cá không?', '2026-11-17T09:00:00', { to_id: 'con2' }), // cùng thế hệ: không tính kỷ niệm
    msg('me1', 'Con nhớ hồi bé con thích món gì không?', '2026-11-17T10:00:00', { to_id: 'con2' }),
    msg('bo1', 'Hồi xưa nhà mình ở đâu nhỉ, ai biết không?', '2026-11-17T11:00:00'), // không có cột to_id: nhóm
    msg('con2', null, '2026-11-17T12:00:00', { kind: 'sticker', sticker: 'hug' }),
  );
  await M.syncMissions('F', db, NOW);
  assert.deepEqual(db.list(), [
    `bo1:memory:${WEEK}`, `con1:love:${WEEK}`, `con2:love:${WEEK}`, `me1:love:${WEEK}`, `me1:memory:${WEEK}`,
  ]);
});

test('markMission: ghi một lần, gọi lại không thêm sao; mã lạ hay người nhà khác không ghi', async () => {
  const db = new FakeDb();
  const at = vn('2026-11-18T20:00:00');
  assert.equal(await M.markMission('F', 'bo1', 'call', db, at), true);
  assert.equal(await M.markMission('F', 'bo1', 'call', db, at), false);
  assert.equal(await M.markMission('F', 'bo1', 'call', db, vn('2026-11-20T08:00:00')), false);
  assert.equal(await M.markMission('F', 'bo1', 'nhay-mua', db, at), false);
  assert.equal(await M.markMission('F', 'x1', 'call', db, at), false);
  assert.deepEqual(db.list(), [`bo1:call:${WEEK}`]);
  assert.equal(db.done[0].created_at, at);
  // Tuần sau thì là nhiệm vụ mới, sao mới.
  assert.equal(await M.markMission('F', 'bo1', 'call', db, vn('2026-11-23T08:00:00')), true);
  // Đã tự nhận ra rồi thì đánh dấu thêm cũng không thêm sao.
  db.posts.push(post('me1', 'video', '2026-11-17T09:00:00'));
  await M.syncMissions('F', db, NOW);
  assert.equal(await M.markMission('F', 'me1', 'video', db, NOW), false);
  assert.equal(db.done.filter((d) => d.member_id === 'me1').length, 1);
});

// ---------- Qua HTTP (pool giả) ----------

const db = new FakeDb();
(pool as any).query = db.query;
const app = express();
app.use(express.json());
app.use(langMiddleware);
app.use((req: any, _res, next) => { req.member = { id: 'con1', family_id: 'F' }; next(); });
app.use('/api', J.jarRouter);
app.use('/api', M.missionsRouter);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
after(() => { server.close(); });

test('không tích tay được nữa: POST /api/missions/:key trả 410, không ghi gì', async () => {
  const en = dict('i18n', 'en');
  for (const m of M.MISSIONS) {
    const n = db.sql.length;
    const r = await fetch(`${base}/missions/${m.key}`, { method: 'POST', headers: { 'x-lang': 'en' } });
    assert.equal(r.status, 410);
    const body = await r.json();
    assert.equal(body.code, 'mission_auto');
    assert.equal(body.error, en['error.mission_auto']);
    assert.equal(db.sql.length, n);
  }
  for (const l of ['vi', 'ko']) assert.ok(dict('i18n', l)['error.mission_auto']);
  assert.deepEqual(db.done, []);
});

test('markCall (móc onCallConnected): ai trong cuộc gọi cũng được tính gọi điện, một lần', async () => {
  M.markCall('F', ['bo1', 'con1']);
  M.markCall('F', ['bo1', 'con1']);
  await new Promise((ok) => setTimeout(ok, 20));
  const week = M.weekKey();
  assert.deepEqual(db.list(), [`bo1:call:${week}`, `con1:call:${week}`]);
  db.done = [];
});

test('danh sách nhiệm vụ: năm mục cố định, đủ chữ ba thứ tiếng', () => {
  assert.deepEqual(M.MISSIONS.map((m) => m.key), ['call', 'video', 'love', 'meal', 'memory']);
  for (const l of ['vi', 'en', 'ko']) for (const m of M.MISSIONS) assert.ok(dict('i18n', l)[`week.mission.${m.key}`], `${l} ${m.key}`);
});

test('lọ: mở lọ là tự đánh dấu nhiệm vụ rồi mới đếm sao; không còn giá hay giấy đã mua', async () => {
  db.posts.push({ ...post('con1', 'video', '2026-11-18T10:00:00'), created_at: new Date(Date.now() - 60e3) });
  const r = await fetch(`${base}/jar`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(db.list(), [`con1:video:${M.weekKey()}`]);
  // Một bài + một nhiệm vụ = hai sao.
  assert.equal(j.total, 2);
  assert.equal('capacity' in j || 'gifts' in j || 'level' in j, false);
  // Mốc có quà (app/docs/lo-moc.md): kho ưu đãi trống thì không mốc nào có quà.
  assert.deepEqual(j.giftMilestones, []);
  assert.equal(j.seeds.reduce((a: number, s: any) => a + s.count, 0), 2);
  assert.equal('owned' in j, false);
  assert.equal(j.catalog.length, 10);
  for (const s of j.catalog) assert.equal('price' in s, false);
  // Chưa chọn giấy: người thứ ba trong nhà nhận giấy thứ ba trong bốn giấy mặc định, như trước khi bỏ giá.
  assert.equal(j.mine, 'sun');
  // Đọc lại lọ không thêm sao.
  assert.equal((await (await fetch(`${base}/jar`)).json()).total, 2);
});

test('giấy gấp sao: ai cũng dùng được mọi giấy, mã lạ thì báo', async () => {
  for (const s of J.CATALOG) {
    const r = await fetch(`${base}/jar/seed`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seed: s.id }) });
    assert.equal(r.status, 200, s.id);
    assert.deepEqual(db.seeds, [{ member_id: 'con1', seed: s.id }]);
  }
  const bad = await fetch(`${base}/jar/seed`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seed: 'kim-cuong' }) });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'seed_not_found');
  assert.ok(!db.sql.some((q) => q.includes('owned_seeds')));
  for (const l of ['vi', 'en', 'ko']) {
    assert.equal(dict('i18n', l)['error.seed_locked'], undefined);
    assert.equal(dict('../src/i18n', l)['jar.soon.title'], undefined);
  }
});
