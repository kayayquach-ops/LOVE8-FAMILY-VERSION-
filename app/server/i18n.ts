// Chữ phía máy chủ tra theo khoá: thông báo đẩy, câu hỏi soạn sẵn, tiêu đề tự sinh, lời báo lỗi.
// Bảng riêng của máy chủ ở server/i18n/<lang>.json; khoá không có ở đó thì tra tiếp bảng chữ của máy khách
// (src/i18n/<lang>.json, ví dụ lời cố định của cuộc gọi `call.line.*`), để mỗi câu chỉ nằm ở một chỗ.
// Thiếu khoá ở ngôn ngữ được hỏi (hoặc để trống) thì dùng tiếng Việt.
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
  const s = server[l][key] || client[l][key] || server.vi[key] || client.vi[key] || key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Tiếng Việt: dùng ở mọi chỗ máy chủ chưa biết người nhận nói tiếng gì (đợt này là tất cả). */
export const tVi = (key: string, vars?: Record<string, string | number>) => tServer('vi', key, vars);

/** Thân trả lỗi: mã ổn định để máy khách tra bảng, kèm câu tiếng Việt cho bản app cũ. */
export const errorBody = (code: string, lang?: Lang | null) => ({ error: tServer(lang, `error.${code}`), code });
