// Múi giờ và giờ địa phương của từng người trên máy chủ (20/11/2026), cho Mây biết bên người nhận đang mấy giờ.
// Múi giờ: vị trí thật nếu người đó đang chia sẻ, không thì members.city (mã có sẵn hoặc JSON CityPicker lưu), không thì nơi gần nhất
// trong src/places.json. Nơi ở, giờ chênh, khoảng cách cho dữ liệu soạn câu (server/callfacts.ts). Không đụng DB; chỉ weatherAt và
// weatherFeelAt gọi mạng (open-meteo, fetch truyền vào được, chung một kho nhớ). Kiểm bằng server/place.test.ts.
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
  } catch (e) {
    console.warn('[place] không tra được nơi ở (src/places.json?):', (e as Error).message);
    return null;
  }
}

// i18n-ok-begin: chữ thời tiết tiếng Anh chỉ đưa vào dữ liệu cho AI, cùng nhóm mã như src/time.ts.
const WEATHER_EN: ReadonlyArray<readonly [readonly number[], string]> = [
  [[0], 'clear'], [[1, 2], 'few clouds'], [[3], 'cloudy'], [[45, 48], 'fog'],
  [[51, 53, 55, 56, 57], 'drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], 'rain'], [[71, 73, 75, 77, 85, 86], 'snow'], [[95, 96, 99], 'storm'],
];
/** Mây Live: trời đáng nói thành cảm giác (mưa phùn cũng là mưa); mã khác không nói gì. */
const FEEL_EN: Partial<Record<string, string>> = { drizzle: 'rainy', rain: 'rainy', snow: 'snowy', storm: 'stormy' };
// i18n-ok-end
const WEATHER_TTL_MS = 3600e3;
/** Lỗi (open-meteo chậm, sập, trả sai dạng) cũng nhớ, ngắn hơn: mỗi ô toạ độ chỉ phải chờ 2 giây một lần mỗi 10 phút, không phải mỗi cuộc gọi. */
const WEATHER_FAIL_TTL_MS = 10 * 60e3;
/** Số đo thô (độ C, mã thời tiết open-meteo); weatherAt và weatherFeelAt đọc chung, null là lần hỏi lỗi. */
type WeatherRaw = { temp: number; code: number };
const weatherCache = new Map<string, { at: number; raw: WeatherRaw | null }>();

/** Nhóm chữ tiếng Anh của một mã thời tiết, không có thì undefined. */
const weatherWord = (code: number) => WEATHER_EN.find(([codes]) => codes.includes(code))?.[1];

/** Số đo hiện tại từ open-meteo, như máy khách (src/time.ts). Toạ độ làm tròn 1 số lẻ (khoảng 11 km) trước khi hỏi,
 *  nhớ 1 giờ theo toạ độ đó (lỗi thì nhớ null 10 phút, ghi log một lần); chờ tối đa 2 giây; lỗi gì cũng null. */
async function weatherRaw(lat: number, lon: number, fetchFn: typeof fetch): Promise<WeatherRaw | null> {
  const la = Math.round(lat * 10) / 10, lo = Math.round(lon * 10) / 10;
  const key = `${la},${lo}`;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < (hit.raw ? WEATHER_TTL_MS : WEATHER_FAIL_TTL_MS)) return hit.raw;
  let raw: WeatherRaw | null = null;
  try {
    const r = await fetchFn(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cur = (await r.json())?.current;
    const temp = Number(cur?.temperature_2m);
    if (cur?.temperature_2m == null || !Number.isFinite(temp)) throw new Error('no temperature');
    // Mã không phải số thì không khớp nhóm nào, như trước.
    raw = { temp, code: typeof cur.weather_code === 'number' ? cur.weather_code : NaN };
  } catch (e) {
    console.warn(`[place] không lấy được thời tiết ở ${key}, 10 phút nữa mới hỏi lại:`, (e as Error).message);
  }
  weatherCache.set(key, { at: Date.now(), raw });
  return raw;
}

/** Thời tiết hiện tại ("5°C, cloudy") cho bộ câu cũ; chuỗi giữ nguyên như trước khi có weatherFeelAt. Lỗi gì cũng null. */
export async function weatherAt(lat: number, lon: number, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const raw = await weatherRaw(lat, lon, fetchFn);
  if (!raw) return null;
  const word = weatherWord(raw.code);
  return word ? `${Math.round(raw.temp)}°C, ${word}` : `${Math.round(raw.temp)}°C`;
}

/** Mây Live: thời tiết thành cảm giác, không bao giờ có số ("cold and rainy"). Nóng lạnh theo độ C làm tròn như chuỗi cũ:
 *  từ 8 trở xuống rất lạnh, từ 15 trở xuống lạnh, từ 35 rất nóng, từ 31 nóng; rồi mưa, tuyết, bão. Dễ chịu, không đáng nói thì null. */
export function weatherFeel(tempC: number, code: number): string | null {
  const t = Math.round(tempC);
  const words = [
    t <= 8 ? 'very cold' : t <= 15 ? 'cold' : t >= 35 ? 'very hot' : t >= 31 ? 'hot' : undefined,
    FEEL_EN[weatherWord(code) ?? ''],
  ].filter(Boolean);
  return words.length ? words.join(' and ') : null;
}

/** weatherFeel từ open-meteo, chung kho nhớ với weatherAt: gọi sau weatherAt cùng toạ độ thì không hỏi mạng lần nữa. Lỗi gì cũng null. */
export async function weatherFeelAt(lat: number, lon: number, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const raw = await weatherRaw(lat, lon, fetchFn);
  return raw ? weatherFeel(raw.temp, raw.code) : null;
}
