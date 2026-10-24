import { useSyncExternalStore } from 'react';
import vi from './vi.json';

// Chữ giao diện tra theo khoá. Tiếng Việt nằm sẵn trong gói chính; tiếng Anh, tiếng Hàn tải khi cần.
// Khoá nào ngôn ngữ đang chọn chưa có (hoặc để trống) thì dùng chữ tiếng Việt.

export type Lang = 'vi' | 'en' | 'ko';
export type Key = keyof typeof vi;
export type Vars = Record<string, string | number>;
type Dict = Record<string, string>;

export const LANGS: readonly Lang[] = ['vi', 'en', 'ko'];
const STORE = 'sh-lang';
const VI: Dict = vi;
const dicts: Partial<Record<Lang, Dict>> = { vi: VI };
const loaders: Record<Exclude<Lang, 'vi'>, () => Promise<{ default: Dict }>> = {
  en: () => import('./en.json'),
  ko: () => import('./ko.json'),
};

export const isLang = (v: unknown): v is Lang => v === 'vi' || v === 'en' || v === 'ko';

function detect(): Lang {
  try { const s = localStorage.getItem(STORE); if (isLang(s)) return s; } catch {}
  const n = (typeof navigator !== 'undefined' ? navigator.language || '' : '').toLowerCase();
  if (!n) return 'vi';
  if (n.startsWith('vi')) return 'vi';
  if (n.startsWith('ko')) return 'ko';
  return 'en';
}

let lang: Lang = detect();
let dict: Dict = VI;
let version = 0;
/** Thứ tiếng của chữ đang hiện (ngôn ngữ chọn chưa có bản dịch thì là tiếng Việt). */
let shown: Lang = 'vi';
const listeners = new Set<() => void>();
const changes = new Set<(l: Lang) => void>();
const plurals = new Map<Lang, Intl.PluralRules>();

/** `<html lang>` theo thứ tiếng của chữ đang hiện: chưa có bản dịch nào thì vẫn là tiếng Việt. */
function apply() {
  dict = dicts[lang] ?? VI;
  version++;
  shown = Object.values(dict).some(Boolean) ? lang : 'vi';
  if (typeof document !== 'undefined') document.documentElement.lang = shown;
  listeners.forEach((f) => f());
}

async function load(l: Lang) {
  if (dicts[l] || l === 'vi') return;
  try { dicts[l] = (await loaders[l]()).default; } catch { /* mất mạng: dùng tiếng Việt */ }
}

/** Tra chữ theo khoá, thay `{biến}`. Có biến `n` là số thì thử khoá `khoá.one` / `khoá.other` trước (cho tiếng Anh). */
export function t(key: Key, vars?: Vars): string {
  let s: string | undefined;
  if (vars && typeof vars.n === 'number' && lang !== 'vi') {
    let p = plurals.get(lang);
    if (!p) { p = new Intl.PluralRules(lang); plurals.set(lang, p); }
    s = dict[`${key}.${p.select(vars.n)}`];
  }
  s = s || dict[key] || VI[key] || key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Có khoá này trong bảng tiếng Việt không (dùng cho mã lỗi máy chủ gửi về). */
export const hasKey = (key: string): key is Key => key in VI;

export const getLang = () => lang;
/** Locale để hiện ngày giờ, theo thứ tiếng của chữ đang hiện. */
export const locale = () => ({ vi: 'vi-VN', en: 'en-US', ko: 'ko-KR' })[shown];
const getVersion = () => version;

export function setLang(l: Lang) {
  if (!isLang(l)) return;
  try { localStorage.setItem(STORE, l); } catch {}
  const was = lang;
  lang = l;
  if (was !== l) changes.forEach((f) => f(l));
  if (dicts[l]) return apply();
  void load(l).then(() => { if (lang === l) apply(); });
}

export function onLang(f: () => void) {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

/** Người dùng đổi ngôn ngữ (không gọi lúc mở app). */
export function onLangChange(f: (l: Lang) => void) {
  changes.add(f);
  return () => { changes.delete(f); };
}

/** Ngôn ngữ hiện tại; đổi ngôn ngữ thì component dùng hook này vẽ lại (chỉ một lần mỗi lần đổi). */
export function useLang(): Lang {
  useSyncExternalStore(onLang, getVersion, getVersion);
  return lang;
}

export function useT() {
  return { t, lang: useLang() };
}

// Máy đang chọn tiếng Anh, tiếng Hàn thì tải bảng chữ ngay lúc mở app.
if (lang !== 'vi') void load(lang).then(apply);
else apply();

// Để thử nhanh trong console: __i18n.setLang('en').
if (typeof window !== 'undefined') (window as unknown as { __i18n: object }).__i18n = { setLang, getLang };
