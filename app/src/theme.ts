import { useSyncExternalStore } from 'react';

// Giao diện sáng / tối. Chọn "auto" thì theo máy. Lưu trong máy (localStorage), áp bằng data-theme trên <html>.
// index.html có đoạn script nhỏ làm đúng việc này trước khi vẽ lần đầu (không bị nháy trắng); file này giữ cho khớp.
export type ThemeMode = 'auto' | 'light' | 'dark';
export const THEME_MODES: readonly ThemeMode[] = ['auto', 'light', 'dark'];
const STORE = 'sh-theme';
const BAR = { light: '#FBFBF8', dark: '#121116' };

const listeners = new Set<() => void>();
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORE);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* bị chặn thì theo máy */ }
  return 'auto';
}

function apply() {
  const mode = getThemeMode();
  const dark = mode === 'dark' || (mode === 'auto' && !!media?.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? BAR.dark : BAR.light));
  listeners.forEach((f) => f());
}

export function setThemeMode(mode: ThemeMode) {
  try { if (mode === 'auto') localStorage.removeItem(STORE); else localStorage.setItem(STORE, mode); } catch { /* không lưu được thì chỉ áp lần này */ }
  apply();
}

export function initTheme() {
  apply();
  media?.addEventListener?.('change', () => { if (getThemeMode() === 'auto') apply(); });
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getThemeMode, () => 'auto');
}
