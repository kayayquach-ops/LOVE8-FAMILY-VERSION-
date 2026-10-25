// Chữ phía máy chủ tra theo khoá: thông báo đẩy, câu hỏi soạn sẵn, tiêu đề tự sinh, lời báo lỗi.
// Bảng riêng của máy chủ ở server/i18n/<lang>.json; khoá không có ở đó thì tra tiếp bảng chữ của máy khách
// (src/i18n/<lang>.json, ví dụ lời cố định của cuộc gọi `call.line.*`), để mỗi câu chỉ nằm ở một chỗ.
// Thiếu khoá ở ngôn ngữ được hỏi (hoặc để trống) thì dùng tiếng Việt.
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';

export type Lang = 'vi' | 'en' | 'ko';
export const LANGS: readonly Lang[] = ['vi', 'en', 'ko'];
export const isLang = (v: unknown): v is Lang => v === 'vi' || v === 'en' || v === 'ko';
type Dict = Record<string, string>;

const load = (rel: string): Dict => {
  try { return JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')); } catch { return {}; }
};
const server: Record<Lang, Dict> = { vi: load('./i18n/vi.json'), en: load('./i18n/en.json'), ko: load('./i18n/ko.json') };
const client: Record<Lang, Dict> = { vi: load('../src/i18n/vi.json'), en: load('../src/i18n/en.json'), ko: load('../src/i18n/ko.json') };

/** Ngôn ngữ lưu ở members.lang; chưa có (người dùng cũ) là tiếng Việt. */
export const langOf = (v: unknown): Lang => (isLang(v) ? v : 'vi');

export function tServer(lang: Lang | null | undefined, key: string, vars?: Record<string, string | number>): string {
  const l = langOf(lang);
  let s: string | undefined;
  // Số nhiều (tiếng Anh): có biến n là số thì thử khoá `khoá.one` / `khoá.other` trước, giống máy khách.
  if (vars && typeof vars.n === 'number' && l !== 'vi') {
    const form = new Intl.PluralRules(l).select(vars.n);
    s = server[l][`${key}.${form}`] || client[l][`${key}.${form}`];
  }
  s = s || server[l][key] || client[l][key] || server.vi[key] || client.vi[key] || key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Tiếng Việt: dùng khi chữ không thuộc về ai (nhãn nội bộ), hoặc ở chỗ chưa biết người nhận. */
export const tVi = (key: string, vars?: Record<string, string | number>) => tServer('vi', key, vars);

// Ngôn ngữ của yêu cầu đang xử lý: header x-lang máy khách gửi, không có thì members.lang của người gọi (adoptLang ở auth),
// không có nữa thì Accept-Language, cuối cùng là tiếng Việt. Dùng được ở mọi chỗ sau await nhờ AsyncLocalStorage.
const als = new AsyncLocalStorage<{ lang: Lang; fixed: boolean }>();
const fromHeader = (v: unknown): Lang | null => {
  const s = String(Array.isArray(v) ? v[0] : v ?? '').trim().toLowerCase().slice(0, 2);
  return isLang(s) ? s : null;
};

export function langMiddleware(req: { headers: Record<string, unknown> }, _res: unknown, next: () => void) {
  const x = fromHeader(req.headers['x-lang']);
  als.run({ lang: x ?? fromHeader(req.headers['accept-language']) ?? 'vi', fixed: !!x }, next);
}

/** Auth gọi sau khi biết members.lang của người gọi: dùng nó khi máy khách không gửi x-lang. */
export function adoptLang(memberLang: unknown) {
  const st = als.getStore();
  if (st && !st.fixed && isLang(memberLang)) st.lang = memberLang;
  else if (st && !st.fixed) st.lang = 'vi';
}

/** Chạy việc nền (ghép podcast, dựng video) với một ngôn ngữ cố định. */
export const runWithLang = <T>(lang: Lang | null | undefined, fn: () => T): T => als.run({ lang: langOf(lang), fixed: true }, fn);

export const reqLang = (): Lang => als.getStore()?.lang ?? 'vi';
/** Tra chữ theo ngôn ngữ của yêu cầu đang xử lý. */
export const tReq = (key: string, vars?: Record<string, string | number>) => tServer(reqLang(), key, vars);

/** Thân trả lỗi: `code` ổn định để máy khách tra bảng, `error` là câu đúng thứ tiếng của yêu cầu (bản app cũ chỉ đọc `error`). */
export const errorBody = (code: string, lang?: Lang | null) => {
  const message = tServer(lang ?? reqLang(), `error.${code}`);
  return { error: message, message, code };
};
