import { token } from './api';
import { t } from './i18n';

// Thông báo đẩy ở máy khách: đăng ký service worker, xin quyền, gửi đăng ký lên máy chủ.
export type PushKind = 'call' | 'chat' | 'post' | 'calendar' | 'weekly';
export type PushPrefs = Record<PushKind, boolean>;
export type PushState = 'on' | 'off' | 'denied' | 'ios-browser' | 'unsupported';

const headers = (): HeadersInit => ({ 'content-type': 'application/json', authorization: `Bearer ${token.get() ?? ''}` });
const post = (path: string, body: unknown) => fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body) });

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
const standalone = () => (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

function keyBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function pushState(): Promise<PushState> {
  // Trên iPhone, Safari thường không nhận thông báo; phải mở từ biểu tượng ở Màn hình chính (iOS 16.4 trở lên).
  if (isIOS() && !standalone()) return 'ios-browser';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Gọi ngay trong lúc người dùng chạm nút (Safari đòi cử chỉ chạm để xin quyền). */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  await registration();
  const reg = await navigator.serviceWorker.ready;
  const { key } = await fetch('/api/push/key', { headers: headers() }).then((r) => r.json());
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const res = await post('/api/push/subscribe', sub.toJSON());
  if (!res.ok) throw new Error(t('notify.failed'));
  return 'on';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Mỗi lần mở app: nếu máy đã bật thì gửi lại đăng ký, phòng khi trình duyệt đổi địa chỉ nhận. */
export async function syncPush() {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await post('/api/push/subscribe', sub.toJSON());
  } catch {}
}

export const getPrefs = (): Promise<PushPrefs> => fetch('/api/push/prefs', { headers: headers() }).then((r) => r.json());
export const setPrefs = (p: Partial<PushPrefs>): Promise<PushPrefs> =>
  fetch('/api/push/prefs', { method: 'PUT', headers: headers(), body: JSON.stringify(p) }).then((r) => r.json());

/** Chạm vào thông báo: service worker gửi tin nhắn, hoặc app mở mới với ?open=. */
export function onPushOpen(cb: (open: string) => void) {
  const q = new URLSearchParams(location.search).get('open');
  if (q) {
    const u = new URL(location.href);
    u.searchParams.delete('open');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    setTimeout(() => cb(q), 0);
  }
  if (!('serviceWorker' in navigator)) return () => {};
  const onMsg = (e: MessageEvent) => { if (e.data?.type === 'push-open' && e.data.open) cb(String(e.data.open)); };
  navigator.serviceWorker.addEventListener('message', onMsg);
  return () => navigator.serviceWorker.removeEventListener('message', onMsg);
}
