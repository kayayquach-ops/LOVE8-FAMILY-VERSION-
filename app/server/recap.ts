// Phim tuần: ảnh và clip của cả nhà trong tuần thành một đoạn phim dọc 720x1280, cắt đúng nhịp nhạc.
// Bố cục (xem docs/recap-design.md): mở bằng bìa giấy có tên nhà, ngày trong tuần và ba tấm ảnh in;
// giữa là từng khoảnh khắc (ảnh dọc tràn màn hình, ảnh ngang như ảnh in đặt trên giấy) kèm tên người gửi và lời kèm;
// kết bằng bức tường ảnh cả tuần và lời hẹn tuần sau. Mỗi cảnh dựng riêng bằng ffmpeg rồi nối thẳng (không mã hoá lại), cuối cùng trộn tiếng.
// 20 giờ tối Chủ nhật (giờ Việt Nam) máy chủ tự dựng cho mọi nhà đủ ảnh, xong thì báo cả nhà. Dựng lần lượt từng nhà để máy chủ không nghẽn.
import express from 'express';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { pool as db } from './db.ts';
import { errorBody, langOf, reqLang, runWithLang, tReq, tServer, type Lang } from './i18n.ts';
import { pickTrack } from './music.ts';
import { notifyFamily } from './push.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'recap-assets');

const W = 720, H = 1280, FPS = 30;
const MAX_ITEMS = 30, MIN_POSTS = 3, SHOW_ITEMS = 16, MAX_SECONDS = 46;
// Mỗi phim dựng tối đa JOBS cảnh cùng lúc, mỗi ffmpeg dùng 2 luồng.
const JOBS = Math.max(1, Number(process.env.RECAP_JOBS) || 2);
// Giấy ấm, mực đen như logo; chữ phụ màu nâu xám.
const PAPER = 'F4F0E8', INK = '1B1714', SOFT = '7A6F64', CREAM = 'F7F2EA', CARD = 'FCFAF6';

export type RecapItem = { kind: 'photo' | 'video'; file: string; author: string; at: Date; caption?: string | null; score?: number };
export type RecapInput = { family: string; week: string; items: RecapItem[]; counts: { photos: number; videos: number; hugs: number }; seed?: string };

// ---------- Tuần ----------

// Tuần tính từ thứ Hai, theo giờ Việt Nam (giống server/index.ts).
export function weekKey(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const day = (t.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}
const weekStart = (week: string) => new Date(`${week}T00:00:00+07:00`);
const prevWeek = (week: string) => new Date(new Date(`${week}T00:00:00Z`).getTime() - 7 * 86400e3).toISOString().slice(0, 10);
/** Giờ phim tuần tự có: 20 giờ tối Chủ nhật của tuần đó, giờ Việt Nam. */
const DUE_HOUR = 20;
const dueAt = (week: string) => new Date(weekStart(week).getTime() + (6 * 24 + DUE_HOUR) * 3600e3);
/** Tuần gần nhất đã tới giờ làm phim. */
const dueWeek = (now = new Date()) => { const w = weekKey(now); return now >= dueAt(w) ? w : prevWeek(w); };

const LOCALE: Record<Lang, string> = { vi: 'vi-VN', en: 'en-US', ko: 'ko-KR' };
const monthName = (m: number) => {
  const s = new Intl.DateTimeFormat(LOCALE[reqLang()], { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 1)));
  return reqLang() === 'vi' ? s.toLocaleLowerCase('vi') : s; // "tháng 11", giữa câu viết thường
};

function datesLabel(week: string) {
  const a = new Date(`${week}T00:00:00Z`), b = new Date(a.getTime() + 6 * 86400e3);
  const am = a.getUTCMonth() + 1, bm = b.getUTCMonth() + 1;
  return am === bm
    ? tReq('recapVideo.dates', { a: a.getUTCDate(), b: b.getUTCDate(), mon: monthName(bm) })
    : tReq('recapVideo.datesCross', { a: a.getUTCDate(), mon: monthName(am), b: b.getUTCDate(), mon2: monthName(bm) });
}
const weekday = (at: Date) => tReq(`recapVideo.day.${new Date(at.getTime() + 7 * 3600e3).getUTCDay()}`);

// ---------- Chạy ffmpeg ----------

export function run(bin: string, args: string[], cwd: string, timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-6000); });
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} thoát với mã ${code}\n${err}`));
    });
  });
}

export async function probe(file: string, cwd: string) {
  try {
    const out = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], cwd, 30_000);
    const j = JSON.parse(out);
    const dur = Number(j.format?.duration);
    return { duration: Number.isFinite(dur) ? dur : null, audio: (j.streams ?? []).some((s: any) => s.codec_type === 'audio') };
  } catch { return { duration: null, audio: false }; }
}

/** Cỡ khung hình đã xoay đúng chiều (video quay dọc trên điện thoại hay ghi góc xoay riêng). */
async function videoInfo(file: string, cwd: string) {
  const out = await run(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], cwd, 30_000);
  const j = JSON.parse(out);
  const v = (j.streams ?? []).find((s: any) => s.codec_type === 'video');
  if (!v?.width) return null;
  const rot = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find((d: any) => d.rotation != null)?.rotation ?? 0)) % 180;
  const dur = Number(j.format?.duration);
  return {
    w: rot === 90 ? v.height : v.width, h: rot === 90 ? v.width : v.height,
    duration: Number.isFinite(dur) ? dur : 3, audio: (j.streams ?? []).some((s: any) => s.codec_type === 'audio'),
  };
}

// ---------- Nhạc nền tổng hợp cũ (podcast vẫn dùng) ----------

// Fmaj7 - Em7 - Dm7 - Cadd9, mỗi hợp âm 4 giây.
const CHORDS = [[174.61, 220, 261.63, 329.63], [164.81, 196, 246.94, 293.66], [146.83, 174.61, 220, 261.63], [130.81, 196, 261.63, 293.66]];
const pick = (idx: string, vals: number[]) => vals.map((v, i) => `eq(${idx},${i})*${v.toFixed(3)}`).join('+');

export function musicExpr(detune: number) {
  // Hai lớp pad lệch nhau 2 giây, mỗi lớp phồng lên rồi tắt hẳn ở biên cửa sổ: đổi hợp âm không bị lách cách, tổng âm lượng đều.
  const pad = (shift: number) => {
    const w = `floor((t+${shift})/4)`, tau = `(t+${shift}-4*${w})`, c = `mod(${w},4)`;
    const notes = [0, 1, 2, 3].map((n) => `sin(2*PI*(${pick(c, CHORDS.map((ch) => ch[n] * detune))})*${tau})`).join('+');
    return `pow(sin(PI*${tau}/4),2)*(${notes})`;
  };
  // Hộp nhạc: mỗi nửa giây một nốt (cao hơn một quãng tám), nghỉ ở nhịp cuối.
  const s = 'floor(t*2)', tau = `(t-floor(t*2)/2)`, step = `mod(${s},8)`, c = 'mod(floor(t/4),4)';
  const PATTERN = [0, 2, 1, 3, 2, 1, 3, 0];
  const n = PATTERN.map((p, i) => `eq(${step},${i})*${p}`).join('+');
  const f = `2*(${[0, 1, 2, 3].map((k) => `eq(${n},${k})*(${pick(c, CHORDS.map((ch) => ch[k]))})`).join('+')})`;
  const env = `(1-exp(-120*${tau}))*exp(-6*${tau})*(1-2*${tau})*(1-eq(${step},7))`;
  const bell = `${env}*(sin(2*PI*${f}*${tau})+0.25*sin(4*PI*${f}*${tau}))`;
  return `0.045*(${pad(0)}+${pad(2)})+0.08*${bell}`;
}

// ---------- Nhạc của phim ----------

type Beat = { period: number; phase: number; sure: boolean };

/** Đoán nhịp bài nhạc: năng lượng đột biến theo thời gian, tự tương quan tìm chu kỳ phách, rồi tìm điểm phách đầu. */
async function analyzeTrack(file: string, work: string): Promise<Beat> {
  await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-t', '75', '-i', file, '-ac', '1', '-ar', '11025', '-f', 'f32le', 'pcm.raw'], work, 60_000);
  const raw = readFileSync(path.join(work, 'pcm.raw'));
  rmSync(path.join(work, 'pcm.raw'), { force: true });
  const pcm = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.length & ~3)));
  const HOP = 128, fr = 11025 / HOP, n = Math.floor(pcm.length / HOP);
  if (n < fr * 8) return { period: 0.55, phase: 0, sure: false };
  const loud = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = i * HOP + 1; j < (i + 1) * HOP; j++) { const d = pcm[j] - pcm[j - 1]; e += d * d; }
    loud[i] = Math.log1p(1000 * e);
  }
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, loud[i] - loud[i - 1]);
  // Bỏ phần nền chậm: trừ trung bình trượt khoảng nửa giây.
  const win = Math.round(fr / 2), env = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += onset[i] - (i >= win ? onset[i - win] : 0);
    env[i] = Math.max(0, onset[i] - acc / Math.min(win, i + 1));
  }
  const lo = Math.floor((60 * fr) / 160), hi = Math.ceil((60 * fr) / 65);
  const ac = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag]; ac[lag] = s; }
  let best = lo, bestScore = -1, sum = 0;
  for (let lag = lo; lag <= hi; lag++) {
    const bpm = (60 * fr) / lag;
    const score = ac[lag] * Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.7) ** 2);
    sum += ac[lag];
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  const sure = ac[best] > (1.35 * sum) / (hi - lo + 1);
  // Tinh chỉnh chu kỳ và điểm phách đầu cùng lúc trên 50 giây đầu (đoạn phim dùng tới): lệch 0,2% chu kỳ là cuối phim trôi gần 0,1 giây.
  const span = Math.min(n, Math.round(50 * fr));
  let lag = best, phase = 0, top = -1;
  for (let l = best * 0.985; l <= best * 1.015; l += 0.02) {
    for (let o = 0; o < l; o++) {
      let s = 0;
      for (let k = o; k < span; k += l) s += env[Math.round(k)] ?? 0;
      if (s > top) { top = s; lag = l; phase = o; }
    }
  }
  return { period: lag / fr, phase: phase / fr, sure };
}

/** Nhạc tổng hợp khi chưa có bài nào: piano điện, pad ấm, bass và trống nhẹ, có vang. Trống vào đúng lúc ảnh đầu tiên hiện, kết bằng một hợp âm ngân. */
function synthMusic(file: string, o: { total: number; beat: number; dropAt: number; endAt: number }) {
  const SR = 44100, len = Math.ceil((o.total + 0.3) * SR);
  const L = new Float32Array(len), R = new Float32Array(len), wet = new Float32Array(len);
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2147483648) - 1;
  const TAU = 2 * Math.PI;
  const voice = (t0: number, secs: number, gainL: number, gainR: number, send: number, fn: (t: number) => number) => {
    const i0 = Math.round(t0 * SR), n = Math.min(Math.round(secs * SR), len - i0);
    for (let k = 0; k < n; k++) { const v = fn(k / SR); L[i0 + k] += v * gainL; R[i0 + k] += v * gainR; wet[i0 + k] += v * send; }
  };
  // Fmaj9 - Em7 - Dm9 - Cmaj9, mỗi hợp âm một ô nhịp; bass là nốt gốc.
  const PROG = [[53, 57, 60, 64, 67], [52, 55, 59, 62, 67], [50, 53, 57, 60, 64], [48, 52, 55, 59, 62]];
  const BASS = [41, 40, 38, 36];
  const ep = (t0: number, m: number, vel: number, pan: number, secs = 2.4) => {
    const f = hz(m);
    voice(t0, secs, vel * (1 - pan), vel * (1 + pan), vel * 0.6, (t) => {
      const env = (1 - Math.exp(-t * 300)) * Math.exp(-t * 1.4) * Math.min(1, (secs - t) * 8);
      const idx = 1.1 * Math.exp(-t * 6) + 0.18;
      return env * (Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t)) + 0.06 * Math.exp(-t * 28) * Math.sin(TAU * f * 7 * t));
    });
  };
  const bar = o.beat * 4;
  for (let b = 0; b * bar < o.endAt; b++) {
    const t0 = b * bar, chord = PROG[b % 4];
    const full = t0 + 1e-6 >= o.dropAt;
    // Pad: hai sóng sin lệch nhẹ mỗi nốt, phồng lên rồi lặng trong khoảng hơn một ô nhịp.
    for (const m of chord.slice(0, 4)) {
      const f = hz(m + 12), secs = Math.min(bar * 1.3, o.endAt - t0 + 0.4);
      voice(t0, secs, 0.016, 0.016, 0.02, (t) => Math.sin(Math.PI * Math.min(1, t / secs)) ** 2 * (Math.sin(TAU * f * 0.9985 * t) + Math.sin(TAU * f * 1.0015 * t)));
    }
    const hits: Array<[number, number, boolean]> = full ? [[0, 0.085, true], [1.5, 0.045, false], [3, 0.04, false]] : [[0, 0.08, true], [2, 0.045, false]];
    for (const [at, vel, all] of hits) {
      const ht = t0 + at * o.beat;
      if (ht >= o.endAt) continue;
      (all ? chord : chord.slice(2)).forEach((m, i) => ep(ht + i * 0.012, m, vel, i % 2 ? 0.25 : -0.25, all ? 2.4 : 1.4));
    }
    if (!full) continue;
    for (const at of [0, 2.5]) {
      const ht = t0 + at * o.beat;
      if (ht >= o.endAt) continue;
      const f = hz(BASS[b % 4]);
      voice(ht, 1.1, 0.2, 0.2, 0, (t) => (1 - Math.exp(-t * 200)) * Math.exp(-t * 2.6) * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t)));
      // Trống cái mềm: sin hạ cao độ nhanh.
      voice(ht, 0.35, 0.42, 0.42, 0, (t) => Math.exp(-t * 10) * Math.sin(TAU * (45 * t + (70 / 28) * (1 - Math.exp(-t * 28)))));
    }
    for (const at of [1, 3]) {
      const ht = t0 + at * o.beat;
      if (ht >= o.endAt) continue;
      let lp = 0;
      voice(ht, 0.25, 0.1, 0.1, 0.05, (t) => { const x = noise(); lp += 0.35 * (x - lp); return Math.exp(-t * 24) * (x - lp) + 0.4 * Math.exp(-t * 30) * Math.sin(TAU * 185 * t); });
    }
    for (let e = 0; e < 8; e++) {
      const ht = t0 + (e / 2 + (e % 2 ? 0.06 : 0)) * o.beat;
      if (ht >= o.endAt) continue;
      let prev = 0;
      const vel = e % 2 ? 0.032 : 0.018;
      voice(ht, 0.08, vel * 0.8, vel * 1.2, 0.01, (t) => { const x = noise(), y = x - prev; prev = x; return Math.exp(-t * 60) * y; });
    }
  }
  // Hợp âm kết: Cmaj9 ngân dài.
  [48, 55, 59, 62, 64].forEach((m, i) => ep(o.endAt + i * 0.03, m, 0.075, i % 2 ? 0.2 : -0.2, Math.max(1, o.total - o.endAt)));
  for (const m of [60, 64, 67, 71]) {
    const f = hz(m), secs = Math.max(1, o.total - o.endAt);
    voice(o.endAt, secs, 0.014, 0.014, 0.025, (t) => Math.min(1, t / 0.6) * Math.exp(-t * 0.5) * Math.min(1, (secs - t) * 2) * (Math.sin(TAU * f * 0.999 * t) + Math.sin(TAU * f * 1.001 * t)));
  }
  // Vang kiểu Schroeder: bốn bộ lọc lược song song rồi hai bộ toàn thông, kênh phải lệch vài mẫu cho rộng.
  const reverb = (out: Float32Array, spread: number) => {
    const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(d + spread), i: 0, lp: 0 }));
    const aps = [556, 225].map((d) => ({ buf: new Float32Array(d + spread), i: 0 }));
    for (let k = 0; k < len; k++) {
      const x = wet[k] * 0.12;
      let y = 0;
      for (const c of combs) { const v = c.buf[c.i]; c.lp = v * 0.7 + c.lp * 0.3; c.buf[c.i] = x + c.lp * 0.8; c.i = (c.i + 1) % c.buf.length; y += v; }
      for (const a of aps) { const v = a.buf[a.i]; const z = -y + v; a.buf[a.i] = y + v * 0.5; a.i = (a.i + 1) % a.buf.length; y = z; }
      out[k] += y;
    }
  };
  reverb(L, 0);
  reverb(R, 23);
  // Lọc bớt chói cho ấm, nén mềm, chuẩn đỉnh khoảng -3 dB, tắt dần ở cuối.
  let peak = 1e-6, lpL = 0, lpR = 0;
  for (let k = 0; k < len; k++) {
    lpL += 0.55 * (L[k] - lpL); lpR += 0.55 * (R[k] - lpR);
    L[k] = Math.tanh(lpL * 1.3); R[k] = Math.tanh(lpR * 1.3);
    peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]));
  }
  const pcm = Buffer.alloc(44 + len * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + len * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(len * 4, 40);
  const g = 0.7 / peak, fadeFrom = len - Math.round(0.8 * SR);
  for (let k = 0; k < len; k++) {
    const f = k > fadeFrom ? (len - k) / (len - fadeFrom) : 1;
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[k] * g * f)) * 32767), 44 + k * 4);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[k] * g * f)) * 32767), 46 + k * 4);
  }
  writeFileSync(file, pcm);
}

// ---------- Chữ ----------

/** Đọc bề ngang từng chữ trong file font (bảng cmap dạng 12 và hmtx), để ngắt dòng và căn chữ đúng như ffmpeg vẽ. */
function loadFont(file: string) {
  const b = readFileSync(file);
  const tables: Record<string, number> = {};
  for (let i = 0; i < b.readUInt16BE(4); i++) tables[b.toString('latin1', 12 + i * 16, 16 + i * 16)] = b.readUInt32BE(20 + i * 16);
  const upem = b.readUInt16BE(tables.head + 18), nh = b.readUInt16BE(tables.hhea + 34);
  const glyph = new Map<number, number>();
  for (let i = 0; i < b.readUInt16BE(tables.cmap + 2); i++) {
    const sub = tables.cmap + b.readUInt32BE(tables.cmap + 8 + i * 8);
    if (b.readUInt16BE(sub) !== 12) continue;
    for (let g = 0; g < b.readUInt32BE(sub + 12); g++) {
      const o = sub + 16 + g * 12, s = b.readUInt32BE(o), e = b.readUInt32BE(o + 4), id = b.readUInt32BE(o + 8);
      for (let c = s; c <= e; c++) glyph.set(c, id + c - s);
    }
  }
  const adv = (id: number) => b.readUInt16BE(tables.hmtx + 4 * Math.min(id, nh - 1));
  return {
    has: (ch: string) => glyph.has(ch.codePointAt(0)!),
    width: (s: string, size: number) => { let w = 0; for (const ch of s) w += adv(glyph.get(ch.codePointAt(0)!) ?? 0); return (w * size) / upem; },
  };
}
type Font = ReturnType<typeof loadFont>;
let fonts: { serif: Font; sans: Font } | null = null;
const getFonts = () => (fonts ??= { serif: loadFont(path.join(ASSETS, 'NotoSerifKR-SemiBold.ttf')), sans: loadFont(path.join(ASSETS, 'NotoSansKR-Medium.ttf')) });

/** Bỏ biểu tượng cảm xúc và chữ font không có, gộp khoảng trắng. */
const clean = (s: string | null | undefined) => [...String(s ?? '').replace(/\s+/g, ' ').trim()].filter((ch) => ch === ' ' || getFonts().sans.has(ch)).join('').trim();
/** Font có chân chỉ có chữ Hàn thông dụng: dòng nào có chữ hiếm thì dùng font không chân. */
const serifOk = (s: string) => [...s].every((ch) => ch === ' ' || getFonts().serif.has(ch));

/** Ngắt dòng theo bề ngang thật của chữ, các dòng dài gần bằng nhau (không để một chữ lẻ loi dòng cuối); quá số dòng thì cắt bằng dấu ba chấm. */
function wrap(text: string, font: Font, size: number, maxW: number, maxLines: number) {
  const greedy = (mw: number) => {
    const out: string[] = [];
    let cur = '';
    for (const word of text.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.width(next, size) <= mw) { cur = next; continue; }
      if (cur) out.push(cur);
      cur = '';
      for (const ch of word) {
        if (cur && font.width(cur + ch, size) > mw) { out.push(cur); cur = ''; }
        cur += ch;
      }
    }
    if (cur) out.push(cur);
    return out;
  };
  let lines = greedy(maxW);
  if (lines.length > 1 && lines.length <= maxLines) {
    let lo = maxW / 2, hi = maxW;
    for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; if (greedy(mid).length === lines.length) hi = mid; else lo = mid; }
    lines = greedy(hi);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && font.width(`${last}…`, size) > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

// ---------- Ảnh: chuẩn bị bằng sharp ----------

// Nạp sharp khi cần (chỉ lúc dựng phim): lỗi thư viện ảnh không làm máy chủ không khởi động được.
type SharpFn = typeof import('sharp').default;
let sharpMod: SharpFn | null = null;
const getSharp = async () => (sharpMod ??= (await import('sharp')).default);

// Chỉnh màu chung cho mọi ảnh: trắng ngả kem, đen ngả nâu, bớt rực một chút, để ảnh từ nhiều máy trông như cùng một cuộn phim.
const GRADE = { a: [0.96, 0.95, 0.91], b: [10, 7, 4], sat: 0.94 };
// Cùng cách chỉnh cho video, làm trong YUV cho nhẹ.
const VIDEO_GRADE = "lutyuv=y='val*0.95+9':u='(val-128)*0.93+125':v='(val-128)*0.93+131'";

const FW = 808, FH = 1436; // ảnh tràn màn hình chuẩn bị lớn hơn khung 12% để có chỗ phóng chậm

async function prepFull(src: string, out: string) {
  const sharp = await getSharp();
  await sharp(src, { failOn: 'none' }).rotate().resize(FW, FH, { fit: 'cover', position: sharp.strategy.attention })
    .linear(GRADE.a, GRADE.b).modulate({ saturation: GRADE.sat }).jpeg({ quality: 88 }).toFile(out);
}

/** Ảnh in: viền giấy trắng, bóng mềm, xoay nghiêng nhẹ. Trả về PNG trong suốt và cỡ của nó. */
async function prepPrint(src: string, out: string, o: { w: number; h: number; border: number; angle: number; shadow?: number }) {
  const sharp = await getSharp();
  const pad = 60, cw = o.w + 2 * o.border, ch = o.h + 2 * o.border;
  const photo = await sharp(src, { failOn: 'none' }).rotate().resize(o.w, o.h, { fit: 'cover', position: sharp.strategy.attention })
    .linear(GRADE.a, GRADE.b).modulate({ saturation: GRADE.sat }).png().toBuffer();
  const rect = (alpha: number, hex: string) => sharp({ create: { width: cw, height: ch, channels: 4, background: { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), alpha } } }).png().toBuffer();
  const blank = () => sharp({ create: { width: cw + 2 * pad, height: ch + 2 * pad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const shadow = await blank().composite([{ input: await rect(o.shadow ?? 0.34, '1E140C'), left: pad, top: pad + Math.round(o.border * 0.9) + 6 }]).png().toBuffer();
  const soft = await sharp(shadow).blur(14).png().toBuffer();
  const card = await sharp(await rect(1, CARD)).composite([{ input: photo, left: o.border, top: o.border }]).png().toBuffer();
  const flat = await sharp(soft).composite([{ input: card, left: pad, top: pad }]).png().toBuffer();
  const info = await sharp(flat).rotate(o.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 3 }).toFile(out);
  return { w: info.width, h: info.height };
}

/** Lớp phủ cho ảnh tràn màn hình: tối dần ở dưới cho chữ dễ đọc, viền tối nhẹ, ngả nâu ấm. */
async function writeScrim(out: string) {
  const sharp = await getSharp();
  const buf = Buffer.alloc(W * H * 4);
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const bottom = ss(0.42, 0.97, v) ** 1.15 * 0.84, top = (1 - ss(0, 0.16, v)) * 0.2;
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x / W - 0.5) * 1.1, v - 0.5);
      const vig = ss(0.42, 0.85, d) * 0.22;
      const a = 1 - (1 - bottom) * (1 - top) * (1 - vig);
      const o = (y * W + x) * 4;
      buf[o] = 26; buf[o + 1] = 18; buf[o + 2] = 12;
      buf[o + 3] = Math.max(0, Math.min(255, Math.round(a * 255 + (((x * 7 + y * 13) % 5) - 2) * 0.6)));
    }
  }
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 3 }).toFile(out);
}

// ---------- Dựng từng cảnh ----------

type Shot = {
  it: RecapItem; layout: 'full' | 'print'; frames: number;
  still: string; // ảnh dùng cho bìa và bức tường ảnh
  video?: { dur: number; audio: boolean; w: number; h: number };
  aspect: number;
};
type Seg = { file: string; frames: number; voice?: { src: string; dur: number } };

const ease = (start: number, d: number) => `pow(max(0,1-max(0,t-${start})/${d}),3)`; // 1 rồi về 0, chậm dần
const still = (i: number, frames: number) => `[${i}:v]loop=loop=${frames - 1}:size=1:start=0,setpts=N/(${FPS}*TB)`;
const pushIn = (amount: number, secs: number) =>
  `scale=w='2*trunc(${W}*(1+${amount}*t/${secs})/2)':h='2*ceil(${H}*(1+${amount}*t/${secs})/2)':eval=frame:flags=bicubic,crop=${W}:${H}`;

/** Một dòng chữ hiện dần và nhích lên. base là đường chân chữ; x là 'c' để căn giữa. */
type Line = { s: string; serif?: boolean; size: number; color: string; alpha?: number; x: number | 'c'; base: number; at: number; shadow?: boolean };

export async function buildRecapVideo(input: RecapInput, outFile: string, opts: { cover?: string } = {}) {
  const sharp = await getSharp();
  const F = getFonts();
  const work = mkdtempSync(path.join(os.tmpdir(), 'recap-'));
  const started = Date.now();
  try {
    copyFileSync(path.join(ASSETS, 'NotoSerifKR-SemiBold.ttf'), path.join(work, 'serif.ttf'));
    copyFileSync(path.join(ASSETS, 'NotoSansKR-Medium.ttf'), path.join(work, 'sans.ttf'));
    copyFileSync(path.join(ASSETS, 'paper.jpg'), path.join(work, 'paper.jpg'));
    const base = ['-y', '-hide_banner', '-loglevel', 'error', '-filter_complex_threads', '1'];
    const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-maxrate', '4M', '-bufsize', '8M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-r', String(FPS), '-g', '60', '-threads', '2', '-video_track_timescale', '15360', '-an'];

    let ti = 0;
    const txt = (s: string) => { const n = `t${ti++}.txt`; writeFileSync(path.join(work, n), s); return n; };
    const draw = (l: Line) => {
      const serif = l.serif !== false && serifOk(l.s);
      const e = `min(1,max(0,(t-${l.at})/0.45))`;
      const x = l.x === 'c' ? '(w-text_w)/2' : String(l.x);
      return `drawtext=fontfile=${serif ? 'serif.ttf' : 'sans.ttf'}:textfile=${txt(l.s)}:expansion=none:fontsize=${l.size}:fontcolor=0x${l.color}` +
        `:alpha='${e}*${l.alpha ?? 1}':x=${x}:y='${l.base}-ascent+20*pow(1-${e},3)'` +
        (l.shadow ? ':shadowcolor=0x1A120C@0.45:shadowx=0:shadowy=2' : '');
    };

    // 1. Chọn khoảnh khắc: lần lượt mỗi người một tấm (theo số cảm xúc), cả nhà ai cũng có mặt; sau đó xếp theo thời gian.
    const byAuthor = new Map<string, RecapItem[]>();
    for (const it of input.items.slice(0, MAX_ITEMS)) byAuthor.set(it.author, [...(byAuthor.get(it.author) ?? []), it]);
    const order: RecapItem[] = [];
    for (let round = 0; order.length < Math.min(SHOW_ITEMS, input.items.length); round++) {
      let took = false;
      for (const list of byAuthor.values()) if (list[round] && order.length < SHOW_ITEMS) { order.push(list[round]); took = true; }
      if (!took) break;
    }

    // 2. Đọc từng file: hướng ảnh, độ dài video. File hỏng thì bỏ.
    const shots: Shot[] = [];
    for (const [i, it] of order.entries()) {
      try {
        if (it.kind === 'photo') {
          const m = await sharp(it.file, { failOn: 'none' }).metadata();
          const swap = (m.orientation ?? 1) >= 5;
          const aspect = ((swap ? m.height : m.width) ?? 1) / ((swap ? m.width : m.height) ?? 1);
          shots.push({ it, layout: aspect <= 0.82 ? 'full' : 'print', frames: 0, still: it.file, aspect });
        } else {
          const v = await videoInfo(it.file, work);
          if (!v) continue;
          const st = path.join(work, `still${i}.jpg`);
          await run(FFMPEG, [...base, '-ss', String(Math.min(0.5, v.duration / 3)), '-i', it.file, '-frames:v', '1', '-q:v', '3', st], work, 30_000);
          const aspect = v.w / v.h;
          shots.push({ it, layout: aspect <= 0.82 ? 'full' : 'print', frames: 0, still: st, aspect, video: { dur: v.duration, audio: v.audio, w: v.w, h: v.h } });
        }
      } catch (e) {
        console.error(`[recap] bỏ qua ${it.file}:`, (e as Error).message.slice(0, 300));
      }
    }
    if (!shots.length) throw new Error('Không đọc được ảnh hay video nào');

    // 3. Nhạc và nhịp: có bài thật thì đo nhịp bài, chưa có thì tổng hợp ở 112 nhịp mỗi phút.
    const track = pickTrack(input.seed ?? input.week);
    let beat: Beat = { period: 60 / 112, phase: 0, sure: true };
    let trackDur = 0;
    if (track) {
      try {
        beat = await analyzeTrack(track, work);
        trackDur = (await probe(track, work)).duration ?? 0;
        if (!beat.sure) beat = { period: 0.55, phase: 0, sure: false };
      } catch (e) {
        console.error('[recap] không đọc được bài nhạc, dùng nhạc tổng hợp:', (e as Error).message.slice(0, 200));
      }
    }
    const useTrack = !!track && trackDur > 5;
    if (!useTrack) beat = { period: 60 / 112, phase: 0, sure: true };
    const P = beat.period;
    // Số phách gần với thời lượng mong muốn, ưu tiên số chẵn cho khớp ô nhịp.
    const beatsFor = (secs: number) => { let n = Math.max(2, Math.round(secs / P)); if (n > 2 && n % 2) n += n * P < secs ? 1 : -1; return n; };
    const beatsOf = (s: Shot) => {
      if (s.video) { let n = Math.max(2, Math.floor(Math.min(s.video.dur, 4.6) / P)); if (n > 2 && n % 2) n--; return n; }
      return beatsFor(clean(s.it.caption).length > 24 ? 2.8 : 2.2);
    };
    // Dài quá thì bớt khoảnh khắc ít cảm xúc nhất (cuối danh sách chọn).
    const openBeats = beatsFor(3.2), closeBeats = beatsFor(4.6);
    while (shots.length > 3 && (openBeats + closeBeats + shots.reduce((a, s) => a + beatsOf(s), 0)) * P > MAX_SECONDS) shots.pop();
    shots.sort((a, b) => a.it.at.getTime() - b.it.at.getTime());
    // Cắt cảnh đúng phách: tính theo phách cộng dồn rồi mới đổi ra khung hình, không bị trôi.
    let beatAcc = 0, frameAcc = 0;
    const take = (beats: number) => { beatAcc += beats; const end = Math.round(beatAcc * P * FPS); const f = end - frameAcc; frameAcc = end; return f; };
    const openFrames = take(openBeats);
    for (const s of shots) s.frames = take(beatsOf(s));
    const closeFrames = take(closeBeats);

    await writeScrim(path.join(work, 'scrim.png'));

    // Ảnh cho bìa (3 tấm nhiều cảm xúc nhất) và bức tường ảnh (tối đa 9 tấm theo thời gian).
    const ranked = [...shots].sort((a, b) => (b.it.score ?? 0) - (a.it.score ?? 0));
    const coverShots = ranked.slice(0, 3);
    const wallShots = shots.length > 9 ? ranked.slice(0, 9).sort((a, b) => a.it.at.getTime() - b.it.at.getTime()) : shots;

    // 4. Các cảnh. Mỗi cảnh là một việc riêng; cảnh khoảnh khắc nào lỗi thì bỏ cảnh đó.
    const textBlock = (s: Shot, onPhoto: boolean, top: number): Line[] => {
      const author = clean(s.it.author) || ' ';
      const cap = clean(s.it.caption);
      const color = onPhoto ? CREAM : INK, sub = onPhoto ? CREAM : SOFT;
      const x: number | 'c' = onPhoto ? 52 : 'c';
      const maxW = onPhoto ? W - 104 : W - 120;
      if (!cap) {
        const size = Math.min(54, Math.floor((54 * maxW) / Math.max(1, F.serif.width(author, 54))));
        return onPhoto
          ? [{ s: weekday(s.it.at), serif: false, size: 25, color: sub, alpha: 0.82, x, base: top - 66, at: 0.12, shadow: true },
            { s: author, size, color, x, base: top, at: 0.2, shadow: true }]
          : [{ s: author, size: Math.min(size, 46), color, x, base: top, at: 0.3 },
            { s: weekday(s.it.at), serif: false, size: 24, color: sub, x, base: top + 44, at: 0.4 }];
      }
      const size = onPhoto ? 44 : 38, lh = Math.round(size * 1.3);
      const font = serifOk(cap) ? F.serif : F.sans;
      const lines = wrap(cap, font, size, maxW, 3);
      const meta = `${author}  ·  ${weekday(s.it.at)}`;
      if (onPhoto) {
        const first = top - (lines.length - 1) * lh;
        return [{ s: meta, serif: false, size: 24, color: sub, alpha: 0.82, x, base: first - lh - 2, at: 0.12, shadow: true },
          ...lines.map((l, i) => ({ s: l, size, color, x, base: first + i * lh, at: 0.2 + i * 0.07, shadow: true }))];
      }
      return [{ s: meta, serif: false, size: 23, color: sub, x, base: top, at: 0.3 },
        ...lines.map((l, i) => ({ s: l, size, color, x, base: top + 54 + i * lh, at: 0.38 + i * 0.07 }))];
    };

    const jobs: Array<() => Promise<Seg | null>> = [];
    const segName = (i: number) => `s${String(i).padStart(2, '0')}.mp4`;

    // Bìa: giấy hoa văn, tên nhà, ngày trong tuần, ba tấm ảnh in rơi xuống lần lượt.
    jobs.push(async () => {
      const D = openFrames / FPS;
      const cards = [
        { cx: 226, cy: 720, angle: -8, at: 0.35 }, { cx: 496, cy: 690, angle: 7, at: 0.6 }, { cx: 362, cy: 820, angle: -2, at: 0.85 },
      ].slice(3 - Math.min(3, coverShots.length));
      const layers: string[] = [];
      for (const [i, c] of cards.entries()) {
        const s = coverShots[i];
        const { w, h } = await prepPrint(s.still, path.join(work, `cover${i}.png`), { w: 316, h: 396, border: 12, angle: c.angle });
        layers.push(`cover${i}.png`);
        Object.assign(c, { w, h });
      }
      const name = clean(input.family) || ' ';
      let nameSize = Math.min(84, Math.floor((84 * 620) / Math.max(1, F.serif.width(name, 84))));
      const nameLines = nameSize < 50 ? wrap(name, F.serif, (nameSize = 56), 620, 2) : [name];
      const text: Line[] = [
        { s: tReq('recapVideo.label'), serif: false, size: 25, color: SOFT, x: 'c', base: 196, at: 0.1 },
        ...nameLines.map((l, i) => ({ s: l, size: nameSize, color: INK, x: 'c' as const, base: 300 + i * Math.round(nameSize * 1.15), at: 0.25 + i * 0.08 })),
        { s: datesLabel(input.week), serif: false, size: 27, color: SOFT, x: 'c', base: 300 + (nameLines.length - 1) * Math.round(nameSize * 1.15) + 62, at: 0.45 },
      ];
      const fc = [`${still(0, openFrames)}[bg]`];
      let prev = 'bg';
      cards.forEach((c: any, i) => {
        fc.push(`${still(i + 1, openFrames)},format=rgba,fade=t=in:st=${c.at}:d=0.3:alpha=1[c${i}]`);
        fc.push(`[${prev}][c${i}]overlay=x=${Math.round(c.cx - c.w / 2)}:y='${Math.round(c.cy - c.h / 2)}+110*${ease(c.at, 0.7)}'[o${i}]`);
        prev = `o${i}`;
      });
      fc.push(`[${prev}]${pushIn(0.03, D)},${text.map(draw).join(',')},format=yuv420p[v]`);
      const file = segName(0);
      await run(FFMPEG, [...base, '-i', 'paper.jpg', ...layers.flatMap((l) => ['-i', l]), '-filter_complex', fc.join(';'), '-map', '[v]', '-frames:v', String(openFrames), ...ENC, file], work);
      return { file, frames: openFrames };
    });

    shots.forEach((s, k) => jobs.push(async () => {
      const file = segName(k + 1), D = s.frames / FPS;
      const dir = k % 2 ? 1 : -1;
      try {
        if (s.layout === 'full' && !s.video) {
          // Ảnh dọc tràn màn hình: vào cảnh hơi phóng rồi lắng lại, sau đó trôi chậm.
          const img = `full${k}.jpg`;
          await prepFull(s.it.file, path.join(work, img));
          const z = dir > 0 ? `(1+0.07*t/${D}+0.06*exp(-t*9))` : `(1.08-0.07*t/${D}+0.06*exp(-t*9))`;
          const fc = [
            `${still(0, s.frames)},scale=w='2*trunc(${W}*${z}/2)':h='2*ceil(${H}*${z}/2)':eval=frame:flags=bicubic,` +
              `crop=${W}:${H}:x='(iw-ow)*(0.5+${dir}*0.25*(t/${D}-0.5))':y='(ih-oh)/2',setsar=1[p]`,
            `${still(1, s.frames)}[s]`,
            `[p][s]overlay=0:0,${textBlock(s, true, 1128).map(draw).join(',')},format=yuv420p[v]`,
          ];
          await run(FFMPEG, [...base, '-i', img, '-i', 'scrim.png', '-filter_complex', fc.join(';'), '-map', '[v]', '-frames:v', String(s.frames), ...ENC, file], work);
          return { file, frames: s.frames };
        }
        if (s.layout === 'print' && !s.video) {
          // Ảnh ngang: một tấm ảnh in đặt nghiêng trên giấy, trượt lên rồi đứng yên.
          const cw = s.aspect >= 1.05 ? 630 : 560, chh = Math.round(cw / Math.max(s.aspect, 0.82));
          const { w, h } = await prepPrint(s.it.file, path.join(work, `print${k}.png`), { w: cw, h: Math.min(chh, 680), border: 14, angle: dir * (1.5 + (k % 3) * 0.6) });
          const cy = 590;
          const fc = [
            `${still(0, s.frames)}[bg]`,
            `${still(1, s.frames)},format=rgba,fade=t=in:st=0:d=0.25:alpha=1[cd]`,
            `[bg][cd]overlay=x=${Math.round((W - w) / 2)}:y='${Math.round(cy - h / 2)}+60*${ease(0, 0.55)}'[c]`,
            `[c]${pushIn(0.025, D)},${textBlock(s, false, Math.round(cy + h / 2) + 34).map(draw).join(',')},format=yuv420p[v]`,
          ];
          await run(FFMPEG, [...base, '-i', 'paper.jpg', '-i', `print${k}.png`, '-filter_complex', fc.join(';'), '-map', '[v]', '-frames:v', String(s.frames), ...ENC, file], work);
          return { file, frames: s.frames };
        }
        const v = s.video!;
        const src = path.relative(work, s.it.file);
        const voice = v.audio ? { src, dur: Math.min(D, v.dur) } : undefined;
        if (s.layout === 'full') {
          // Video dọc: tràn màn hình, vào cảnh hơi phóng rồi lắng lại.
          const z = `(1+0.05*exp(-t*7)+0.03*t/${D})`;
          const fc = [
            `[0:v]fps=${FPS},setpts=PTS-STARTPTS,crop='min(iw,ih*${W}/${H})':'min(ih,iw*${H}/${W})',` +
              `scale=w='2*trunc(${W}*${z}/2)':h='2*ceil(${H}*${z}/2)':eval=frame:flags=bicubic,crop=${W}:${H},setsar=1,${VIDEO_GRADE},` +
              `tpad=stop_mode=clone:stop_duration=${D.toFixed(3)}[p]`,
            `${still(1, s.frames)}[s]`,
            `[p][s]overlay=0:0,${textBlock(s, true, 1128).map(draw).join(',')},format=yuv420p[v]`,
          ];
          await run(FFMPEG, [...base, '-t', (D + 0.3).toFixed(3), '-i', src, '-i', 'scrim.png', '-filter_complex', fc.join(';'), '-map', '[v]', '-frames:v', String(s.frames), ...ENC, file], work);
          return { file, frames: s.frames, voice };
        }
        // Video ngang: đặt trong khung giấy trắng có bóng, trên nền giấy.
        const vw = 640, vh = Math.min(600, 2 * Math.round(vw / s.aspect / 2)), B = 12, cy = 580;
        const sh = await sharp({ create: { width: vw + 2 * B + 120, height: vh + 2 * B + 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .composite([{ input: await sharp({ create: { width: vw + 2 * B, height: vh + 2 * B, channels: 4, background: { r: 30, g: 20, b: 12, alpha: 0.34 } } }).png().toBuffer(), left: 60, top: 70 }])
          .png().toBuffer();
        await sharp(sh).blur(14).png().toFile(path.join(work, `shadow${k}.png`));
        const fx = Math.round((W - vw) / 2) - B, fy = Math.round(cy - vh / 2) - B;
        const rise = `50*${ease(0, 0.55)}`;
        const fc = [
          `${still(1, s.frames)}[bg]`,
          `${still(2, s.frames)}[sh]`,
          `[0:v]fps=${FPS},setpts=PTS-STARTPTS,scale=${vw}:${vh}:force_original_aspect_ratio=increase,crop=${vw}:${vh},setsar=1,${VIDEO_GRADE},` +
            `pad=${vw + 2 * B}:${vh + 2 * B}:${B}:${B}:color=0x${CARD},tpad=stop_mode=clone:stop_duration=${D.toFixed(3)}[vid]`,
          `[bg][sh]overlay=x=${fx - 60}:y='${fy - 60}+${rise}'[b1]`,
          `[b1][vid]overlay=x=${fx}:y='${fy}+${rise}',${textBlock(s, false, fy + vh + 2 * B + 64).map(draw).join(',')},format=yuv420p[v]`,
        ];
        await run(FFMPEG, [...base, '-t', (D + 0.3).toFixed(3), '-i', src, '-i', 'paper.jpg', '-i', `shadow${k}.png`, '-filter_complex', fc.join(';'), '-map', '[v]', '-frames:v', String(s.frames), ...ENC, file], work);
        return { file, frames: s.frames, voice };
      } catch (e) {
        console.error(`[recap] bỏ qua ${s.it.file}:`, (e as Error).message.slice(0, 400));
        return null;
      }
    }));

    // Kết: bức tường ảnh cả tuần hiện dần từng tấm, lời hẹn tuần sau, rồi lặng về giấy.
    jobs.push(async () => {
      const D = closeFrames / FPS;
      const n = wallShots.length, cols = n <= 3 ? n : n === 4 ? 2 : 3, rows = Math.ceil(n / cols);
      const size = n <= 2 ? 250 : 188, step = size + 30;
      const gy = 560 - ((rows - 1) * step) / 2;
      const tiles: Array<{ file: string; x: number; y: number; at: number }> = [];
      for (const [i, s] of wallShots.entries()) {
        const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), c = i % cols;
        const cx = W / 2 + (c - (inRow - 1) / 2) * step + ((i * 37) % 17) - 8, cy = gy + r * step + ((i * 53) % 15) - 7;
        const { w, h } = await prepPrint(s.still, path.join(work, `tile${i}.png`), { w: size, h: size, border: 8, angle: ((i * 47) % 11) - 5, shadow: 0.28 });
        tiles.push({ file: `tile${i}.png`, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), at: 0.05 + i * 0.08 });
      }
      const bottom = gy + (rows - 1) * step + size / 2;
      const c = input.counts;
      const meta = [clean(input.family), tReq('recapVideo.moments', { n: c.photos + c.videos }), c.hugs ? tReq('recapVideo.hugs', { n: c.hugs }) : '']
        .filter(Boolean).join('  ·  ');
      const text: Line[] = [
        { s: tReq('recapVideo.bye'), size: 64, color: INK, x: 'c', base: Math.round(bottom + 150), at: 0.5 + n * 0.08 },
        { s: meta, serif: false, size: 25, color: SOFT, x: 'c', base: Math.round(bottom + 208), at: 0.7 + n * 0.08 },
      ];
      const fc = [`${still(0, closeFrames)}[bg]`];
      let prev = 'bg';
      tiles.forEach((t, i) => {
        fc.push(`${still(i + 1, closeFrames)},format=rgba,fade=t=in:st=${t.at.toFixed(2)}:d=0.3:alpha=1[t${i}]`);
        fc.push(`[${prev}][t${i}]overlay=x=${t.x}:y='${t.y}+40*${ease(t.at, 0.45)}'[o${i}]`);
        prev = `o${i}`;
      });
      fc.push(`[${prev}]${pushIn(0.02, D)},${text.map(draw).join(',')},fade=t=out:st=${(D - 0.8).toFixed(3)}:d=0.8:color=0x${PAPER},format=yuv420p[v]`);
      const file = segName(shots.length + 1);
      await run(FFMPEG, [...base, '-i', 'paper.jpg', ...tiles.flatMap((t) => ['-i', t.file]), '-filter_complex', fc.join(';'), '-map', '[v]', '-frames:v', String(closeFrames), ...ENC, file], work);
      return { file, frames: closeFrames };
    });

    const results: Array<Seg | null> = new Array(jobs.length).fill(null);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
      while (next < jobs.length) { const i = next++; results[i] = await jobs[i](); }
    }));
    const segs = results.filter((s): s is Seg => !!s);
    if (!results[0] || !results[results.length - 1]) throw new Error('Không dựng được bìa hoặc cảnh kết');
    if (segs.length < 3) throw new Error('Không dựng được khoảnh khắc nào');

    // 5. Nhạc. Cảnh lỗi bị bỏ thì thời điểm các cảnh sau dịch lên, tính lại từ các cảnh còn lại.
    const totalFrames = segs.reduce((a, s) => a + s.frames, 0), total = totalFrames / FPS;
    const starts: number[] = [];
    segs.reduce((acc, s) => { starts.push(acc / FPS); return acc + s.frames; }, 0);
    const inputs: string[] = [];
    const fc: string[] = [];
    writeFileSync(path.join(work, 'list.txt'), segs.map((s) => `file '${s.file}'`).join('\n'));
    inputs.push('-f', 'concat', '-safe', '0', '-i', 'list.txt');
    if (useTrack) {
      const loop = trackDur < beat.phase + total + 1;
      inputs.push(...(loop ? ['-stream_loop', '-1'] : []), '-i', track!);
      fc.push(`[1:a]atrim=start=${beat.phase.toFixed(3)}:duration=${total.toFixed(3)},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,` +
        `loudnorm=I=-19:TP=-2:LRA=11,aresample=44100,afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, total - 2.8).toFixed(3)}:d=2.8[mus]`);
    } else {
      synthMusic(path.join(work, 'music.wav'), { total, beat: P, dropAt: segs[0].frames / FPS, endAt: starts[starts.length - 1] });
      inputs.push('-i', 'music.wav');
      fc.push(`[1:a]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100[mus]`);
    }
    // Tiếng gốc của video đặt đúng chỗ, nhạc tự hạ khi có tiếng.
    const voices: string[] = [];
    let vi = 2;
    segs.forEach((s, i) => {
      if (!s.voice) return;
      inputs.push('-t', (s.voice.dur + 0.3).toFixed(3), '-i', s.voice.src);
      fc.push(`[${vi++}:a]atrim=0:${s.voice.dur.toFixed(3)},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,loudnorm=I=-17:TP=-2,aresample=44100,` +
        `afade=t=in:d=0.15,afade=t=out:st=${Math.max(0, s.voice.dur - 0.3).toFixed(3)}:d=0.3,adelay=delays=${Math.round(starts[i] * 1000)}:all=1[vo${voices.length}]`);
      voices.push(`[vo${voices.length}]`);
    });
    if (voices.length) {
      fc.push(`${voices.join('')}amix=inputs=${voices.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)},asplit[vc][sc]`);
      fc.push('[mus][sc]sidechaincompress=threshold=0.02:ratio=8:attack=40:release=500[duck]');
      fc.push('[duck][vc]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]');
    } else fc.push('[mus]alimiter=limit=0.95[a]');

    const tmp = path.join(work, 'out.mp4');
    await run(FFMPEG, [...base, ...inputs, '-filter_complex', fc.join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', '-t', total.toFixed(3), tmp], work, 300_000);
    mkdirSync(path.dirname(outFile), { recursive: true });
    try { renameSync(tmp, outFile); } catch { copyFileSync(tmp, outFile); }
    if (opts.cover) {
      // Ảnh bìa cho màn Phim tuần: khung cuối của cảnh mở đầu (đủ ba tấm ảnh và tên nhà).
      const c = path.join(work, 'cover.jpg');
      await run(FFMPEG, [...base, '-ss', ((segs[0].frames - 2) / FPS).toFixed(3), '-i', segs[0].file, '-frames:v', '1', '-q:v', '3', c], work, 30_000);
      try { renameSync(c, opts.cover); } catch { copyFileSync(c, opts.cover); }
    }
    const music = useTrack ? `${path.basename(track!)}, ${(60 / P).toFixed(1)} bpm, +${beat.phase.toFixed(3)}s` : `synth ${(60 / P).toFixed(0)} bpm`;
    console.log(`[recap] dựng ${segs.length - 2} khoảnh khắc, ${total.toFixed(1)} giây, nhạc ${music}, mất ${((Date.now() - started) / 1000).toFixed(1)} giây`);
    return { duration: total, items: segs.length - 2 };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------- Cơ sở dữ liệu, hàng đợi, lịch tự dựng ----------

const MAX_ATTEMPTS = 3;

export async function migrateRecap(p: pg.Pool) {
  await p.query(`
    create table if not exists recaps (
      family_id text not null references families(id), week text not null, status text not null, media text,
      posts_count int not null default 0, created_at timestamptz not null default now(), primary key (family_id, week)
    );
    alter table recaps add column if not exists cover text;
    alter table recaps add column if not exists attempts int not null default 0;
    alter table recaps add column if not exists notified_at timestamptz;
  `);
  // Máy chủ vừa khởi động lại: video đang dựng dở coi như hỏng (vẫn giữ bản cũ nếu có); lịch tự dựng sẽ thử lại.
  await p.query(`update recaps set status = case when media is not null then 'ready' else 'failed' end where status = 'rendering'`);
}

const mediaFile = (m: string) => path.join(MEDIA_DIR, path.basename(m.split('?')[0]));

async function countPosts(p: pg.Pool, fid: string, week: string) {
  const s = weekStart(week);
  const { rows } = await p.query(
    `select count(*)::int n from posts where family_id = $1 and kind in ('photo','video') and media is not null and created_at >= $2 and created_at < $3`,
    [fid, s, new Date(s.getTime() + 7 * 86400e3)]);
  return rows[0].n as number;
}

/** Ngôn ngữ của phim: thứ tiếng nhiều người trong nhà dùng nhất. */
async function familyLang(p: pg.Pool, fid: string): Promise<Lang> {
  const { rows } = await p.query(
    'select lang, count(*) n, min(created_at) first from members where family_id = $1 group by lang order by n desc, first limit 1', [fid]);
  return langOf(rows[0]?.lang);
}

async function renderFamilyWeek(p: pg.Pool, fid: string, week: string) {
  const s = weekStart(week), e = new Date(s.getTime() + 7 * 86400e3);
  try {
    const [fam, posts, counts] = await Promise.all([
      p.query('select name from families where id = $1', [fid]),
      p.query(
        `select p.kind, p.media, p.caption, p.created_at, m.name, (select count(*) from reactions r where r.post_id = p.id)::int n
         from posts p join members m on m.id = p.author_id
         where p.family_id = $1 and p.kind in ('photo','video') and p.media is not null and p.created_at >= $2 and p.created_at < $3
         order by n desc, p.created_at desc limit ${MAX_ITEMS}`, [fid, s, e]),
      p.query('select kind, count(*)::int n from posts where family_id = $1 and created_at >= $2 and created_at < $3 group by kind', [fid, s, e]),
    ]);
    const n = (k: string) => counts.rows.find((r) => r.kind === k)?.n ?? 0;
    const items: RecapItem[] = posts.rows
      .map((r) => ({ kind: r.kind, file: mediaFile(r.media), author: r.name, at: new Date(r.created_at), caption: r.caption, score: r.n }))
      .filter((i) => existsSync(i.file));
    if (!items.length) throw new Error('Không còn file ảnh nào trên ổ đĩa');
    const name = `${fid}-${week}`;
    const out = path.join(MEDIA_DIR, 'recaps', `${name}.mp4`), cover = path.join(MEDIA_DIR, 'recaps', `${name}.jpg`);
    const r = await buildRecapVideo({ family: fam.rows[0]?.name ?? tReq('family.defaultName'), week, items, counts: { photos: n('photo'), videos: n('video'), hugs: n('hug') }, seed: name }, out, { cover });
    const v = Date.now();
    // posts_count: số khoảnh khắc cả tuần (ảnh và video), để màn Phim tuần biết đã có thêm từ lần dựng trước hay chưa.
    await p.query(`update recaps set status = 'ready', media = $3, cover = $4, posts_count = $5, attempts = 0, created_at = now() where family_id = $1 and week = $2`,
      [fid, week, `/media/recaps/${name}.mp4?v=${v}`, `/media/recaps/${name}.jpg?v=${v}`, n('photo') + n('video')]);
    console.log(`[recap] xong ${fid} ${week}`);
    // Tới giờ phim tuần rồi thì báo cả nhà một lần (phim dựng sớm giữa tuần thì không báo; tối Chủ nhật dựng lại bản đủ tuần mới báo).
    const due = dueAt(week).getTime();
    if (Date.now() >= due && Date.now() - due < 3 * 86400e3) {
      const { rowCount } = await p.query('update recaps set notified_at = now() where family_id = $1 and week = $2 and notified_at is null', [fid, week]);
      if (rowCount) void notifyFamily(fid, null, (l) => ({
        kind: 'post', title: tServer(l, 'push.recap.title'), body: tServer(l, 'push.recap.body'), tag: `recap-${week}`, open: 'recap', ttl: 24 * 3600,
      }));
    }
  } catch (err) {
    console.error(`[recap] lỗi ${fid} ${week}:`, (err as Error).message);
    await p.query(
      `update recaps set status = case when media is not null then 'ready' else 'failed' end, attempts = attempts + 1 where family_id = $1 and week = $2`,
      [fid, week]).catch((e) => console.error('[recap] không ghi được lỗi:', e));
  }
}

// Hàng đợi dựng: mỗi lúc RECAP_PARALLEL nhà (mặc định 1). Mỗi việc tự bắt lỗi, một nhà hỏng không làm kẹt cả hàng.
const PARALLEL = Math.max(1, Number(process.env.RECAP_PARALLEL) || 1);
const waiting: Array<() => Promise<void>> = [];
const busy = new Set<string>();
let active = 0;
function pump() {
  while (active < PARALLEL && waiting.length) {
    const job = waiting.shift()!;
    active++;
    void job().catch((e) => console.error('[recap] hàng đợi:', e)).finally(() => { active--; pump(); });
  }
}

/** Giành quyền dựng trong cơ sở dữ liệu rồi xếp hàng; nhà đang dựng thì bỏ qua (không dựng trùng). */
async function enqueue(p: pg.Pool, fid: string, week: string, postsCount: number, lang: Lang) {
  const key = `${fid}:${week}`;
  if (busy.has(key)) return false;
  const { rowCount } = await p.query(
    `insert into recaps (family_id, week, status, posts_count) values ($1,$2,'rendering',$3)
     on conflict (family_id, week) do update set status = 'rendering', posts_count = excluded.posts_count where recaps.status <> 'rendering'`,
    [fid, week, postsCount]);
  if (!rowCount) return false;
  busy.add(key);
  waiting.push(() => runWithLang(lang, () => renderFamilyWeek(p, fid, week)).finally(() => { busy.delete(key); }));
  pump();
  return true;
}

/** Một lượt lịch: tuần gần nhất đã tới giờ (20 giờ tối Chủ nhật), nhà nào đủ ảnh mà chưa có bản đủ tuần thì dựng.
 *  Máy chủ tắt đúng tối Chủ nhật thì lần khởi động sau vẫn dựng bù trong tuần kế tiếp. */
async function scheduleTick(p: pg.Pool) {
  const week = dueWeek(), s = weekStart(week), due = dueAt(week);
  const { rows } = await p.query(
    `select p.family_id, count(*)::int n, r.status, r.created_at, coalesce(r.attempts, 0) attempts
     from posts p left join recaps r on r.family_id = p.family_id and r.week = $3
     where p.kind in ('photo','video') and p.media is not null and p.created_at >= $1 and p.created_at < $2
     group by p.family_id, r.status, r.created_at, r.attempts
     having count(*) >= ${MIN_POSTS}`, [s, new Date(s.getTime() + 7 * 86400e3), week]);
  for (const r of rows) {
    if (r.status === 'rendering') continue;
    if (r.status === 'ready' && new Date(r.created_at) >= due) continue; // đã có bản dựng sau giờ chốt tuần
    if (r.attempts >= MAX_ATTEMPTS) continue;
    await enqueue(p, r.family_id, week, r.n, await familyLang(p, r.family_id));
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
/** Kiểm tra mỗi 10 phút (và một lần sau khi khởi động). */
export function startRecapScheduler(p: pg.Pool) {
  if (timer) return timer;
  const tick = () => { scheduleTick(p).catch((e) => console.error('[recap] lịch:', e)); };
  setTimeout(tick, 45_000);
  timer = setInterval(tick, 10 * 60e3);
  return timer;
}

const row = (r: any) => ({ week: r.week, status: r.status, media: r.media, cover: r.cover, postsCount: r.posts_count, createdAt: r.created_at });

export const recapRouter = express.Router();

recapRouter.get('/recaps', async (req: any, res) => {
  try {
    const { rows } = await db.query('select * from recaps where family_id = $1 order by week desc limit 52', [req.member.family_id]);
    res.json(rows.map(row));
  } catch (e) { console.error(e); res.status(500).json(errorBody('server')); }
});

/** Tuần đang dở: đã có bao nhiêu khoảnh khắc, mấy giờ phim tự có. */
recapRouter.get('/recaps/week', async (req: any, res) => {
  try {
    const week = weekKey();
    res.json({ week, posts: await countPosts(db, req.member.family_id, week), minPosts: MIN_POSTS, dueAt: dueAt(week).toISOString() });
  } catch (e) { console.error(e); res.status(500).json(errorBody('server')); }
});

/** Xem trước tuần đang dở (bấm tay). Tối Chủ nhật lịch vẫn dựng lại bản đủ tuần. */
recapRouter.post('/recaps/render', async (req: any, res) => {
  try {
    const fid = req.member.family_id;
    const week = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.week ?? '')) ? String(req.body.week) : weekKey();
    const n = await countPosts(db, fid, week);
    if (n < MIN_POSTS) {
      return res.json({ skipped: true, code: n ? 'recap_few' : 'recap_none', n, message: n ? tReq('recap.few', { n }) : tReq('recap.none') });
    }
    await enqueue(db, fid, week, n, await familyLang(db, fid));
    const { rows } = await db.query('select * from recaps where family_id = $1 and week = $2', [fid, week]);
    res.json(row(rows[0]));
  } catch (e) { console.error(e); res.status(500).json(errorBody('server')); }
});
