// Kiểm thử vị trí cả nhà (server/location.ts): kiểm vị trí gửi lên, giới hạn số lần gửi, tắt chia sẻ thì từ chối và xoá vị trí,
// /api/me bỏ hẳn người không chia sẻ, làm tròn toạ độ, tra nơi gần nhất trong src/places.json.
// Không cần Postgres: DB giả trong bộ nhớ chỉ hiểu đúng các câu SQL location.ts gửi (cách làm theo server/members.test.ts).
// Không mở kênh sự kiện thật: send ghi lại tin gửi cho cả nhà.
// Chạy: node --import tsx --test server/location.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

const L = await import('./location.ts');
const { Limit } = await import('./limit.ts');
const { langMiddleware } = await import('./i18n.ts');
const G = await import('../src/geo.ts');
const express = (await import('express')).default;

const places = JSON.parse(readFileSync(new URL('../src/places.json', import.meta.url), 'utf8'));

// ---------- DB giả ----------

type Row = { id: string; family_id: string; loc_share: boolean | null; loc_lat: number | null; loc_lon: number | null; loc_acc: number | null; loc_at: Date | null };

class FakeDb {
  rows = new Map<string, Row>();
  log: string[] = [];
  add(id: string, share: boolean | null = false, family_id = 'f1') {
    this.rows.set(id, { id, family_id, loc_share: share, loc_lat: null, loc_lon: null, loc_acc: null, loc_at: null });
  }
  get(id: string) { return this.rows.get(id)!; }
  query = async (sql: string, args: any[] = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    this.log.push(s);
    const r = this.rows.get(args[0]);
    if (s === 'update members set loc_lat = $2, loc_lon = $3, loc_acc = $4, loc_at = now() where id = $1 and loc_share returning loc_share, loc_lat, loc_lon, loc_at') {
      if (!r || !r.loc_share) return { rows: [], rowCount: 0 };
      Object.assign(r, { loc_lat: args[1], loc_lon: args[2], loc_acc: args[3], loc_at: new Date() });
      return { rows: [{ loc_share: r.loc_share, loc_lat: r.loc_lat, loc_lon: r.loc_lon, loc_at: r.loc_at }], rowCount: 1 };
    }
    if (s === 'update members set loc_share = true where id = $1') {
      if (r) r.loc_share = true;
      return { rows: [], rowCount: r ? 1 : 0 };
    }
    if (s === 'update members set loc_share = false, loc_lat = null, loc_lon = null, loc_acc = null, loc_at = null where id = $1') {
      if (r) Object.assign(r, { loc_share: false, loc_lat: null, loc_lon: null, loc_acc: null, loc_at: null });
      return { rows: [], rowCount: r ? 1 : 0 };
    }
    throw new Error(`câu SQL lạ: ${s}`);
  };
}

/** Máy chủ thử: req.member lấy từ header x-member (thay cho auth ở index.ts), mọi người cùng nhà f1. */
async function serve(db: FakeDb, limit = new Limit(100, 60e3)) {
  const sent: Array<{ fid: string; msg: any }> = [];
  const app = express();
  app.use(express.json());
  app.use(langMiddleware);
  app.use((req: any, _res, next) => { req.member = { id: String(req.headers['x-member']), family_id: 'f1' }; next(); });
  app.use('/api', L.locationRouter({ db, send: (fid, msg) => { sent.push({ fid, msg }); }, limit }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, member: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, {
      method, headers: { 'content-type': 'application/json', 'x-member': member, 'x-lang': 'vi' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() as any, retry: r.headers.get('retry-after') };
  };
  return { sent, call, close: () => new Promise<void>((done) => server.close(() => done())) };
}

const HANOI = { lat: 21.028512, lon: 105.854219, acc: 35.4 };

// ---------- Kiểm vị trí gửi lên ----------

test('kiểm vị trí: đúng khoảng vĩ độ, kinh độ, sai số; sai kiểu hay quá khoảng là null', () => {
  assert.deepEqual(L.parseFix(HANOI), { lat: 21.028512, lon: 105.854219, acc: 35 });
  assert.deepEqual(L.parseFix({ lat: 90, lon: -180 }), { lat: 90, lon: -180, acc: null }, 'đúng biên, không có sai số');
  assert.deepEqual(L.parseFix({ lat: -90, lon: 180, acc: 0 }), { lat: -90, lon: 180, acc: 0 });
  for (const bad of [
    { lat: 90.0001, lon: 0 }, { lat: -90.5, lon: 0 }, { lat: 0, lon: 180.01 }, { lat: 0, lon: -181 },
    { lat: '21', lon: 105 }, { lat: 21 }, { lon: 105 }, { lat: null, lon: null }, { lat: NaN, lon: 1 }, { lat: 1, lon: Infinity },
    { lat: 1, lon: 1, acc: -1 }, { lat: 1, lon: 1, acc: 100_001 }, { lat: 1, lon: 1, acc: '20' }, { lat: 1, lon: 1, acc: NaN },
  ]) assert.equal(L.parseFix(bad), null, JSON.stringify(bad));
  assert.equal(L.parseFix(null), null);
  assert.equal(L.parseFix('21,105'), null);
});

test('gửi vị trí sai: 400 location_invalid, không đụng DB, không báo ai', async () => {
  const db = new FakeDb();
  db.add('m1', true);
  const s = await serve(db);
  try {
    for (const body of [{ lat: 91, lon: 0 }, { lat: 'x', lon: 0 }, {}, { lat: 1, lon: 1, acc: -5 }]) {
      const r = await s.call('POST', '/api/me/location', 'm1', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.code, 'location_invalid');
    }
    assert.deepEqual(db.log, []);
    assert.equal(s.sent.length, 0);
    const bad = await s.call('PUT', '/api/me/location/share', 'm1', { on: 'yes' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'location_invalid');
    assert.equal(db.get('m1').loc_share, true, 'công tắc giữ nguyên');
  } finally { await s.close(); }
});

// ---------- Bật, tắt chia sẻ ----------

test('chưa bật chia sẻ: gửi vị trí bị từ chối (409 location_off), không lưu, không báo ai', async () => {
  const db = new FakeDb();
  db.add('m1', false);
  db.add('m2', null);
  const s = await serve(db);
  try {
    for (const id of ['m1', 'm2']) {
      const r = await s.call('POST', '/api/me/location', id, HANOI);
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'location_off');
      assert.equal(db.get(id).loc_lat, null);
      assert.equal(db.get(id).loc_at, null);
    }
    assert.equal(s.sent.length, 0);
    // Điều kiện nằm ngay trong câu update (tắt giữa chừng cũng không lọt).
    assert.ok(db.log.every((q) => /where id = \$1 and loc_share returning/.test(q)));
  } finally { await s.close(); }
});

test('bật chia sẻ rồi gửi: lưu vị trí mới nhất, báo cả nhà vị trí đã làm tròn kèm tên nơi; tắt thì xoá hẳn, báo bỏ, gửi tiếp bị từ chối', async () => {
  const db = new FakeDb();
  db.add('m1', false);
  const s = await serve(db);
  try {
    const on = await s.call('PUT', '/api/me/location/share', 'm1', { on: true });
    assert.equal(on.status, 200);
    assert.equal(db.get('m1').loc_share, true);
    assert.equal(s.sent.length, 0, 'bật chưa có vị trí thì chưa báo gì');

    const r = await s.call('POST', '/api/me/location', 'm1', HANOI);
    assert.equal(r.status, 200);
    const row = db.get('m1');
    assert.equal(row.loc_lat, HANOI.lat);
    assert.equal(row.loc_lon, HANOI.lon);
    assert.equal(row.loc_acc, 35);
    assert.ok(row.loc_at instanceof Date);
    assert.equal(s.sent.length, 1);
    const { fid, msg } = s.sent[0];
    assert.equal(fid, 'f1');
    assert.equal(msg.type, 'loc');
    assert.equal(msg.memberId, 'm1');
    assert.equal(msg.loc.lat, 21.0285);
    assert.equal(msg.loc.lon, 105.8542);
    assert.equal(msg.loc.tz, 'Asia/Ho_Chi_Minh');
    assert.deepEqual(msg.loc.place, { vi: 'Hà Nội', en: 'Hanoi', ko: '하노이', near: false });
    assert.equal(msg.loc.at, row.loc_at!.toISOString());
    assert.ok(!('acc' in msg.loc), 'không gửi sai số cho người khác');
    assert.deepEqual(r.body.loc, msg.loc);

    // Gửi lần hai: chỉ giữ vị trí mới nhất.
    await s.call('POST', '/api/me/location', 'm1', { lat: 37.5665, lon: 126.978 });
    assert.equal(db.get('m1').loc_lat, 37.5665);
    assert.equal(db.get('m1').loc_acc, null);
    assert.equal(s.sent[1].msg.loc.place.ko, '서울');

    const off = await s.call('PUT', '/api/me/location/share', 'm1', { on: false });
    assert.equal(off.status, 200);
    assert.deepEqual(
      (({ loc_share, loc_lat, loc_lon, loc_acc, loc_at }) => ({ loc_share, loc_lat, loc_lon, loc_acc, loc_at }))(db.get('m1')),
      { loc_share: false, loc_lat: null, loc_lon: null, loc_acc: null, loc_at: null });
    assert.deepEqual(s.sent[2], { fid: 'f1', msg: { type: 'loc', memberId: 'm1', loc: null } });

    const again = await s.call('POST', '/api/me/location', 'm1', HANOI);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'location_off');
    assert.equal(db.get('m1').loc_lat, null);
    assert.equal(s.sent.length, 3);
  } finally { await s.close(); }
});

test('giới hạn số lần: hết lượt thì 429 slow_down kèm Retry-After, tính riêng từng người', async () => {
  const db = new FakeDb();
  db.add('m1', true);
  db.add('m2', true);
  const s = await serve(db, new Limit(3, 60e3));
  try {
    for (let i = 0; i < 3; i++) assert.equal((await s.call('POST', '/api/me/location', 'm1', HANOI)).status, 200);
    const r = await s.call('POST', '/api/me/location', 'm1', HANOI);
    assert.equal(r.status, 429);
    assert.equal(r.body.code, 'slow_down');
    assert.ok(Number(r.retry) > 0 && Number(r.retry) <= 60);
    assert.equal(s.sent.length, 3);
    assert.equal((await s.call('POST', '/api/me/location', 'm2', HANOI)).status, 200, 'người khác vẫn gửi được');
  } finally { await s.close(); }
});

// ---------- /api/me ----------

test('/api/me: người không chia sẻ không có gì (kể cả còn sót toạ độ), người chia sẻ có vị trí làm tròn, giờ, tên nơi', () => {
  const at = new Date('2026-11-20T03:04:05Z');
  const rows = [
    { id: 'a', loc_share: true, loc_lat: 21.028512, loc_lon: 105.854219, loc_at: at },
    { id: 'b', loc_share: false, loc_lat: 21.03, loc_lon: 105.85, loc_at: at },
    { id: 'c', loc_share: null, loc_lat: 21.03, loc_lon: 105.85, loc_at: at },
    { id: 'd', loc_share: true, loc_lat: null, loc_lon: null, loc_at: null },
    { id: 'e' },
  ];
  // Đúng cách index.ts dựng từng người: { ...các trường, ...memberLoc(r) }.
  const out = rows.map((r) => ({ id: r.id, ...L.memberLoc(r) }));
  assert.deepEqual(out.filter((m) => 'loc' in m).map((m) => m.id), ['a']);
  for (const m of out.slice(1)) assert.deepEqual(Object.keys(m), ['id']);
  assert.deepEqual(out[0], {
    id: 'a',
    loc: { lat: 21.0285, lon: 105.8542, at: '2026-11-20T03:04:05.000Z', tz: 'Asia/Ho_Chi_Minh', place: { vi: 'Hà Nội', en: 'Hanoi', ko: '하노이', near: false } },
  });
  assert.equal(L.locOf(rows[1]), null);
});

test('làm tròn 4 số lẻ (khoảng 11 m)', () => {
  assert.equal(L.round4(21.028512), 21.0285);
  assert.equal(L.round4(105.85426), 105.8543);
  assert.equal(L.round4(-33.868749), -33.8687);
  assert.equal(L.round4(37), 37);
  const loc = L.locOf({ loc_share: true, loc_lat: 10.123456, loc_lon: 106.654321, loc_at: new Date() })!;
  assert.deepEqual([loc.lat, loc.lon], [10.1235, 106.6543]);
});

// ---------- Nơi gần nhất ----------

test('nơi gần nhất trong places.json: tên ba thứ tiếng, múi giờ, "gần" khi xa hơn 60 km, chỉ tên nước khi xa hơn 300 km', () => {
  assert.deepEqual(G.nearestPlace(places, { lat: 21.0285, lon: 105.8542 }), { vi: 'Hà Nội', en: 'Hanoi', ko: '하노이', near: false, tz: 'Asia/Ho_Chi_Minh' });
  assert.deepEqual(G.nearestPlace(places, { lat: 35.54, lon: 129.31 }), { vi: 'Ulsan', en: 'Ulsan', ko: '울산', near: false, tz: 'Asia/Seoul' });
  assert.deepEqual(G.nearestPlace(places, { lat: 10.79, lon: 106.95 }), { vi: 'Long Thành', en: 'Long Thanh', ko: '롱타인', near: false, tz: 'Asia/Ho_Chi_Minh' });
  // Côn Đảo không có trong bảng, gần nhất là Bạc Liêu cách hơn 100 km.
  assert.deepEqual(G.nearestPlace(places, { lat: 8.68, lon: 106.6 }), { vi: 'Bạc Liêu', en: 'Bac Lieu', ko: '박리에우', near: true, tz: 'Asia/Ho_Chi_Minh' });
  // Giữa Thái Bình Dương, gần nhất là Honolulu cách hơn 800 km: chỉ nói tên nước.
  assert.deepEqual(G.nearestPlace(places, { lat: 20, lon: -150 }), { vi: 'Mỹ', en: 'United States', ko: '미국', near: false, tz: 'Pacific/Honolulu' });
});

test('nơi gần nhất: đúng ngưỡng 60 km và 300 km, thiếu tên Anh, Hàn thì dùng tên có sẵn', () => {
  assert.equal(G.PLACE_KM, 60);
  assert.equal(G.NEAR_KM, 300);
  const data = { p: [['Làng A', 'VN', 0, 0, 0, 'lang a'], ['Far', 'KR', 0, 90, 1, 'far', 'Far', '먼곳']], z: ['Asia/Ho_Chi_Minh', 'Asia/Seoul'], c: { VN: 'Việt Nam', KR: 'Hàn Quốc' }, ce: { VN: 'Vietnam' }, cko: {} } as any;
  // 1 độ vĩ khoảng 111 km.
  assert.deepEqual(G.nearestPlace(data, { lat: 0.5, lon: 0 }), { vi: 'Làng A', en: 'Làng A', ko: 'Làng A', near: false, tz: 'Asia/Ho_Chi_Minh' });
  assert.equal(G.nearestPlace(data, { lat: 1, lon: 0 }).near, true);
  assert.equal(G.nearestPlace(data, { lat: 2.6, lon: 0 }).near, true);
  assert.deepEqual(G.nearestPlace(data, { lat: 3, lon: 0 }), { vi: 'Việt Nam', en: 'Vietnam', ko: 'Vietnam', near: false, tz: 'Asia/Ho_Chi_Minh' });
  assert.equal(G.nearestPlace(data, { lat: 0, lon: 89.9 }).ko, '먼곳');
});

test('lược đồ: cột vị trí nằm trên members, thêm được nhiều lần, không có bảng mới trỏ tới thành viên', () => {
  const src = readFileSync(new URL('./location.ts', import.meta.url), 'utf8');
  const cols = [...src.matchAll(/alter table members add column if not exists (\w+) ([\w ]+);/g)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(cols, [
    ['loc_lat', 'double precision'], ['loc_lon', 'double precision'], ['loc_acc', 'real'], ['loc_at', 'timestamptz'], ['loc_share', 'boolean default false'],
  ]);
  assert.doesNotMatch(src, /create table/i);
});
