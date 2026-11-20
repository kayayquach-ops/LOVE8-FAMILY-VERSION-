// Vị trí cả nhà (20/11/2026). Mỗi người tự bật "chia sẻ vị trí với cả nhà" trong Cài đặt; chưa bật thì không ai thấy gì.
// Máy chủ chỉ giữ vị trí MỚI NHẤT ngay trên hàng members (loc_lat, loc_lon, loc_acc, loc_at, loc_share), không lưu lịch sử,
// không có bảng riêng trỏ tới thành viên: xoá người khỏi nhà (server/members.ts) là vị trí mất theo hàng.
// Vị trí mới gửi cho cả nhà qua kênh sự kiện chung (toFamily ở server/facetime.ts, máy khách nghe bằng onLive ở src/live.ts),
// loại tin { type: 'loc', memberId, loc }. Tắt chia sẻ thì xoá vị trí đã lưu và báo cả nhà bỏ vị trí đó (loc: null).
// Tên nơi tra từ src/places.json (src/geo.ts nearestPlace), không gọi dịch vụ bản đồ nào.
import express from 'express';
import { readFileSync } from 'node:fs';
import { pool } from './db.ts';
import { errorBody } from './i18n.ts';
import { ipOf, Limit, limitBy } from './limit.ts';
import { toFamily } from './facetime.ts';
import { nearestPlace, type PlacesData } from '../src/geo.ts';
import type { MemberLoc } from '../src/shared.ts';

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// Mỗi câu một dòng: server/members.test.ts đọc các câu add column để dựng lược đồ.
export async function migrateLocation(db: Db = pool) {
  await db.query(`
    alter table members add column if not exists loc_lat double precision;
    alter table members add column if not exists loc_lon double precision;
    alter table members add column if not exists loc_acc real;
    alter table members add column if not exists loc_at timestamptz;
    alter table members add column if not exists loc_share boolean default false;
  `);
}

let places: PlacesData | null = null;
const placesData = () => (places ??= JSON.parse(readFileSync(new URL('../src/places.json', import.meta.url), 'utf8')) as PlacesData);

/** Làm tròn 4 số lẻ: khoảng 11 m, đủ để mở bản đồ đúng chỗ. */
export const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Sai số lớn hơn chừng này (100 km) thì vị trí chẳng còn nghĩa gì. */
const MAX_ACC_M = 100_000;

/** Vị trí gửi lên: vĩ độ -90..90, kinh độ -180..180, sai số 0..100 km tính bằng mét (không gửi thì để trống). Sai thì null. */
export function parseFix(body: unknown): { lat: number; lon: number; acc: number | null } | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const { lat, lon, acc } = b;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (acc != null && (typeof acc !== 'number' || !Number.isFinite(acc) || acc < 0 || acc > MAX_ACC_M)) return null;
  return { lat, lon, acc: acc == null ? null : Math.round(acc) };
}

type LocRow = { loc_share?: boolean | null; loc_lat?: number | null; loc_lon?: number | null; loc_at?: Date | string | null };

/** Vị trí một người cho cả nhà xem: chỉ khi người đó đang chia sẻ và đã có vị trí. Toạ độ làm tròn, kèm tên nơi và múi giờ. */
export function locOf(r: LocRow): MemberLoc | null {
  if (!r.loc_share || r.loc_lat == null || r.loc_lon == null || !r.loc_at) return null;
  const lat = round4(Number(r.loc_lat)), lon = round4(Number(r.loc_lon));
  const { tz, ...place } = nearestPlace(placesData(), { lat, lon });
  return { lat, lon, at: new Date(r.loc_at).toISOString(), tz, place };
}

/** Phần thêm vào từng người trong /api/me: người không chia sẻ thì không có gì cả. */
export function memberLoc(r: LocRow): { loc?: MemberLoc } {
  const loc = locOf(r);
  return loc ? { loc } : {};
}

const h = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json(errorBody('server'));
  });

/** send: gửi một tin cho mọi máy đang mở của cả nhà. limit: số lần gửi vị trí của mỗi người. */
export type LocDeps = { db: Db; send: (familyId: string, msg: unknown) => void; limit: Limit };

/** Gắn sau auth. App gửi lâu nhất 60 giây một lần (src/geo.ts shouldSend); trần ở đây rộng hơn, chỉ để chặn máy gửi dồn. */
export function locationRouter(deps: LocDeps = { db: pool, send: toFamily, limit: new Limit(10, 60e3) }) {
  const r = express.Router();
  const slow = limitBy({ name: 'location', per: deps.limit, key: (req) => (req as { member?: { id: string } }).member?.id ?? ipOf(req) });

  // Vị trí mới nhất của mình. Chỉ ghi khi đang bật chia sẻ (cùng một câu update, tắt giữa chừng cũng không lọt).
  r.post('/me/location', slow, h(async (req, res) => {
    const me = req.member as { id: string; family_id: string };
    const fix = parseFix(req.body);
    if (!fix) return res.status(400).json(errorBody('location_invalid'));
    const { rows } = await deps.db.query(
      'update members set loc_lat = $2, loc_lon = $3, loc_acc = $4, loc_at = now() where id = $1 and loc_share returning loc_share, loc_lat, loc_lon, loc_at',
      [me.id, fix.lat, fix.lon, fix.acc]);
    if (!rows[0]) return res.status(409).json(errorBody('location_off'));
    const loc = locOf(rows[0]);
    deps.send(me.family_id, { type: 'loc', memberId: me.id, loc });
    res.json({ ok: true, loc });
  }));

  // Bật hoặc tắt chia sẻ. Tắt là xoá luôn vị trí đã lưu và báo cả nhà bỏ vị trí của mình.
  r.put('/me/location/share', h(async (req, res) => {
    const me = req.member as { id: string; family_id: string };
    const on = req.body?.on;
    if (typeof on !== 'boolean') return res.status(400).json(errorBody('location_invalid'));
    if (on) await deps.db.query('update members set loc_share = true where id = $1', [me.id]);
    else {
      await deps.db.query('update members set loc_share = false, loc_lat = null, loc_lon = null, loc_acc = null, loc_at = null where id = $1', [me.id]);
      deps.send(me.family_id, { type: 'loc', memberId: me.id, loc: null });
    }
    res.json({ ok: true, on });
  }));

  return r;
}
