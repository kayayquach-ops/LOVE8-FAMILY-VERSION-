// Kiểm thử xin vào nhà (server/join.ts): tạo lời xin, cho vào, không cho vào, hết hạn, chỉ người duyệt làm được,
// người duyệt đổi khi người vào sớm nhất bị xoá, mã của lời xin không gọi được đường thành viên, giới hạn lượt theo IP.
// Không cần Postgres: DB giả trong bộ nhớ chạy đúng các câu trong SQL của join.ts (có giao dịch, đồng hồ giả để thử hết hạn),
// cách làm theo server/members.test.ts. Chạy: node --import tsx --test server/join.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(path.join(tmpdir(), 'join-test-'));
process.env.MEDIA_DIR = root;

const J = await import('./join.ts');
const M = await import('./members.ts');
const { langMiddleware } = await import('./i18n.ts');
const express = (await import('express')).default;

const here = path.dirname(fileURLToPath(import.meta.url));
const vi = JSON.parse(readFileSync(path.join(here, 'i18n/vi.json'), 'utf8'));
const en = JSON.parse(readFileSync(path.join(here, 'i18n/en.json'), 'utf8'));
const { SQL } = J;
const DAY = 86400e3;

// ---------- DB giả ----------

type Row = Record<string, any>;
class FakeDb {
  now = Date.parse('2026-11-18T03:00:00Z');
  t: { families: Row[]; members: Row[]; join_requests: Row[] } = { families: [], members: [], join_requests: [] };
  log: string[] = [];
  failOn: string | null = null;
  connects = 0;
  released = 0;
  private snap: string | null = null;

  live = (r: Row) => r.created_at > this.now - J.EXPIRE_DAYS * DAY;
  connect = async () => { this.connects++; return { query: (s: string, a?: any[]) => this.query(s, a), release: () => { this.released++; } }; };
  family(id: string, code: string, name: string) { this.t.families.push({ id, code, name }); }
  member(id: string, family_id: string, name: string, at: number, extra: Row = {}) {
    this.t.members.push({ id, family_id, name, role: 'con', token: `tok-${id}`, city: null, intro: null, lang: null, google_sub: null, google_email: null, created_at: at, last_seen: at, ...extra });
  }
  dump() { return JSON.parse(JSON.stringify(this.t)); }

  async query(sql: string, args: any[] = []): Promise<{ rows: Row[]; rowCount: number }> {
    this.log.push(sql);
    if (this.failOn === sql) throw new Error('lỗi giả');
    const res = (rows: Row[], n = rows.length) => ({ rows, rowCount: n });
    const fam = (id: string) => { if (!this.t.families.some((f) => f.id === id)) throw new Error('vi phạm khoá ngoại families'); };
    const del = (pred: (r: Row) => boolean) => { const n = this.t.join_requests.filter(pred).length; this.t.join_requests = this.t.join_requests.filter((r) => !pred(r)); return res([], n); };
    switch (sql) {
      case 'begin': this.snap = JSON.stringify(this.t); return res([]);
      case 'commit': this.snap = null; return res([]);
      case 'rollback': if (this.snap) this.t = JSON.parse(this.snap); this.snap = null; return res([]);
      case SQL.family: return res(this.t.families.filter((f) => f.code === args[0]).map((f) => ({ id: f.id, name: f.name })));
      case SQL.approver: return res(this.t.members.filter((m) => m.family_id === args[0])
        .sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1)).slice(0, 1).map((m) => ({ id: m.id, name: m.name })));
      case SQL.member: return res(this.t.members.filter((m) => m.token === args[0]).map((m) => ({ id: m.id })));
      case SQL.touch: {
        const ms = this.t.members.filter((m) => m.token === args[0]);
        for (const m of ms) m.last_seen = this.now;
        return res(ms.map((m) => ({ id: m.id, family_id: m.family_id, lang: m.lang })));
      }
      case SQL.open: return res([{ n: this.t.join_requests.filter((r) => r.family_id === args[0] && this.live(r)).length }]);
      case SQL.insert: {
        const [id, family_id, token, name, role, city, intro, lang, google_sub, google_email] = args;
        fam(family_id);
        if (this.t.join_requests.some((r) => r.id === id || r.token === token)) throw new Error('trùng khoá join_requests');
        this.t.join_requests.push({ id, family_id, token, name, role, city, intro, lang, google_sub, google_email, created_at: this.now });
        return res([], 1);
      }
      case SQL.byToken: return res(this.t.join_requests.filter((r) => r.token === args[0] && this.live(r))
        .map((r) => ({ family_id: r.family_id, family_name: this.t.families.find((f) => f.id === r.family_id)!.name })));
      case SQL.list: return res(this.t.join_requests.filter((r) => r.family_id === args[0] && this.live(r))
        .sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1))
        .map((r) => ({ id: r.id, name: r.name, role: r.role, city: r.city, created_at: new Date(r.created_at) })));
      case SQL.lock: return res(this.t.join_requests.filter((r) => r.id === args[0] && r.family_id === args[1] && this.live(r)).map((r) => ({ ...r })));
      case SQL.addMember: {
        const [id, family_id, name, role, token, city, intro, lang] = args;
        fam(family_id);
        if (this.t.members.some((m) => m.id === id || m.token === token)) throw new Error('trùng khoá members');
        this.t.members.push({ id, family_id, name, role, token, city, intro, lang, google_sub: null, google_email: null, created_at: this.now, last_seen: this.now });
        return res([], 1);
      }
      case SQL.drop: return del((r) => r.id === args[0]);
      case SQL.cancel: return del((r) => r.token === args[0]);
      case SQL.sweep: return del((r) => !this.live(r));
      case SQL.linkGoogle: {
        const m = this.t.members.find((x) => x.id === args[0]);
        if (!m || this.t.members.some((x) => x.google_sub === args[1])) return res([], 0);
        m.google_sub = args[1]; m.google_email = args[2];
        return res([], 1);
      }
    }
    throw new Error(`DB giả chưa biết câu này: ${sql}`);
  }
}

// Nhà A: a1 (vào sớm nhất, người duyệt), a2, a3 (thêm sau nhưng ghi vào DB trước, để thấy thứ tự theo created_at chứ không theo thứ tự ghi). Nhà B: b1.
const A = 'fam-a', B = 'fam-b', C = 'fam-c';
const a1 = 'mem-a1', a2 = 'mem-a2', a3 = 'mem-a3', b1 = 'mem-b1';
const T0 = Date.parse('2026-01-01T00:00:00Z');
function seed() {
  const db = new FakeDb();
  db.family(A, '1111111', 'Nhà Gạo');
  db.family(B, '2222222', 'Nhà Bên');
  db.family(C, '333333', 'Nhà Cũ');
  db.member(a3, A, 'Hoa', T0 + 3 * DAY);
  db.member(a2, A, 'Minh', T0 + 2 * DAY);
  db.member(a1, A, 'Nguyễn Thị Lan', T0 + DAY, { role: 'me' });
  db.member(b1, B, 'Bố', T0, { role: 'bo' });
  return db;
}

type Res = { status: number; body: any; headers: Headers };
async function serve(db: FakeDb, t: { after: (fn: () => void) => void }) {
  const notified: Array<{ approver: string; request: string; name: string }> = [];
  const deps = {
    db, connect: db.connect,
    notify: (approver: string, request: string, name: string) => { notified.push({ approver, request, name }); },
    // Phiên Google giả: {ok: true} là phiên hợp lệ, gì khác là hỏng; không gửi thì không xin nối.
    google: async (g: unknown) => (g === undefined ? undefined : (g as { ok?: boolean })?.ok ? { sub: 'g-sub-1', email: 'ba@example.com' } : null),
  };
  const app = express();
  app.use(express.json());
  app.use(langMiddleware);
  app.use('/api', J.joinPublicRouter(deps));
  app.use('/api', J.memberAuth(db) as any);
  app.use('/api', J.joinRouter(deps));
  // Đường thành viên như ở index.ts: /api/me (kèm phần lời xin), một đường đọc dữ liệu nhà, và xoá người khỏi nhà thật.
  app.get('/api/me', async (req: any, res) => { res.json({ id: req.member.id, ...(await J.joinView(db, req.member.family_id, req.member.id)) }); });
  app.get('/api/feed', (_req, res) => { res.json([{ secret: 'ảnh của nhà' }]); });
  app.use('/api', M.membersRouter({ connect: db.connect as any, db, mediaDir: root }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, p: string, o: { token?: string; body?: unknown; lang?: string } = {}): Promise<Res> => {
    const r = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', 'x-lang': o.lang ?? 'vi', ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  return { call, notified };
}

const ask = (code = '1111111', extra: Record<string, unknown> = {}) => ({ code, name: 'Bà Nội', role: 'me', city: 'Hải Phòng', lang: 'vi', ...extra });
const errBody = (code: string, dict = vi) => ({ code, error: dict[`error.${code}`], message: dict[`error.${code}`] });

// ---------- Tạo lời xin ----------

test('xin vào nhà: tạo lời xin, chưa là thành viên, chỉ trả tên nhà và tên gọi người duyệt, báo đúng người duyệt', async (t) => {
  const db = seed();
  const { call, notified } = await serve(db, t);
  const before = db.t.members.length;
  const r = await call('POST', '/api/join', { body: ask('1111111', { name: 'x'.repeat(50), role: 'ông', intro: { food: 'phở', loveVoice: 'false' } }) });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ['approverName', 'familyName', 'pending', 'token']);
  assert.equal(r.body.pending, true);
  assert.equal(r.body.familyName, 'Nhà Gạo');
  assert.equal(r.body.approverName, 'Lan', 'tên gọi (chữ cuối) của người vào nhà sớm nhất');
  assert.ok(typeof r.body.token === 'string' && r.body.token.length >= 30);
  assert.equal(db.t.members.length, before, 'chưa thêm thành viên nào');
  assert.equal(db.t.join_requests.length, 1);
  const q = db.t.join_requests[0];
  assert.equal(q.family_id, A);
  assert.equal(q.token, r.body.token);
  assert.equal(q.name, 'x'.repeat(30));
  assert.equal(q.role, 'con', 'vai lạ thành con');
  assert.equal(q.city, 'Hải Phòng');
  assert.deepEqual(JSON.parse(q.intro), { food: 'phở', loveVoice: false });
  assert.equal(q.google_sub, null);
  assert.deepEqual(notified, [{ approver: a1, request: q.id, name: 'x'.repeat(30) }]);

  // Tra mã nhà chỉ trả tên nhà.
  assert.deepEqual((await call('GET', '/api/family/1111111')).body, { name: 'Nhà Gạo' });
  const miss = await call('POST', '/api/join', { body: ask('7654321') });
  assert.deepEqual(miss, { ...miss, status: 404, body: errBody('family_code_not_found') });
  assert.equal((await call('POST', '/api/join', { body: ask('7654321'), lang: 'en' })).body.message, en['error.family_code_not_found']);
});

test('mã của lời xin không gọi được đường thành viên nào, chỉ biết tên nhà và tên gọi người duyệt', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  const { body: { token } } = await call('POST', '/api/join', { body: ask() });
  const pending = { ...errBody('join_pending'), familyName: 'Nhà Gạo', approverName: 'Lan' };
  for (const [method, p] of [['GET', '/api/me'], ['GET', '/api/feed'], ['DELETE', `/api/members/${a2}`], ['POST', `/api/join/requests/${db.t.join_requests[0].id}/approve`]]) {
    const r = await call(method, p, { token });
    assert.equal(r.status, 403, `${method} ${p}`);
    assert.deepEqual(r.body, pending, `${method} ${p}: chỉ có tên nhà và tên gọi người duyệt`);
  }
  assert.ok(db.t.members.some((m) => m.id === a2), 'không xoá được ai');
  assert.equal(db.t.join_requests.length, 1, 'không tự duyệt được mình');
  assert.deepEqual((await call('GET', '/api/join/status', { token })).body, { status: 'pending', familyName: 'Nhà Gạo', approverName: 'Lan' });
  // Mã lạ: 401 như cũ (máy bỏ mã); không có mã cũng 401.
  assert.deepEqual((await call('GET', '/api/me', { token: 'không-có' })).body, errBody('not_signed_in'));
  assert.equal((await call('GET', '/api/join/status', { token: 'không-có' })).status, 401);
  assert.equal((await call('GET', '/api/join/status')).status, 401);
  // Thành viên thật vẫn qua.
  assert.equal((await call('GET', '/api/feed', { token: `tok-${a2}` })).status, 200);
});

// ---------- Cho vào, không cho vào ----------

test('cho vào: giữ nguyên mã của máy, thêm thành viên rồi xoá lời xin trong một giao dịch', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  const { body: { token } } = await call('POST', '/api/join', { body: ask('1111111', { intro: { food: 'phở' } }) });
  const req = db.t.join_requests[0];
  db.log.length = 0;
  db.now += 3600e3;
  const r = await call('POST', `/api/join/requests/${req.id}/approve`, { token: `tok-${a1}` });
  assert.deepEqual(r.body, { ok: true });
  const fresh = db.t.members.find((m) => m.token === token)!;
  assert.ok(fresh, 'thành viên mới mang đúng mã của lời xin');
  assert.deepEqual({ family: fresh.family_id, name: fresh.name, role: fresh.role, city: fresh.city, intro: fresh.intro, lang: fresh.lang },
    { family: A, name: 'Bà Nội', role: 'me', city: 'Hải Phòng', intro: JSON.stringify({ food: 'phở' }), lang: 'vi' });
  assert.equal(db.t.join_requests.length, 0);
  const tx = db.log.filter((s) => ['begin', 'commit', 'rollback', SQL.addMember, SQL.drop].includes(s));
  assert.deepEqual(tx, ['begin', SQL.addMember, SQL.drop, 'commit']);
  assert.equal(db.connects, db.released);
  // Máy đang chờ: hỏi lại là thấy đã vào, rồi gọi được mọi đường như thành viên.
  assert.deepEqual((await call('GET', '/api/join/status', { token })).body, { status: 'in' });
  const me = await call('GET', '/api/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.id, fresh.id);
  assert.deepEqual(me.body, { id: fresh.id, approverId: a1, waiting: 0 });
  // Bấm lần nữa (hai máy cùng bấm): lời xin đã hết.
  assert.deepEqual((await call('POST', `/api/join/requests/${req.id}/approve`, { token: `tok-${a1}` })).body, errBody('join_not_found'));
  assert.equal(db.t.members.filter((m) => m.token === token).length, 1);
});

test('lỗi giữa chừng khi cho vào: không thêm ai, lời xin còn nguyên', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  const { body: { token } } = await call('POST', '/api/join', { body: ask() });
  const before = db.dump();
  db.failOn = SQL.drop;
  const r = await call('POST', `/api/join/requests/${db.t.join_requests[0].id}/approve`, { token: `tok-${a1}` });
  assert.equal(r.status, 500);
  assert.equal(r.body.code, 'server');
  assert.deepEqual(db.dump().members.map((m: Row) => m.id), before.members.map((m: Row) => m.id));
  assert.equal(db.t.join_requests.length, 1);
  assert.ok(db.log.includes('rollback') && !db.log.includes('commit'));
  assert.equal(db.connects, db.released);
  assert.equal((await call('GET', '/api/join/status', { token })).body.status, 'pending');
});

test('không cho vào: xoá lời xin, máy kia nhận 401 (về màn đầu)', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  const { body: { token } } = await call('POST', '/api/join', { body: ask() });
  const members = db.t.members.length;
  assert.deepEqual((await call('POST', `/api/join/requests/${db.t.join_requests[0].id}/deny`, { token: `tok-${a1}` })).body, { ok: true });
  assert.equal(db.t.join_requests.length, 0);
  assert.equal(db.t.members.length, members);
  assert.equal((await call('GET', '/api/join/status', { token })).status, 401);
  assert.deepEqual((await call('GET', '/api/me', { token })).body, errBody('not_signed_in'));
});

test('chỉ người duyệt làm được: người khác trong nhà 403, người duyệt nhà khác 404, không đổi gì; người khác chỉ thấy số người chờ', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  await call('POST', '/api/join', { body: ask() });
  const id = db.t.join_requests[0].id;
  const before = db.dump();
  for (const verb of ['approve', 'deny']) {
    for (const who of [a2, a3]) {
      const r = await call('POST', `/api/join/requests/${id}/${verb}`, { token: `tok-${who}` });
      assert.equal(r.status, 403, `${who} ${verb}`);
      assert.deepEqual(r.body, errBody('join_not_approver'));
    }
    // b1 là người duyệt của nhà B, lời xin thuộc nhà A.
    const other = await call('POST', `/api/join/requests/${id}/${verb}`, { token: `tok-${b1}` });
    assert.equal(other.status, 404);
    assert.deepEqual(other.body, errBody('join_not_found'));
  }
  assert.deepEqual(db.dump().join_requests, before.join_requests);
  assert.equal(db.t.members.length, before.members.length);
  // /api/me: người duyệt thấy tên, vai, nơi ở; người khác chỉ biết số người đang chờ; nhà khác không thấy gì.
  const mine = await call('GET', '/api/me', { token: `tok-${a1}` });
  assert.deepEqual(mine.body, { id: a1, approverId: a1, requests: [{ id, name: 'Bà Nội', role: 'me', city: 'Hải Phòng', createdAt: new Date(db.t.join_requests[0].created_at).toISOString() }] });
  assert.deepEqual((await call('GET', '/api/me', { token: `tok-${a2}` })).body, { id: a2, approverId: a1, waiting: 1 });
  assert.deepEqual((await call('GET', '/api/me', { token: `tok-${b1}` })).body, { id: b1, approverId: b1, requests: [] });
});

test('người duyệt đổi sang người vào sớm kế tiếp khi người vào sớm nhất bị xoá khỏi nhà', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  const { body } = await call('POST', '/api/join', { body: ask() });
  assert.equal(body.approverName, 'Lan');
  const id = db.t.join_requests[0].id;
  assert.equal((await call('POST', `/api/join/requests/${id}/approve`, { token: `tok-${a2}` })).status, 403);
  // a2 xoá a1 khỏi nhà (members.ts: bước cuối xoá hàng members của a1).
  db.t.members = db.t.members.filter((m) => m.id !== a1);
  assert.equal((await J.approverOf(db, A))?.id, a2, 'theo created_at, không theo thứ tự ghi (a3 ghi trước nhưng vào sau)');
  assert.deepEqual((await call('GET', '/api/join/status', { token: body.token })).body, { status: 'pending', familyName: 'Nhà Gạo', approverName: 'Minh' });
  assert.equal((await call('GET', '/api/me', { token: `tok-${a2}` })).body.requests.length, 1);
  assert.equal((await call('POST', `/api/join/requests/${id}/approve`, { token: `tok-${a3}` })).status, 403);
  assert.deepEqual((await call('POST', `/api/join/requests/${id}/approve`, { token: `tok-${a2}` })).body, { ok: true });
  // Vào cùng lúc: người có mã nhỏ hơn duyệt.
  db.member('mem-z', C, 'Z', T0); db.member('mem-y', C, 'Y', T0);
  assert.equal((await J.approverOf(db, C))?.id, 'mem-y');
});

test('lời xin hết hạn sau 7 ngày: không duyệt được, máy chờ nhận 401, người duyệt không còn thấy', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  const { body: { token } } = await call('POST', '/api/join', { body: ask() });
  const id = db.t.join_requests[0].id;
  db.now += J.EXPIRE_DAYS * DAY - 60e3;
  assert.equal((await call('GET', '/api/join/status', { token })).body.status, 'pending', 'chưa đủ 7 ngày');
  db.now += 2 * 60e3;
  assert.equal((await call('GET', '/api/join/status', { token })).status, 401);
  assert.deepEqual((await call('GET', '/api/me', { token })).body, errBody('not_signed_in'));
  assert.deepEqual((await call('GET', '/api/me', { token: `tok-${a1}` })).body.requests, []);
  assert.deepEqual((await call('POST', `/api/join/requests/${id}/approve`, { token: `tok-${a1}` })).body, errBody('join_not_found'));
  assert.ok(!db.t.members.some((m) => m.token === token));
  // Lời xin mới thì dọn luôn hàng đã hết hạn.
  await call('POST', '/api/join', { body: ask() });
  assert.equal(db.t.join_requests.length, 1);
  assert.notEqual(db.t.join_requests[0].id, id);
});

test('người chờ tự huỷ: lời xin mất, người duyệt không còn thấy', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  const { body: { token } } = await call('POST', '/api/join', { body: ask() });
  assert.deepEqual((await call('DELETE', '/api/join', { token })).body, { ok: true });
  assert.equal(db.t.join_requests.length, 0);
  assert.equal((await call('GET', '/api/join/status', { token })).status, 401);
  // Mã thành viên gọi huỷ thì không đụng gì tới thành viên.
  await call('DELETE', '/api/join', { token: `tok-${a2}` });
  assert.ok(db.t.members.some((m) => m.id === a2));
});

test('Google: lời xin giữ danh tính đã xác minh, được cho vào mới nối vào thành viên', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  const ok = await call('POST', '/api/join', { body: ask('1111111', { google: { ok: true } }) });
  assert.equal(ok.body.google, true);
  assert.equal(db.t.join_requests[0].google_sub, 'g-sub-1');
  assert.ok(!db.t.members.some((m) => m.google_sub === 'g-sub-1'), 'chưa nối khi chưa duyệt');
  await call('POST', `/api/join/requests/${db.t.join_requests[0].id}/approve`, { token: `tok-${a1}` });
  const m = db.t.members.find((x) => x.token === ok.body.token)!;
  assert.deepEqual([m.google_sub, m.google_email], ['g-sub-1', 'ba@example.com']);
  const bad = await call('POST', '/api/join', { body: ask('1111111', { google: { ok: false } }) });
  assert.equal(bad.body.google, false);
  assert.equal(db.t.join_requests[0].google_sub, null);
});

// ---------- Giới hạn lượt ----------

test('giới hạn: mỗi IP sai mã 10 lần mỗi 10 phút, tra mã và xin vào dùng chung lượt, mã đúng không tốn lượt', async (t) => {
  const db = seed();
  const { call } = await serve(db, t);
  for (let i = 0; i < 15; i++) assert.equal((await call('GET', '/api/family/1111111')).status, 200, 'mã đúng không tốn lượt');
  for (let i = 0; i < 9; i++) assert.equal((await call('GET', '/api/family/0000000')).status, 404);
  assert.equal((await call('POST', '/api/join', { body: ask('9999999') })).status, 404, 'lần sai thứ 10, qua đường xin vào');
  const blocked = await call('GET', '/api/family/0000000');
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.body, errBody('too_many_tries'));
  assert.ok(Number(blocked.headers.get('retry-after')) > 500, 'chờ gần 10 phút');
  // Hết lượt thì mã đúng cũng phải chờ, và không tạo lời xin nào.
  assert.equal((await call('GET', '/api/family/1111111')).status, 429);
  assert.equal((await call('POST', '/api/join', { body: ask() })).status, 429);
  assert.equal(db.t.join_requests.length, 0);
});

test('giới hạn: mỗi IP gửi được 10 lời xin mỗi giờ; mỗi nhà tối đa 10 lời đang chờ', async (t) => {
  const db = seed();
  const { call, notified } = await serve(db, t);
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/api/join', { body: ask(i < 5 ? '1111111' : '2222222') })).status, 200);
  const r = await call('POST', '/api/join', { body: ask('333333') });
  assert.equal(r.status, 429);
  assert.deepEqual(r.body, errBody('too_many_tries'));
  assert.ok(Number(r.headers.get('retry-after')) > 3000);
  assert.equal(db.t.join_requests.length, 10);
  assert.equal(notified.length, 10);

  // Nhà đã có 10 lời đang chờ (từ nhiều nơi): lời thứ 11 bị từ chối, không báo người duyệt.
  const db2 = seed();
  for (let i = 0; i < J.MAX_OPEN; i++) db2.t.join_requests.push({ id: `q${i}`, family_id: A, token: `qt${i}`, name: 'n', role: 'con', created_at: db2.now - i * 60e3 });
  const s2 = await serve(db2, t);
  const full = await s2.call('POST', '/api/join', { body: ask() });
  assert.equal(full.status, 429);
  assert.deepEqual(full.body, errBody('join_busy'));
  assert.equal(db2.t.join_requests.length, J.MAX_OPEN);
  assert.equal(s2.notified.length, 0);
  // Một lời hết hạn thì có chỗ.
  db2.t.join_requests[J.MAX_OPEN - 1].created_at = db2.now - (J.EXPIRE_DAYS + 1) * DAY;
  assert.equal((await s2.call('POST', '/api/join', { body: ask() })).status, 200);
});

test('memberFields: dùng chung cho tạo nhà, giữ đúng cách làm sạch cũ', () => {
  const f = J.memberFields({ name: '', role: 'bo', city: 'x'.repeat(400), lang: 'ko', intro: { wantHug: 'true', loveVoice: 'maybe' } });
  assert.equal(f.role, 'bo');
  assert.equal(f.city!.length, 300);
  assert.equal(f.lang, 'ko');
  assert.deepEqual(JSON.parse(f.intro!), { wantHug: true });
  assert.equal(J.memberFields({ lang: 'fr' }).lang, null);
  assert.equal(J.given('  Nguyễn  Văn   An '), 'An');
  assert.equal(J.given(''), '');
});
