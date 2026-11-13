// Video dọc sau cuộc gọi: giọng người kể là trục chính, ảnh chạy chậm kiểu Ken Burns trong khung ảnh in trên nền giấy ấm,
// phụ đề đốt vào video, thẻ câu hỏi giữa các đoạn, mở đầu và kết ngắn. Không ảnh thì thẻ màu ấm có sóng âm nhẹ.
// Dựng một lượt ffmpeg: nền giấy và khung ảnh vẽ bằng JS (PPM/PAM), ảnh chỉnh màu một lần, chữ bằng libass (font trong server/fonts).
// 720x1280, 24 khung/giây, tiếng lấy nguyên tệp m4a của tập podcast (cùng một bản tiếng, khỏi mã hoá lại).
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Lang } from './i18n.ts';
import { ffmpeg, type Word } from './voiceedit.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(here, 'fonts');
const W = 720, H = 1280, FPS = 24;
const FADE = 0.45;
// Khung ảnh in: mép giấy trắng ngà 10 px, bo góc, bóng mềm. Hộp lớp (gồm bóng) đặt ở (BX, BY).
const PX = 44, PY = 150, PW = 632, PH = 790, PR = 30, BORDER = 10;
const IX = PX + BORDER, IY = PY + BORDER, IW = PW - 2 * BORDER, IH = PH - 2 * BORDER, IR = PR - BORDER;
const BX = 8, BY = 118, BW = 704, BH = 880;
const SW = 698, SH = 878; // ảnh tĩnh lớn hơn khung 14% để có chỗ phóng và lia

export type VSeg =
  | { kind: 'intro'; s: number; e: number }
  | { kind: 'card'; s: number; e: number; n: number; of: number; question: string }
  | { kind: 'voice'; s: number; e: number; words: Word[]; photo: string | null; topic: string }
  | { kind: 'outro'; s: number; e: number };

export type VideoText = { tells: string; what: string; date: string; asked: string; questionOf: (n: number, of: number) => string; thanks: string; bye: string; family: string; name: string };
export type VideoInput = { audio: string; total: number; segs: VSeg[]; lang: Lang; text: VideoText };

// ---------- Ảnh nền, khung ảnh: vẽ thẳng ra PPM/PAM ----------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function sdRound(px: number, py: number, x: number, y: number, w: number, h: number, r: number) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r), qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Giấy ấm: sáng ở giữa, ngả dần ra mép, vân giấy rất nhẹ (tĩnh, nén video gần như không tốn). */
function paper(w: number, h: number, ox = 0, oy = 0) {
  const rand = rng(7);
  const gw = 20, gh = 34;
  const grid = Array.from({ length: (gw + 1) * (gh + 1) }, () => rand() - 0.5);
  const at = (gx: number, gy: number) => grid[Math.min(gh, gy) * (gw + 1) + Math.min(gw, gx)];
  const fine = rng(11);
  const buf = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + ox, Y = y + oy;
    const u = X / W, v = Y / H;
    const r2 = ((u - 0.5) / 0.62) ** 2 + ((v - 0.45) / 0.75) ** 2;
    const k = smooth(0, 1.2, r2);
    const fx = (u * gw), fy = (v * gh), ix = Math.floor(fx), iy = Math.floor(fy);
    const sx = smooth(0, 1, fx - ix), sy = smooth(0, 1, fy - iy);
    const n = (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
    const grain = (fine() - 0.5) * 3.2 + n * 5;
    const base = [247 - 13 * k, 241 - 15 * k, 232 - 18 * k];
    const o = (y * w + x) * 3;
    buf[o] = base[0] + grain; buf[o + 1] = base[1] + grain; buf[o + 2] = base[2] + grain * 0.9;
  }
  return buf;
}
const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function writePPM(file: string, w: number, h: number, rgb: Float32Array) {
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < out.length; i++) out[i] = byte(rgb[i]);
  writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), out]));
}
function writePAM(file: string, w: number, h: number, px: (x: number, y: number) => [number, number, number, number]) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = px(x, y), o = (y * w + x) * 4;
    out[o] = byte(r); out[o + 1] = byte(g); out[o + 2] = byte(b); out[o + 3] = byte(a * 255);
  }
  writeFileSync(file, Buffer.concat([Buffer.from(`P7\nWIDTH ${w}\nHEIGHT ${h}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`), out]));
}

const SHADOW = [58, 44, 36];
function shadowAlpha(X: number, Y: number) {
  const d = sdRound(X, Y, PX + 4, PY + 18, PW - 8, PH - 6, PR + 6);
  return 0.2 * (1 - smooth(-30, 46, d));
}

/** Khung ảnh in (mép giấy + bóng) và bốn góc bo phủ lên ảnh. */
function writePlates(work: string) {
  const edge = [255, 252, 246];
  writePAM(path.join(work, 'plate.pam'), BW, BH, (x, y) => {
    const X = x + BX + 0.5, Y = y + BY + 0.5;
    const inside = Math.min(1, Math.max(0, 0.5 - sdRound(X, Y, PX, PY, PW, PH, PR)));
    const sa = shadowAlpha(X, Y) * (1 - inside);
    const a = inside + sa;
    if (a <= 0) return [0, 0, 0, 0];
    const c = edge.map((e, j) => (e * inside + SHADOW[j] * sa) / a);
    return [c[0], c[1], c[2], a];
  });
  writePAM(path.join(work, 'corners.pam'), IW, IH, (x, y) => {
    const a = Math.min(1, Math.max(0, 0.5 + sdRound(x + 0.5, y + 0.5, 0, 0, IW, IH, IR)));
    return [edge[0], edge[1], edge[2], a];
  });
  // Thẻ không ảnh, hai màu dùng xen kẽ: giấy đất nung rất nhạt và xanh xám lá khô, đậm dần xuống dưới.
  const tints = [[[244, 232, 220], [-10, -14, -16]], [[233, 234, 225], [-12, -12, -14]]];
  tints.forEach(([top, drop], k) => {
    const rand = rng(3 + k);
    writePAM(path.join(work, `plateq${k}.pam`), BW, BH, (x, y) => {
      const X = x + BX + 0.5, Y = y + BY + 0.5;
      const inside = Math.min(1, Math.max(0, 0.5 - sdRound(X, Y, PX, PY, PW, PH, PR)));
      const sa = shadowAlpha(X, Y) * (1 - inside) * 0.8;
      const a = inside + sa;
      if (a <= 0) return [0, 0, 0, 0];
      const v = (Y - PY) / PH, n = (rand() - 0.5) * 3;
      const c = top.map((t, j) => ((t + drop[j] * v + n) * inside + SHADOW[j] * sa) / a);
      return [c[0], c[1], c[2], a];
    });
  });
}

// ---------- Ảnh: xoay theo EXIF, chỉnh màu ấm một lần ----------

/** Hướng ảnh JPEG trong EXIF (1 đến 8); ffmpeg cũ không tự xoay ảnh tĩnh. */
export function jpegOrientation(file: string): number {
  let fd = -1;
  try {
    fd = openSync(file, 'r');
    const b = Buffer.alloc(131072);
    const n = readSync(fd, b, 0, b.length, 0);
    if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
    let p = 2;
    while (p + 4 < n) {
      if (b[p] !== 0xff) return 1;
      const marker = b[p + 1], len = b.readUInt16BE(p + 2);
      if (marker === 0xe1 && b.toString('latin1', p + 4, p + 10) === 'Exif\0\0') {
        const t = p + 10, le = b.toString('latin1', t, t + 2) === 'II';
        const u16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
        const u32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
        const ifd = t + u32(t + 4), count = u16(ifd);
        for (let i = 0; i < count; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 12 > n) break;
          if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
        }
        return 1;
      }
      if (marker === 0xda) return 1;
      p += 2 + len;
    }
  } catch {} finally { if (fd >= 0) closeSync(fd); }
  return 1;
}
const ORIENT = ['', '', 'hflip,', 'hflip,vflip,', 'vflip,', 'transpose=0,', 'transpose=1,', 'transpose=3,', 'transpose=2,'];

async function prepPhoto(src: string, out: string, work: string) {
  const o = /\.jpe?g$/i.test(src) ? jpegOrientation(src) : 1;
  const grade = [
    `${ORIENT[o]}scale=${SW}:${SH}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${SW}:${SH}:(iw-${SW})/2:(ih-${SH})*0.4`,
    'eq=contrast=1.03:saturation=0.9:gamma=1.02',
    'colorbalance=rs=0.03:bs=-0.03:rm=0.025:gm=0.005:bm=-0.025:rh=0.015:bh=-0.02',
    "curves=all='0/0.04 0.5/0.51 1/0.97'",
    'vignette=angle=PI/5',
  ].join(',');
  await ffmpeg(['-v', 'error', '-noautorotate', '-i', src, '-frames:v', '1', '-vf', grade, '-pix_fmt', 'rgb24', out], work, 60_000);
}

// ---------- Chữ: đo, xuống dòng, phụ đề ----------

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const KS = (() => {
  const set = new Set<string>();
  try {
    const dec = new TextDecoder('euc-kr');
    for (let a = 0xb0; a <= 0xc8; a++) for (let b = 0xa1; b <= 0xfe; b++) set.add(dec.decode(new Uint8Array([a, b])));
  } catch {}
  return set;
})();

type Fonts = { sans: string; serif: string; italic: string; kr: boolean };
const fontsFor = (lang: Lang): Fonts => (lang === 'ko'
  ? { sans: 'SH Sans KR', serif: 'SH Serif KR', italic: 'SH Serif KR', kr: true }
  : { sans: 'SH Sans', serif: 'SH Serif', italic: 'SH Serif Italic', kr: false });

/** Chữ an toàn cho ASS; chữ Hàn lẫn trong câu Việt/Anh (hoặc chữ Hàn hiếm trong font có chân) đổi sang font Hàn từng đoạn. */
function esc(s: string, font: string, f: Fonts) {
  const clean = s.normalize('NFC').replace(/[{}]/g, '').replace(/\s+/g, ' ').replace(/\\/g, '/');
  const needKr = (ch: string) => (f.kr ? font === 'SH Serif KR' && HANGUL.test(ch) && KS.size > 0 && !KS.has(ch) : HANGUL.test(ch));
  if (![...clean].some(needKr)) return clean;
  let out = '', on = false;
  for (const ch of clean) {
    const k = needKr(ch);
    if (k !== on) { out += `{\\fn${k ? 'SH Sans KR' : font}}`; on = k; }
    out += ch;
  }
  return on ? `${out}{\\fn${font}}` : out;
}

export function textWidth(s: string, size: number) {
  let w = 0;
  for (const ch of s.normalize('NFC')) {
    if (HANGUL.test(ch)) w += 0.95;
    else if (ch === ' ') w += 0.27;
    else if (/[.,:;'!|ilìíỉĩịjt()]/.test(ch)) w += 0.31; // i18n-ok: bảng đo bề rộng chữ
    else if (/[mwMW]/.test(ch)) w += 0.84;
    else if (ch !== ch.toLowerCase()) w += 0.68;
    else w += 0.55;
  }
  return w * size;
}

/** Chia các từ thành đúng n dòng: dòng dài gần bằng nhau, ưu tiên ngắt sau dấu câu, tránh dòng cụt; null nếu không vừa maxW. */
function breakLines(words: string[], size: number, maxW: number, n: number): string[] | null {
  const width = (a: number, b: number) => textWidth(words.slice(a, b).join(' '), size);
  const avg = width(0, words.length) / n / size;
  // best[k][i]: chi phí nhỏ nhất xếp i từ đầu vào k dòng.
  const best: number[][] = Array.from({ length: n + 1 }, () => Array(words.length + 1).fill(Infinity));
  const from: number[][] = Array.from({ length: n + 1 }, () => Array(words.length + 1).fill(-1));
  best[0][0] = 0;
  for (let k = 1; k <= n; k++) for (let i = 1; i <= words.length; i++) for (let j = k - 1; j < i; j++) {
    if (best[k - 1][j] === Infinity) continue;
    const w = width(j, i);
    if (w > maxW * 1.02) continue;
    const d = (w / size - avg) / avg;
    let c = 10 * d * d;
    if (w / size < avg * 0.35) c += 5;
    if (i < words.length && /[,.;:!?…]["”»)]?$/.test(words[i - 1])) c -= 3;
    if (best[k - 1][j] + c < best[k][i]) { best[k][i] = best[k - 1][j] + c; from[k][i] = j; }
  }
  if (best[n][words.length] === Infinity) return null;
  const out: string[] = [];
  for (let k = n, i = words.length; k > 0; i = from[k][i], k--) out.unshift(words.slice(from[k][i], i).join(' '));
  return out;
}

/** Xuống dòng đẹp, không quá maxLines dòng (dòng cuối cắt bớt nếu vẫn không vừa). */
export function wrap(text: string, size: number, maxW: number, maxLines: number) {
  const words = text.normalize('NFC').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const min = Math.max(1, Math.ceil(textWidth(words.join(' '), size) / maxW));
  for (let n = min; n <= Math.min(maxLines, words.length); n++) {
    const lines = breakLines(words, size, maxW, n);
    if (lines) return lines;
  }
  const lines = breakLines(words.slice(0, Math.max(1, Math.floor((words.length * maxLines) / min) - 1)), size, maxW, maxLines) ?? [words.join(' ')];
  lines[lines.length - 1] += '…';
  return lines;
}

type Cue = { s: number; e: number; lines: string[] };
const SUB_SIZE = 40, SUB_W = 600;

/** Chia lời thành từng cụm tối đa 2 dòng: ngắt ở cuối câu, dấu phẩy, chỗ ngừng, hoặc khi cụm quá dài/quá lâu. */
export function cues(words: Word[], segStart: number, segEnd: number): Cue[] {
  const out: Cue[] = [];
  let cur: Word[] = [];
  const w2 = (ws: Word[]) => textWidth(ws.map((w) => w.w).join(' '), SUB_SIZE);
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.w).join(' ');
    out.push({ s: Math.max(segStart, cur[0].s - 0.05), e: cur[cur.length - 1].e + 0.3, lines: textWidth(text, SUB_SIZE) > SUB_W ? wrap(text, SUB_SIZE, SUB_W, 2) : [text] });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.s - prev.e > 0.65 || w2([...cur, w]) > SUB_W * 1.9 || w.e - cur[0].s > 6)) flush();
    cur.push(w);
    const width = w2(cur);
    if ((/[.?!…]["”»)]?$/.test(w.w) && width > SUB_W * 0.45) || (/[,;:]$/.test(w.w) && width > SUB_W * 1.15)) flush();
  }
  flush();
  // Không chồng lên nhau, không quá ngắn, không tràn ra ngoài đoạn giọng.
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    out[i].e = Math.min(Math.max(out[i].e, out[i].s + 1.0), next ? next.s - 0.04 : segEnd, segEnd);
  }
  return out.filter((c) => c.e - c.s > 0.25);
}

const ts = (t: number) => {
  const c = Math.max(0, Math.round(t * 100));
  return `${Math.floor(c / 360000)}:${String(Math.floor(c / 6000) % 60).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`;
};
const C = { ink: '&H0023272B&', soft: '&H004B535A&', muted: '&H0078828A&', accent: '&H00445A9A&' };
const upper = (s: string, lang: Lang) => s.toLocaleUpperCase(lang === 'vi' ? 'vi-VN' : lang === 'ko' ? 'ko-KR' : 'en-US');

/** Sóng âm kiểu ghi âm trên điện thoại: mỗi 0,1 giây một vạch cao theo độ to, trôi dần sang trái (libass tự nội suy vị trí). */
const BAR_STEP = 0.1, BAR_N = 34, BAR_PITCH = 13, BAR_W = 5, BAR_CY = 712, BAR_X0 = 360 - (BAR_N * BAR_PITCH) / 2;
function barEvents(levels: number[], s: number, e: number, a: number, b: number) {
  const out: string[] = [];
  const speed = BAR_PITCH / BAR_STEP, life = (BAR_N + 1) * BAR_STEP, xR = BAR_X0 + BAR_N * BAR_PITCH + BAR_PITCH / 2;
  const clip = `\\clip(${Math.round(BAR_X0 - 4)},${BAR_CY - 90},${Math.round(xR - BAR_PITCH / 2 + 4)},${BAR_CY + 90})`;
  // Mốc đặt đúng lưới 1/100 giây của ASS để các vạch trôi cùng tốc độ, cách đều nhau.
  const g = (x: number) => Math.round(x * 100) / 100;
  for (let k = -BAR_N; s + k * BAR_STEP < e; k++) {
    const tau = g(s + k * BAR_STEP);
    const lv = k >= 0 ? levels[k] ?? 0 : 0;
    const h = Math.round(4 + 104 * lv), r = BAR_W / 2;
    const start = g(Math.max(a, tau)), end = g(Math.min(b, tau + life));
    if (end - start < 0.05) continue;
    const x0 = xR - (start - tau) * speed, x1 = xR - (end - tau) * speed;
    const draw = `m 0 ${r} b 0 0 ${BAR_W} 0 ${BAR_W} ${r} l ${BAR_W} ${h - r} b ${BAR_W} ${h} 0 ${h} 0 ${h - r}`;
    const fadeIn = start <= a + 0.01 ? Math.round(FADE * 1000) : 120;
    const fadeOut = end >= b - 0.01 ? Math.round(FADE * 1000) : 0;
    out.push(`Dialogue: 1,${ts(start)},${ts(end)},Base,,0,0,0,,{\\an5\\move(${x0.toFixed(1)},${BAR_CY},${x1.toFixed(1)},${BAR_CY},0,${Math.round((end - start) * 1000)})${clip}\\p1\\c${C.accent}\\alpha&H30&\\fad(${fadeIn},${fadeOut})}${draw}`);
  }
  return out;
}

/** Độ to (0..1) mỗi 0,1 giây của một đoạn trong tệp tiếng. */
async function levelsOf(audio: string, s: number, e: number, work: string) {
  const { out } = await ffmpeg(['-v', 'error', '-ss', s.toFixed(3), '-t', (e - s).toFixed(3), '-i', audio, '-ac', '1', '-ar', '8000', '-f', 'f32le', 'pipe:1'], work, 60_000);
  const per = 800, n = Math.floor(out.byteLength / 4 / per), dbs: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < per; j++) { const x = out.readFloatLE((i * per + j) * 4); sum += x * x; }
    dbs.push(10 * Math.log10(sum / per + 1e-12));
  }
  // Giọng đã nén nên độ to khá đều: so với mức to nhất của chính đoạn này (24 dB dưới đó là vạch thấp nhất) để vạch có cao có thấp.
  const top = [...dbs].sort((a, b) => a - b)[Math.floor(dbs.length * 0.95)] ?? -20;
  return dbs.map((db) => Math.pow(Math.min(1, Math.max(0, (db - top + 24) / 24)), 1.8));
}

function buildAss(v: VideoInput, introPhoto: boolean, extra: string[]) {
  const f = fontsFor(v.lang), T = v.text;
  const ev: string[] = [];
  const add = (s: number, e: number, tags: string, text: string, layer = 1) => { if (e - s > 0.05) ev.push(`Dialogue: ${layer},${ts(s)},${ts(e)},Base,,0,0,0,,{${tags}}${text}`); };
  const line = (s: number, e: number, x: number, y: number, font: string, size: number, color: string, text: string, extra = '', layer = 1) =>
    add(s, e, `\\an5\\pos(${x},${y})\\fn${font}\\fs${size}\\c${color}${extra}`, esc(text, font, f), layer);
  const fade = (a: number, b: number) => `\\fad(${Math.round(a * 1000)},${Math.round(b * 1000)})`;
  const rise = (x: number, y: number, ms: number) => `\\move(${x},${y + 12},${x},${y},0,${ms})`;
  const total = v.total;
  const intro = v.segs.find((s) => s.kind === 'intro');
  const outro = v.segs.find((s) => s.kind === 'outro');
  const bodyS = intro ? intro.e - 0.2 : 0, bodyE = outro ? outro.s + 0.3 : total;

  // Đầu trang (thương hiệu + người kể) và thanh tiến độ mảnh ở chân.
  line(bodyS, bodyE, 360, 68, f.sans, 17, C.accent, 'SWEET HOME', `\\fsp6${fade(0.6, 0.5)}`);
  line(bodyS, bodyE, 360, 106, f.italic, 30, C.soft, T.name, fade(0.6, 0.5));
  const bar = 'm 0 0 l 440 0 440 3 0 3';
  add(0.3, total - 0.3, `\\an7\\pos(140,1212)\\p1\\c${C.ink}\\alpha&HD8&${fade(0.6, 0.6)}`, bar, 0);
  add(0.3, total - 0.3, `\\an7\\pos(140,1212)\\p1\\c${C.accent}${fade(0.6, 0.6)}\\clip(140,1200,140,1224)\\t(0,${Math.round((total - 0.6) * 1000)},\\clip(140,1200,580,1224))`, bar, 0);

  for (const s of v.segs) {
    if (s.kind === 'intro') {
      // Có ảnh: ảnh mở đầu trong khung, tên dưới ảnh. Không ảnh: tên đặt giữa trang giấy.
      const y = introPhoto ? 1020 : 600, big = introPhoto ? (f.kr ? 44 : 50) : (f.kr ? 52 : 60);
      if (!introPhoto) line(s.s + 0.1, s.e, 360, y - 92, f.sans, 18, C.accent, 'SWEET HOME', `\\fsp6${fade(0.6, 0.35)}`);
      line(s.s + 0.3, s.e, 360, y, f.serif, big, C.ink, T.tells, `${fade(0.7, 0.35)}${rise(360, y, 700)}`);
      line(s.s + 0.55, s.e, 360, y + 62, f.italic, f.kr ? 28 : 32, C.accent, T.what, `${fade(0.8, 0.35)}${rise(360, y + 62, 800)}`);
      line(s.s + 0.8, s.e, 360, y + 120, f.sans, 17, C.muted, upper(T.date, v.lang), `\\fsp4${fade(0.8, 0.35)}`);
    } else if (s.kind === 'card') {
      const size = f.kr ? 40 : 46;
      const lines = wrap(s.question, size, 580, 6);
      const lh = size * (f.kr ? 1.5 : 1.36);
      const cy = 640, top = cy - (lines.length * lh) / 2;
      line(s.s, s.e, 360, Math.round(top - 78), f.sans, 18, C.accent, upper(T.questionOf(s.n, s.of), v.lang), `\\fsp6${fade(0.35, 0.3)}`);
      add(s.s, s.e, `\\an5\\pos(360,${Math.round(top - 40)})\\p1\\c${C.accent}\\alpha&H50&${fade(0.35, 0.3)}`, 'm 0 0 l 56 0 56 2 0 2');
      lines.forEach((l, i) => line(s.s + 0.1, s.e, 360, Math.round(top + lh * (i + 0.5)), f.serif, size, C.ink, l, `${fade(0.5, 0.3)}${rise(360, Math.round(top + lh * (i + 0.5)), 600)}`));
      line(s.s + 0.3, s.e, 360, Math.round(top + lines.length * lh + 44), f.italic, 26, C.muted, T.asked, fade(0.6, 0.3));
    } else if (s.kind === 'voice') {
      if (!s.photo) {
        const a = s.s - 0.35, b = s.e + 0.35;
        add(a, b, `\\an7\\pos(92,166)\\fn${f.serif}\\fs220\\c${C.accent}\\alpha&H70&${fade(FADE, FADE)}`, '“');
        line(a, b, 360, 470, f.serif, f.kr ? 52 : 60, C.ink, T.name, fade(FADE + 0.1, FADE));
        line(a, b, 360, 540, f.sans, 18, C.accent, upper(s.topic, v.lang), `\\fsp6${fade(FADE + 0.2, FADE)}`);
      }
      for (const c of cues(s.words, s.s, s.e + 0.25)) {
        add(c.s, c.e, `\\an8\\pos(360,996)\\fn${f.sans}\\fs${f.kr ? 38 : SUB_SIZE}\\c${C.ink}\\q2${fade(0.09, 0.09)}`, c.lines.map((l) => esc(l, f.sans, f)).join('\\N'), 2);
      }
    } else if (s.kind === 'outro') {
      const lines = wrap(T.thanks, f.kr ? 42 : 48, 600, 3);
      const lh = (f.kr ? 42 : 48) * 1.36, top = 600 - (lines.length * lh) / 2;
      lines.forEach((l, i) => line(s.s + 0.2, total, 360, Math.round(top + lh * (i + 0.5)), f.serif, f.kr ? 42 : 48, C.ink, l, `${fade(0.7, 1.2)}${rise(360, Math.round(top + lh * (i + 0.5)), 800)}`));
      line(s.s + 0.6, total, 360, Math.round(top + lines.length * lh + 40), f.italic, f.kr ? 28 : 32, C.accent, T.bye, fade(0.8, 1.2));
      line(s.s + 0.9, total, 360, 1090, f.sans, 17, C.accent, 'SWEET HOME', `\\fsp6${fade(0.8, 1.2)}`);
      if (T.family) line(s.s + 1.0, total, 360, 1128, f.italic, 26, C.muted, T.family, fade(0.8, 1.2));
    }
  }
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', 'YCbCr Matrix: None', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Base,${f.sans},40,${C.ink},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`, '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...ev, ...extra, '',
  ].join('\n');
}

// ---------- Dựng ----------

/** Chuyển động Ken Burns cho đoạn thứ k: lần lượt phóng vào và lùi ra, lia nhẹ chéo. N: số khung của lớp. */
function kenBurns(k: number, N: number) {
  const zin = k % 2 === 0;
  const z0 = zin ? 1.0 : 1.1, z1 = zin ? 1.1 : 1.0;
  const dirs = [[-0.6, 0.5], [0.6, -0.4], [0.5, 0.6], [-0.5, -0.5]];
  const [px, py] = dirs[k % dirs.length];
  const P = `min(1,in/${N})`;
  const Z = `(${z0}+${(z1 - z0).toFixed(3)}*${P})`;
  const hw = `(W/${Z}/2)`, hh = `(H/${Z}/2)`;
  // Lia từ một phía sang phía kia, biên độ theo phần ảnh còn dư ở độ phóng hiện tại.
  const cx = `(W/2+(${(-px).toFixed(2)}+${(2 * px).toFixed(2)}*${P})*(W/2-${hw}))`;
  const cy = `(H/2+(${(-py).toFixed(2)}+${(2 * py).toFixed(2)}*${P})*(H/2-${hh}))`;
  const x0 = `${cx}-${hw}`, x1 = `${cx}+${hw}`, y0 = `${cy}-${hh}`, y1 = `${cy}+${hh}`;
  return `perspective=x0='${x0}':y0='${y0}':x1='${x1}':y1='${y0}':x2='${x0}':y2='${y1}':x3='${x1}':y3='${y1}':interpolation=linear:eval=frame`;
}

export async function renderCallVideo(v: VideoInput, work: string, outMp4: string, outPoster: string) {
  const f = fontsFor(v.lang);
  const fontFiles = f.kr ? ['sh-sans-kr.ttf', 'sh-serif-kr.ttf'] : ['sh-sans.ttf', 'sh-serif.ttf', 'sh-serif-italic.ttf', 'sh-sans-kr.ttf'];
  const fontsDir = path.join(work, 'vfonts');
  mkdirSync(fontsDir, { recursive: true });
  for (const n of fontFiles) copyFileSync(path.join(FONT_DIR, n), path.join(fontsDir, n));

  writePPM(path.join(work, 'bg.ppm'), W, H, paper(W, H));
  writePlates(work);

  const voices = v.segs.filter((s): s is Extract<VSeg, { kind: 'voice' }> => s.kind === 'voice');
  const photoOf = new Map<string, string>();
  let pk = 0;
  for (const s of voices) {
    if (!s.photo || photoOf.has(s.photo)) continue;
    const name = `ph${pk++}.ppm`;
    try { await prepPhoto(s.photo, name, work); photoOf.set(s.photo, name); }
    catch (e) { console.error('[video] bỏ qua ảnh', path.basename(s.photo), (e as Error).message.split('\n')[0]); }
  }

  // Các lớp khung đặt lên nền giấy: ảnh mở đầu (nếu có), rồi mỗi đoạn giọng một khung (ảnh, hoặc thẻ màu có sóng âm).
  type Layer = { a: number; b: number; still: string | null };
  const layers: Layer[] = [];
  const intro = v.segs.find((s) => s.kind === 'intro');
  const firstStill = voices.map((s) => (s.photo ? photoOf.get(s.photo) : undefined)).find(Boolean) ?? null;
  if (intro && firstStill) layers.push({ a: 0, b: intro.e + 0.35, still: firstStill });
  const extra: string[] = [];
  for (const s of voices) {
    const a = Math.max(0, s.s - 0.35), b = Math.min(v.total, s.e + 0.35);
    const still = s.photo ? photoOf.get(s.photo) ?? null : null;
    layers.push({ a, b, still });
    if (!still) extra.push(...barEvents(await levelsOf(v.audio, s.s, s.e, work).catch(() => []), s.s, s.e, a, b));
  }
  writeFileSync(path.join(work, 'ep.ass'), buildAss(v, !!(intro && firstStill), extra));

  const loop = (file: string, dur: number) => ['-loop', '1', '-framerate', String(FPS), '-t', dur.toFixed(3), '-i', file];
  const inputs: string[] = [...loop('bg.ppm', v.total)];
  let n = 1;
  const fc: string[] = [`[0:v]format=yuv420p[b0]`];
  let cur = 'b0', plain = 0;
  layers.forEach(({ a, b, still }, k) => {
    const d = b - a, N = Math.round(d * FPS);
    if (still) {
      const iP = n++, iS = n++, iC = n++;
      inputs.push(...loop('plate.pam', d), ...loop(still, d), ...loop('corners.pam', d));
      fc.push(`[${iS}:v]${kenBurns(k, N)},scale=${IW}:${IH}:flags=bicubic,format=rgba[ph${k}]`);
      fc.push(`[${iP}:v][ph${k}]overlay=${IX - BX}:${IY - BY}:format=rgb[pp${k}]`);
      fc.push(`[pp${k}][${iC}:v]overlay=${IX - BX}:${IY - BY}:format=rgb[pc${k}]`);
    } else {
      inputs.push(...loop(`plateq${plain++ % 2}.pam`, d));
      fc.push(`[${n++}:v]null[pc${k}]`);
    }
    fc.push(`[pc${k}]format=yuva420p,fade=t=in:st=0:d=${FADE}:alpha=1,fade=t=out:st=${(d - FADE).toFixed(3)}:d=${FADE}:alpha=1,setpts=PTS-STARTPTS+${a.toFixed(3)}/TB[L${k}]`);
    fc.push(`[${cur}][L${k}]overlay=${BX}:${BY}:eof_action=pass:format=yuv420[b${k + 1}]`);
    cur = `b${k + 1}`;
  });
  // Chữ, hạt phim rất nhẹ trên độ sáng.
  fc.push(`[${cur}]ass=ep.ass:fontsdir=vfonts,noise=c0s=3:c0f=t,format=yuv420p[v]`);

  const audioIdx = n;
  inputs.push('-i', v.audio);
  const threads = String(Number(process.env.PODCAST_VIDEO_THREADS) || 2);
  const tmp = path.join(work, 'video.mp4');
  await ffmpeg(['-v', 'error', '-filter_complex_threads', threads, ...inputs, '-filter_complex', fc.join(';'), '-map', '[v]', '-map', `${audioIdx}:a`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 4),
    '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'smpte170m', '-threads', threads,
    '-c:a', 'copy', '-movflags', '+faststart', '-t', v.total.toFixed(3), tmp], work, Math.max(900_000, v.total * 12_000));
  const at = intro ? Math.min(intro.e - 0.4, 2.6) : 1;
  await ffmpeg(['-v', 'error', '-ss', at.toFixed(2), '-i', tmp, '-frames:v', '1', '-q:v', '3', path.join(work, 'poster.jpg')], work, 60_000);
  copyFileSync(tmp, outMp4);
  copyFileSync(path.join(work, 'poster.jpg'), outPoster);
  return { photos: photoOf.size };
}

export const fontsReady = () => existsSync(path.join(FONT_DIR, 'sh-sans.ttf'));
