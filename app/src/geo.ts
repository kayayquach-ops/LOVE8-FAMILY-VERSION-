// Vị trí cả nhà: phần tính toán thuần (không React, không trình duyệt, không chữ giao diện), dùng chung cho máy chủ
// (server/location.ts) và app (src/location.ts, Home.tsx), chạy thử được bằng node --test (src/geo.test.ts).
import type { Me, Member, MemberLoc } from './shared';

export type LatLon = { lat: number; lon: number };

/** Khoảng cách theo mét giữa hai điểm (haversine, Trái Đất bán kính 6371 km). */
export function distanceM(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371e3 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ---------- Tên nơi gần nhất, tra src/places.json (không gọi dịch vụ bản đồ nào) ----------

/** Một dòng places.json: tên Việt, mã nước, vĩ độ, kinh độ, thứ tự múi giờ trong z, chữ tìm, tên Anh, tên Hàn. */
type PlaceRow = [string, string, number, number, number, string, string?, string?];
/** places.json: p các nơi, z các múi giờ, c / ce / cko tên nước tiếng Việt / Anh / Hàn. */
export type PlacesData = { p: PlaceRow[]; z: string[]; c: Record<string, string>; ce: Record<string, string>; cko: Record<string, string> };
export type Place = MemberLoc['place'] & { tz: string };

/** Trong bán kính này thì gọi thẳng tên nơi gần nhất. */
export const PLACE_KM = 60;
/** Xa hơn PLACE_KM mà chưa quá chừng này thì là "gần {nơi}"; xa hơn nữa chỉ nói tên nước của nơi gần nhất. */
export const NEAR_KM = 300;

/** Nơi gần nhất trong places.json, đủ ba thứ tiếng (thiếu tên Anh, Hàn thì dùng tên có sẵn), kèm múi giờ nơi đó. */
export function nearestPlace(data: PlacesData, at: LatLon): Place {
  let best = data.p[0];
  let bestM = Infinity;
  for (const r of data.p) {
    const d = distanceM(at, { lat: r[2], lon: r[3] });
    if (d < bestM) { bestM = d; best = r; }
  }
  const tz = data.z[best[4]];
  if (bestM > NEAR_KM * 1000) {
    const vi = data.c[best[1]] ?? best[1];
    const en = data.ce[best[1]] || vi;
    return { vi, en, ko: data.cko[best[1]] || en, near: false, tz };
  }
  const [vi, , , , , , en, ko] = best;
  return { vi, en: en || vi, ko: ko || en || vi, near: bestM > PLACE_KM * 1000, tz };
}

// ---------- Gửi vị trí của mình (src/location.ts) ----------

/** Lâu nhất 60 giây gửi một lần (đứng yên vẫn gửi lại để cả nhà thấy "vừa xong"). */
export const SEND_EVERY_MS = 60_000;
/** Đi xa hơn 300 m so với lần gửi trước thì gửi sớm hơn... */
export const SEND_MOVE_M = 300;
/** ...nhưng không dày hơn 15 giây một lần (vị trí sai số lớn hay nhảy vài trăm mét). */
export const SEND_GAP_MS = 15_000;

export type Sent = LatLon & { at: number };

/** Có nên gửi vị trí vừa đọc được không, so với lần gửi trước (null là chưa gửi lần nào). */
export function shouldSend(last: Sent | null, fix: LatLon, now: number): boolean {
  if (!last) return true;
  const gap = now - last.at;
  if (gap >= SEND_EVERY_MS) return true;
  return gap >= SEND_GAP_MS && distanceM(last, fix) > SEND_MOVE_M;
}

// ---------- Hiện vị trí người khác ----------

/** Link mở bản đồ đúng điểm: iPhone, iPad (iPad báo mình là Mac có màn cảm ứng) mở Apple Maps, máy khác mở Google Maps. */
export function mapUrl(lat: number, lon: number, userAgent: string, touchPoints = 0): string {
  const apple = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
  return apple ? `https://maps.apple.com/?ll=${lat},${lon}&q=${lat},${lon}` : `https://www.google.com/maps?q=${lat},${lon}`;
}

/** Thành phố giả (dạng JSON như CityPicker lưu) để localTime, weather ở src/time.ts tính theo vị trí thật.
 *  Làm tròn 1 số lẻ (khoảng 11 km): đi loanh quanh không phải hỏi lại thời tiết. */
export const locCity = (loc: MemberLoc) => JSON.stringify({ name: '', lat: Math.round(loc.lat * 10) / 10, lon: Math.round(loc.lon * 10) / 10, tz: loc.tz });

/** Sửa vị trí của đúng một người trong danh sách cả nhà (null là bỏ). Không đổi gì thì trả lại đúng đối tượng cũ. */
export function patchLoc(me: Me, memberId: string, loc: MemberLoc | null): Me {
  const old = me.members.find((m) => m.id === memberId);
  if (!old || JSON.stringify(old.loc ?? null) === JSON.stringify(loc)) return me;
  const { loc: _drop, ...rest } = old;
  const next: Member = loc ? { ...rest, loc } : rest;
  return { ...me, me: me.me.id === memberId ? next : me.me, members: me.members.map((m) => (m.id === memberId ? next : m)) };
}
