// Xuất biểu tượng app từ public/logo.svg. Chạy: node scripts/icons.mjs (cần sharp trong devDependencies).
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const pub = new URL('../public/', import.meta.url);
const house = readFileSync(new URL('logo.svg', pub), 'utf8').replace(/<svg[^>]*>/, '').replace('</svg>', '');
const CREAM = '#F6EEE2';

// Nhà nằm giữa nền kem; scale nhỏ lại để có vùng an toàn cho bản maskable.
function icon(scale, round) {
  const t = 256 * (1 - scale);
  const bg = round ? `<rect width="512" height="512" rx="116" fill="${CREAM}"/>` : `<rect width="512" height="512" fill="${CREAM}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg}<g transform="translate(${t} ${t + 8 * scale}) scale(${scale})">${house}</g></svg>`;
}

// Bản nền đặc (maskable, apple-touch) bỏ hẳn kênh trong suốt.
const png = (svg, size, file, flat = false) => {
  let s = sharp(Buffer.from(svg), { density: 300 }).resize(size, size);
  if (flat) s = s.flatten({ background: CREAM });
  return s.png({ compressionLevel: 9 }).toFile(decodeURIComponent(new URL(file, pub).pathname).replace(/^\/([A-Za-z]:)/, '$1'));
};

const any = icon(1.08, true);
const full = icon(1, false);
const mask = icon(0.9, false);
writeFileSync(new URL('favicon.svg', pub), any);
await Promise.all([
  png(full, 512, 'icon.png', true),
  png(any, 192, 'icon-192.png'),
  png(any, 512, 'icon-512.png'),
  png(mask, 192, 'icon-maskable-192.png', true),
  png(mask, 512, 'icon-maskable-512.png', true),
  png(icon(1, false), 180, 'apple-touch-icon.png', true),
  png(icon(1.2, true), 32, 'favicon-32.png'),
]);
console.log('xong');
