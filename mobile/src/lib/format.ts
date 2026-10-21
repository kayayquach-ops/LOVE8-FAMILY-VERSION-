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

/** Giờ ở nơi người thân đang sống (Hàn Quốc nhanh hơn Việt Nam 2 tiếng). */
export function localTimeFor(country: string, ref = new Date()): string {
  const offsets: Record<string, number> = { VN: 7, KR: 9, JP: 9, TW: 8, US: -5 };
  const offset = offsets[country] ?? 7;
  const utc = ref.getTime() + ref.getTimezoneOffset() * 60000;
  const t = new Date(utc + offset * 3600000);
  return `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
}
