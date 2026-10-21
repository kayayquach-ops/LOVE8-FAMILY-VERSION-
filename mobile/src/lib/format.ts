const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function relativeTime(iso: string, ref = new Date()): string {
  const diff = (ref.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days} ngày trước`;
  return shortDate(new Date(iso));
}

export function shortDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function longDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function weekday(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

/** Giờ phút theo đồng hồ máy, ví dụ 17:20. */
export function clock(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// Tên tháng âm lịch như trên tờ lịch bóc: tháng Giêng, tháng Một, tháng Chạp.
const LUNAR_MONTHS = ['Giêng', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười', 'Một', 'Chạp'];

export function lunarMonthName(month: number, leap?: boolean): string {
  return `tháng ${LUNAR_MONTHS[month - 1]}${leap ? ' nhuận' : ''}`;
}

export function duration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function inDaysLabel(n: number): string {
  if (n === 0) return 'Hôm nay';
  if (n === 1) return 'Ngày mai';
  return `Còn ${n} ngày`;
}

const OFFSETS: Record<string, number> = { VN: 7, KR: 9, JP: 9, TW: 8, US: -5 };

const pad = (n: number) => n.toString().padStart(2, '0');

/** Giờ ở nơi người thân đang sống (Hàn Quốc nhanh hơn Việt Nam 2 tiếng). */
export function localTimeFor(country: string, ref = new Date()): string {
  const t = new Date(ref.getTime() + (OFFSETS[country] ?? 7) * 3600_000);
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** 7 giờ sáng theo giờ nơi người nhận đang sống: lần tới (`next`) hoặc lần vừa qua (`last`). */
export function morningAt(country: string, which: 'next' | 'last' = 'next', hour = 7, ref = new Date()): Date {
  const off = (OFFSETS[country] ?? 7) * 3600_000;
  const local = new Date(ref.getTime() + off);
  let t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour) - off;
  if (which === 'next' && t <= ref.getTime()) t += 86400_000;
  if (which === 'last' && t > ref.getTime()) t -= 86400_000;
  return new Date(t);
}

/** Nhãn ngày cho dòng phân cách trong chat: Hôm nay, Hôm qua, hoặc thứ và ngày. */
export function dayLabel(iso: string, ref = new Date()): string {
  const d = new Date(iso);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  if (diff === -1) return 'Ngày mai';
  return `${WEEKDAYS[d.getDay()]}, ${shortDate(d)}`;
}
