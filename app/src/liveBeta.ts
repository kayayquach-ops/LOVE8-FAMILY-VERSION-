// Công tắc ẩn "Thử Mây mới" (Mây Live): máy này đã được mở cho thấy công tắc chưa (cờ mayLiveBeta trong máy).
// Hai cách mở: link có ?thu-may-moi (App.tsx), hoặc chạm năm lần vào tiêu đề "Bạn nhỏ của nhà" trong Cài đặt trong 3 giây (Settings.tsx).
// Cách chạm là cho app trên Màn hình chính iPhone: link luôn mở ở Safari, mà Safari giữ dữ liệu riêng với app. Kiểm bằng src/liveBeta.test.ts.

const KEY = 'mayLiveBeta';
export const liveBeta = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setLiveBeta = () => { try { localStorage.setItem(KEY, '1'); } catch {} };

export const REVEAL_TAPS = 5;
export const REVEAL_MS = 3000;

/** Một lần chạm lúc now: giữ các lần chạm trong REVEAL_MS gần nhất; đủ REVEAL_TAPS thì hit và đếm lại từ đầu. */
export function revealTap(prev: number[], now: number): { taps: number[]; hit: boolean } {
  const taps = [...prev.filter((x) => now - x < REVEAL_MS), now];
  return taps.length >= REVEAL_TAPS ? { taps: [], hit: true } : { taps, hit: false };
}
