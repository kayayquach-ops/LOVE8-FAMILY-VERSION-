// Hoãn lời mời gọi tuần. Tách khỏi Call.tsx để Trang chủ dùng được mà không phải tải cả màn gọi.
const SNOOZE = 'homeletter-call-snooze';
export const snoozed = () => { try { return Number(localStorage.getItem(SNOOZE) || 0) > Date.now(); } catch { return false; } };
/** "Để sau": ẩn lời mời gọi 1 ngày. */
export const snooze = () => { try { localStorage.setItem(SNOOZE, String(Date.now() + 24 * 3600e3)); } catch {} };
