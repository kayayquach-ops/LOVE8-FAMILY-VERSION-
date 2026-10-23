import { token } from './api';

// Kênh sự kiện gọi video, mở một lần cho cả app: chuông gọi đến và các gói tin kết nối đi chung một đường.
export type LiveRoom = { id: string; by: string; members: string[]; started: number } | null;
export type LiveMsg =
  | { type: 'hello' | 'room'; room: LiveRoom }
  | { type: 'declined'; from: string }
  | { type: 'signal'; from: string; data: any };

const subs = new Set<(m: LiveMsg) => void>();
let es: EventSource | null = null;

export function connectLive() {
  if (es || !token.get()) return;
  try {
    es = new EventSource(`/api/live/stream?token=${encodeURIComponent(token.get() ?? '')}`);
    es.onmessage = (e) => {
      let m: LiveMsg;
      try { m = JSON.parse(e.data); } catch { return; }
      for (const f of subs) f(m);
    };
  } catch { es = null; }
}

export function disconnectLive() { es?.close(); es = null; }

export function onLive(f: (m: LiveMsg) => void) {
  subs.add(f);
  return () => { subs.delete(f); };
}

export async function livePost<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/live/${path}`, {
    method: body === undefined && path === 'config' ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token.get() ?? ''}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi, thử lại nhé');
  return data as T;
}
