// Giọng nói của Homeletter bằng Gemini: đọc câu thành tiếng (TTS) và chép lời câu trả lời (STT).
// Âm thanh đọc ra lưu theo hash(chữ + giọng + model) trong MEDIA_DIR/tts, câu lặp lại không phải gọi lần nữa.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { useGemini } from './ai.ts';
import { run } from './recap.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
const TTS_DIR = path.join(MEDIA_DIR, 'tts');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const TTS_MAX = 300;
const TTS_MODEL = () => process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
// Một giọng duy nhất cho cả cuộc gọi: đổi giọng bằng GEMINI_VOICE, cache khoá theo tên giọng.
export const VOICE = () => process.env.GEMINI_VOICE || 'Zephyr';
// Tăng số này khi đổi cách xử lý âm thanh để bỏ cache cũ.
const CACHE_VER = 'v2';
const STT_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
// Model 2.5 hiểu lời dặn giọng đặt trước câu; các model TTS mới hơn lại đọc to cả lời dặn, nên chỉ gửi câu.
// Đổi lời dặn bằng GEMINI_TTS_STYLE, không cần sửa code.
const STYLE_DEFAULT = 'Nói tiếng Việt tự nhiên, rõ ràng, tươi và thân thiện, như người thân đang nói chuyện bình thường qua điện thoại. '
  + 'Âm lượng và cao độ bình thường, tốc độ vừa phải hơi nhanh một chút, nhịp tự nhiên có nhấn nhá. '
  + 'Không thì thầm, không kéo dài chữ, không giọng kể chuyện ru ngủ. Câu cần nói: ';
const STYLE = () => process.env.GEMINI_TTS_STYLE || STYLE_DEFAULT;

export const hasVoice = () => useGemini();
const styled = () => TTS_MODEL().includes('2.5');

// ---------- Giới hạn: mỗi người tối đa 80 câu mới mỗi giờ, cả máy chủ 3 câu cùng lúc, bị 429 thì nghỉ 1 phút ----------

const used = new Map<string, number[]>();
export function allow(who: string, max = 80, windowMs = 3600e3) {
  const now = Date.now();
  const list = (used.get(who) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { used.set(who, list); return false; }
  list.push(now);
  used.set(who, list);
  return true;
}

let coolUntil = 0;
let busy = 0;
const queue: Array<() => void> = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (busy >= 3) await new Promise<void>((r) => queue.push(r));
  busy++;
  try { return await fn(); } finally { busy--; queue.shift()?.(); }
}

// ---------- Đọc thành tiếng ----------

const inflight = new Map<string, Promise<string | null>>();

function keyOf(text: string) {
  return createHash('sha1').update(`${CACHE_VER}|${TTS_MODEL()}|${VOICE()}|${styled() ? STYLE() : ''}|${text}`).digest('hex').slice(0, 24);
}

/** Đường dẫn /media/tts/<hash>.mp3 nếu đã có sẵn trong kho. */
export function cachedSpeech(text: string): string | null {
  const k = keyOf(text);
  for (const ext of ['.mp3', '.wav']) if (existsSync(path.join(TTS_DIR, k + ext))) return `/media/tts/${k}${ext}`;
  return null;
}

/** Đọc câu thành tiếng, trả về đường dẫn file. who để tính giới hạn; câu có sẵn trong kho thì không tính. */
export function speech(text: string, who: string): Promise<string | null> | null {
  const hit = cachedSpeech(text);
  if (hit) return Promise.resolve(hit);
  if (!hasVoice() || Date.now() < coolUntil) return null;
  const k = keyOf(text);
  const going = inflight.get(k);
  if (going) return going;
  if (!allow(`tts:${who}`)) return null;
  const p = slot(() => synth(text, k)).catch((e) => { console.error('[voice] đọc lỗi:', (e as Error).message); return null; })
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

async function synth(text: string, k: string): Promise<string | null> {
  const t0 = Date.now();
  // Câu rất ngắn (ừm, dạ) đôi khi model trả chữ thay vì tiếng: thử thêm một lần.
  let part = await askAudio(text);
  if (!part) part = await askAudio(text);
  if (!part) throw new Error('Gemini TTS không trả âm thanh');
  return save(part, text, k, t0);
}

/** Chạy ffmpeg và lấy nhật ký stderr (đo âm lượng nằm ở đó). */
function ffmpegErr(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { timeout: 30_000, maxBuffer: 4_000_000, windowsHide: true }, (err, _out, stderr) => (err ? reject(err) : resolve(String(stderr))));
  });
}

async function askAudio(text: string) {
  const model = TTS_MODEL();
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: styled() ? STYLE() + text : text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE() } } } },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status === 429) coolUntil = Date.now() + 60_000;
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  return part?.data ? { mimeType: part.mimeType ?? '', data: part.data } : null;
}

async function save(part: { mimeType: string; data: string }, text: string, k: string, t0: number) {
  const raw = Buffer.from(part.data, 'base64');
  const isWav = raw.subarray(0, 4).toString('latin1') === 'RIFF';
  const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? '')?.[1]) || 24000;

  mkdirSync(TTS_DIR, { recursive: true });
  const tmp = path.join(TTS_DIR, `${k}.${process.pid}.${Date.now()}`);
  const wav = isWav ? raw : withWavHeader(raw, rate);
  writeFileSync(tmp + '.wav', wav);
  let url: string;
  try {
    // Cắt im lặng hai đầu, chuẩn hoá về cùng độ to (loudnorm hai lượt), mono 48 kbps: một câu chừng 30 đến 60 KB.
    const trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse';
    const T = 'I=-18:TP=-2:LRA=9';
    let af = `${trim},loudnorm=${T}`;
    try {
      const log = await ffmpegErr(['-hide_banner', '-nostats', '-i', tmp + '.wav', '-af', `${trim},loudnorm=${T}:print_format=json`, '-f', 'null', '-']);
      const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
      const ok = [m.input_i, m.input_tp, m.input_lra, m.input_thresh, m.target_offset].every((v: string) => Number.isFinite(Number(v)));
      if (ok) af = `${trim},loudnorm=${T}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    } catch {}
    await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp + '.wav', '-af', af,
      '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', tmp + '.mp3'], TTS_DIR, 30_000);
    renameSync(tmp + '.mp3', path.join(TTS_DIR, k + '.mp3'));
    rmSync(tmp + '.wav', { force: true });
    url = `/media/tts/${k}.mp3`;
  } catch (e) {
    console.error('[voice] ffmpeg lỗi, giữ WAV:', (e as Error).message.split('\n')[0]);
    rmSync(tmp + '.mp3', { force: true });
    renameSync(tmp + '.wav', path.join(TTS_DIR, k + '.wav'));
    url = `/media/tts/${k}.wav`;
  }
  console.log(`[voice] đọc ${text.length} chữ trong ${Date.now() - t0} ms`);
  return url;
}

function withWavHeader(pcm: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// ---------- Chép lời ----------

const STT_PROMPT = `Chép lại nguyên văn lời nói tiếng Việt trong đoạn ghi âm này.
Giữ đúng từng chữ người nói, có dấu, không thêm, không bớt, không sửa câu, không tóm tắt, không giải thích.
Bỏ qua tiếng ồn. Nếu không nghe thấy lời nói nào thì trả về chuỗi rỗng.`;

/** Chép lời một file ghi âm trong MEDIA_DIR. Quá hạn hoặc lỗi thì trả null, không làm chậm cuộc gọi. */
export async function transcribe(file: string, who: string, timeoutMs = 8000): Promise<string | null> {
  if (!hasVoice() || Date.now() < coolUntil || !allow(`stt:${who}`, 60)) return null;
  const t0 = Date.now();
  const out = `${file}.stt.mp3`;
  try {
    // Đổi về mp3 mono 16 kHz: nhỏ, gửi nhanh, Gemini đọc được (m4a, webm từ điện thoại thì chưa chắc).
    await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', out],
      path.dirname(file), Math.max(1000, timeoutMs - 1000));
    const audio = readFileSync(out).toString('base64');
    const left = timeoutMs - (Date.now() - t0);
    if (left < 500) return null;
    const res = await fetch(`${API}/${STT_MODEL()}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/mp3', data: audio } }, { text: STT_PROMPT }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseJsonSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        },
      }),
      signal: AbortSignal.timeout(left),
    });
    if (res.status === 429) coolUntil = Date.now() + 60_000;
    if (!res.ok) throw new Error(`Gemini STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const text = String(JSON.parse(raw).text ?? '').replace(/\s+/g, ' ').trim();
    console.log(`[voice] chép lời ${text.length} chữ trong ${Date.now() - t0} ms`);
    return text || null;
  } catch (e) {
    console.error('[voice] chép lời lỗi:', (e as Error).message);
    return null;
  } finally {
    rmSync(out, { force: true });
  }
}
