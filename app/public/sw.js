// Chỉ lo thông báo đẩy. Không giữ bản lưu nào của app, mọi tài nguyên vẫn tải thẳng từ máy chủ.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data ? e.data.text() : '' }; }
  const open = d.open || '';
  const call = d.kind === 'call';
  e.waitUntil(self.registration.showNotification(d.title || 'Nhà mình có tin mới', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || d.kind || 'homeletter',
    renotify: true,
    requireInteraction: call,
    vibrate: call ? [300, 150, 300, 150, 300] : [120],
    timestamp: Date.now(),
    data: { open, url: open ? `/?open=${encodeURIComponent(open)}` : '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const { open, url } = e.notification.data || {};
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (win) {
      await win.focus().catch(() => {});
      if (open) win.postMessage({ type: 'push-open', open });
      return;
    }
    await self.clients.openWindow(url || '/');
  })());
});
