// Âm lịch Việt Nam, theo thuật toán của Hồ Ngọc Đức (tính theo múi giờ UTC+7).
// Âm lịch Hàn (UTC+9) và Trung Quốc (UTC+8) đôi khi lệch một ngày so với lịch Việt,
// nên app dùng múi giờ 7 cho mọi phép tính.

export const VN_TIME_ZONE = 7;

export type SolarDate = { day: number; month: number; year: number };
export type LunarDate = { day: number; month: number; year: number; leap: boolean };

const PI = Math.PI;
const INT = Math.floor;

export function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  }
  return jd;
}

export function jdToDate(jd: number): SolarDate {
  let a: number, b: number, c: number;
  if (jd > 2299160) {
    a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT((1461 * d) / 4);
  const m = INT((5 * e + 2) / 153);
  return {
    day: e - INT((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * INT(m / 10),
    year: b * 100 + d - 4800 + INT(m / 10),
  };
}

function newMoon(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + C1 - deltat;
}

function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L = L - PI * 2 * INT(L / (PI * 2));
  return L;
}

function getSunLongitude(dayNumber: number, timeZone: number): number {
  return INT((sunLongitude(dayNumber - 0.5 - timeZone / 24) / PI) * 6);
}

function getNewMoonDay(k: number, timeZone: number): number {
  return INT(newMoon(k) + 0.5 + timeZone / 24);
}

function getLunarMonth11(yy: number, timeZone: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  if (getSunLongitude(nm, timeZone) >= 9) {
    nm = getNewMoonDay(k - 1, timeZone);
  }
  return nm;
}

function getLeapMonthOffset(a11: number, timeZone: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
}

export function solarToLunar(solar: SolarDate, timeZone = VN_TIME_ZONE): LunarDate {
  const dayNumber = jdFromDate(solar.day, solar.month, solar.year);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone);
  }
  let a11 = getLunarMonth11(solar.year, timeZone);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = solar.year;
    a11 = getLunarMonth11(solar.year - 1, timeZone);
  } else {
    lunarYear = solar.year + 1;
    b11 = getLunarMonth11(solar.year + 1, timeZone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let leap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) leap = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day: lunarDay, month: lunarMonth, year: lunarYear, leap };
}

/** Trả về null nếu ngày âm không tồn tại (ví dụ tháng nhuận không có trong năm đó). */
export function lunarToSolar(lunar: LunarDate, timeZone = VN_TIME_ZONE): SolarDate | null {
  let a11: number, b11: number;
  if (lunar.month < 11) {
    a11 = getLunarMonth11(lunar.year - 1, timeZone);
    b11 = getLunarMonth11(lunar.year, timeZone);
  } else {
    a11 = getLunarMonth11(lunar.year, timeZone);
    b11 = getLunarMonth11(lunar.year + 1, timeZone);
  }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lunar.month - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11, timeZone);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (lunar.leap && lunar.month !== leapMonth) return null;
    if (lunar.leap || off >= leapOff) off += 1;
  } else if (lunar.leap) {
    return null;
  }
  const monthStart = getNewMoonDay(k + off, timeZone);
  return jdToDate(monthStart + lunar.day - 1);
}

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const ZODIAC_EMOJI = ['🐭', '🐃', '🐯', '🐱', '🐲', '🐍', '🐴', '🐐', '🐵', '🐔', '🐶', '🐷'];

export function canChiYear(lunarYear: number): string {
  return `${CAN[(lunarYear + 6) % 10]} ${CHI[(lunarYear + 8) % 12]}`;
}

/** Người Việt cầm tinh con mèo (Mão), không phải con thỏ như ở Hàn và Trung Quốc. */
export function zodiacEmoji(lunarYear: number): string {
  return ZODIAC_EMOJI[(lunarYear + 8) % 12];
}

export function toSolarDate(d: Date): SolarDate {
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

export function fromSolarDate(s: SolarDate): Date {
  return new Date(s.year, s.month - 1, s.day);
}

export function lunarOf(d: Date): LunarDate {
  return solarToLunar(toSolarDate(d));
}

export function formatLunar(l: LunarDate): string {
  return `${l.day}/${l.month}${l.leap ? ' nhuận' : ''} âm lịch`;
}

/**
 * Ngày dương gần nhất (tính từ `from`) ứng với ngày âm lặp lại hằng năm, như ngày giỗ
 * hay sinh nhật âm. Nếu tháng âm năm đó chỉ có 29 ngày mà sự kiện rơi vào ngày 30,
 * dùng ngày 29, theo cách nhiều gia đình vẫn làm.
 */
export function nextSolarForLunar(day: number, month: number, from: Date): Date {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const currentLunarYear = lunarOf(start).year;
  for (let y = currentLunarYear - 1; y <= currentLunarYear + 2; y++) {
    let d = day;
    let solar = lunarToSolar({ day: d, month, year: y, leap: false });
    while (solar && d > 28 && lunarOf(fromSolarDate(solar)).month !== month) {
      d -= 1;
      solar = lunarToSolar({ day: d, month, year: y, leap: false });
    }
    if (!solar) continue;
    const date = fromSolarDate(solar);
    if (date >= start) return date;
  }
  return start;
}

export function nextSolarAnniversary(day: number, month: number, from: Date): Date {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const thisYear = new Date(start.getFullYear(), month - 1, day);
  return thisYear >= start ? thisYear : new Date(start.getFullYear() + 1, month - 1, day);
}

export function daysBetween(a: Date, b: Date): number {
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() -
    new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  return Math.round(ms / 86400000);
}
