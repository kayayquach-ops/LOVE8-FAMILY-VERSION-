// Kiểm bảng chữ: node scripts/i18n-check.mjs (npm run i18n:check). Lỗi thì thoát mã 1.
// 1. Mọi khoá dùng trong mã có trong vi.json (máy khách hoặc máy chủ).
// 2. en.json, ko.json không có khoá thừa so với vi.json; biến {x} giống nhau giữa các thứ tiếng.
// 3. In số khoá en, ko còn thiếu (thiếu thì dùng tiếng Việt).
// 4. Không còn chữ tiếng Việt viết cứng trong mã, trừ chú thích, console, lỗi nội bộ máy chủ và các khối đánh dấu i18n-ok.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, VI as VI_CHARS } from './i18n-scan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const LANGS = ['vi', 'en', 'ko'];
const dict = {
  client: Object.fromEntries(LANGS.map((l) => [l, json(`src/i18n/${l}.json`)])),
  server: Object.fromEntries(LANGS.map((l) => [l, json(`server/i18n/${l}.json`)])),
};
const viKeys = new Set([...Object.keys(dict.client.vi), ...Object.keys(dict.server.vi)]);
const errors = [];
const warns = [];

// ---- Bảng chữ ----
for (const k of Object.keys(dict.client.vi)) if (k in dict.server.vi) errors.push(`khoá "${k}" nằm ở cả bảng máy khách lẫn máy chủ`);
// Biến chỉ là chữ xưng hô theo vai (self, Self, kids, call, other) thì tiếng Anh được bỏ hoặc thêm tuỳ câu; mọi biến khác ({name}, {n}...) phải khớp tiếng Việt.
const ROLE_VARS = new Set(['self', 'Self', 'kids', 'call', 'other']);
// Dạng số ít (.one) được bỏ {n} ("tomorrow", "1 day").
const vars = (s, one = false) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].filter((v) => !ROLE_VARS.has(v) && !(one && v === 'n')).sort().join(',');
// Tên riêng được giữ nguyên trong bản dịch (chứa chữ có dấu tiếng Việt).
const PROPER = ['Mây'];
const stripProper = (s) => PROPER.reduce((x, p) => x.split(p).join(''), String(s));
const missing = {};
for (const side of ['client', 'server']) {
  for (const l of ['en', 'ko']) {
    const d = dict[side][l];
    for (const [k, v] of Object.entries(d)) {
      const base = k.replace(/\.(zero|one|two|few|many|other)$/, '');
      if (!(k in dict[side].vi) && !(base in dict[side].vi)) { errors.push(`${side}/${l}.json: khoá thừa "${k}"`); continue; }
      if (VI_CHARS.test(stripProper(v))) errors.push(`${side}/${l}.json: "${k}" còn chữ có dấu tiếng Việt: ${v.slice(0, 60)}`);
      if (v && vars(v, k.endsWith('.one') && !(k in dict[side].vi)) !== vars(dict[side].vi[k] ?? dict[side].vi[base], k.endsWith('.one') && !(k in dict[side].vi))) errors.push(`${side}/${l}.json: biến trong "${k}" khác tiếng Việt (${vars(v) || 'không có'} / ${vars(dict[side].vi[k] ?? dict[side].vi[base]) || 'không có'})`);
    }
    missing[`${side}/${l}`] = Object.keys(dict[side].vi).filter((k) => !d[k]);
  }
  for (const [k, v] of Object.entries(dict[side].vi)) if (!v) errors.push(`${side}/vi.json: khoá "${k}" để trống`);
}

// ---- Khoá dùng trong mã ----
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${f.name}`;
    if (f.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f.name) && !/\.test\.ts$/.test(f.name)) files.push(p);
  }
};
walk('src'); walk('server');

const used = new Set();
const patterns = [];
const toRe = (tpl) => new RegExp(`^${tpl.replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$\{[^}]*\}/g, '[^]+')}$`);
for (const f of files) {
  const src = read(f);
  // Đối số đầu của t(...), tVi(...), tServer(lang, ...): chuỗi 'a.b', hoặc `a.${x}` (khớp theo mẫu), kể cả cond ? 'a' : 'b'.
  for (const m of src.matchAll(/(?<![\w.])(?:t|tVi)\(|(?<![\w.])tServer\([^,()]+,/g)) {
    let k = m.index + m[0].length, depth = 1, arg = '', quote = '';
    while (k < src.length && depth) {
      const ch = src[k++];
      if (quote) { if (ch === quote) quote = ''; arg += ch; continue; }
      if (ch === "'" || ch === '`') quote = ch;
      else if (ch === '(' || ch === '{') depth++;
      else if (ch === ')' || ch === '}') depth--;
      if (depth === 1 && ch === ',') break;
      if (depth) arg += ch;
    }
    for (const q of arg.matchAll(/'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g)) used.add(q[1]);
    for (const q of arg.matchAll(/`([^`]*)`/g)) {
      const tpl = q[1].replace(/\$\{(?:[^{}]|\{[^}]*\})*\}/g, '${x}');
      if (!/^[a-zA-Z][\w.${}-]*$/.test(tpl)) continue;
      if (tpl.includes('${')) patterns.push({ f, tpl, re: toRe(tpl) }); else used.add(tpl);
    }
  }
  for (const m of src.matchAll(/errorBody\('([\w-]+)'/g)) used.add(`error.${m[1]}`);
  // Khoá truyền gián tiếp (mảng khoá, hàm tra truyền vào như tr(...) ở shared.ts): chuỗi nào trùng khoá có sẵn thì tính là đã dùng.
  for (const q of src.matchAll(/'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g)) if (viKeys.has(q[1])) used.add(q[1]);
  for (const q of src.matchAll(/`([a-zA-Z][\w-]*\.[\w.-]*\$\{[^`]*)`/g)) {
    const tpl = q[1].replace(/\$\{(?:[^{}]|\{[^}]*\})*\}/g, '${x}');
    if (/^[a-zA-Z][\w.${}-]*$/.test(tpl)) { const re = toRe(tpl); if ([...viKeys].some((k) => re.test(k))) patterns.push({ f, tpl, re }); }
  }
  // Hàm câu theo vai ở Onboarding: R('kid.q') là onboarding.kid.q.parent và .child.
  if (f.endsWith('Onboarding.tsx')) for (const m of src.matchAll(/\bR\('([\w.]+)'\)/g)) { used.add(`onboarding.${m[1]}.parent`); used.add(`onboarding.${m[1]}.child`); }
  // Câu hỏi soạn sẵn ở call.ts: S('k') thuộc callScript.first|template.parent|child.k, ít nhất một bản.
  if (f.endsWith('call.ts')) for (const m of src.matchAll(/\bS\('(\w+)'\)/g)) patterns.push({ f, tpl: `callScript.*.${m[1]}`, re: new RegExp(`^callScript\\.(first|template)\\.(parent|child)\\.${m[1]}$`) });
}
for (const k of used) if (!viKeys.has(k)) errors.push(`khoá "${k}" dùng trong mã nhưng không có trong vi.json`);
for (const p of patterns) if (![...viKeys].some((k) => p.re.test(k))) errors.push(`${p.f}: khoá dạng \`${p.tpl}\` không khớp khoá nào trong vi.json`);
const unused = [...viKeys].filter((k) => !used.has(k) && !patterns.some((p) => p.re.test(k)));

// ---- Chữ tiếng Việt còn viết cứng ----
const leftovers = [];
for (const f of files) {
  if (f.includes('/i18n/')) continue;
  const lines = read(f).split('\n');
  const skip = new Set();
  let off = false;
  lines.forEach((l, n) => {
    if (/i18n-ok-begin/.test(l)) off = true;
    if (off || /i18n-ok\b/.test(l) || /i18n-ok\b/.test(lines[n - 1] ?? '') || /console\.(log|warn|error)/.test(l)) skip.add(n + 1);
    if (f.startsWith('server/') && /new Error\(/.test(l)) skip.add(n + 1);
    if (/i18n-ok-end/.test(l)) off = false;
  });
  for (const u of scan(read(f))) if (!skip.has(u.line)) leftovers.push(`${f}:${u.line}  ${u.text.slice(0, 90)}`);
}

// ---- Báo cáo ----
console.log(`Khoá: máy khách ${Object.keys(dict.client.vi).length}, máy chủ ${Object.keys(dict.server.vi).length}, tổng ${viKeys.size}.`);
for (const [k, list] of Object.entries(missing)) if (k.endsWith('/ko') && list.length) errors.push(`${k}: thiếu ${list.length} khoá (${list.slice(0, 5).join(', ')})`);
for (const [k, list] of Object.entries(missing)) console.log(`Thiếu ${k}: ${list.length}${list.length ? ` (ví dụ ${list.slice(0, 3).join(', ')})` : ''}`);
if (unused.length) warns.push(`khoá chưa thấy dùng (${unused.length}): ${unused.join(', ')}`);
for (const l of leftovers) errors.push(`chữ tiếng Việt viết cứng: ${l}`);
for (const w of warns) console.log(`Chú ý: ${w}`);
if (errors.length) {
  for (const e of errors) console.log(`LỖI: ${e}`);
  console.log(`${errors.length} lỗi.`);
  process.exit(1);
}
console.log('Sạch.');
