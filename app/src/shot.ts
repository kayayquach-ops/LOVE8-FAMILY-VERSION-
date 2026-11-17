// Chụp chung dù ở xa: phần tính toán thuần (không React, không chữ giao diện) để chạy thử được bằng node --test.
// Thiết kế: app/docs/chup-chung.md.
import { nextOccurrence, type Solar } from './lunar';
import type { Shot } from './shared';

/** Một ảnh ghép tối đa 4 người (docs/chup-chung.md), nên ngoài mình ra chọn được tối đa 3 người. */
export const SHOT_MAX_OTHERS = 3;

/** Ghế trên khung ngắm (toạ độ theo viewBox 330 x 440 của khung 3:4): tâm và bán kính đầu. */
export type Seat = { cx: number; cy: number; r: number };
/** Khung mặt của mình, luôn ở giữa. */
export const FACE = { cx: 165, cy: 196, rx: 74, ry: 92 } as const;

/** Ghế cho 1 đến 3 người kia: 1 người ngồi bên phải, 2 người hai bên, 3 người thì thêm một ghế nhỏ hàng sau bên trái. */
export function seatLayout(n: number): Seat[] {
  if (n <= 0) return [];
  if (n === 1) return [{ cx: 286, cy: 214, r: 28 }];
  if (n === 2) return [{ cx: 44, cy: 214, r: 28 }, { cx: 286, cy: 214, r: 28 }];
  return [{ cx: 40, cy: 228, r: 25 }, { cx: 290, cy: 228, r: 25 }, { cx: 64, cy: 112, r: 20 }];
}

/** Vai của một ghế (nét vẽ dưới đầu), theo mockup ghế r = 28. Trả về đường SVG và đáy vai. */
export function shoulders({ cx, cy, r }: Seat) {
  const k = r / 28;
  const x = (d: number) => +(cx + d * k).toFixed(1);
  const y = (d: number) => +(cy + d * k).toFixed(1);
  return {
    d: `M${x(-36)} ${y(116)} C ${x(-32)} ${y(68)}, ${x(-18)} ${y(48)}, ${x(0)} ${y(48)} C ${x(18)} ${y(48)}, ${x(32)} ${y(68)}, ${x(36)} ${y(116)}`,
    left: x(-36), right: x(36), top: y(48), bottom: y(116),
  };
}

/** Cỡ chữ tên trong ghế: tên dài thì nhỏ lại cho vừa (Patrick Hand rộng chừng 0,45em mỗi chữ). */
export function seatFont(name: string, r: number) {
  const len = Math.max(1, [...name].length);
  return Math.round(Math.max(12, Math.min(0.75 * r, (2.4 * r) / (0.45 * len))));
}

/** Tên ngắn: tên đầy đủ ba chữ trở lên (Nguyễn Văn An) thì lấy chữ cuối; "Mẹ Lan", "Bố" giữ nguyên. */
export const shortName = (n: string) => { const w = n.trim().split(/\s+/); return w.length > 2 ? w[w.length - 1] : n.trim(); };

/** Dịp sắp tới theo lịch âm: Tết (1/1 âm), Trung thu hoặc Chuseok (15/8 âm), chỉ khi còn dưới `within` ngày.
 * Hai dịp 15/8 cùng ngày: người đang ở Hàn (korea) thì gợi ý Chuseok, còn lại là Trung thu. */
export function upcomingOccasion(today: Solar, korea = false, within = 90): { occasion: 'tet' | 'trung-thu' | 'chuseok'; days: number } | null {
  const t0 = Date.UTC(today.year, today.month - 1, today.day);
  const opts = [
    { occasion: 'tet' as const, day: 1, month: 1 },
    { occasion: korea ? 'chuseok' as const : 'trung-thu' as const, day: 15, month: 8 },
  ];
  let best: { occasion: 'tet' | 'trung-thu' | 'chuseok'; days: number } | null = null;
  for (const o of opts) {
    const s = nextOccurrence({ day: o.day, month: o.month, lunar: true }, today);
    if (!s) continue;
    const days = Math.round((Date.UTC(s.year, s.month - 1, s.day) - t0) / 864e5);
    if (days >= 0 && days < within && (!best || days < best.days)) best = { occasion: o.occasion, days };
  }
  return best;
}

/** Hôm nay theo giờ máy. */
export function todaySolar(d = new Date()): Solar {
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

export const partOf = (s: Shot, memberId: string) => s.parts.find((p) => p.memberId === memberId);
/** Lời rủ cho mình: lượt đang chờ mà mình có tên nhưng chưa chụp. */
export const isInviteFor = (s: Shot, memberId: string) => s.status === 'waiting' && !!partOf(s, memberId) && !partOf(s, memberId)!.media;
/** Lượt mình đã chụp và còn dở: đang chờ, đang rửa, hoặc rửa xong mà chưa gửi vào nhà. */
export const isPendingFor = (s: Shot, memberId: string) =>
  !!partOf(s, memberId)?.media && (s.status === 'waiting' || s.status === 'developing' || (s.status === 'done' && !s.postId));

/** Id lượt chụp trong thông báo đẩy: "shot:<id>", "shot=<id>", "shot/<id>" hoặc đường dẫn có "?shot=<id>". */
export function shotIdFrom(open: string): string | null {
  const m = /(?:^|[?&])shot[:=/]([\w-]+)/.exec(open);
  return m ? m[1] : null;
}
