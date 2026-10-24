// Dựng hoa văn chấm cho màn chào: tự vẽ đường cong Bézier (xoắn ốc, cuống, lá, cánh bướm),
// rasterize ở độ phân giải thấp rồi thay mỗi ô lưới bằng một chấm vuông theo dither có trật tự (Bayer 4x4).
// Chạy lại: node scripts/ornaments.mjs  → public/art/orn-corner.png, orn-side.png, orn-butterfly.png
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/art');
const f = (n) => Math.round(n * 10) / 10;

/** Xoắn ốc: các điểm từ ngoài vào trong, nối bằng Catmull-Rom → Bézier bậc ba. Trả về nhiều đoạn, mỗi đoạn mảnh dần. */
function spiral(cx, cy, r, turns, start, dir = 1, w = 8) {
  const pts = [];
  const n = Math.ceil(turns * 28);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + dir * t * turns * Math.PI * 2;
    const rr = r * 1.25 * Math.pow(1 - t * 0.8, 1.2);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const parts = [];
  const k = 4;
  for (let s = 0; s < k; s++) {
    const seg = pts.slice(Math.floor((s * n) / k), Math.floor(((s + 1) * n) / k) + 1);
    parts.push(`<path d="${bez(seg)}" stroke-width="${f(w * WF * (1 - s * 0.18))}"/>`);
  }
  return parts.join('');
}
function bez(p) {
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
const WF = 1.45; // nét đậm hơn để xoắn ốc còn đọc được sau khi thành chấm
const stem = (d, w = 7) => `<path d="${d}" stroke-width="${f(w * WF)}"/>`;
const leaf = (d, o = 0.8) => `<path d="${d}" fill="#000" fill-opacity="${o}" stroke="none"/>`;
const dot = (x, y, r = 4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#000" stroke="none"/>`;
const mirrorX = (inner, cx) => `<g>${inner}</g><g transform="translate(${cx * 2},0) scale(-1,1)">${inner}</g>`;
const mirrorY = (inner, cy) => `<g>${inner}</g><g transform="translate(0,${cy * 2}) scale(1,-1)">${inner}</g>`;
const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;

// ---------- Cụm góc (góc trên trái), khung 330 x 600 = 110 x 200 điểm CSS ở 3x ----------
// Nhánh ngang: đối xứng gương quanh x = 175.
const topHalf = [
  stem('M175,74 C160,40 118,28 92,44 C74,56 72,80 88,92'),
  spiral(98, 78, 22, 1.6, Math.PI * 0.95, 1, 8),
  stem('M175,84 C158,118 124,128 104,116'),
  spiral(112, 104, 13, 1.3, Math.PI * 0.6, -1, 6),
  leaf('M160,60 C148,36 132,26 118,14 C134,22 150,30 166,52 Z'),
  leaf('M150,98 C138,118 128,132 112,140 C130,128 140,116 146,96 Z', 0.65),
  stem('M92,44 C70,30 46,34 36,52', 6),
  spiral(48, 58, 12, 1.4, Math.PI, -1, 6),
  stem('M88,92 C70,104 60,118 66,132', 5),
  spiral(76, 128, 9, 1.2, Math.PI, 1, 5),
  leaf('M60,40 C52,24 40,16 26,14 C40,22 48,32 56,46 Z', 0.55),
  dot(132, 62, 4), dot(140, 140, 3.5), dot(20, 24, 3), dot(124, 152, 3),
].join('');
const topCenter = [
  leaf('M175,62 C166,44 170,28 175,18 C180,28 184,44 175,62 Z', 0.9),
  `<circle cx="175" cy="78" r="9" stroke-width="6"/>`,
  leaf('M175,92 C169,104 171,114 175,124 C179,114 181,104 175,92 Z', 0.75),
  dot(175, 134, 3.5),
].join('');
// Nhánh dọc: xích chữ S đi xuống, xoắn ốc mọc luân phiên trái phải, đuôi cuộn nhỏ.
const vert = [
  stem('M40,140 C10,176 74,214 46,256 C18,298 82,336 52,380 C30,412 58,446 48,476', 7),
  spiral(26, 198, 19, 1.5, 0, -1, 7), stem('M38,176 C30,182 24,186 26,198', 5),
  spiral(78, 240, 16, 1.4, Math.PI, 1, 6), stem('M58,232 C66,230 74,232 78,240', 5),
  spiral(28, 330, 17, 1.5, 0, -1, 7), stem('M40,312 C32,316 28,322 28,330', 5),
  spiral(80, 372, 13, 1.3, Math.PI, 1, 6),
  leaf('M48,270 C64,284 74,300 92,306 C78,292 68,280 52,262 Z', 0.6),
  leaf('M44,420 C30,432 22,446 12,452 C24,440 30,428 40,414 Z', 0.55),
  spiral(52, 510, 16, 1.6, -Math.PI / 2, 1, 6), stem('M48,476 C50,486 54,494 52,510', 5),
  dot(70, 160, 3.5), dot(14, 270, 3), dot(88, 420, 3), dot(30, 560, 3), dot(56, 580, 3),
].join('');
const corner = svg(330, 600, mirrorX(topHalf, 175) + topCenter + vert);

// ---------- Hoa văn giữa cạnh: dải dọc hẹp, đối xứng trên dưới, 90 x 330 ----------
const sideHalf = [
  stem('M45,165 C20,140 70,118 45,90 C22,64 62,44 45,16', 6),
  spiral(26, 128, 15, 1.4, 0, -1, 6),
  spiral(64, 62, 13, 1.3, Math.PI, 1, 5),
  leaf('M45,150 C58,140 70,136 82,138 C70,146 58,150 47,158 Z', 0.55),
  leaf('M44,40 C32,32 22,30 10,32 C22,38 32,42 43,50 Z', 0.5),
  dot(70, 104, 3), dot(18, 84, 3), dot(45, 8, 3),
].join('');
const side = svg(90, 330, mirrorY(sideHalf + `<circle cx="45" cy="165" r="7" stroke-width="5"/>`, 165));

// ---------- Bướm: hai cánh trên, hai cánh dưới, thân, râu; 510 x 510 ----------
const wingHalf = [
  // cánh trên
  leaf('M255,240 C232,170 196,96 140,70 C92,48 52,70 58,120 C64,170 120,220 255,252 Z', 0.62),
  // cánh dưới
  leaf('M255,262 C200,270 140,290 112,336 C88,378 108,420 150,418 C196,416 236,350 255,278 Z', 0.5),
  // viền cánh đậm hơn
  `<path d="M255,240 C232,170 196,96 140,70 C92,48 52,70 58,120 C64,170 120,220 255,252" stroke-width="10" stroke-opacity=".9"/>`,
  `<path d="M255,262 C200,270 140,290 112,336 C88,378 108,420 150,418 C196,416 236,350 255,278" stroke-width="9" stroke-opacity=".85"/>`,
  // gân cánh sáng (xoá bớt chấm)
  `<g stroke="#fff" stroke-opacity="1" style="mix-blend-mode:normal">`,
  `<path d="M250,244 C200,190 150,140 100,96" stroke-width="5"/>`,
  `<path d="M250,248 C190,220 130,190 74,150" stroke-width="5"/>`,
  `<path d="M250,240 C226,180 200,130 170,88" stroke-width="4"/>`,
  `<path d="M250,272 C210,300 170,340 140,392" stroke-width="5"/>`,
  `<path d="M250,268 C200,290 150,320 116,356" stroke-width="4"/>`,
  `</g>`,
  // đốm trên cánh
  dot(118, 104, 14), dot(160, 380, 11),
  // râu
  `<path d="M252,232 C240,190 222,160 200,140" stroke-width="4"/>`, dot(198, 138, 6),
].join('');
const butterfly = svg(510, 510, mirrorX(wingHalf, 255) + leaf('M255,226 C264,240 264,320 255,352 C246,320 246,240 255,226 Z', 1));

// ---------- Halftone: ô lưới → chấm vuông theo dither Bayer 4x4 ----------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
async function halftone(src, w, h, cell, dotSize, color, name) {
  const gw = Math.floor(w / cell), gh = Math.floor(h / cell);
  // Vẽ trên nền trắng, đọc độ tối; gân trắng sẽ xoá bớt mực.
  const { data } = await sharp(Buffer.from(src)).flatten({ background: '#fff' }).resize(gw, gh, { kernel: 'lanczos3' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rects = [];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const v = 1 - data[y * gw + x] / 255;
    if (v < 0.06 || v * 1.08 < BAYER[(y % 4) * 4 + (x % 4)]) continue;
    const s = v > 0.55 ? dotSize : dotSize * 0.78;
    const o = (cell - s) / 2;
    rects.push(`<rect x="${f(x * cell + o)}" y="${f(y * cell + o)}" width="${f(s)}" height="${f(s)}"/>`);
  }
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${gw * cell}" height="${gh * cell}"><g fill="${color}">${rects.join('')}</g></svg>`;
  const file = path.join(OUT, name);
  await sharp(Buffer.from(out)).png({ compressionLevel: 9, palette: true, colours: 16 }).toFile(file);
  console.log(name, rects.length, 'chấm');
}

await halftone(corner, 330, 600, 4, 3, '#8C8F8A', 'orn-corner.png');
await halftone(side, 90, 330, 4, 2.8, '#9A9D97', 'orn-side.png');
await halftone(butterfly, 510, 510, 7, 5, '#8E928B', 'orn-butterfly.png');
