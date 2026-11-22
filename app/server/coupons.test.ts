// Kiểm thử ưu đãi của nhãn hàng (server/coupons.ts): chỉ trả ưu đãi đang bật, còn hạn, đúng thứ tiếng; thứ tự theo hạn;
// nhóm lạ về 'other'; link chỉ http, https; đường API chỉ đọc và nằm sau auth.
// Không cần Postgres: DB giả trả mọi dòng của bảng cho đúng câu COUPONS_SQL (cách làm theo server/location.test.ts).
// Tên nhãn hàng ở đây là tên tự đặt, không phải nhãn hàng thật.
// Chạy: node --import tsx --test server/coupons.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

const C = await import('./coupons.ts');
const { langMiddleware } = await import('./i18n.ts');
const express = (await import('express')).default;

type Row = import('./coupons.ts').CouponRow;

const NOW = Date.parse('2026-11-22T03:00:00Z');
const DAY = 86400e3;
const row = (id: string, x: Partial<Row> = {}): Row => ({
  id, brand: `Hiệu ${id}`, category: 'health', title: `Ưu đãi ${id}`, discount: '-10%', code: `MA-${id}`, url: null,
  expires_at: null, audience: 'all', lang: null, active: true, created_at: new Date(NOW - 10 * DAY), ...x,
});

class FakeDb {
  rows: Row[] = [];
  log: string[] = [];
  query = async (sql: string) => {
    this.log.push(sql);
    if (sql === C.COUPONS_SQL) return { rows: this.rows.map((r) => ({ ...r })), rowCount: this.rows.length };
    if (/^\s*create table if not exists brand_coupons/.test(sql)) return { rows: [], rowCount: 0 };
    throw new Error(`câu SQL lạ: ${sql}`);
  };
}

/** Máy chủ thử: không có auth (đã kiểm riêng là index.ts gắn router sau auth), x-lang chọn thứ tiếng như máy khách gửi. */
async function serve(db: FakeDb) {
  const app = express();
  app.use(express.json());
  app.use(langMiddleware);
  app.use('/api', C.couponsRouter(db));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, lang = 'vi') => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'x-lang': lang } });
    return { status: r.status, body: await r.json().catch(() => null) as any };
  };
  return { call, close: () => new Promise<void>((done) => server.close(() => done())) };
}

test('chỉ ưu đãi đang bật, còn hạn; hết hạn đúng lúc này là đã hết', () => {
  const out = C.pickCoupons([
    row('bat'),
    row('tat', { active: false }),
    row('het', { expires_at: new Date(NOW - 1) }),
    row('vua-het', { expires_at: new Date(NOW) }),
    row('con', { expires_at: new Date(NOW + 1) }),
  ], 'vi', NOW);
  assert.deepEqual(out.map((c) => c.id), ['con', 'bat']);
});

test('thứ tiếng: lang trống hiện cho mọi người, có lang thì chỉ người xem đúng thứ tiếng đó', () => {
  const rows = [row('chung'), row('viet', { lang: 'vi' }), row('han', { lang: 'ko' }), row('anh', { lang: 'en' })];
  assert.deepEqual(C.pickCoupons(rows, 'vi', NOW).map((c) => c.id).sort(), ['chung', 'viet']);
  assert.deepEqual(C.pickCoupons(rows, 'ko', NOW).map((c) => c.id).sort(), ['chung', 'han']);
  assert.deepEqual(C.pickCoupons(rows, 'en', NOW).map((c) => c.id).sort(), ['anh', 'chung']);
});

test('thứ tự: hết hạn sớm nhất trước, không hạn sau cùng, cùng hạn thì mới thêm trước', () => {
  const out = C.pickCoupons([
    row('khong-han-cu', { created_at: new Date(NOW - 5 * DAY) }),
    row('mai', { expires_at: new Date(NOW + DAY) }),
    row('khong-han-moi', { created_at: new Date(NOW - DAY) }),
    row('tuan-sau', { expires_at: new Date(NOW + 7 * DAY) }),
    row('mai-moi', { expires_at: new Date(NOW + DAY), created_at: new Date(NOW - DAY) }),
  ], 'vi', NOW);
  assert.deepEqual(out.map((c) => c.id), ['mai-moi', 'mai', 'tuan-sau', 'khong-han-moi', 'khong-han-cu']);
});

test('dạng trả về: nhóm lạ về other, gói gia đình, mã trống là null, hạn dạng ISO, không lộ cột nội bộ', () => {
  const [a] = C.pickCoupons([row('a', { category: 'xe-may', audience: 'family', code: '  ', expires_at: '2026-12-31T16:59:59Z', url: 'https://vi-du.test/uu-dai' })], 'vi', NOW);
  assert.deepEqual(a, {
    id: 'a', brand: 'Hiệu a', category: 'other', title: 'Ưu đãi a', discount: '-10%', code: null,
    url: 'https://vi-du.test/uu-dai', expiresAt: '2026-12-31T16:59:59.000Z', family: true,
  });
  for (const cat of ['massage', 'health', 'pharmacy', 'supplement', 'homecare', 'other']) {
    assert.equal(C.pickCoupons([row('x', { category: cat })], 'vi', NOW)[0].category, cat);
  }
  const [b] = C.pickCoupons([row('b', { audience: 'all', code: ' EM20 ' })], 'vi', NOW);
  assert.equal(b.family, false);
  assert.equal(b.code, 'EM20');
});

test('link: chỉ http, https; link khác hay hỏng thành null', () => {
  assert.equal(C.httpUrl('https://vi-du.test/a?b=1'), 'https://vi-du.test/a?b=1');
  assert.equal(C.httpUrl(' http://vi-du.test '), 'http://vi-du.test/');
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://vi-du.test', 'vi-du.test', '', null, undefined]) {
    assert.equal(C.httpUrl(bad), null, String(bad));
  }
});

test('GET /api/coupons: trả danh sách đã lọc theo x-lang, bảng trống thì danh sách trống', async () => {
  const db = new FakeDb();
  const s = await serve(db);
  try {
    let r = await s.call('GET', '/api/coupons');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { coupons: [] });

    const far = new Date(Date.now() + 30 * DAY);
    db.rows = [
      row('viet', { lang: 'vi', expires_at: far }),
      row('han', { lang: 'ko', expires_at: far }),
      row('chung'),
      row('tat', { active: false }),
      row('het', { expires_at: new Date(Date.now() - DAY) }),
    ];
    r = await s.call('GET', '/api/coupons', 'vi');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.coupons.map((c: any) => c.id), ['viet', 'chung']);
    r = await s.call('GET', '/api/coupons', 'ko');
    assert.deepEqual(r.body.coupons.map((c: any) => c.id), ['han', 'chung']);
    assert.ok(db.log.every((q) => q === C.COUPONS_SQL), 'chỉ đọc');
  } finally { await s.close(); }
});

test('chỉ đọc: không có đường thêm, sửa, xoá', async () => {
  const db = new FakeDb();
  db.rows = [row('a')];
  const s = await serve(db);
  try {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await s.call(m, '/api/coupons')).status, 404, m);
      assert.equal((await s.call(m, '/api/coupons/a')).status, 404, m);
    }
    assert.equal(db.log.length, 0);
  } finally { await s.close(); }
});

test('DB lỗi: 500 với mã chung, không lộ câu lỗi', async () => {
  const db = new FakeDb();
  db.query = async () => { throw new Error('relation "brand_coupons" does not exist'); };
  const orig = console.error;
  console.error = () => {};
  const s = await serve(db);
  try {
    const r = await s.call('GET', '/api/coupons');
    assert.equal(r.status, 500);
    assert.equal(r.body.code, 'server');
    assert.doesNotMatch(JSON.stringify(r.body), /relation/);
  } finally { console.error = orig; await s.close(); }
});

test('index.ts: tạo bảng lúc khởi động và gắn đường ưu đãi sau auth (chỉ người đã đăng nhập)', async () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const auth = src.indexOf("app.use('/api', auth as express.RequestHandler)");
  const router = src.indexOf("app.use('/api', couponsRouter())");
  assert.ok(auth > 0, 'thấy dòng gắn auth');
  assert.ok(router > auth, 'couponsRouter gắn sau auth');
  assert.match(src, /await migrateCoupons\(pool\);/);
  const db = new FakeDb();
  await C.migrateCoupons(db);
  assert.match(db.log[0], /create table if not exists brand_coupons/);
});
