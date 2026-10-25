// Dải ảnh kiểu photobooth: 3 hoặc 4 tấm xếp dọc, mỗi chủ đề tự vẽ nền, khung, hoạ tiết và chữ bằng canvas.
// Toạ độ logic: dải rộng 600, cao 1800 (3 ô) hoặc 2200 (4 ô); khi xuất thì phóng to cho nét.

import { cover } from './booth';

type Ctx = CanvasRenderingContext2D;
export type Tone = 'color' | 'bw' | 'wine';
type Box = { x: number; y: number; w: number; h: number };
export type StripInfo = { title: string; when: Date; photo?: HTMLImageElement | null };
type L = { n: number; h: number; cells: Box[]; info: StripInfo };
type StripTheme = {
  id: string; tone: Tone;
  top: number; bottom: number; side: number; gap: number;
  frame: string | null; pad: number; radius: number; shadow?: boolean;
  pair: string; tilt?: number;
  under: (c: Ctx, l: L) => void;
  over?: (c: Ctx, l: L) => void;
};

export const SW = 600;
export const stripH = (n: number) => (n === 4 ? 2200 : 1800);
const KS = '"Noto Sans KR"', KR = '"Noto Serif KR"'; // phông Hàn, chỉ có khi đang tiếng Hàn (xem loadKoFonts)
const F = `BVP, ${KS}, system-ui, sans-serif`;
const TAU = Math.PI * 2;

function rand(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

import { loadKoFonts, shownLang, t } from './i18n';

const two = (x: number) => String(x).padStart(2, '0');
const WD = (d: Date) => t(`strip.weekday.${d.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6}`);
const dmy = (d: Date, s = '.') => (shownLang() === 'en' ? `${two(d.getMonth() + 1)}${s}${two(d.getDate())}${s}${d.getFullYear()}` : `${two(d.getDate())}${s}${two(d.getMonth() + 1)}${s}${d.getFullYear()}`);
const hm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

/** Đặt cỡ chữ lớn nhất mà vẫn vừa bề ngang. */
function fit(c: Ctx, text: string, maxW: number, size: number, weight = 500, family = F, style = '') {
  let s = size;
  do { c.font = `${style} ${weight} ${s}px ${family}`.trim(); } while (c.measureText(text).width > maxW && --s > 10);
  return s;
}

function text(c: Ctx, s: string, x: number, y: number, color: string, size: number, maxW: number, weight = 500, align: CanvasTextAlign = 'center', family = F) {
  fit(c, s, maxW, size, weight, family);
  c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
  c.fillText(s, x, y);
}

// ---------- Chữ riêng từng khung ----------

const PF = `"Playfair Display", ${KR}, serif`, OS = `Oswald, ${KS}, sans-serif`, SM = `"Space Mono", ${KS}, monospace`, IN = `Inter, ${KS}, sans-serif`;
const BA = `Bangers, ${KS}, sans-serif`, PA = `Pacifico, ${KS}, cursive`, DS = `"Dancing Script", ${KR}, cursive`, LO = `Lobster, ${KS}, cursive`, PH = `"Patrick Hand", ${KS}, cursive`;

const STRIP_FONTS: Record<string, string[]> = {
  mist: [`700 40px ${DS}`, `400 40px ${PH}`],
  ticket: [`italic 700 40px ${PF}`, `500 40px ${OS}`],
  film: [`400 40px ${SM}`, `700 40px ${SM}`],
  music: [`400 40px ${IN}`, `700 40px ${IN}`],
  halloween: [`400 40px ${BA}`],
  tet: [`400 40px ${PA}`, `700 40px ${DS}`, `500 40px ${OS}`],
  xmas: [`400 40px ${LO}`, `700 40px ${DS}`],
  photo: [`italic 700 40px ${PF}`, `400 40px ${PH}`],
};
// i18n-ok: chữ mẫu để nạp phông (đủ dấu tiếng Việt), không hiện ra màn hình.
const VI = 'Cả nhà mình, Hồ Chí Minh, Đà Nẵng, Tết ăâêôơưđ ẢÃẠẮẰẲẴẶ 0123456789';

/** Nạp chữ của các khung (cả bộ dấu tiếng Việt) trước khi vẽ, để tấm đầu không rơi về chữ mặc định. */
export function loadStripFonts(ids: string[] = Object.keys(STRIP_FONTS), extra = '') {
  const f = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!f) return Promise.resolve();
  const load = () => Promise.all(ids.flatMap((id) => STRIP_FONTS[id] ?? []).map((spec) => f.load(spec, VI + extra).catch(() => []))).then(() => {});
  if (shownLang() !== 'ko') return load();
  // Tiếng Hàn: nạp thêm phông Hàn với đúng chữ sẽ vẽ (tiêu đề, thứ, chữ trong khung), không thì tấm đầu rơi về phông hệ thống.
  const ko = extra + [0, 1, 2, 3, 4, 5, 6].map((d) => t(`strip.weekday.${d as 0}`)).join('') + ['ticket.row', 'ticket.seat', 'ticket.show', 'ticket.keep', 'music.playing', 'music.by', 'tet.title', 'tet.stamp', 'tet.luck', 'xmas.title', 'pair.back'].map((k) => t(`strip.${k}` as 'strip.pair.back')).join('') + '0123456789월일년';
  return loadKoFonts().then(() => Promise.all([`400 40px ${KS}`, `500 40px ${KS}`, `700 40px ${KS}`, `700 40px ${KR}`].map((spec) => f.load(spec, ko).catch(() => [])))).then(load);
}

/** Chữ cong theo cung tròn: tâm (cx, cy) ở dưới, chữ chạy trên đỉnh cung. */
function arcText(c: Ctx, t: string, cx: number, cy: number, r: number, paint: (ch: string) => void) {
  const chars = [...t.normalize('NFC')];
  const ws = chars.map((ch) => c.measureText(ch).width);
  let a = -ws.reduce((x, y) => x + y, 0) / r / 2;
  c.save(); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  chars.forEach((ch, i) => {
    const mid = a + ws[i] / r / 2;
    c.save(); c.translate(cx + Math.sin(mid) * r, cy - Math.cos(mid) * r); c.rotate(mid);
    paint(ch);
    c.restore();
    a += ws[i] / r;
  });
  c.restore();
}

/** Gạch chân vẽ tay: hai nét cong lệch nhau một chút. */
function scribble(c: Ctx, x1: number, x2: number, y: number, color: string, w = 4) {
  c.save(); c.strokeStyle = color; c.lineCap = 'round'; c.lineWidth = w;
  c.beginPath(); c.moveTo(x1, y + 2); c.quadraticCurveTo((x1 + x2) / 2, y - 7, x2, y - 1); c.stroke();
  c.lineWidth = w * 0.6; c.globalAlpha = 0.7;
  c.beginPath(); c.moveTo(x1 + 18, y + 9); c.quadraticCurveTo((x1 + x2) / 2 + 10, y + 2, x2 - 14, y + 6); c.stroke();
  c.restore();
}

/** Nét bút dạ: vẽ chồng vài lớp lệch nhỏ để mép chữ hơi rung như viết tay. */
function marker(c: Ctx, t: string, x: number, y: number, color: string, seed = 5) {
  const r = rand(seed);
  c.fillStyle = color;
  c.globalAlpha = 0.4;
  for (let i = 0; i < 3; i++) c.fillText(t, x + (r() - 0.5) * 2.6, y + (r() - 0.5) * 2.6);
  c.globalAlpha = 1;
  c.fillText(t, x, y);
}

function heart(c: Ctx, x: number, y: number, s: number, color: string) {
  c.fillStyle = color;
  c.beginPath(); c.moveTo(x, y + s * 0.55);
  c.bezierCurveTo(x - s, y - s * 0.15, x - s * 0.45, y - s * 0.85, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.45, y - s * 0.85, x + s, y - s * 0.15, x, y + s * 0.55); c.fill();
}

/** Tem tròn nghiêng: vòng kép, chữ chạy quanh vành, chữ lớn ở giữa. */
function stamp(c: Ctx, x: number, y: number, r: number, rot: number, color: string, ring: string, mid: string, ringFont: string, midFont: string) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.strokeStyle = color; c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
  c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r - 7, 0, TAU); c.stroke();
  c.fillStyle = color;
  c.font = ringFont;
  arcText(c, ring, 0, 0, r - 22, (ch) => c.fillText(ch, 0, 0));
  c.font = midFont; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(mid, 0, r * 0.12);
  c.restore();
}

function glow(c: Ctx, x: number, y: number, r: number, color: string, w: number, h: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}

function grain(c: Ctx, w: number, h: number, alpha: number, light = false, seed = 7) {
  const r = rand(seed);
  c.fillStyle = light ? `rgba(255,250,240,${alpha})` : `rgba(60,50,45,${alpha})`;
  for (let i = 0; i < (w * h) / 420; i++) c.fillRect(r() * w, r() * h, 1.5, 1.5);
}

function dims(s: CanvasImageSource): [number, number] {
  if (s instanceof HTMLVideoElement) return [s.videoWidth, s.videoHeight];
  if (s instanceof HTMLImageElement) return [s.naturalWidth, s.naturalHeight];
  const a = s as { width: number; height: number };
  return [a.width, a.height];
}

/** Phủ tông lên vùng đã cắt: đen trắng hoặc đỏ rượu, bằng chế độ hoà màu của canvas (không đụng điểm ảnh). */
export function tone(c: Ctx, t: Tone, x: number, y: number, w: number, h: number) {
  if (t === 'color') return;
  c.save();
  c.globalCompositeOperation = 'saturation';
  c.fillStyle = '#808080'; c.fillRect(x, y, w, h);
  if (t === 'wine') {
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = '#C64B57'; c.fillRect(x, y, w, h);
    c.globalCompositeOperation = 'screen';
    c.fillStyle = '#2E060C'; c.fillRect(x, y, w, h);
  } else {
    c.globalCompositeOperation = 'soft-light';
    c.fillStyle = 'rgba(128,128,128,.35)'; c.fillRect(x, y, w, h);
  }
  c.restore();
}

/** Ô trống: dáng người tròn trịa, dùng cho ảnh xem trước của chủ đề. */
export function placeholder(c: Ctx, x: number, y: number, w: number, h: number) {
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#E9CDBE'); g.addColorStop(1, '#B9AFC9');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,.55)';
  const s = Math.min(w, h);
  [[0.36, 0.95], [0.64, 0.82]].forEach(([fx, k]) => {
    const cx = x + w * fx, r = s * 0.16 * k;
    c.beginPath(); c.arc(cx, y + h * 0.45, r, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(cx, y + h, r * 2, r * 1.9, 0, Math.PI, TAU); c.fill();
  });
}

function photoIn(c: Ctx, src: CanvasImageSource | null, b: Box, r: number, t: Tone) {
  c.save();
  c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, Math.max(0, Math.min(r, b.w / 2, b.h / 2))); c.clip();
  if (src) { const [sw, sh] = dims(src); c.fillStyle = '#2A2522'; c.fillRect(b.x, b.y, b.w, b.h); if (sw && sh) cover(c, src, sw, sh, b.x, b.y, b.w, b.h, false); }
  else placeholder(c, b.x, b.y, b.w, b.h);
  tone(c, t, b.x, b.y, b.w, b.h);
  c.restore();
}

// ---------- Hoạ tiết vẽ tay ----------

function star4(c: Ctx, x: number, y: number, r: number, color: string) {
  c.fillStyle = color;
  c.beginPath(); c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

function star5(c: Ctx, x: number, y: number, r: number, color: string) {
  c.fillStyle = color; c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath(); c.fill();
}

function moon(c: Ctx, x: number, y: number, r: number, color: string) {
  c.save();
  c.shadowColor = color; c.shadowBlur = r * 0.9;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.arc(x + r * 0.45, y - r * 0.3, r * 0.85, 0, TAU);
  c.fillStyle = color; c.fill('evenodd');
  c.restore();
}

function bat(c: Ctx, x: number, y: number, s: number, rot = 0, color = '#17101C') {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.fillStyle = color;
  for (const k of [1, -1]) {
    c.save(); c.scale(k, 1);
    c.beginPath();
    c.moveTo(0.05, -0.08);
    c.quadraticCurveTo(0.45, -0.55, 1, -0.3);
    c.quadraticCurveTo(0.86, -0.12, 0.9, 0.1);
    c.quadraticCurveTo(0.74, 0.0, 0.62, 0.14);
    c.quadraticCurveTo(0.52, 0.02, 0.38, 0.18);
    c.quadraticCurveTo(0.26, 0.06, 0.05, 0.2);
    c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0.06, -0.12); c.lineTo(0.16, -0.36); c.lineTo(0.2, -0.08); c.fill();
    c.restore();
  }
  c.beginPath(); c.ellipse(0, 0.04, 0.2, 0.24, 0, 0, TAU); c.fill();
  c.fillStyle = '#FFE7B0';
  c.beginPath(); c.arc(-0.08, -0.02, 0.045, 0, TAU); c.arc(0.08, -0.02, 0.045, 0, TAU); c.fill();
  c.restore();
}

function pumpkin(c: Ctx, x: number, y: number, r: number, face = true) {
  c.save(); c.translate(x, y);
  c.fillStyle = '#5B4321';
  c.beginPath(); c.roundRect(-r * 0.09, -r * 1.02, r * 0.18, r * 0.34, r * 0.06); c.fill();
  c.strokeStyle = '#4E8A3E'; c.lineWidth = r * 0.07; c.lineCap = 'round';
  c.beginPath(); c.moveTo(r * 0.05, -r * 0.82); c.quadraticCurveTo(r * 0.45, -r * 1.05, r * 0.38, -r * 0.7); c.stroke();
  const lobes: [number, string][] = [[-0.48, '#E46A12'], [0.48, '#E46A12'], [-0.2, '#F28124'], [0.2, '#F28124'], [0, '#F7923A']];
  for (const [dx, col] of lobes) {
    c.fillStyle = col;
    c.beginPath(); c.ellipse(dx * r, 0, r * (dx === 0 ? 0.42 : 0.5), r * 0.8, 0, 0, TAU); c.fill();
  }
  if (face) {
    c.fillStyle = '#3A1A08';
    for (const k of [-1, 1]) {
      c.beginPath(); c.moveTo(k * r * 0.34, -r * 0.08); c.lineTo(k * r * 0.14, -r * 0.08); c.lineTo(k * r * 0.24, -r * 0.3); c.closePath(); c.fill();
    }
    c.beginPath();
    c.moveTo(-r * 0.42, r * 0.12);
    c.quadraticCurveTo(0, r * 0.62, r * 0.42, r * 0.12);
    c.quadraticCurveTo(0, r * 0.36, -r * 0.42, r * 0.12);
    c.fill();
    c.fillStyle = 'rgba(255,214,140,.5)';
    c.beginPath(); c.ellipse(-r * 0.3, -r * 0.42, r * 0.1, r * 0.05, -0.5, 0, TAU); c.fill();
  }
  c.restore();
}

function cat(c: Ctx, x: number, y: number, s: number) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const k = '#120D14';
  c.fillStyle = k; c.strokeStyle = k; c.lineCap = 'round';
  c.lineWidth = 0.13;
  c.beginPath(); c.moveTo(0.32, 0.72); c.bezierCurveTo(0.95, 0.75, 0.9, 0.1, 0.62, 0.05); c.stroke();
  c.beginPath(); c.ellipse(0, 0.42, 0.42, 0.42, 0, 0, TAU); c.fill();
  c.beginPath(); c.arc(0, -0.18, 0.32, 0, TAU); c.fill();
  for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 0.3, -0.26); c.lineTo(d * 0.3, -0.58); c.lineTo(d * 0.08, -0.42); c.closePath(); c.fill(); }
  c.fillStyle = '#F7C548';
  for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 0.13, -0.2, 0.08, 0.1, 0, 0, TAU); c.fill(); }
  c.fillStyle = k;
  for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 0.13, -0.2, 0.025, 0.08, 0, 0, TAU); c.fill(); }
  c.fillStyle = '#F2A0A8'; c.beginPath(); c.arc(0, -0.08, 0.03, 0, TAU); c.fill();
  c.restore();
}

/** Mạng nhện ở góc: (x, y) là góc, a0 đến a1 là quạt toả ra. */
function web(c: Ctx, x: number, y: number, r: number, a0: number, a1: number, color = 'rgba(255,255,255,.75)') {
  c.save();
  c.strokeStyle = color; c.lineWidth = 2; c.lineCap = 'round';
  const spokes = 5;
  const ang = Array.from({ length: spokes }, (_, i) => a0 + ((a1 - a0) * i) / (spokes - 1));
  for (const a of ang) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); }
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (r * ring) / 4.3;
    c.beginPath();
    ang.forEach((a, i) => {
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (!i) c.moveTo(px, py);
      else {
        const m = (a + ang[i - 1]) / 2, sag = rr * 0.8;
        c.quadraticCurveTo(x + Math.cos(m) * sag, y + Math.sin(m) * sag, px, py);
      }
    });
    c.stroke();
  }
  c.restore();
}

function blossom(c: Ctx, x: number, y: number, s: number, petal = '#FFD23F', heart = '#E8862A') {
  c.fillStyle = petal;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU - Math.PI / 2;
    c.beginPath(); c.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.48, s * 0.36, a, 0, TAU); c.fill();
  }
  c.fillStyle = heart; c.beginPath(); c.arc(x, y, s * 0.22, 0, TAU); c.fill();
  c.strokeStyle = heart; c.lineWidth = Math.max(1, s * 0.06);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * s * 0.4, y + Math.sin(a) * s * 0.4); c.stroke();
  }
}

/** Cành mai: thân cong, hoa và nụ dọc theo cành. */
function maiBranch(c: Ctx, pts: [number, number][], seed: number, s = 1) {
  c.save();
  c.strokeStyle = '#4A2A1E'; c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = 9 * s;
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  c.stroke();
  const r = rand(seed);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    blossom(c, (px + pts[i][0]) / 2 + (r() - 0.5) * 16 * s, (py + pts[i][1]) / 2 - 12 * s, (11 + r() * 6) * s);
    const [x, y] = pts[i];
    blossom(c, x + (r() - 0.5) * 30 * s, y + (r() - 0.5) * 30 * s, (15 + r() * 10) * s);
    c.fillStyle = '#F2B53A'; c.beginPath(); c.arc(x + (r() - 0.5) * 50 * s, y + (r() - 0.5) * 40 * s, 5 * s, 0, TAU); c.fill();
  }
  c.restore();
}

function lantern(c: Ctx, x: number, top: number, y: number, r: number) {
  c.strokeStyle = '#F2C14E'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x, top); c.lineTo(x, y - r * 0.9); c.stroke();
  c.fillStyle = '#F2C14E';
  c.beginPath(); c.roundRect(x - r * 0.45, y - r * 0.98, r * 0.9, r * 0.22, 4); c.fill();
  c.beginPath(); c.roundRect(x - r * 0.45, y + r * 0.76, r * 0.9, r * 0.22, 4); c.fill();
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
  g.addColorStop(0, '#FF7A4D'); g.addColorStop(1, '#D9261C');
  c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r * 0.78, r * 0.82, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(242,193,78,.75)'; c.lineWidth = 2;
  for (const k of [-0.45, 0, 0.45]) { c.beginPath(); c.ellipse(x, y, r * 0.78 * Math.abs(k || 0.02), r * 0.82, 0, 0, TAU); c.stroke(); }
  c.strokeStyle = '#F2C14E'; c.lineWidth = 3; c.lineCap = 'round';
  for (const k of [-6, 0, 6]) { c.beginPath(); c.moveTo(x, y + r * 0.98); c.lineTo(x + k, y + r * 1.55); c.stroke(); }
}

function envelope(c: Ctx, x: number, y: number, w: number, rot: number) {
  const h = w * 1.5;
  c.save(); c.translate(x, y); c.rotate(rot);
  c.shadowColor = 'rgba(60,10,10,.35)'; c.shadowBlur = 14; c.shadowOffsetY = 6;
  c.fillStyle = '#E2302A'; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 8); c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = '#F2C14E'; c.lineWidth = 2.5;
  c.beginPath(); c.roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 5); c.stroke();
  c.fillStyle = '#C42320';
  c.beginPath(); c.moveTo(-w / 2, -h / 2 + 4); c.quadraticCurveTo(0, -h / 2 + w * 0.7, w / 2, -h / 2 + 4); c.lineTo(w / 2, -h / 2); c.lineTo(-w / 2, -h / 2); c.fill();
  c.fillStyle = '#F2C14E'; c.beginPath(); c.arc(0, -h / 2 + w * 0.42, w * 0.17, 0, TAU); c.fill();
  blossom(c, 0, h * 0.12, w * 0.2, '#F2C14E', '#E2302A');
  c.restore();
}

function pine(c: Ctx, x: number, base: number, w: number, h: number) {
  c.fillStyle = '#5B3A24'; c.fillRect(x - w * 0.07, base - h * 0.12, w * 0.14, h * 0.14);
  const tiers = [[0.0, 1.0], [0.3, 0.8], [0.56, 0.6]];
  tiers.forEach(([t, k], i) => {
    const by = base - h * 0.1 - h * t, ty = by - h * 0.42;
    c.fillStyle = i % 2 ? '#2F8552' : '#24703F';
    c.beginPath();
    c.moveTo(x, ty);
    c.quadraticCurveTo(x + w * 0.2 * k, ty + h * 0.2, x + (w / 2) * k, by);
    c.quadraticCurveTo(x, by + h * 0.06, x - (w / 2) * k, by);
    c.quadraticCurveTo(x - w * 0.2 * k, ty + h * 0.2, x, ty);
    c.fill();
  });
  const r = rand(4);
  for (let i = 0; i < 9; i++) {
    const t = r(), yy = base - h * 0.15 - t * h * 0.7, spread = (1 - t) * w * 0.38;
    c.fillStyle = i % 3 ? '#D83A3A' : '#F2C14E';
    c.beginPath(); c.arc(x + (r() - 0.5) * 2 * spread, yy, w * 0.045, 0, TAU); c.fill();
  }
  star5(c, x, base - h * 0.95, w * 0.12, '#F6CF57');
}

function gift(c: Ctx, x: number, y: number, w: number, h: number, box: string, ribbon: string) {
  c.fillStyle = box; c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill();
  c.fillStyle = ribbon; c.fillRect(x + w / 2 - w * 0.08, y, w * 0.16, h); c.fillRect(x, y + h * 0.3, w, h * 0.14);
  c.strokeStyle = ribbon; c.lineWidth = w * 0.08; c.lineCap = 'round';
  c.beginPath(); c.ellipse(x + w / 2 - w * 0.16, y - w * 0.08, w * 0.15, w * 0.08, 0.4, 0, TAU); c.stroke();
  c.beginPath(); c.ellipse(x + w / 2 + w * 0.16, y - w * 0.08, w * 0.15, w * 0.08, -0.4, 0, TAU); c.stroke();
}

/** Khung có góc khuyết lõm vào như vé xem phim. */
function notched(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y); c.arc(x + w, y, r, Math.PI, Math.PI / 2, true);
  c.lineTo(x + w, y + h - r); c.arc(x + w, y + h, r, -Math.PI / 2, -Math.PI, true);
  c.lineTo(x + r, y + h); c.arc(x, y + h, r, 0, -Math.PI / 2, true);
  c.lineTo(x, y + r); c.arc(x, y, r, Math.PI / 2, 0, true);
  c.closePath();
}

function soft(c: Ctx, h: number, base: string, blobs: [number, number, number, string][]) {
  c.fillStyle = base; c.fillRect(0, 0, SW, h);
  for (const [x, y, r, col] of blobs) glow(c, x, y * h, r, col, SW, h);
}

// ---------- Các chủ đề ----------

const WINE = '#5E0F1B', CREAM = '#F5EBDC';

export const STRIPS: StripTheme[] = [
  {
    id: 'mist', tone: 'color', top: 64, bottom: 250, side: 44, gap: 24,
    frame: '#FFFFFF', pad: 10, radius: 24, shadow: true, pair: '#E5E0DA',
    under: (c, l) => {
      soft(c, l.h, '#ECEAE8', [[300, 0.3, 520, 'rgba(255,255,255,.95)'], [40, 0.95, 560, 'rgba(241,200,182,.85)'], [580, 0.88, 520, 'rgba(190,182,204,.8)']]);
      grain(c, SW, l.h, 0.07);
    },
    over: (c, l) => {
      const y = l.h - 136;
      fit(c, l.info.title, 440, 68, 700, DS);
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.save(); c.shadowColor = 'rgba(255,255,255,.9)'; c.shadowBlur = 16;
      c.fillStyle = '#3A2F2A'; c.fillText(l.info.title, SW / 2, y); c.restore();
      const tw = Math.min(c.measureText(l.info.title).width, 440);
      scribble(c, SW / 2 - tw / 2 + 10, SW / 2 + tw / 2 - 10, y + 22, 'rgba(214,140,120,.8)', 4);
      heart(c, SW / 2 + tw / 2 + 20, y - 46, 13, 'rgba(214,120,110,.85)');
      heart(c, SW / 2 + tw / 2 + 40, y - 24, 8, 'rgba(190,160,200,.9)');
      fit(c, `${WD(l.info.when).toLowerCase()}, ${dmy(l.info.when)}`, 480, 30, 400, PH);
      marker(c, `${WD(l.info.when).toLowerCase()}, ${dmy(l.info.when)}`, SW / 2, l.h - 60, 'rgba(58,47,42,.75)');
    },
  },
  {
    id: 'ticket', tone: 'color', top: 262, bottom: 248, side: 58, gap: 16,
    frame: WINE, pad: 4, radius: 3, pair: WINE,
    under: (c, l) => {
      const h = l.h;
      c.fillStyle = WINE; c.fillRect(0, 0, SW, h);
      c.fillStyle = CREAM; notched(c, 20, 20, SW - 40, h - 40, 26); c.fill();
      c.fillStyle = WINE;
      for (let y = 66; y < h - 50; y += 36) for (const x of [20, SW - 20]) { c.beginPath(); c.arc(x, y, 11, 0, TAU); c.fill(); }
      c.strokeStyle = WINE; c.lineWidth = 2.5;
      notched(c, 44, 44, SW - 88, h - 88, 18); c.stroke();
      // Đầu vé: sao, tên nhà, ô hàng ghế, suất chiếu.
      star5(c, SW / 2, 74, 13, WINE); star5(c, SW / 2 - 28, 80, 8, WINE); star5(c, SW / 2 + 28, 80, 8, WINE);
      fit(c, l.info.title, 440, 56, 700, PF, 'italic');
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = 'rgba(94,15,27,.22)'; c.fillText(l.info.title, SW / 2 + 3, 143);
      c.fillStyle = WINE; c.fillText(l.info.title, SW / 2, 140);
      const y0 = 160, y1 = 244, x0 = 58, x3 = SW - 58;
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x3, y0); c.moveTo(x0, y1); c.lineTo(x3, y1);
      c.moveTo(150, y0); c.lineTo(150, y1); c.moveTo(242, y0); c.lineTo(242, y1); c.moveTo(242, 202); c.lineTo(x3, 202);
      c.stroke();
      const d = l.info.when;
      text(c, t('strip.ticket.row'), 104, 184, WINE, 17, 80, 500, 'center', OS);
      text(c, two(d.getDate()), 104, 234, WINE, 42, 80, 500, 'center', OS);
      text(c, t('strip.ticket.seat'), 196, 184, WINE, 17, 80, 500, 'center', OS);
      text(c, two(d.getMonth() + 1), 196, 234, WINE, 42, 80, 500, 'center', OS);
      text(c, `${WD(d)}, ${dmy(d, '/')}`.toUpperCase(), (242 + x3) / 2, 192, WINE, 20, 280, 500, 'center', OS);
      text(c, t('strip.ticket.show', { time: hm(d) }), (242 + x3) / 2, 236, WINE, 28, 280, 500, 'center', OS);
    },
    over: (c, l) => {
      const h = l.h, y = h - 232;
      c.strokeStyle = WINE; c.lineWidth = 2;
      c.beginPath(); c.moveTo(58, y); c.lineTo(SW - 58, y); c.moveTo(58, y + 44); c.lineTo(SW - 58, y + 44); c.stroke();
      text(c, t('strip.ticket.keep'), SW / 2, y + 31, WINE, 20, 380, 500, 'center', OS);
      star5(c, 82, y + 22, 8, WINE); star5(c, SW - 82, y + 22, 8, WINE);
      fit(c, 'sweet home', 440, 66, 700, PF, 'italic');
      c.textAlign = 'center'; c.fillStyle = WINE; c.fillText('sweet home', SW / 2, h - 96);
    },
  },
  {
    id: 'film', tone: 'bw', top: 66, bottom: 150, side: 54, gap: 22,
    frame: null, pad: 0, radius: 3, pair: '#E9E6E1', tilt: 0.04,
    under: (c, l) => {
      c.fillStyle = '#121110'; c.fillRect(0, 0, SW, l.h);
      c.fillStyle = '#E9E2D4';
      for (let y = 22; y < l.h - 30; y += 46) { c.beginPath(); c.roundRect(14, y, 20, 28, 5); c.roundRect(SW - 34, y, 20, 28, 5); c.fill(); }
      c.font = `400 15px ${SM}`; c.fillStyle = '#D98A3D'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      c.fillText('HL 400', 54, 46);
      c.textAlign = 'right'; c.fillText(`${l.n} ▸`, SW - 54, 46);
      grain(c, SW, l.h, 0.08, true, 3);
    },
    over: (c, l) => {
      const last = l.cells[l.cells.length - 1];
      c.save();
      c.font = `700 26px ${SM}`; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      c.shadowColor = 'rgba(255,120,40,.9)'; c.shadowBlur = 10;
      c.fillStyle = '#FF9A4A';
      c.fillText(`'${String(l.info.when.getFullYear()).slice(2)} ${two(l.info.when.getMonth() + 1)} ${two(l.info.when.getDate())}`, last.x + last.w - 16, last.y + last.h - 16);
      c.restore();
      // Chữ máy đánh chữ: mỗi ký tự lệch nhẹ, đậm nhạt không đều như mực ruy băng.
      const ti = l.info.title.normalize('NFC');
      fit(c, ti, 440, 30, 400, SM);
      const tw = c.measureText(ti).width, r = rand(31);
      let x = SW / 2 - tw / 2;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      for (const ch of [...ti]) {
        c.fillStyle = `rgba(237,230,216,${0.72 + r() * 0.28})`;
        c.fillText(ch, x, l.h - 62 + (r() - 0.5) * 2.5);
        x += c.measureText(ch).width;
      }
    },
  },
  {
    id: 'music', tone: 'color', top: 46, bottom: 426, side: 40, gap: 20,
    frame: null, pad: 0, radius: 20, pair: '#E2DAE0',
    under: (c, l) => {
      soft(c, l.h, '#E8E1DA', [[80, 0.1, 480, 'rgba(255,255,255,.9)'], [560, 0.45, 520, 'rgba(214,196,214,.85)'], [60, 0.9, 520, 'rgba(240,205,190,.85)']]);
      grain(c, SW, l.h, 0.05);
    },
    over: (c, l) => {
      const x = 40, w = SW - 80, y = l.h - 396, ink = '#2B2723', mute = 'rgba(43,39,35,.5)';
      c.save();
      c.shadowColor = 'rgba(60,40,50,.14)'; c.shadowBlur = 30; c.shadowOffsetY = 10;
      c.fillStyle = 'rgba(255,255,255,.62)';
      c.beginPath(); c.roundRect(x, y, w, 360, 30); c.fill();
      c.restore();
      text(c, t('strip.music.playing'), x + 34, y + 48, mute, 18, 300, 400, 'left', IN);
      text(c, l.info.title, x + 34, y + 94, ink, 36, w - 120, 700, 'left', IN);
      text(c, t('strip.music.by', { date: dmy(l.info.when) }), x + 34, y + 130, mute, 21, w - 120, 400, 'left', IN);
      // Trái tim nhỏ bên phải tên bài.
      const hx = x + w - 52, hy = y + 82;
      c.fillStyle = '#C8576A';
      c.beginPath(); c.moveTo(hx, hy + 14);
      c.bezierCurveTo(hx - 26, hy - 4, hx - 12, hy - 22, hx, hy - 9);
      c.bezierCurveTo(hx + 12, hy - 22, hx + 26, hy - 4, hx, hy + 14); c.fill();
      const by = y + 172, bx = x + 34, bw = w - 68, p = 0.38;
      c.fillStyle = 'rgba(43,39,35,.14)'; c.beginPath(); c.roundRect(bx, by - 3, bw, 6, 3); c.fill();
      c.fillStyle = ink; c.beginPath(); c.roundRect(bx, by - 3, bw * p, 6, 3); c.fill();
      c.beginPath(); c.arc(bx + bw * p, by, 9, 0, TAU); c.fill();
      const el = 60 + l.info.when.getMinutes() + (l.info.when.getDate() % 4) * 13, total = Math.round(el / p);
      const ms = (s: number) => `${Math.floor(s / 60)}:${two(s % 60)}`;
      text(c, ms(el), bx, by + 34, mute, 17, 100, 400, 'left', IN);
      text(c, `-${ms(total - el)}`, bx + bw, by + 34, mute, 17, 100, 400, 'right', IN);
      // Nút: lùi, tạm dừng, tới.
      const cy = y + 262, cx = SW / 2;
      c.fillStyle = ink;
      const tri = (tx: number, dir: number, s: number) => { c.beginPath(); c.moveTo(tx, cy - s); c.lineTo(tx + dir * s * 1.3, cy); c.lineTo(tx, cy + s); c.closePath(); c.fill(); };
      tri(cx - 118, -1, 14); tri(cx - 100, -1, 14);
      tri(cx + 118, 1, 14); tri(cx + 100, 1, 14);
      c.beginPath(); c.roundRect(cx - 16, cy - 24, 11, 48, 4); c.roundRect(cx + 5, cy - 24, 11, 48, 4); c.fill();
      // Âm lượng.
      const vy = y + 322;
      c.fillStyle = 'rgba(43,39,35,.14)'; c.beginPath(); c.roundRect(bx + 36, vy - 3, bw - 72, 6, 3); c.fill();
      c.fillStyle = mute; c.beginPath(); c.roundRect(bx + 36, vy - 3, (bw - 72) * 0.62, 6, 3); c.fill();
      const spk = (sx: number, waves: number) => {
        c.fillStyle = mute; c.beginPath(); c.moveTo(sx, vy - 4); c.lineTo(sx + 5, vy - 4); c.lineTo(sx + 11, vy - 10); c.lineTo(sx + 11, vy + 10); c.lineTo(sx + 5, vy + 4); c.lineTo(sx, vy + 4); c.fill();
        c.strokeStyle = mute; c.lineWidth = 2; c.lineCap = 'round';
        for (let i = 1; i <= waves; i++) { c.beginPath(); c.arc(sx + 12, vy, 5 * i, -0.9, 0.9); c.stroke(); }
      };
      spk(bx, 0); spk(bx + bw - 22, 2);
    },
  },
  {
    id: 'halloween', tone: 'color', top: 232, bottom: 236, side: 48, gap: 24,
    frame: '#0E0A10', pad: 7, radius: 26, shadow: true, pair: '#B9A6D9',
    under: (c, l) => {
      const g = c.createLinearGradient(0, 0, 0, l.h);
      g.addColorStop(0, '#4A2466'); g.addColorStop(0.55, '#2A1638'); g.addColorStop(1, '#120B18');
      c.fillStyle = g; c.fillRect(0, 0, SW, l.h);
      glow(c, SW / 2, 120, 340, 'rgba(242,140,40,.35)', SW, l.h);
      glow(c, SW / 2, l.h - 60, 360, 'rgba(242,120,30,.3)', SW, l.h);
      const r = rand(13);
      for (let i = 0; i < 42; i++) star4(c, r() * SW, r() * l.h, 3 + r() * 6, r() < 0.5 ? 'rgba(255,214,150,.8)' : 'rgba(242,140,40,.75)');
      moon(c, SW - 92, 92, 46, '#F9E7B5');
      bat(c, 88, 64, 50, -0.15); bat(c, 196, 48, 28, 0.2);
      // Chữ cong như vòm, ba lớp: bóng tím lệch, viền đen dày, ruột cam chuyển màu, rồi vài giọt chảy.
      c.font = `400 84px ${BA}`;
      const og = c.createLinearGradient(0, 100, 0, 175);
      og.addColorStop(0, '#FFC062'); og.addColorStop(1, '#F06A12');
      c.lineJoin = 'round';
      arcText(c, 'HALLOWEEN', SW / 2, 900, 730, (ch) => { c.fillStyle = '#7B3FA8'; c.fillText(ch, 5, 6); });
      arcText(c, 'HALLOWEEN', SW / 2, 900, 730, (ch) => { c.lineWidth = 10; c.strokeStyle = '#140A1A'; c.strokeText(ch, 0, 0); });
      arcText(c, 'HALLOWEEN', SW / 2, 900, 730, (ch) => { c.fillStyle = og; c.fillText(ch, 0, 0); });
      c.fillStyle = '#F06A12';
      for (const [dx, len] of [[-150, 16], [-58, 24], [40, 14], [132, 20]]) {
        const x = SW / 2 + dx, y = 168 + (dx * dx) / 1460;
        c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.lineTo(x + 4, y + len); c.arc(x, y + len, 4.5, 0, Math.PI); c.closePath(); c.fill();
      }
      fit(c, `${l.info.title} · ${dmy(l.info.when)}`, 460, 28, 400, BA);
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#F6E3C4'; c.fillText(`${l.info.title} · ${dmy(l.info.when)}`, SW / 2, 220);
    },
    over: (c, l) => {
      const [a] = l.cells, z = l.cells[l.cells.length - 1], m = l.cells[1];
      web(c, a.x - 6, a.y - 6, 120, 0, Math.PI / 2);
      web(c, z.x + z.w + 6, z.y + z.h + 6, 130, Math.PI, Math.PI * 1.5);
      bat(c, m.x + m.w - 30, m.y - 6, 46, 0.25);
      cat(c, a.x + a.w - 64, a.y + a.h + 4, 60);
      pumpkin(c, SW / 2, l.h - 104, 70);
      pumpkin(c, SW / 2 - 150, l.h - 74, 44);
      pumpkin(c, SW / 2 + 150, l.h - 70, 40, false);
      for (const [x, y] of [[40, l.h - 50], [SW - 40, l.h - 120], [SW - 70, l.h - 40]]) star4(c, x, y, 9, 'rgba(255,214,150,.85)');
    },
  },
  {
    id: 'tet', tone: 'color', top: 236, bottom: 236, side: 52, gap: 22,
    frame: '#FFF3DC', pad: 8, radius: 14, shadow: true, pair: '#F4E3C3',
    under: (c, l) => {
      const g = c.createLinearGradient(0, 0, 0, l.h);
      g.addColorStop(0, '#B8261E'); g.addColorStop(1, '#7E1414');
      c.fillStyle = g; c.fillRect(0, 0, SW, l.h);
      const r = rand(21);
      c.fillStyle = 'rgba(242,193,78,.16)';
      for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(r() * SW, r() * l.h, 2 + r() * 4, 0, TAU); c.fill(); }
      c.strokeStyle = '#F2C14E'; c.lineWidth = 2.5;
      c.beginPath(); c.roundRect(16, 16, SW - 32, l.h - 32, 18); c.stroke();
      c.lineWidth = 1.2; c.beginPath(); c.roundRect(26, 26, SW - 52, l.h - 52, 12); c.stroke();
      lantern(c, 92, 26, 102, 36); lantern(c, SW - 92, 26, 126, 30);
      text(c, t('strip.tet.title'), SW / 2, 106, '#FFE3A3', 34, 300, 700, 'center', DS);
      // Tên nhà: viền kép đỏ sẫm và vàng nhạt, ruột vàng ánh kim.
      const ti = l.info.title;
      fit(c, ti, 340, 52, 400, PA);
      c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
      c.lineWidth = 12; c.strokeStyle = '#5A0B0B'; c.strokeText(ti, SW / 2, 182);
      c.lineWidth = 5; c.strokeStyle = '#FFE3A3'; c.strokeText(ti, SW / 2, 182);
      const gg = c.createLinearGradient(0, 140, 0, 186);
      gg.addColorStop(0, '#FFE38A'); gg.addColorStop(1, '#E2A62B');
      c.fillStyle = gg; c.fillText(ti, SW / 2, 182);
    },
    over: (c, l) => {
      const [a] = l.cells;
      maiBranch(c, [[-10, a.y + 130], [40, a.y + 70], [110, a.y + 26], [170, a.y - 6], [230, a.y - 20]], 3, 0.85);
      maiBranch(c, [[-10, l.h - 30], [60, l.h - 92], [130, l.h - 132], [200, l.h - 156], [252, l.h - 176]], 9);
      envelope(c, SW - 150, l.h - 118, 70, -0.18); envelope(c, SW - 84, l.h - 108, 64, 0.16);
      stamp(c, 344, l.h - 100, 54, -0.2, '#FFE3A3', t('strip.tet.stamp', { year: l.info.when.getFullYear() + (l.info.when.getMonth() >= 9 ? 1 : 0) }), t('strip.tet.luck'), `500 13px ${OS}`, `400 30px ${PA}`);
      text(c, dmy(l.info.when), 344, l.h - 28, 'rgba(255,227,163,.85)', 22, 200, 700, 'center', DS);
    },
  },
  {
    id: 'xmas', tone: 'color', top: 226, bottom: 262, side: 48, gap: 22,
    frame: '#FFFFFF', pad: 8, radius: 18, shadow: true, pair: '#E7EEE8',
    under: (c, l) => {
      const g = c.createLinearGradient(0, 0, 0, l.h);
      g.addColorStop(0, '#1F5A43'); g.addColorStop(1, '#0F2E24');
      c.fillStyle = g; c.fillRect(0, 0, SW, l.h);
      // Dây đèn nhỏ chạy ngang trên đầu.
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 2;
      c.beginPath(); for (let x = 0; x <= SW; x += 10) c.lineTo(x, 34 + Math.sin(x / 48) * 14); c.stroke();
      const cols = ['#F6CF57', '#E2453C', '#F4EFE6', '#7FD0A0'];
      for (let i = 0, x = 24; x < SW; x += 46, i++) {
        const y = 34 + Math.sin(x / 48) * 14 + 9;
        c.save(); c.shadowColor = cols[i % 4]; c.shadowBlur = 12; c.fillStyle = cols[i % 4];
        c.beginPath(); c.ellipse(x, y, 6, 9, 0, 0, TAU); c.fill(); c.restore();
      }
      const r = rand(17);
      c.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 110; i++) { c.beginPath(); c.arc(r() * SW, r() * l.h, 1.5 + r() * 3.2, 0, TAU); c.fill(); }
      text(c, t('strip.xmas.title'), SW / 2, 112, '#F6CF57', 32, 400, 700, 'center', DS);
      // Tên nhà: bóng đỏ lệch xuống phải như in hai màu, sao nhỏ hai bên.
      const ti = l.info.title;
      fit(c, ti, 430, 60, 400, LO);
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#D83A3A'; c.fillText(ti, SW / 2 + 4, 186);
      c.fillStyle = '#FFFFFF'; c.fillText(ti, SW / 2, 182);
      const tw = Math.min(c.measureText(ti).width, 430);
      star4(c, SW / 2 - tw / 2 - 26, 150, 12, '#F6CF57'); star4(c, SW / 2 + tw / 2 + 24, 140, 9, '#F6CF57'); star4(c, SW / 2 + tw / 2 + 12, 176, 6, '#FFFFFF');
    },
    over: (c, l) => {
      const r = rand(29);
      c.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(r() * SW, r() * l.h, 2 + r() * 3, 0, TAU); c.fill(); }
      const h = l.h;
      c.fillStyle = '#F4F1EA';
      c.beginPath(); c.moveTo(0, h - 96);
      c.bezierCurveTo(150, h - 150, 300, h - 70, 420, h - 112); c.bezierCurveTo(500, h - 140, 560, h - 120, SW, h - 128);
      c.lineTo(SW, h); c.lineTo(0, h); c.fill();
      pine(c, SW - 112, h - 70, 160, 196);
      gift(c, 70, h - 150, 70, 56, '#D83A3A', '#F6CF57');
      gift(c, 148, h - 136, 58, 44, '#F6CF57', '#2F8552');
      text(c, dmy(l.info.when), 150, h - 40, '#2F5B47', 30, 220, 700, 'center', DS);
    },
  },
  {
    id: 'photo', tone: 'color', top: 60, bottom: 226, side: 44, gap: 22,
    frame: '#FFFFFF', pad: 9, radius: 22, shadow: true, pair: '#2B2723',
    under: (c, l) => {
      c.fillStyle = '#8A8278'; c.fillRect(0, 0, SW, l.h);
      const p = l.info.photo;
      if (p?.naturalWidth) cover(c, p, p.naturalWidth, p.naturalHeight, 0, 0, SW, l.h, false);
      c.fillStyle = 'rgba(30,25,22,.25)'; c.fillRect(0, 0, SW, l.h);
    },
    over: (c, l) => {
      c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 14;
      fit(c, l.info.title, 480, 56, 700, PF, 'italic');
      c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = '#FFFFFF';
      c.fillText(l.info.title, SW / 2, l.h - 124);
      const tw = Math.min(c.measureText(l.info.title).width, 480);
      scribble(c, SW / 2 - tw / 2, SW / 2 + tw / 2, l.h - 102, 'rgba(255,255,255,.85)', 3.5);
      fit(c, `${WD(l.info.when).toLowerCase()}, ${dmy(l.info.when)}`, 480, 28, 400, PH);
      marker(c, `${WD(l.info.when).toLowerCase()}, ${dmy(l.info.when)}`, SW / 2, l.h - 58, 'rgba(255,255,255,.92)', 9);
      c.restore();
    },
  },
];

export const stripTheme = (id: string) => STRIPS.find((t) => t.id === id) ?? STRIPS[0];

function layout(t: StripTheme, n: number, info: StripInfo): L {
  const h = stripH(n);
  const w = SW - t.side * 2;
  const ch = (h - t.top - t.bottom - t.gap * (n - 1)) / n;
  return { n, h, info, cells: Array.from({ length: n }, (_, i) => ({ x: t.side, y: t.top + i * (ch + t.gap), w, h: ch })) };
}

/** Vẽ một dải ở toạ độ logic (rộng 600). Ô chưa có ảnh vẽ dáng người mờ. */
export function drawStrip(c: Ctx, id: string, frames: (CanvasImageSource | null)[], n: number, info: StripInfo, t: Tone) {
  const th = stripTheme(id);
  const l = layout(th, n, info);
  c.save();
  th.under(c, l);
  l.cells.forEach((b, i) => {
    if (th.frame) {
      c.save();
      if (th.shadow) { c.shadowColor = 'rgba(20,10,10,.28)'; c.shadowBlur = 22; c.shadowOffsetY = 8; }
      c.fillStyle = th.frame; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, th.radius); c.fill();
      c.restore();
    }
    const p = th.pad;
    photoIn(c, frames[i] ?? null, { x: b.x + p, y: b.y + p, w: b.w - p * 2, h: b.h - p * 2 }, Math.max(th.radius - p, 2), t);
  });
  th.over?.(c, l);
  c.restore();
}

/** Xuất ảnh: một dải, hoặc hai dải cạnh nhau như tấm ảnh in đôi ở tiệm chụp. */
export function renderStrip(id: string, frames: (CanvasImageSource | null)[], n: number, info: StripInfo, tn: Tone, pair: boolean, scale = 2) {
  const h = stripH(n);
  const one = document.createElement('canvas');
  const s1 = pair ? scale * 0.72 : scale;
  one.width = Math.round(SW * s1); one.height = Math.round(h * s1);
  const c1 = one.getContext('2d')!;
  c1.scale(s1, s1);
  drawStrip(c1, id, frames, n, info, tn);
  if (!pair) return one;
  const th = stripTheme(id);
  const M = 70, PW = SW * 2 + M * 3, PH = h + M * 2;
  const out = document.createElement('canvas');
  out.width = Math.round(PW * s1); out.height = Math.round(PH * s1);
  const c = out.getContext('2d')!;
  c.scale(s1, s1);
  c.fillStyle = th.pair; c.fillRect(0, 0, PW, PH);
  if (th.tilt) {
    // Chữ viền lặp lại phía sau, như tờ lót ảnh.
    c.save();
    c.strokeStyle = 'rgba(43,39,35,.22)'; c.lineWidth = 2.5;
    c.font = `600 132px ${F}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const back = t('strip.pair.back');
    for (let y = 90, i = 0; y < PH; y += 170, i++) { c.globalAlpha = 1 - i * 0.07; c.strokeText(back, PW / 2, y); }
    c.restore();
  } else grain(c, PW, PH, 0.05);
  [M, M * 2 + SW].forEach((x, i) => {
    c.save();
    const a = th.tilt ? (i ? th.tilt * 0.7 : -th.tilt) : 0;
    c.translate(x + SW / 2, M + h / 2); c.rotate(a);
    c.shadowColor = 'rgba(20,10,10,.3)'; c.shadowBlur = 30; c.shadowOffsetY = 12;
    c.drawImage(one, -SW / 2, -h / 2, SW, h);
    c.restore();
  });
  return out;
}

/** Một tấm trong dải, tỉ lệ gần với ô của các khung (khoảng 1,15:1) để cắt ít nhất. */
export const FW = 920, FH = 800;
export type Face = { id?: string; video: HTMLVideoElement | HTMLCanvasElement | null; name: string; mirror: boolean };
type Rect = { x: number; y: number; w: number; h: number };

/** Chia ô theo số người: 1 choán hết, 2 cạnh nhau, 3 một lớn hai nhỏ, 4 lưới 2x2, 5 đến 8 hai hàng đều, hàng lẻ canh giữa. */
export function faceCells(n: number, W = FW, H = FH, gap = 6): Rect[] {
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
  if (n === 2) { const w = (W - gap) / 2; return [{ x: 0, y: 0, w, h: H }, { x: w + gap, y: 0, w, h: H }]; }
  if (n === 3) {
    const w = W * 0.56, w2 = W - w - gap, h2 = (H - gap) / 2;
    return [{ x: 0, y: 0, w, h: H }, { x: w + gap, y: 0, w: w2, h: h2 }, { x: w + gap, y: h2 + gap, w: w2, h: h2 }];
  }
  const rows = n === 4 ? 2 : n <= 8 ? 2 : 3;
  const cols = Math.ceil(n / rows);
  const cw = (W - gap * (cols - 1)) / cols, ch = (H - gap * (rows - 1)) / rows;
  // Hàng trên nhiều hơn khi số lẻ; hàng dưới ít hơn thì canh giữa.
  const out: Rect[] = [];
  let left = n;
  for (let r = 0; r < rows; r++) {
    const inRow = Math.ceil(left / (rows - r));
    const off = ((cols - inRow) * (cw + gap)) / 2;
    for (let k = 0; k < inRow; k++) out.push({ x: off + k * (cw + gap), y: r * (ch + gap), w: cw, h: ch });
    left -= inRow;
  }
  return out;
}

/** Phủ kín ô, cắt dọc lệch lên trên để mặt nằm ở nửa trên. */
function coverTop(c: Ctx, src: CanvasImageSource, sw: number, sh: number, b: Rect, mirror: boolean) {
  const s = Math.max(b.w / sw, b.h / sh);
  const cw = b.w / s, ch = b.h / s;
  const sx = (sw - cw) / 2, sy = (sh - ch) * 0.3;
  c.save();
  c.beginPath(); c.rect(b.x, b.y, b.w, b.h); c.clip();
  if (mirror) { c.translate(b.x * 2 + b.w, 0); c.scale(-1, 1); }
  c.drawImage(src, sx, sy, cw, ch, b.x, b.y, b.w, b.h);
  c.restore();
}

function faceInto(c: Ctx, f: Face, b: Rect, label: boolean) {
  const v = f.video;
  const ready = v instanceof HTMLVideoElement ? v.videoWidth > 0 && v.readyState >= 2 : !!v && v.width > 0;
  if (v && ready) {
    const [sw, sh] = v instanceof HTMLVideoElement ? [v.videoWidth, v.videoHeight] : [v.width, v.height];
    coverTop(c, v, sw, sh, b, f.mirror);
  } else {
    const g = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    g.addColorStop(0, '#F1E2D8'); g.addColorStop(1, '#D9D2E0');
    c.fillStyle = g; c.fillRect(b.x, b.y, b.w, b.h);
    c.fillStyle = '#9A5A44'; c.font = `600 ${Math.round(Math.min(b.w, b.h) * 0.32)}px ${F}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText((f.name.trim().split(/\s+/).pop()?.[0] ?? '?').toUpperCase(), b.x + b.w / 2, b.y + b.h * 0.46);
  }
  if (!label || !f.name) return;
  const fs = Math.round(Math.max(26, Math.min(42, Math.min(b.w, b.h) * 0.1)));
  c.font = `500 ${fs}px ${F}`;
  const name = f.name.length > 14 ? f.name.slice(0, 13) + '…' : f.name;
  const tw = Math.min(c.measureText(name).width + fs * 1.1, b.w - 30);
  const tx = b.x + 18, ty = b.y + b.h - fs * 1.6 - 16;
  c.fillStyle = 'rgba(30,25,22,.4)';
  c.beginPath(); c.roundRect(tx, ty, tw, fs * 1.6, fs * 0.8); c.fill();
  c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(name, tx + tw / 2, ty + fs * 0.82, tw - fs * 0.6);
}

/** Vẽ một tấm: cả nhà chung một ô (chia theo số người), hoặc chỉ một người. */
export function snapInto(c: Ctx, faces: Face[]) {
  c.fillStyle = '#2B2723'; c.fillRect(0, 0, FW, FH);
  const list = faces.length ? faces : [{ video: null, name: '?', mirror: false }];
  const boxes = faceCells(list.length);
  list.forEach((f, i) => faceInto(c, f, boxes[i], list.length > 1 || faces.length === 1));
}

export function snap(faces: Face[]) {
  const cv = document.createElement('canvas');
  cv.width = FW; cv.height = FH;
  snapInto(cv.getContext('2d')!, faces);
  return cv;
}
