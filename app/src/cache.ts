import { token } from './api';

// Bản lưu lần trước của từng màn (tin nhà, trang chủ, chat, lịch, lọ): mở màn là hiện ngay, máy chủ trả lời thì thay bản mới.
// Giữ trong bộ nhớ cho lần mở sau trong phiên, và trong localStorage cho lần mở app sau. Khoá theo mã máy để đổi nhà không thấy tin nhà cũ.
const mem = new Map<string, unknown>();
const keyOf = (k: string) => `hl-c:${(token.get() ?? '').slice(0, 10)}:${k}`;

export function cached<T>(k: string): T | null {
  const key = keyOf(k);
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as T;
    mem.set(key, v);
    return v;
  } catch { return null; }
}

export function remember<T>(k: string, v: T) {
  const key = keyOf(k);
  mem.set(key, v);
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

/** Giữ nguyên đối tượng cũ khi nội dung không đổi, để React.memo bỏ qua phần không đổi (một tin đổi thì chỉ vẽ lại tin đó). */
export function reuse<T extends { id: string }>(prev: T[] | null, next: T[]): T[] {
  if (!prev) return next;
  const old = new Map(prev.map((x) => [x.id, x]));
  let same = prev.length === next.length;
  const out = next.map((x, i) => {
    const o = old.get(x.id);
    const keep = o && JSON.stringify(o) === JSON.stringify(x) ? o : x;
    if (keep !== prev[i]) same = false;
    return keep;
  });
  return same ? prev : out;
}
