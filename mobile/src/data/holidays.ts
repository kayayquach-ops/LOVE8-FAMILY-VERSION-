import type { FamilyEvent } from './types';

// Ngày lễ trong năm, mỗi ngày kèm một việc nhỏ để cả nhà gần nhau hơn.
// Bản đầu dành cho gia đình Việt (thêm vài ngày của Hàn Quốc). Mỗi văn hoá sẽ có bộ ngày lễ riêng.
const h = (
  id: string, title: string, calendar: 'lunar' | 'solar', day: number, month: number, idea: string,
): FamilyEvent => ({ id: `h-${id}`, title, kind: 'holiday', calendar, day, month, idea, remindDaysBefore: 3 });

export const HOLIDAYS: FamilyEvent[] = [
  h('nam-moi', 'Tết Dương lịch', 'solar', 1, 1, 'Mỗi người gửi một tấm ảnh đầu năm vào Nhà.'),
  h('tet', 'Tết Nguyên Đán (Seollal)', 'lunar', 1, 1, 'Homeletter làm video "Năm nay nhà mình" để cả nhà xem cùng nhau.'),
  h('ram-gieng', 'Rằm tháng Giêng', 'lunar', 15, 1, 'Gửi ảnh mâm cúng rằm cho người ở xa.'),
  h('8-3', 'Quốc tế Phụ nữ', 'solar', 8, 3, 'Gửi mẹ và bà một lời chào buổi sáng.'),
  h('gio-to', 'Giỗ Tổ Hùng Vương', 'lunar', 10, 3, 'Hỏi ông bà về dòng họ nhà mình.'),
  h('30-4', 'Ngày Giải phóng miền Nam', 'solar', 30, 4, 'Kỳ nghỉ dài: hẹn một cuộc gọi video cả nhà.'),
  h('1-5', 'Quốc tế Lao động', 'solar', 1, 5, 'Hỏi bố mẹ về công việc đầu tiên trong đời.'),
  h('cha-me-han', 'Ngày Cha Mẹ (Hàn Quốc)', 'solar', 8, 5, 'Ghi âm lời cảm ơn bố mẹ, hẹn phát sáng hôm ấy.'),
  h('doan-ngo', 'Tết Đoan Ngọ', 'lunar', 5, 5, 'Gửi ảnh bát rượu nếp, hoa quả đầu mùa.'),
  h('gia-dinh', 'Ngày Gia đình Việt Nam', 'solar', 28, 6, 'Cả nhà gọi video và cùng xem lại video của năm.'),
  h('vu-lan', 'Lễ Vu Lan', 'lunar', 15, 7, 'Ghi âm lời cảm ơn bố mẹ, hẹn phát đúng sáng ngày Vu Lan.'),
  h('trung-thu', 'Tết Trung thu (Chuseok)', 'lunar', 15, 8, 'Gửi ảnh mâm cỗ trông trăng của mỗi nhà.'),
  h('2-9', 'Quốc khánh', 'solar', 2, 9, 'Kỳ nghỉ: hẹn một cuộc gọi video cả nhà.'),
  h('20-10', 'Ngày Phụ nữ Việt Nam', 'solar', 20, 10, 'Nhờ Homeletter hỏi mẹ điều mẹ tự hào nhất.'),
  h('20-11', 'Ngày Nhà giáo Việt Nam', 'solar', 20, 11, 'Hỏi bố mẹ về người thầy đáng nhớ nhất.'),
  h('ong-tao', 'Ông Công Ông Táo', 'lunar', 23, 12, 'Gửi ảnh Tết xưa để Homeletter làm video đón Tết.'),
];
