// Múi giờ và giờ địa phương của từng người trên máy chủ (20/11/2026), cho Mây biết bên người nhận đang mấy giờ.
// Múi giờ: vị trí thật nếu người đó đang chia sẻ, không thì members.city (mã có sẵn hoặc JSON CityPicker lưu), không thì nơi gần nhất
// trong src/places.json. Nơi ở, giờ chênh, khoảng cách cho dữ liệu soạn câu (server/callfacts.ts). Không đụng DB; chỉ weatherAt gọi mạng
// (open-meteo, fetch truyền vào được). Kiểm bằng server/place.test.ts.
import { distanceM, nearestPlace, PLACE_KM, type LatLon } from '../src/geo.ts';
import { cityOf } from '../src/shared.ts';
import type { Lang } from './i18n.ts';
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

/** Đồng hồ ở tzA nhanh hơn đồng hồ ở tzB bao nhiêu giờ tại at (âm là chậm hơn), làm tròn tới nửa giờ. */
export function hoursApart(tzA: string, tzB: string, at: Date): number {
  const t = at.getTime();
  return Math.round((offsetMs(safeTz(tzA), t) - offsetMs(safeTz(tzB), t)) / 1800e3) / 2;
}

/** Khoảng cách theo km, làm tròn. */
export function distanceKm(a: LatLon, b: LatLon): number {
  return Math.round(distanceM(a, b) / 1000);
}

/** Nơi một người đang sống cho AI đọc: thành phố tự chọn thì đúng tên ấy; vị trí thật thì tên nơi gần nhất trong PLACE_KM, xa hơn chỉ biết nước.
 *  Tên nơi và tên nước theo thứ tiếng người nghe (places.json). Không biết ở đâu thì null. */
export function placeOfMember(m: PlaceRow, lang: Lang): { name: string | null; country: string | null; lat: number; lon: number } | null {
  try {
    const loc = locOf(m);
    const city = loc ? undefined : cityOf(m.city);
    const at = loc ?? city;
    if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lon)) return null;
    const data = placesData();
    let best = data.p[0], bestM = Infinity;
    for (const r of data.p) {
      const d = distanceM(at, { lat: r[2], lon: r[3] });
      if (d < bestM) { bestM = d; best = r; }
    }
    const [vi, cc, , , , , en, ko] = best;
    const nearest = lang === 'vi' ? vi : lang === 'en' ? en || vi : ko || en || vi;
    const country = (lang === 'vi' ? data.c[cc] : lang === 'en' ? data.ce[cc] : data.cko[cc]) || data.ce[cc] || data.c[cc] || null;
    return { name: city?.name || (bestM <= PLACE_KM * 1000 ? nearest : null), country, lat: at.lat, lon: at.lon };
  } catch {
    return null;
  }
}

// i18n-ok-begin: chữ thời tiết tiếng Anh chỉ đưa vào dữ liệu cho AI, cùng nhóm mã như src/time.ts.
const WEATHER_EN: ReadonlyArray<readonly [readonly number[], string]> = [
  [[0], 'clear'], [[1, 2], 'few clouds'], [[3], 'cloudy'], [[45, 48], 'fog'],
  [[51, 53, 55, 56, 57], 'drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], 'rain'], [[71, 73, 75, 77, 85, 86], 'snow'], [[95, 96, 99], 'storm'],
];
// i18n-ok-end
const WEATHER_TTL_MS = 3600e3;
const weatherCache = new Map<string, { at: number; text: string }>();

/** Thời tiết hiện tại ("5°C, cloudy") từ open-meteo, như máy khách (src/time.ts). Toạ độ làm tròn 1 số lẻ (khoảng 11 km) trước khi hỏi,
 *  nhớ 1 giờ theo toạ độ đó; chờ tối đa 2 giây; lỗi gì cũng null. */
export async function weatherAt(lat: number, lon: number, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const la = Math.round(lat * 10) / 10, lo = Math.round(lon * 10) / 10;
  const key = `${la},${lo}`;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.text;
  try {
    const r = await fetchFn(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const cur = (await r.json())?.current;
    const temp = Number(cur?.temperature_2m);
    if (cur?.temperature_2m == null || !Number.isFinite(temp)) return null;
    const word = WEATHER_EN.find(([codes]) => codes.includes(cur.weather_code))?.[1];
    const text = word ? `${Math.round(temp)}°C, ${word}` : `${Math.round(temp)}°C`;
    weatherCache.set(key, { at: Date.now(), text });
    return text;
  } catch {
    return null;
  }
}
