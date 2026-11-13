// Sinh logo và biểu tượng app từ branding/logo-source.webp (ảnh gốc của người dùng, không đổi màu, không phủ hiệu ứng).
// Chạy: node scripts/icons.mjs (cần sharp trong devDependencies).
//  - logo-mark.png: chỉ phần chữ đen, nền trong suốt (alpha từ độ đậm của nét), dùng trong app.
//  - icon*.png, apple-touch-icon.png, favicon-32.png, favicon.svg: crop từ ảnh gốc, có nền giấy.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SRC = fileURLToPath(new URL('../../branding/logo-source.webp', import.meta.url));
const out = (f) => fileURLToPath(new URL(`../public/${f}`, import.meta.url));

// Khung chữ trong ảnh gốc 2000x2000 (đo bằng ngưỡng độ tối): x 441..1564, y 487..1434.
const BOX = { x0: 441, y0: 487, x1: 1564, y1: 1434 };
const CX = (BOX.x0 + BOX.x1) / 2;
const CY = (BOX.y0 + BOX.y1) / 2;

// 1) Dấu logo nền trong suốt. Nền giấy sáng (>= ~200), nét chữ đen (~0): alpha = độ đậm, bỏ vân nền nhạt, giữ mép mượt.
{
  const pad = 24;
  const left = BOX.x0 - pad, top = BOX.y0 - pad;
  const w = BOX.x1 - BOX.x0 + 1 + pad * 2, h = BOX.y1 - BOX.y0 + 1 + pad * 2;
  const { data } = await sharp(SRC).extract({ left, top, width: w, height: h }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(w * h * 4); // RGB = 0 (đen thuần), chỉ có alpha
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(1, Math.max(0, ((235 - data[i]) / 235 - 0.15) / 0.85));
    rgba[i * 4 + 3] = Math.round(a * 255);
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(out('logo-mark.png'));
}

// 2) Biểu tượng app: crop vuông từ ảnh gốc, chữ nằm giữa. side lớn hơn thì chữ nhỏ hơn.
const square = async (side, size, { round = false, cy = CY } = {}) => {
  const left = Math.max(0, Math.min(2000 - side, Math.round(CX - side / 2)));
  const top = Math.max(0, Math.min(2000 - side, Math.round(cy - side / 2)));
  const img = sharp(SRC).extract({ left, top, width: side, height: side }).resize(size, size, { kernel: 'lanczos3' });
  if (!round) return img.flatten({ background: '#ffffff' }).png({ compressionLevel: 9 }).toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.227)}" fill="#fff"/></svg>`);
  return sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]).png({ compressionLevel: 9 }).toBuffer();
};
const save = async (buf, file) => writeFileSync(out(file), await buf);

const ANY = 1440;   // chữ rộng ~78% khung
const MASK = 1700;  // bản maskable: chữ nằm gọn trong vùng an toàn 80% ở giữa
const FAV = 1250;   // favicon nhỏ: chữ to hơn
const FAVY = 880;
await Promise.all([
  save(square(ANY, 512), 'icon.png'),
  save(square(ANY, 192, { round: true }), 'icon-192.png'),
  save(square(ANY, 512, { round: true }), 'icon-512.png'),
  save(square(MASK, 192), 'icon-maskable-192.png'),
  save(square(MASK, 512), 'icon-maskable-512.png'),
  save(square(ANY, 180), 'apple-touch-icon.png'),
  save(square(FAV, 32, { round: true, cy: FAVY }), 'favicon-32.png'),
]);

// favicon.svg: ảnh 128px nhúng trong SVG, bo góc.
const fav = await square(FAV, 128, { round: true, cy: FAVY });
writeFileSync(out('favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><image width="128" height="128" href="data:image/png;base64,${fav.toString('base64')}"/></svg>`);
console.log('xong');
