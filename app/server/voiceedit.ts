// Làm sạch giọng kể và ghép tiếng cho tập podcast (ffmpeg, chạy nền).
// Mỗi đoạn trả lời: đo nền ồn, lọc ồn, EQ cho giọng ấm, nén, khử xì, cắt lặng đầu cuối, rút khoảng lặng dài,
// cắt tiếng ậm ờ theo mốc từng từ (Whisper) nếu chỗ cắt đủ yên. Cả tập: đặt giọng theo mốc, nhạc nền nhỏ dưới giọng
// (sidechain), vào ra có fade, chuẩn âm lượng -16 LUFS và đỉnh thật dưới -1 dBTP (loudnorm hai lượt).
// Không có giọng Mây, không có giọng máy: câu hỏi hiện bằng chữ trong video và trong mục lục của tập.
import { spawn } from 'node:child_process';
import { existsSync, renameSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pool } from './db.ts';
import type { Lang } from './i18n.ts';
import { pickTrack } from './music.ts';
import { musicExpr } from './recap.ts';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
/** Đổi khi cách cắt đổi: mốc từ đã lưu theo bản cắt cũ sẽ không dùng nữa. */
const EDIT_VER = 'e1';
export const TARGET_LUFS = -16;
const CLIP_LUFS = -17;
const MUSIC_GAP_LUFS = -19; // nhạc lúc không có giọng nhỏ hơn giọng chừng 2 đến 4 LU; dưới giọng sidechain hạ thêm khoảng 14 dB

export type Word = { w: string; s: number; e: number };
export type Clip = { file: string; dur: number; gain: number; words: Word[] | null; text: string | null; voiced: Array<[number, number]> };

// ---------- Chạy ffmpeg (giữ cả stderr để đọc số đo) ----------

export function ff(bin: string, args: string[], cwd: string, timeoutMs = 300_000): Promise<{ out: Buffer; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d) => { err = (err + d).slice(-40_000); });
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ out: Buffer.concat(out), err });
      else reject(new Error(`${path.basename(bin)} thoát với mã ${code}\n${err.slice(-3000)}`));
    });
  });
}
export const ffmpeg = (args: string[], cwd: string, ms?: number) => ff(FFMPEG, ['-y', '-hide_banner', '-nostdin', ...args], cwd, ms);

export async function duration(file: string, cwd: string) {
  try {
    const { out } = await ff(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], cwd, 30_000);
    const d = Number(String(out).trim());
    return Number.isFinite(d) ? d : null;
  } catch { return null; }
}

/** Độ to tích hợp (LUFS) đọc từ phần tóm tắt của ebur128. */
function parseLufs(err: string) {
  const sum = err.slice(err.lastIndexOf('Summary:'));
  const m = sum.match(/I:\s*(-?[\d.]+|-inf)\s*LUFS/);
  return m && m[1] !== '-inf' ? Number(m[1]) : null;
}
export async function loudness(file: string, cwd: string) {
  const { err } = await ffmpeg(['-loglevel', 'info', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], cwd, 300_000);
  const tp = err.slice(err.lastIndexOf('Summary:')).match(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/);
  return { lufs: parseLufs(err), tp: tp && tp[1] !== '-inf' ? Number(tp[1]) : null };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lin = (db: number) => Math.pow(10, db / 20);
const f3 = (n: number) => n.toFixed(3);

// ---------- Đo giọng: năng lượng từng khung 10 ms ----------

const HOP = 0.01;
type Env = { db: Float32Array; floor: number; level: number; thr: number };

export async function envelope(file: string, cwd: string): Promise<Env> {
  const { out } = await ffmpeg(['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-af', 'highpass=f=80', '-f', 'f32le', 'pipe:1'], cwd, 120_000);
  const n = Math.floor(out.byteLength / 4), size = 160;
  const frames = Math.floor(n / size);
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = 0; i < size; i++) { const v = out.readFloatLE((f * size + i) * 4); sum += v * v; }
    db[f] = 10 * Math.log10(sum / size + 1e-12);
  }
  const sorted = Float32Array.from(db).sort();
  const pct = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : -90;
  const floor = Math.max(-90, pct(0.1)), level = pct(0.95);
  // Ngưỡng có tiếng: trên nền ồn đủ xa, nhưng không quá thấp so với giọng (phòng ồn thì lấy giữa hai mức).
  const thr = level - floor < 16 ? floor + (level - floor) * 0.45 : clamp(Math.max(floor + 9, level - 30), floor + 6, level - 8);
  return { db, floor, level, thr };
}

/** Các đoạn có tiếng (giây): lấp khe ngắn, bỏ tiếng lách cách lẻ. */
function speech(env: Env): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1, last = -1;
  for (let f = 0; f < env.db.length; f++) {
    if (env.db[f] <= env.thr) continue;
    if (start < 0) start = f;
    else if (f - last > 20) { out.push([start, last + 1]); start = f; }
    last = f;
  }
  if (start >= 0) out.push([start, last + 1]);
  return out.filter(([a, b]) => b - a >= 6).map(([a, b]) => [a * HOP, b * HOP]);
}

/** Khung yên nhất quanh một mốc (để cắt không lẹm chữ). */
function quietest(env: Env, t: number, before: number, after: number) {
  const a = Math.max(0, Math.round((t - before) / HOP)), b = Math.min(env.db.length - 1, Math.round((t + after) / HOP));
  let best = Math.round(t / HOP), v = Infinity;
  for (let f = a; f <= b; f++) if (env.db[f] < v) { v = env.db[f]; best = f; }
  return { t: best * HOP, db: v };
}

// ---------- Dựng một đoạn giọng ----------

export function chain(env: Env) {
  const snr = env.level - env.floor;
  // Lọc ồn vừa phải theo độ ồn của bản ghi (lọc quá tay giọng sẽ như dưới nước).
  const nr = snr < 18 ? 16 : snr < 28 ? 13 : 10;
  const nf = Math.round(clamp(env.floor + 4, -80, -25));
  // Giọng (khung 95%) về khoảng -14 dBFS trước khi nén: mọi bản ghi vào bộ nén ở cùng một mức.
  const gain = clamp(-14 - env.level, -12, 26);
  const gate = lin(clamp(env.thr + gain - 2, -70, -30));
  return [
    'highpass=f=80:p=2',
    `afftdn=nr=${nr}:nf=${nf}:tn=1`,
    'equalizer=f=170:t=q:w=0.9:g=1.5',
    'equalizer=f=380:t=q:w=1.4:g=-2',
    'equalizer=f=3200:t=q:w=1.2:g=1.5',
    'equalizer=f=12000:t=q:w=1:g=-1',
    `volume=${gain.toFixed(1)}dB`,
    `agate=threshold=${gate.toFixed(5)}:ratio=2:range=0.35:attack=8:release=250:knee=4`,
    `acompressor=threshold=${lin(-24).toFixed(5)}:ratio=2:attack=40:release=700:knee=6`,
    `acompressor=threshold=${lin(-18).toFixed(5)}:ratio=3:attack=6:release=120:knee=3`,
    'deesser=i=0.35:m=0.5:f=0.5:s=o',
  ].join(',');
}

/** Ghép các khúc giữ lại, mỗi chỗ nối có fade 12 ms (chỗ nối luôn nằm trong khoảng lặng). */
function joinGraph(input: string, keeps: Array<[number, number]>, tail: string) {
  const fc: string[] = [];
  if (keeps.length === 1) {
    const [a, b] = keeps[0];
    fc.push(`${input}atrim=start=${f3(a)}:end=${f3(b)},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${f3(Math.max(0, b - a - 0.012))}:d=0.012${tail}[out]`);
    return fc.join(';');
  }
  fc.push(`${input}asplit=${keeps.length}${keeps.map((_, i) => `[s${i}]`).join('')}`);
  keeps.forEach(([a, b], i) => fc.push(`[s${i}]atrim=start=${f3(a)}:end=${f3(b)},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${f3(Math.max(0, b - a - 0.012))}:d=0.012[k${i}]`));
  fc.push(`${keeps.map((_, i) => `[k${i}]`).join('')}concat=n=${keeps.length}:v=0:a=1${tail}[out]`);
  return fc.join(';');
}

/** Đổi mốc thời gian của bản gốc sang bản đã cắt. */
function mapper(keeps: Array<[number, number]>) {
  const offs: number[] = [];
  let acc = 0;
  for (const [a, b] of keeps) { offs.push(acc); acc += b - a; }
  return (t: number) => {
    for (let i = 0; i < keeps.length; i++) {
      const [a, b] = keeps[i];
      if (t < a) return offs[i];
      if (t <= b) return offs[i] + (t - a);
    }
    return acc;
  };
}

/** Giữ lại phần có tiếng: lặng đầu chừa 0,15 s, lặng cuối 0,3 s, khoảng lặng giữa dài quá 0,8 s rút còn khoảng 0,55 s. */
function keepsOf(regions: Array<[number, number]>, dur: number): Array<[number, number]> {
  const keeps: Array<[number, number]> = [];
  let a = Math.max(0, regions[0][0] - 0.15);
  for (let i = 0; i < regions.length - 1; i++) {
    const end = regions[i][1], next = regions[i + 1][0];
    if (next - end > 0.8) { keeps.push([a, end + 0.3]); a = next - 0.25; }
  }
  keeps.push([a, Math.min(dur, regions[regions.length - 1][1] + 0.3)]);
  return keeps;
}

const FILLERS: Record<Lang, Set<string>> = {
  vi: new Set(['ờ', 'ơ', 'ừm', 'ờm', 'ưm', 'hừm', 'ừmm', 'ờờ', 'ơơ', 'um', 'uhm', 'hmm']), // i18n-ok: tiếng ậm ờ cần cắt
  en: new Set(['uh', 'um', 'uhm', 'erm', 'hmm', 'mm', 'mmm', 'umm', 'uhh']),
  ko: new Set(['음', '으음', '음음', '어어', '으', '흠', '으으']),
};
const bare = (w: string) => w.normalize('NFC').toLowerCase().replace(/[\p{P}\p{S}]/gu, '');
export const isFiller = (w: string, lang: Lang) => FILLERS[lang].has(bare(w));

export type ClipOpts = { lang: Lang; cacheKey: string | null; transcript: string | null; whisper: boolean };

/** Làm sạch một đoạn giọng. Trả null nếu đoạn gần như không có tiếng. name: tên tệp (không đuôi) trong thư mục làm việc. */
export async function cleanClip(src: string, work: string, name: string, o: ClipOpts): Promise<Clip | null> {
  const env = await envelope(src, work);
  const dur = env.db.length * HOP;
  const regions = speech(env);
  const voicedTime = regions.reduce((a, [s, e]) => a + e - s, 0);
  if (!regions.length || voicedTime < 0.5 || env.level < -60) return null;

  // Lượt 1: lọc, cắt lặng, đo độ to.
  const keeps = keepsOf(regions, dur);
  const map1 = mapper(keeps);
  const first = `${name}.a.wav`;
  const { err } = await ffmpeg(['-loglevel', 'info', '-i', src, '-vn', '-filter_complex',
    joinGraph(`[0:a]aresample=48000,aformat=sample_fmts=flt:channel_layouts=mono,${chain(env)},`, keeps, ',ebur128'),
    '-map', '[out]', '-c:a', 'pcm_f32le', first], work, 300_000);
  const lufs = parseLufs(err);
  let file = first;
  let clipDur = keeps.reduce((a, [s, e]) => a + e - s, 0);
  let voiced = regions.map(([s, e]) => [map1(s), map1(e)] as [number, number]);

  // Mốc từng từ: lấy từ kho (đã chép lần trước) hoặc nhờ Whisper trong hạn mức ngày.
  let got: { words: Word[]; text: string } | null = o.cacheKey ? await cachedWords(o.cacheKey, clipDur) : null;
  if (!got && o.whisper) {
    got = await whisperWords(first, work, o.lang, clipDur);
    if (got && o.cacheKey) await saveWords(o.cacheKey, clipDur, got).catch(() => {});
  }
  // Whisper nghe ra chuyện khác hẳn lời đã chép (bịa câu trên tiếng ồn): bỏ, dùng lời đã chép.
  if (got && o.transcript && overlap(got.text, o.transcript) < 0.25) got = null;

  // Lượt 2: cắt tiếng ậm ờ, chỉ khi hai đầu chỗ cắt đủ yên.
  if (got) {
    const env2 = await envelope(first, work);
    const cuts: Array<[number, number]> = [];
    got.words.forEach((w, i) => {
      if (!isFiller(w.w, o.lang) || w.e - w.s < 0.1 || w.e - w.s > 1.6) return;
      const prevEnd = got!.words[i - 1]?.e ?? 0, nextStart = got!.words[i + 1]?.s ?? clipDur;
      const a = quietest(env2, w.s, Math.min(0.12, Math.max(0.02, w.s - prevEnd)), 0.05);
      const b = quietest(env2, w.e, 0.05, Math.min(0.15, Math.max(0.02, nextStart - w.e)));
      if (a.db > env2.thr + 3 || b.db > env2.thr + 3 || b.t - a.t < 0.12) return;
      cuts.push([a.t + 0.04, b.t - 0.04]);
    });
    if (cuts.length) {
      const keep2: Array<[number, number]> = [];
      let a = 0;
      for (const [s, e] of cuts) { if (s - a > 0.05) keep2.push([a, s]); a = e; }
      if (clipDur - a > 0.05) keep2.push([a, clipDur]);
      const map2 = mapper(keep2);
      const second = `${name}.b.wav`;
      await ffmpeg(['-i', first, '-filter_complex', joinGraph('[0:a]', keep2, ''), '-map', '[out]', '-c:a', 'pcm_f32le', second], work, 120_000);
      file = second;
      clipDur = keep2.reduce((x, [s, e]) => x + e - s, 0);
      got = { text: got.text, words: got.words.map((w) => ({ w: w.w, s: map2(w.s), e: map2(w.e) })) };
      voiced = voiced.map(([s, e]) => [map2(s), map2(e)] as [number, number]).filter(([s, e]) => e - s > 0.05);
    }
  }

  const real = await duration(file, work);
  if (real) clipDur = real;
  const text = got ? got.words.filter((w) => !isFiller(w.w, o.lang)).map((w) => w.w).join(' ') : (o.transcript?.trim() || null);
  const words = got ? got.words.filter((w) => !isFiller(w.w, o.lang)) : o.transcript?.trim() ? spread(o.transcript, voiced) : null;
  return { file, dur: clipDur, gain: lufs == null ? 0 : clamp(CLIP_LUFS - lufs, -12, 12), words, text, voiced };
}

/** Không có mốc từng từ: chia chữ theo độ dài vào các đoạn có tiếng. */
export function spread(text: string, voiced: Array<[number, number]>): Word[] {
  const toks = text.normalize('NFC').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!toks.length || !voiced.length) return [];
  const total = voiced.reduce((a, [s, e]) => a + e - s, 0);
  const weight = (w: string) => [...w].length + 1 + (/[.,!?;:…]$/.test(w) ? 2 : 0);
  const sum = toks.reduce((a, w) => a + weight(w), 0);
  const at = (x: number) => {
    let t = x * total;
    for (const [s, e] of voiced) { if (t <= e - s) return s + t; t -= e - s; }
    return voiced[voiced.length - 1][1];
  };
  let acc = 0;
  return toks.map((w) => {
    const s = at(acc / sum);
    acc += weight(w);
    return { w, s, e: Math.max(s + 0.08, at(acc / sum) - 0.02) };
  });
}

function overlap(a: string, b: string) {
  const ta = new Set(bare(a).split(/\s+/).filter(Boolean)), tb = bare(b).split(/\s+/).filter(Boolean);
  if (!ta.size || !tb.length) return 1;
  return tb.filter((w) => ta.has(w)).length / tb.length;
}

// ---------- Whisper: mốc từng từ, ngân sách ngày (giây âm thanh) ----------

const vnDay = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
/** Mặc định 30 phút mỗi ngày (khoảng 0,18 đô): tài khoản OpenAI dùng chung, trần 10 đô mỗi tháng. */
const dailySec = () => (Number(process.env.WHISPER_DAILY_MIN) || 30) * 60;

async function budget(): Promise<{ day: string; sec: number }> {
  try {
    const { rows } = await pool.query(`select value from app_settings where key = 'whisper_budget'`);
    const v = rows[0] ? JSON.parse(rows[0].value) : null;
    if (v?.day === vnDay()) return { day: v.day, sec: Number(v.sec) || 0 };
  } catch {}
  return { day: vnDay(), sec: 0 };
}
async function spend(sec: number) {
  const b = await budget();
  await pool.query(`insert into app_settings (key, value) values ('whisper_budget', $1) on conflict (key) do update set value = excluded.value`,
    [JSON.stringify({ day: b.day, sec: Math.round(b.sec + sec) })]).catch(() => {});
}
let blockedUntil = 0;

// Câu mồi chỉ gồm tiếng ậm ờ để Whisper chép cả tiếng ậm ờ. Không mồi bằng câu thật (hay câu hỏi): Whisper có khi chép luôn câu mồi
// vào đầu lời như thể người kể đã nói. Tiếng ậm ờ lọt vào thì đã bị bỏ khỏi phụ đề; lặp "ừ ừ ừ" thì bị lọc và hỏi lại không mồi.
const PROMPT: Record<Lang, string> = {
  vi: 'Ừm, ờ... ừm.', // i18n-ok: câu mồi cho Whisper
  en: 'Um, uh... um.',
  ko: '음, 어어... 음.',
};
/** Câu Whisper hay tự bịa trên tiếng ồn hoặc lặng. */
const HALLU = /subscribe|đăng ký kênh|ghiền mì gõ|cảm ơn các bạn đã (theo dõi|xem)|hẹn gặp lại các bạn|la la school|thanks for watching|subtitles by|시청해 ?주셔서|구독과 좋아요|mbc 뉴스/i; // i18n-ok: câu Whisper hay bịa

type WhisperOut = { text?: string; words?: Array<{ word: string; start: number; end: number }>;
  segments?: Array<{ start: number; end: number; text: string; avg_logprob?: number; no_speech_prob?: number; compression_ratio?: number }> };

async function whisperWords(file: string, work: string, lang: Lang, dur: number): Promise<{ words: Word[]; text: string } | null> {
  if (!process.env.OPENAI_API_KEY || Date.now() < blockedUntil) return null;
  const b = await budget();
  if (b.sec + dur > dailySec()) { console.log(`[voice-edit] hết ngân sách Whisper hôm nay (${Math.round(b.sec)} giây), chia phụ đề theo độ dài chữ`); return null; }
  try {
    const { out } = await ffmpeg(['-v', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-b:a', '48k', '-f', 'mp3', 'pipe:1'], work, 120_000);
    const ask = async (prompt: string) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(out)], { type: 'audio/mpeg' }), 'voice.mp3');
      form.append('model', process.env.OPENAI_WORDS_MODEL || 'whisper-1');
      form.append('language', lang);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      form.append('timestamp_granularities[]', 'segment');
      if (prompt) form.append('prompt', prompt.slice(0, 600));
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
        signal: AbortSignal.timeout(60_000 + dur * 1000),
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 200);
        if (res.status === 401 || res.status === 403 || res.status === 429) blockedUntil = Date.now() + 30 * 60_000;
        console.error(`[voice-edit] Whisper ${res.status}: ${body}`);
        return undefined;
      }
      await spend(dur);
      return align(await res.json() as WhisperOut);
    };
    // Lời chép quá ít so với độ dài (Whisper lặp chữ hay bịa câu, đã bị lọc): hỏi lại một lần không có câu mồi.
    const enough = (r: { words: Word[] } | null | undefined) => !!r && r.words.length >= Math.max(2, dur * 0.6);
    const first = await ask(PROMPT[lang]);
    if (first === undefined) return null;
    if (enough(first)) return first;
    const again = await ask('');
    const got = [first, again].filter((r): r is { words: Word[]; text: string } => !!r);
    return got.sort((x, y) => y.words.length - x.words.length)[0] ?? null;
  } catch (e) {
    console.error('[voice-edit] Whisper lỗi:', (e as Error).message.split('\n')[0]);
    return null;
  }
}

/** Ghép chữ có dấu câu (theo câu) với mốc từng từ (không dấu câu); từ nào không khớp thì nội suy theo độ dài chữ. */
function align(r: WhisperOut): { words: Word[]; text: string } | null {
  const segs = (r.segments ?? []).filter((s) => (s.no_speech_prob ?? 0) < 0.6 && (s.avg_logprob ?? 0) > -1.1 && (s.compression_ratio ?? 1) < 2.6 && !HALLU.test(s.text));
  const ws = r.words ?? [];
  const out: Word[] = [];
  for (const s of segs) {
    const toks = s.text.normalize('NFC').trim().split(/\s+/).filter(Boolean);
    const pool = ws.filter((w) => w.start >= s.start - 0.05 && w.end <= s.end + 0.05);
    let j = 0;
    const timed: Array<Word & { ok: boolean }> = toks.map((tok) => {
      const key = bare(tok);
      for (let k = j; k < Math.min(pool.length, j + 3); k++) {
        if (bare(pool[k].word) === key) { j = k + 1; return { w: tok, s: pool[k].start, e: pool[k].end, ok: true }; }
      }
      return { w: tok, s: 0, e: 0, ok: false };
    });
    // Nội suy mốc cho từ không khớp, giữa hai từ đã có mốc (hoặc biên của câu).
    for (let i = 0; i < timed.length; i++) {
      if (timed[i].ok) continue;
      let k = i;
      while (k < timed.length && !timed[k].ok) k++;
      const from = i ? timed[i - 1].e : s.start, to = k < timed.length ? timed[k].s : s.end;
      const len = timed.slice(i, k).reduce((a, t) => a + [...t.w].length + 1, 0);
      let acc = 0;
      for (let m = i; m < k; m++) {
        const a = from + ((to - from) * acc) / len;
        acc += [...timed[m].w].length + 1;
        timed[m].s = a; timed[m].e = from + ((to - from) * acc) / len; timed[m].ok = true;
      }
      i = k - 1;
    }
    for (const t of timed) out.push({ w: t.w, s: t.s, e: Math.max(t.e, t.s + 0.05) });
  }
  if (!out.length) return null;
  return { words: out, text: out.map((w) => w.w).join(' ') };
}

// ---------- Kho mốc từng từ (khỏi trả tiền chép lại khi dựng lại tập) ----------

export async function migrateVoiceEdit() {
  await pool.query(`create table if not exists podcast_words (
    key text primary key, ver text not null, dur real not null, words text not null, created_at timestamptz not null default now())`);
}
async function cachedWords(key: string, dur: number) {
  try {
    const { rows: [r] } = await pool.query('select ver, dur, words from podcast_words where key = $1', [key]);
    if (!r || r.ver !== EDIT_VER || Math.abs(Number(r.dur) - dur) > 0.06) return null;
    return JSON.parse(r.words) as { words: Word[]; text: string };
  } catch { return null; }
}
async function saveWords(key: string, dur: number, v: { words: Word[]; text: string }) {
  await pool.query(`insert into podcast_words (key, ver, dur, words) values ($1,$2,$3,$4)
    on conflict (key) do update set ver = excluded.ver, dur = excluded.dur, words = excluded.words, created_at = now()`, [key, EDIT_VER, dur, JSON.stringify(v)]);
}

// ---------- Ghép cả tập ----------

export type Placed = { clip: Clip; at: number };
const trackLufs = new Map<string, number>();

async function musicInput(work: string, total: number, seed: string): Promise<{ args: string[]; graph: (i: number) => string; lufs: number }> {
  const track = pickTrack(seed);
  if (track) {
    try {
      const st = statSync(track);
      const k = `${track}|${st.size}|${st.mtimeMs}`;
      let l = trackLufs.get(k);
      if (l == null) { l = (await loudness(track, work)).lufs ?? -16; trackLufs.set(k, l); }
      const len = (await duration(track, work)) ?? 0;
      if (len > 20) {
        // Bài ngắn hơn tập: nối lại chính nó, chồng mờ 4 giây ở chỗ nối.
        const n = Math.max(1, Math.ceil((total + 1) / (len - 4)));
        const args = Array.from({ length: n }, () => ['-i', track]).flat();
        const graph = (i: number) => {
          const ins = Array.from({ length: n }, (_, k) => `[${i + k}:a]aresample=48000,aformat=sample_fmts=flt:channel_layouts=stereo[m${k}]`);
          let cur = 'm0';
          for (let k = 1; k < n; k++) { ins.push(`[${cur}][m${k}]acrossfade=d=4:c1=tri:c2=tri[mx${k}]`); cur = `mx${k}`; }
          return `${ins.join(';')};[${cur}]`;
        };
        return { args, graph, lufs: l };
      }
    } catch (e) {
      console.error('[voice-edit] bỏ qua bài nhạc:', (e as Error).message.split('\n')[0]);
    }
  }
  // Chưa có bài nào: nhạc tổng hợp cũ (pad hợp âm êm và hộp nhạc), lặp lại một vòng 32 giây dựng sẵn.
  const loop = await synthLoop(work);
  return { args: ['-stream_loop', '-1', '-i', loop.file], graph: (i) => `[${i}:a]`, lufs: loop.lufs };
}

/** Nhạc tổng hợp tuần hoàn đúng 16 giây (4 hợp âm x 4 giây) nhưng tính bằng aevalsrc rất chậm: dựng một lần 48 giây có tiếng vang,
 *  lấy đoạn 16..48 (tiếng vang đã đều) làm vòng lặp liền mạch, giữ trong thư mục tạm của máy. */
let synth: Promise<{ file: string; lufs: number }> | null = null;
function synthLoop(work: string) {
  if (!synth) {
    synth = (async () => {
      const file = path.join(os.tmpdir(), 'sh-synth-loop-v1.wav');
      if (!existsSync(file)) {
        const part = `${file}.${process.pid}.part.wav`;
        await ffmpeg(['-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=exprs='${musicExpr(0.998)}|${musicExpr(1.002)}':s=48000:d=48`,
          '-af', 'lowpass=f=2800,aecho=0.8:0.6:180|340:0.22|0.12,atrim=16:48,asetpts=PTS-STARTPTS', '-c:a', 'pcm_s16le', part], work, 600_000);
        renameSync(part, file);
      }
      return { file, lufs: (await loudness(file, work)).lufs ?? -30 };
    })();
    synth.catch(() => { synth = null; });
  }
  return synth;
}

/** Ghép giọng đã làm sạch theo mốc với nhạc nền, chuẩn âm lượng, ra tệp m4a (AAC 160 kbps). */
export async function mixEpisode(work: string, placed: Placed[], total: number, seed: string, outFile: string) {
  const music = await musicInput(work, total, seed);
  const inputs: string[] = [];
  const fc: string[] = [];
  placed.forEach((p, i) => {
    inputs.push('-i', p.clip.file);
    const ms = Math.round(p.at * 1000);
    fc.push(`[${i}:a]volume=${p.clip.gain.toFixed(2)}dB,adelay=delays=${ms}:all=1[v${i}]`);
  });
  const mi = placed.length;
  inputs.push(...music.args);
  fc.push(`${placed.map((_, i) => `[v${i}]`).join('')}amix=inputs=${placed.length}:normalize=0:duration=longest,apad=whole_dur=${f3(total)},atrim=0:${f3(total)},asplit=2[vm][vk0]`);
  fc.push('[vk0]pan=stereo|c0=c0|c1=c0[vk]');
  const mg = clamp(MUSIC_GAP_LUFS - music.lufs, -30, 20);
  fc.push(`${music.graph(mi)}atrim=0:${f3(total)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=flt:channel_layouts=stereo,` +
    `highpass=f=60,equalizer=f=2800:t=q:w=1.2:g=-3,volume=${mg.toFixed(2)}dB,afade=t=in:d=2.5,afade=t=out:st=${f3(Math.max(0, total - 4.5))}:d=4.5[mus]`);
  fc.push('[mus][vk]sidechaincompress=threshold=0.015:ratio=8:attack=60:release=900:knee=4[duck]');
  fc.push('[vm]pan=stereo|c0=c0|c1=c0[vs]');
  // Hãm đỉnh nhẹ trên cả tập (vài dB ở tiếng bật hơi) để loudnorm lượt sau chỉnh tuyến tính được, không phải nén động.
  fc.push(`[duck][vs]amix=inputs=2:normalize=0:duration=first,alimiter=limit=${lin(-5).toFixed(4)}:attack=2:release=60[a]`);
  await ffmpeg(['-v', 'error', ...inputs, '-filter_complex', fc.join(';'), '-map', '[a]', '-c:a', 'pcm_f32le', '-ar', '48000', 'mix.wav'], work, 900_000);

  // loudnorm hai lượt: đo, rồi chỉnh tuyến tính về -16 LUFS, đỉnh thật -1,5 dBTP (AAC còn dư chỗ dưới -1).
  const target = `I=${TARGET_LUFS}:TP=-1.5:LRA=11`;
  const { err } = await ffmpeg(['-loglevel', 'info', '-i', 'mix.wav', '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], work, 600_000);
  const j = JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1));
  const ln = `loudnorm=${target}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  await ffmpeg(['-v', 'error', '-i', 'mix.wav', '-af', `${ln},aresample=48000`, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', outFile], work, 600_000);
}
