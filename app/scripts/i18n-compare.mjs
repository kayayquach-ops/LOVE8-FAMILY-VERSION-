// So chữ tiếng Việt trước và sau khi chuyển sang bảng chữ: node scripts/i18n-compare.mjs [commit gốc, mặc định dafe118].
// Trước: mọi mẩu chữ có dấu trong mã ở commit gốc. Sau: giá trị trong vi.json (máy khách, máy chủ) cộng chữ còn để lại trong mã.
// Hai bên cắt thành đoạn ở chỗ biến ({} hoặc {tên}) rồi so: đoạn nào của bản cũ không còn là "mất hoặc đổi", đoạn mới là "thừa".
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fragments, scan } from './i18n-scan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'dafe118';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });

const isCode = (f) => /^(src|server)\/.*\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) && !f.includes('/i18n/');
const oldFiles = git('ls-tree', '-r', '--name-only', base, '--', 'src', 'server').split('\n').filter(isCode);
const newFiles = [];
const walk = (d) => { for (const e of readdirSync(path.join(root, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (isCode(p)) newFiles.push(p); } };
walk('src'); walk('server');

const count = (m, k, where) => { const v = m.get(k) ?? { n: 0, where }; v.n++; m.set(k, v); };
const before = new Map(), after = new Map();
for (const f of oldFiles) for (const u of scan(git('show', `${base}:app/${f}`))) for (const x of fragments(u.text)) count(before, x, `${f}:${u.line}`);
for (const f of newFiles) for (const u of scan(readFileSync(path.join(root, f), 'utf8'))) for (const x of fragments(u.text)) count(after, x, `${f}:${u.line}`);
for (const p of ['src/i18n/vi.json', 'server/i18n/vi.json']) {
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(path.join(root, p), 'utf8')))) for (const x of fragments(v)) count(after, x, `${p} ${k}`);
}

const lost = [...before].filter(([k]) => !after.has(k));
const extra = [...after].filter(([k]) => !before.has(k));
console.log(`Gốc ${base}: ${before.size} đoạn chữ khác nhau trong ${oldFiles.length} file. Bây giờ: ${after.size} đoạn.`);
console.log(`\nMất hoặc đổi (${lost.length}):`);
for (const [k, v] of lost) console.log(`  - "${k}"  (${v.where})`);
console.log(`\nThừa, không có trong bản gốc (${extra.length}):`);
for (const [k, v] of extra) console.log(`  + "${k}"  (${v.where})`);
