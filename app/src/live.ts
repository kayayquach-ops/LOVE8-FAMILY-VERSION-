import { errorText, token } from './api';

// Kênh sự kiện gọi video, mở một lần cho cả app: chuông gọi đến và các gói tin kết nối đi chung một đường.
// audio: cuộc gọi thoại (không camera).
export type LiveRoom = { id: string; by: string; to?: string | null; audio?: boolean; members: string[]; started: number } | null;
export type LiveMsg =
  | { type: 'hello' | 'room'; room: LiveRoom }
  | { type: 'declined'; from: string }
  | { type: 'signal'; from: string; data: any };

const subs = new Set<(m: LiveMsg) => void>();
let es: EventSource | null = null;

let retry = 0;
// Lần cuối nghe được gì từ máy chủ (tin, hoặc nhịp tim 20 giây một lần) và số lần đã mở kênh (FaceTime.tsx ghi vào chẩn đoán cuộc gọi).
let seen = 0;
let opens = 0;

export function connectLive() {
  if (es || !token.get()) return;
  try {
    const src = new EventSource(`/api/live/stream?token=${encodeURIComponent(token.get() ?? '')}`);
    es = src;
    seen = Date.now();
    // Đếm cả lần trình duyệt tự nối lại sau khi rớt (retry: 2000 của máy chủ).
    src.onopen = () => { seen = Date.now(); opens++; };
    src.addEventListener('ping', () => { seen = Date.now(); });
    src.onmessage = (e) => {
      seen = Date.now();
      let m: LiveMsg;
      try { m = JSON.parse(e.data); } catch { return; }
      for (const f of subs) f(m);
    };
    // iPhone cắt kênh khi app xuống nền; kênh đóng hẳn thì mở lại, để chuông gọi đến không bị mất.
    src.onerror = () => {
      if (src.readyState !== EventSource.CLOSED) return;
      if (es === src) es = null;
      clearTimeout(retry);
      retry = window.setTimeout(connectLive, 1500);
    };
  } catch { es = null; }
}

/** Kênh im quá lâu dù máy chủ gửi nhịp tim 20 giây một lần: kênh đã chết mà trình duyệt chưa biết (iPhone vừa ra khỏi nền, đổi Wi-Fi sang 4G).
 * Gói tin gửi vào kênh chết là mất, nên đóng và mở kênh mới; máy chủ gửi lại "hello" kèm phòng hiện tại. */
function reopenIfQuiet(maxQuiet: number) {
  if (!es || Date.now() - seen < maxQuiet) return;
  es.close();
  es = null;
  connectLive();
}

if (typeof document !== 'undefined') {
  // Quay lại app: kênh chết, hoặc im lâu hơn một nhịp tim, thì mở lại ngay.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!es || es.readyState === EventSource.CLOSED) { es = null; connectLive(); } else reopenIfQuiet(30_000);
  });
  setInterval(() => { if (!document.hidden) reopenIfQuiet(50_000); }, 10_000);
}

export function disconnectLive() { es?.close(); es = null; }

let reopenedAt = 0;
/** Gọi video gửi đi mà mãi không thấy hồi âm: có thể kênh đã chết mà chưa im đủ lâu để tự phát hiện. Mở kênh mới, tối đa 30 giây một lần. */
export function reopenLive() {
  if (!token.get() || Date.now() - reopenedAt < 30_000) return;
  reopenedAt = Date.now();
  es?.close();
  es = null;
  connectLive();
}

/** Số lần kênh đã mở được từ lúc mở app (lần đầu cũng tính). */
export const liveStats = () => ({ opens });

export function onLive(f: (m: LiveMsg) => void) {
  subs.add(f);
  return () => { subs.delete(f); };
}

/** keepalive: gửi được cả lúc trang đang đóng (chẩn đoán cuộc gọi lúc gác máy). */
export async function livePost<T = any>(path: string, body?: unknown, opts?: { keepalive?: boolean }): Promise<T> {
  const res = await fetch(`/api/live/${path}`, {
    method: body === undefined && path === 'config' ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token.get() ?? ''}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive: opts?.keepalive,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}
