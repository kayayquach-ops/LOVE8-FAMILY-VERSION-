import { useSyncExternalStore } from 'react';
import vi from './vi.json';

// Chữ giao diện tra theo khoá. Tiếng Việt nằm sẵn trong gói chính; tiếng Anh, tiếng Hàn tải khi cần.
// Khoá nào ngôn ngữ đang chọn chưa có (hoặc để trống) thì dùng chữ tiếng Việt.

export type Lang = 'vi' | 'en' | 'ko';
export type Key = keyof typeof vi;
export type Vars = Record<string, string | number>;
type Dict = Record<string, string>;

export const LANGS: readonly Lang[] = ['vi', 'en', 'ko'];
/** Tên mỗi thứ tiếng viết bằng chính nó (không dịch). */
export const LANG_NAMES: Record<Lang, string> = { vi: 'Tiếng Việt', en: 'English', ko: '한국어' };
const STORE = 'sh-lang';
const TOKEN = 'homeletter-token';
const VI: Dict = vi;
const dicts: Partial<Record<Lang, Dict>> = { vi: VI };
const loaders: Record<Exclude<Lang, 'vi'>, () => Promise<{ default: Dict }>> = {
  en: () => import('./en.json'),
  ko: () => import('./ko.json'),
};

export const isLang = (v: unknown): v is Lang => v === 'vi' || v === 'en' || v === 'ko';

function detect(): Lang {
  try {
    const s = localStorage.getItem(STORE);
    if (isLang(s)) return s;
    // Người đã vào nhà từ bản tiếng Việt cũ (có mã máy, chưa từng chọn ngôn ngữ): giữ tiếng Việt, không đổi bất ngờ theo máy.
    if (localStorage.getItem(TOKEN)) return 'vi';
  } catch {}
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
  if (lang === 'ko') void loadKoFonts();
  dict = dicts[lang] ?? VI;
  version++;
  shown = Object.values(dict).some(Boolean) ? lang : 'vi';
  if (typeof document !== 'undefined') document.documentElement.lang = shown;
  listeners.forEach((f) => f());
}

let koFonts: Promise<void> | undefined;
/** Phông Hàn (Noto Sans/Serif KR) chỉ tải khi dùng tiếng Hàn; CSS chia lát theo unicode-range nên chỉ lát có chữ mới tải. */
export function loadKoFonts() {
  koFonts ??= Promise.all([
    import('@fontsource/noto-sans-kr/400.css'), import('@fontsource/noto-sans-kr/500.css'), import('@fontsource/noto-sans-kr/700.css'),
    import('@fontsource/noto-serif-kr/700.css'),
  ]).then(() => {}).catch(() => { koFonts = undefined; });
  return koFonts;
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
/** Thứ tiếng của chữ đang hiện (ngôn ngữ chọn chưa có bản dịch thì là tiếng Việt). */
export const shownLang = () => shown;
/** Locale để hiện ngày giờ, theo thứ tiếng của chữ đang hiện. */
export const locale = () => ({ vi: 'vi-VN', en: 'en-US', ko: 'ko-KR' })[shown];
const getVersion = () => version;

// ---- Ngày giờ theo ngôn ngữ đang hiện ----
/** Ngày đầy đủ dạng số, ví dụ 12/3/2026 (vi), 3/12/2026 (en), 2026. 3. 12. (ko). */
export const fmtDate = (d: Date, o?: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale(), o);
/** Giờ:phút. */
export const fmtTime = (d: Date, tz?: string) => new Intl.DateTimeFormat(locale(), { hour: locale().startsWith('vi') ? '2-digit' : 'numeric', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }).format(d);
/** Ngày và tháng không có năm: 12/3 (vi), Mar 12 (en). */
export const fmtDayMonth = (day: number, month: number) => (shown === 'vi' ? `${day}/${month}` : new Date(2024, month - 1, day).toLocaleDateString(locale(), { month: 'short', day: 'numeric' }));
/** Tên tháng (m0 từ 0): vi chỉ hiện số tháng vì khoá `calendar.month` đã có chữ "Tháng". */
export const monthLabel = (m0: number) => (shown === 'vi' ? String(m0 + 1) : new Date(2024, m0, 1).toLocaleDateString(locale(), { month: 'long' }));
/** Tên các thứ tiếng của trình chép lời và giọng đọc của trình duyệt. */
export const speechLang = () => ({ vi: 'vi-VN', en: 'en-US', ko: 'ko-KR' })[shown];

/** Ghi nhớ ngôn ngữ đang dùng (kể cả khi nó là mặc định theo máy), để lần mở sau không bị coi là người cũ của bản tiếng Việt. */
export function rememberLang() {
  try { localStorage.setItem(STORE, lang); } catch {}
}

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
