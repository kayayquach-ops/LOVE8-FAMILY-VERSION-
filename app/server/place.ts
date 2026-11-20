// Múi giờ và giờ địa phương của từng người trên máy chủ (20/11/2026), cho Mây biết bên người nhận đang mấy giờ.
// Múi giờ: vị trí thật nếu người đó đang chia sẻ, không thì members.city (mã có sẵn hoặc JSON CityPicker lưu), không thì nơi gần nhất
// trong src/places.json. Không gọi mạng, không đụng DB. Kiểm bằng server/place.test.ts.
import { nearestPlace } from '../src/geo.ts';
import { cityOf } from '../src/shared.ts';
import { locOf, placesData } from './location.ts';

export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

export type PlaceRow = { city?: string | null; loc_share?: boolean | null; loc_lat?: number | null; loc_lon?: number | null; loc_at?: Date | string | null };

/** Tên múi giờ máy chủ hiểu được (Asia/Seoul...), sai hay rỗng thì false. */
function okTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}
const safeTz = (tz: unknown) => (okTz(tz) ? tz : DEFAULT_TZ);

/** Live location (locOf) when shared, else members.city via cityOf (tz in the JSON or the CITIES code), else the nearest place in places.json for the city's lat/lon; any invalid tz falls back to DEFAULT_TZ. Never throws. */
export function tzOfMember(m: PlaceRow): string {
  try {
    const loc = locOf(m);
    if (loc) return safeTz(loc.tz);
    const c = cityOf(m.city);
    if (!c) return DEFAULT_TZ;
    if (c.tz) return safeTz(c.tz);
    if (Number.isFinite(c.lat) && Number.isFinite(c.lon)) return safeTz(nearestPlace(placesData(), { lat: c.lat, lon: c.lon }).tz);
  } catch {}
  return DEFAULT_TZ;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Năm, tháng, ngày, giờ, phút, giây trên đồng hồ ở tz tại thời điểm at (tz đã kiểm). */
function wallClock(tz: string, at: Date) {
  const o: Record<string, number> = {};
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  for (const x of f.formatToParts(at)) if (x.type !== 'literal') o[x.type] = Number(x.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Local date (YYYY-MM-DD) and minutes since local midnight in tz (invalid tz: DEFAULT_TZ). */
export function localParts(tz: string, at: Date): { date: string; minutes: number } {
  const w = wallClock(safeTz(tz), at);
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, minutes: w.hour * 60 + w.minute };
}

/** Đồng hồ ở tz nhanh hơn giờ UTC bao nhiêu mili giây tại thời điểm at. */
function offsetMs(tz: string, at: number) {
  const w = wallClock(tz, new Date(at));
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(at / 1000) * 1000;
}

/** The instant when the wall clock in tz shows `date` at `minutes` past midnight. */
export function zonedTime(tz: string, date: string, minutes: number): Date {
  const z = safeTz(tz);
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  // Tính lại độ lệch ở kết quả một lần: ngày đổi giờ mùa hè, độ lệch lúc nửa đêm khác lúc 9:00.
  return new Date(guess - offsetMs(z, guess - offsetMs(z, guess)));
}
