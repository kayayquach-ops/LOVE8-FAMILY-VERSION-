// Quy đổi lịch âm Việt Nam (múi giờ UTC+7) <-> dương. Thuật toán Hồ Ngọc Đức.
// Dùng chung cho máy chủ và giao diện.

const TZ = 7;
const PI = Math.PI;
const fl = Math.floor;

export type Lunar = { day: number; month: number; year: number; leap: boolean };
export type Solar = { day: number; month: number; year: number };

function jdFromDate(dd: number, mm: number, yy: number) {
  const a = fl((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  return dd + fl((153 * m + 2) / 5) + 365 * y + fl(y / 4) - fl(y / 100) + fl(y / 400) - 32045;
}

function jdToDate(jd: number): Solar {
  const a = jd + 32044;
  const b = fl((4 * a + 3) / 146097);
  const c = a - fl((b * 146097) / 4);
  const d = fl((4 * c + 3) / 1461);
  const e = c - fl((1461 * d) / 4);
  const m = fl((5 * e + 2) / 153);
  return { day: e - fl((153 * m + 2) / 5) + 1, month: m + 3 - 12 * fl(m / 10), year: b * 100 + d - 4800 + fl(m / 10) };
}

function newMoon(k: number) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  const s = (x: number) => Math.sin(dr * x);
  const C1 = (0.1734 - 0.000393 * T) * s(M) + 0.0021 * s(2 * M) - 0.4068 * s(Mpr) + 0.0161 * s(2 * Mpr)
    - 0.0004 * s(3 * Mpr) + 0.0104 * s(2 * F) - 0.0051 * s(M + Mpr) - 0.0074 * s(M - Mpr)
    + 0.0004 * s(2 * F + M) - 0.0004 * s(2 * F - M) - 0.0006 * s(2 * F + Mpr) + 0.001 * s(2 * F - Mpr)
    + 0.0005 * s(2 * Mpr + M);
  const dt = T < -11
    ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
    : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + C1 - dt;
}

function sunLongitude(jdn: number) {
  const T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  const DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M)
    + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * fl(L / (PI * 2));
  return L;
}

const sunSector = (day: number) => fl((sunLongitude(day - 0.5 - TZ / 24) / PI) * 6);
const newMoonDay = (k: number) => fl(newMoon(k) + 0.5 + TZ / 24);

function lunarMonth11(yy: number) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = fl(off / 29.530588853);
  let nm = newMoonDay(k);
  if (sunSector(nm) >= 9) nm = newMoonDay(k - 1);
  return nm;
}

function leapMonthOffset(a11: number) {
  const k = fl((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0, i = 1;
  let arc = sunSector(newMoonDay(k + i));
  do { last = arc; i++; arc = sunSector(newMoonDay(k + i)); } while (arc !== last && i < 14);
  return i - 1;
}

export function solarToLunar(day: number, month: number, year: number): Lunar {
  const dayNumber = jdFromDate(day, month, year);
  const k = fl((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = newMoonDay(k + 1);
  if (monthStart > dayNumber) monthStart = newMoonDay(k);
  let a11 = lunarMonth11(year), b11 = a11, ly: number;
  if (a11 >= monthStart) { ly = year; a11 = lunarMonth11(year - 1); }
  else { ly = year + 1; b11 = lunarMonth11(year + 1); }
  const diff = fl((monthStart - a11) / 29);
  let leap = false, lm = diff + 11;
  if (b11 - a11 > 365) {
    const lo = leapMonthOffset(a11);
    if (diff >= lo) { lm = diff + 10; if (diff === lo) leap = true; }
  }
  if (lm > 12) lm -= 12;
  if (lm >= 11 && diff < 4) ly -= 1;
  return { day: dayNumber - monthStart + 1, month: lm, year: ly, leap };
}

// Ngày 30 của tháng thiếu (29 ngày) lùi về 29. Tháng nhuận không có thì dùng tháng thường.
export function lunarToSolar(day: number, month: number, year: number, leap = false): Solar {
  let a11: number, b11: number;
  if (month < 11) { a11 = lunarMonth11(year - 1); b11 = lunarMonth11(year); }
  else { a11 = lunarMonth11(year); b11 = lunarMonth11(year + 1); }
  const k = fl(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = month - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const lo = leapMonthOffset(a11);
    let leapMonth = lo - 2;
    if (leapMonth < 0) leapMonth += 12;
    const isLeap = leap && month === leapMonth;
    if (isLeap || off >= lo) off += 1;
  }
  const start = newMoonDay(k + off);
  const d = Math.min(day, newMoonDay(k + off + 1) - start);
  return jdToDate(start + d - 1);
}

// Sự kiện lặp theo âm lịch: các ngày dương rơi vào năm dương `solarYear` (0, 1 hoặc 2 ngày).
export function lunarEventInSolarYear(day: number, month: number, leap: boolean, solarYear: number): Array<Solar & { lunarYear: number }> {
  const out: Array<Solar & { lunarYear: number }> = [];
  for (const ly of [solarYear - 1, solarYear]) {
    const s = lunarToSolar(day, month, ly, leap);
    if (s.year === solarYear) out.push({ ...s, lunarYear: ly });
  }
  return out;
}

// Lần tới (từ hôm nay trở đi). Với dương lịch, lunarYear = null.
export function nextOccurrence(
  e: { day: number; month: number; lunar: boolean; leap?: boolean },
  today: Solar,
): (Solar & { lunarYear: number | null }) | null {
  const t0 = Date.UTC(today.year, today.month - 1, today.day);
  const cands: Array<Solar & { lunarYear: number | null }> = [];
  for (const y of [today.year, today.year + 1]) {
    if (e.lunar) cands.push(...lunarEventInSolarYear(e.day, e.month, !!e.leap, y));
    else cands.push({ day: e.day, month: e.month, year: y, lunarYear: null });
  }
  cands.sort((a, b) => Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day));
  return cands.find((c) => Date.UTC(c.year, c.month - 1, c.day) >= t0) ?? null;
}
