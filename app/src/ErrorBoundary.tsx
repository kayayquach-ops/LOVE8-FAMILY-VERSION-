import { Component, type ReactNode } from 'react';
import { t } from './i18n';

// PWA nằm trong máy nhiều ngày; giữa chừng có bản mới thì tên tệp JS của các màn tải sau (Thư, Cài đặt, Podcast...) không còn,
// mở màn đó là lỗi. Gặp lỗi tải tệp thì tự tải lại trang một lần; lỗi khác thì hiện màn nhỏ có nút mở lại thay vì màn trắng.

const KEY = 'sh-reload-at';
let reloading = false;

/** Tải lại trang, nhưng không quá một lần trong 30 giây (tránh vòng lặp khi máy chủ hỏng thật). Mất mạng thì không tải lại. */
function reloadOnce() {
  if (reloading) return true;
  if (navigator.onLine === false) return false;
  try {
    if (Date.now() - (Number(sessionStorage.getItem(KEY)) || 0) < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; }
  reloading = true;
  location.reload();
  return true;
}

const chunkError = (e: unknown) => /dynamically imported module|module script failed|Unable to preload|error loading dynamically|MIME type/i.test(String((e as Error)?.message ?? e));

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => { if (reloadOnce()) e.preventDefault(); });
}

/** Mở lại sạch: bỏ bản lưu dữ liệu (cache.ts) phòng khi chính bản lưu cũ sai hình dạng làm màn vẽ lỗi. */
function restart() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('hl-c:')) localStorage.removeItem(k); } catch {}
  location.reload();
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error(error);
    if (chunkError(error)) reloadOnce();
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (reloading) return null;
    return (
      <div className="screen"><div className="center" style={{ alignItems: 'center', textAlign: 'center', gap: 18 }}>
        <div className="h1">{t('app.crash.title')}</div>
        <div className="muted">{t('app.crash.body')}</div>
        <button className="btn" style={{ maxWidth: 260 }} onClick={restart}>{t('app.crash.reload')}</button>
      </div></div>
    );
  }
}
