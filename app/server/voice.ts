// Giọng nói của Mây (Sweet Home) bằng Gemini: đọc câu thành tiếng (TTS) và chép lời câu trả lời (STT).
// Âm thanh đọc ra lưu theo hash(chữ + giọng + model) trong MEDIA_DIR/tts, câu lặp lại không phải gọi lần nữa.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { useGemini } from './ai.ts';
import { run } from './recap.ts';
import { TtsGate, TtsLimited, vnDay, type Reason, type Store } from './ttsgate.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
const TTS_DIR = path.join(MEDIA_DIR, 'tts');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const TTS_MAX = 300;
const TTS_MODEL = () => process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
// Một giọng duy nhất cho cả cuộc gọi: đổi giọng bằng GEMINI_VOICE, cache khoá theo tên giọng.
export const VOICE = () => process.env.GEMINI_VOICE || 'Zephyr';
// Chỉ tăng số này khi thật sự đổi cách xử lý âm thanh: tăng là bỏ cả kho cũ và phải đọc lại (tốn hạn mức).
const CACHE_VER = 'v2';
const STT_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
// Model 2.5 hiểu lời dặn giọng đặt trước câu; các model TTS mới hơn lại đọc to cả lời dặn, nên chỉ gửi câu.
// Đổi lời dặn bằng GEMINI_TTS_STYLE, không cần sửa code.
// TODO(i18n đợt 3): giọng đọc và lời dặn cách đọc theo ngôn ngữ của người nghe. Đợt này giữ nguyên tiếng Việt.
// i18n-ok-begin
const STYLE_DEFAULT = 'Nói tiếng Việt tự nhiên, rõ ràng, tươi và thân thiện, như người thân đang nói chuyện bình thường qua điện thoại. '
  + 'Âm lượng và cao độ bình thường, tốc độ vừa phải hơi nhanh một chút, nhịp tự nhiên có nhấn nhá. '
  + 'Không thì thầm, không kéo dài chữ, không giọng kể chuyện ru ngủ. Câu cần nói: ';
// i18n-ok-end
const STYLE_EN = 'Speak natural, clear, friendly English, like a relative chatting normally on the phone. '
  + 'Normal volume and pitch, a steady pace that is a little quick, natural emphasis. '
  + 'No whispering, no drawn-out words, no bedtime-story voice. The sentence to say: ';
// Câu có dấu tiếng Việt thì dùng lời dặn tiếng Việt; còn lại (tiếng Anh) dùng lời dặn tiếng Anh. Khoá kho âm thanh theo cả lời dặn lẫn chữ nên không lẫn.
// TODO(i18n đợt 3): thêm lời dặn tiếng Hàn khi có bản dịch ko.
// i18n-ok-begin
const VI_CHARS = /[À-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;
const STYLE = (text = '') => process.env.GEMINI_TTS_STYLE || (/[a-zA-Z]/.test(text) && !VI_CHARS.test(text) ? STYLE_EN : STYLE_DEFAULT);
// i18n-ok-end

export type Provider = 'openai' | 'gemini';
const MODE = () => (process.env.TTS_PROVIDER || 'auto').toLowerCase();
export const openaiKey = () => !!process.env.OPENAI_API_KEY;
/** Nhà cung cấp nào được bật theo khoá và TTS_PROVIDER (auto | openai | gemini). */
export const providerOn = (p: Provider) => (p === 'openai' ? openaiKey() && MODE() !== 'gemini' : useGemini() && MODE() !== 'openai');
export const hasVoice = () => providerOn('openai') || providerOn('gemini');
const styled = () => TTS_MODEL().includes('2.5');

// ---------- Giới hạn: mỗi người tối đa 80 câu mới mỗi giờ; cả máy chủ do TtsGate giữ (8 yêu cầu mỗi 60 giây, ngân sách ngày, cờ 429) ----------

const used = new Map<string, number[]>();
export function allow(who: string, max = 80, windowMs = 3600e3) {
  const now = Date.now();
  const list = (used.get(who) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { used.set(who, list); return false; }
  list.push(now);
  used.set(who, list);
  return true;
}

export const gate = new TtsGate();
// OpenAI: nhiều yêu cầu cùng lúc, ~60 mỗi phút, ngân sách ngày theo giờ Việt Nam. Chép lời dự phòng có ngân sách riêng.
export const oaGate = new TtsGate({ rpm: 60, concurrency: 4, daily: () => Number(process.env.OPENAI_TTS_DAILY) || 400, dayOf: vnDay });
const sttGate = new TtsGate({ rpm: 60, concurrency: 4, daily: () => 200, dayOf: vnDay });
export const gateOf = (p: Provider) => (p === 'openai' ? oaGate : gate);
/** Giọng sẽ dùng cho cuộc gọi mới: OpenAI nếu bật và đang chạy được, rồi Gemini, không thì giọng máy. */
export function pickProvider(): Provider | 'device' {
  for (const p of ['openai', 'gemini'] as const) if (providerOn(p) && !gateOf(p).blocked()) return p;
  return 'device';
}
/** Nhà cung cấp mặc định cho việc tra kho / nạp sẵn phía máy chủ khi máy khách không nói rõ. */
export const defaultProvider = (): Provider => { const p = pickProvider(); return p === 'device' ? (providerOn('openai') ? 'openai' : 'gemini') : p; };
let sttCool = 0;
let doFetch: typeof fetch = (...a) => fetch(...a);
/** Chỉ cho kiểm thử: thay fetch bằng hàm giả. */
export function _setFetch(f: typeof fetch) { doFetch = f; }

/** Nối bộ đếm ngày vào bảng app_settings (key 'tts_budget'), sống qua lần deploy. */
export async function initTtsBudget(storeFor: (key: string) => Store) {
  gate.store = storeFor('tts_budget');
  oaGate.store = storeFor('tts_budget_openai');
  sttGate.store = storeFor('stt_budget_openai');
  await Promise.all([gate.init(), oaGate.init(), sttGate.init()]);
  console.log(`[voice] nhà cung cấp TTS: ${MODE()} (OpenAI ${providerOn('openai') ? 'bật' : 'tắt'}, Gemini ${providerOn('gemini') ? 'bật' : 'tắt'}); ngân sách hôm nay: OpenAI ${oaGate.used}/${oaGate.limit()}, Gemini ${gate.used}/${gate.limit()}`);
}

/** Trạng thái cho máy khách: provider chốt lúc nhấc máy; ok=false (provider 'device') khi không nhà cung cấp nào dùng được. */
export function ttsStatus() {
  const provider = pickProvider();
  if (provider === 'device') {
    const why = (['openai', 'gemini'] as const).filter(providerOn).map((p) => gateOf(p).blocked()).find(Boolean);
    const g = gateOf(defaultProvider());
    return { ok: false, provider, reason: (why ?? 'nokey') as Reason, used: g.used, limit: g.limit(), remaining: 0 };
  }
  const s = gateOf(provider).status();
  return { ok: true, provider, reason: null, used: s.used, limit: s.limit, remaining: s.remaining };
}

let reqs = 0;
function logSummary(force = false) {
  if (!force && ++reqs % 20) return;
  for (const p of ['openai', 'gemini'] as const) {
    if (!providerOn(p)) continue;
    const s = gateOf(p).status();
    console.log(`[voice] TTS ${p} hôm nay: ${s.calls} yêu cầu mới, ${s.cache} trúng kho, ${s.r429} lần 429, ${s.err} lỗi, ngân sách ${s.used}/${s.limit} (còn ${s.remaining})${s.ok ? '' : ', đang chặn: ' + s.reason}`);
  }
}
setInterval(() => logSummary(true), 3600e3).unref();

// ---------- Đọc thành tiếng ----------

const inflight = new Map<string, Promise<string | null>>();
const squash = (t: string) => t.replace(/\s+/g, ' ').trim();

// ---------- OpenAI TTS: giọng, lời dặn theo ngôn ngữ, khoá kho riêng (không đụng khoá Gemini) ----------

export const OA_MODEL = () => process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
export const OA_VOICE = () => process.env.OPENAI_TTS_VOICE || 'coral';
// i18n-ok-begin
const OA_STYLE: Record<'vi' | 'en' | 'ko', string> = {
  vi: 'Đọc bằng tiếng Việt tự nhiên, rõ, ấm và thân thiện như người thân gọi điện nói chuyện bình thường. Âm lượng và cao độ bình thường, tốc độ vừa phải hơi nhanh, có nhấn nhá. Không thì thầm, không kéo dài giọng, không giọng ru ngủ. Đọc tên "Mây" như tiếng Việt.',
  en: 'Speak natural, clear, warm and friendly English, like a relative chatting normally on the phone. Normal volume and pitch, a steady pace that is a little quick, natural emphasis. No whispering, no drawn-out words, no bedtime-story voice. Say the name "Mây" as in Vietnamese.',
  ko: '자연스럽고 또렷하고 따뜻하게, 가족이 전화로 편하게 말하듯 한국어로 읽어 주세요. 보통 크기와 높이, 약간 빠른 속도, 자연스러운 강세. 속삭이지 말고, 말을 늘이지 말고, 자장가 같은 목소리는 안 됩니다. "Mây"는 베트남어처럼 읽어 주세요.',
};
const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
// i18n-ok-end
// Tên "Mây" có dấu nhưng không làm câu tiếng Anh thành tiếng Việt.
// i18n-ok-begin
export const textLang = (t: string): 'vi' | 'en' | 'ko' => { const u = t.replace(/Mây/g, 'May'); return HANGUL.test(u) ? 'ko' : /[a-zA-Z]/.test(u) && !VI_CHARS.test(u) ? 'en' : 'vi'; };
export const OA_INSTR = (t: string) => process.env.OPENAI_TTS_STYLE || OA_STYLE[textLang(t)];
// i18n-ok-end

function keyOf(text: string, p: Provider = 'gemini') {
  if (p === 'openai') return createHash('sha1').update(`oa1|${OA_MODEL()}|${OA_VOICE()}|${OA_INSTR(text)}|${text}`).digest('hex').slice(0, 24);
  return createHash('sha1').update(`${CACHE_VER}|${TTS_MODEL()}|${VOICE()}|${styled() ? STYLE(text) : ''}|${text}`).digest('hex').slice(0, 24);
}

/** Đường dẫn /media/tts/<hash>.mp3 nếu đã có sẵn trong kho. */
export function cachedSpeech(text: string, p: Provider = defaultProvider()): string | null {
  const k = keyOf(squash(text), p);
  for (const ext of ['.mp3', '.wav']) if (existsSync(path.join(TTS_DIR, k + ext))) return `/media/tts/${k}${ext}`;
  return null;
}

export type SpeechOpts = {
  /** 0: câu của cuộc gọi đang diễn ra (mặc định), 1: nạp sẵn. */
  prio?: number;
  /** Câu không bắt buộc (nạp sẵn, câu đáp theo nội dung): chỉ đọc khi còn trên 30% ngân sách ngày. */
  optional?: boolean;
  /** Chỉ lấy từ kho, không bao giờ gọi nhà cung cấp. */
  cacheOnly?: boolean;
  /** Nhà cung cấp đã chốt cho cuộc gọi; không có thì lấy mặc định. Không bao giờ tự đổi sang nhà khác. */
  provider?: Provider;
};

/** Đọc câu thành tiếng, trả về đường dẫn file. who để tính giới hạn; câu có sẵn trong kho thì không tính. null: không đọc được (chưa có khoá, hết hạn mức, bị chặn). */
export function speech(raw: string, who: string, opts: SpeechOpts = {}): Promise<string | null> | null {
  const text = squash(raw);
  const prov = opts.provider ?? defaultProvider();
  const g = gateOf(prov);
  const hit = cachedSpeech(text, prov);
  if (hit) { g.stats.cache++; logSummary(); return Promise.resolve(hit); }
  if (opts.cacheOnly || !providerOn(prov) || g.blocked(!!opts.optional)) return null;
  const k = keyOf(text, prov);
  const going = inflight.get(k);
  if (going) return going;
  if (!allow(`${prov}:${who}`, prov === 'openai' ? 40 : 80)) return null;
  const p = (prov === 'openai' ? synthOpenAI(text, k, opts) : synth(text, k, opts)).catch((e) => {
    if (!(e instanceof TtsLimited)) { g.stats.err++; console.error(`[voice] đọc lỗi (${prov}):`, (e as Error).message); }
    return null;
  }).finally(() => { inflight.delete(k); logSummary(); });
  inflight.set(k, p);
  return p;
}

async function synth(text: string, k: string, opts: SpeechOpts): Promise<string | null> {
  const t0 = Date.now();
  // Câu rất ngắn (ừm, dạ) đôi khi model trả chữ thay vì tiếng: thử thêm một lần (mỗi lần tính một lượt ngân sách).
  const ask = () => gate.schedule(opts.prio ?? 0, () => askAudio(text), !!opts.optional);
  let part = await ask();
  if (!part) part = await ask();
  if (!part) throw new Error('Gemini TTS không trả âm thanh');
  return save(part, text, k, t0);
}

/** Mã lỗi từ phản hồi của OpenAI: chỉ lấy code/type, không in nội dung (có thể chứa một phần khoá). */
function oaCode(body: string) {
  try { const e = JSON.parse(body).error; return String(e?.code ?? e?.type ?? 'unknown'); } catch { return 'unknown'; }
}

/** Đổi lỗi OpenAI thành cờ chặn: 401/403 và hết số dư chặn 30 phút, 429 do tốc độ theo retry-after. Trả true nếu đã đặt cờ. */
function oaBlock(g: TtsGate, status: number, code: string, body: string, retryAfter: string | null, what: string) {
  if (status === 401 || status === 403) {
    console.error(`[voice] OpenAI ${what} ${status} (${code}): khoá sai hoặc không có quyền, chặn 30 phút`);
    g.block(30 * 60_000);
  } else if (status === 429) {
    g.stats.r429++;
    if (/insufficient_quota|billing/i.test(code + body.slice(0, 400))) {
      console.error(`[voice] OpenAI ${what} 429 (${code}): hết số dư hoặc hạn mức thanh toán, chặn 30 phút`);
      g.block(30 * 60_000, 'budget');
    } else {
      const ra = Number(retryAfter);
      g.block(Math.min(120_000, Math.max(5_000, (Number.isFinite(ra) && ra > 0 ? ra : 20) * 1000)));
    }
  } else return false;
  return true;
}

async function askOpenAI(text: string): Promise<Buffer> {
  const model = OA_MODEL();
  const res = await doFetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model, voice: OA_VOICE(), input: text, response_format: 'mp3',
      ...(model.includes('gpt-4o') ? { instructions: OA_INSTR(text) } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const code = oaCode(body);
    if (oaBlock(oaGate, res.status, code, body, res.headers.get('retry-after'), 'TTS')) throw new TtsLimited(oaGate.why ?? 'cooldown');
    throw new Error(`OpenAI TTS ${res.status} (${code})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 400) throw new Error('OpenAI TTS trả file quá nhỏ');
  return buf;
}

// OpenAI trả thẳng mp3 và âm lượng khá đều giữa các câu nên không chạy loudnorm (đỡ chậm).
async function synthOpenAI(text: string, k: string, opts: SpeechOpts): Promise<string | null> {
  const t0 = Date.now();
  const buf = await oaGate.schedule(opts.prio ?? 0, () => askOpenAI(text), !!opts.optional);
  mkdirSync(TTS_DIR, { recursive: true });
  const tmp = path.join(TTS_DIR, `${k}.${process.pid}.${Date.now()}.part`);
  writeFileSync(tmp, buf);
  renameSync(tmp, path.join(TTS_DIR, k + '.mp3'));
  console.log(`[voice] đọc (openai) ${text.length} chữ trong ${Date.now() - t0} ms`);
  return `/media/tts/${k}.mp3`;
}

/** Chạy ffmpeg và lấy nhật ký stderr (đo âm lượng nằm ở đó). */
function ffmpegErr(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { timeout: 30_000, maxBuffer: 4_000_000, windowsHide: true }, (err, _out, stderr) => (err ? reject(err) : resolve(String(stderr))));
  });
}

async function askAudio(text: string) {
  const model = TTS_MODEL();
  const res = await doFetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: styled() ? STYLE(text) + text : text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE() } } } },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status === 429) {
    gate.note429(await res.text());
    throw new TtsLimited(gate.status().reason ?? 'cooldown');
  }
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

// TODO(i18n đợt 3): chép lời theo ngôn ngữ người nói (members.lang). Đợt này giữ nguyên.
// i18n-ok-begin
const STT_PROMPT = `Chép lại nguyên văn lời nói tiếng Việt trong đoạn ghi âm này.
Giữ đúng từng chữ người nói, có dấu, không thêm, không bớt, không sửa câu, không tóm tắt, không giải thích.
Bỏ qua tiếng ồn. Nếu không nghe thấy lời nói nào thì trả về chuỗi rỗng.`;
// i18n-ok-end

/** Chép lời một file ghi âm trong MEDIA_DIR. Gemini trước; Gemini lỗi hoặc hết hạn mức thì OpenAI (nếu có khoá). Quá hạn hoặc lỗi thì trả null, không làm chậm cuộc gọi. */
export async function transcribe(file: string, who: string, timeoutMs = 8000, lang: 'vi' | 'en' | 'ko' = 'vi'): Promise<string | null> {
  const gem = useGemini() && Date.now() >= sttCool;
  const oa = openaiKey() && !sttGate.blocked();
  if ((!gem && !oa) || !allow(`stt:${who}`, 60)) return null;
  const t0 = Date.now();
  const out = `${file}.stt.mp3`;
  try {
    // Đổi về mp3 mono 16 kHz: nhỏ, gửi nhanh, Gemini đọc được (m4a, webm từ điện thoại thì chưa chắc).
    await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', out],
      path.dirname(file), Math.max(1000, timeoutMs - 1000));
    const audio = readFileSync(out);
    const left = () => timeoutMs - (Date.now() - t0);
    if (gem) {
      try {
        if (left() < 500) return null;
        const text = await geminiStt(audio, left());
        console.log(`[voice] chép lời ${text.length} chữ trong ${Date.now() - t0} ms`);
        return text || null;
      } catch (e) {
        console.error('[voice] chép lời lỗi:', (e as Error).message);
        if (!oa) return null;
      }
    }
    if (!oa || left() < 1500) return null;
    const text = await sttGate.schedule(0, () => openaiStt(audio, left(), lang));
    console.log(`[voice] chép lời (openai) ${text.length} chữ trong ${Date.now() - t0} ms`);
    return text || null;
  } catch (e) {
    if (!(e instanceof TtsLimited)) console.error('[voice] chép lời OpenAI lỗi:', (e as Error).message);
    return null;
  } finally {
    rmSync(out, { force: true });
  }
}

async function geminiStt(audio: Buffer, ms: number) {
  const res = await doFetch(`${API}/${STT_MODEL()}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/mp3', data: audio.toString('base64') } }, { text: STT_PROMPT }] }],
      generationConfig: {
        maxOutputTokens: 2000,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      },
    }),
    signal: AbortSignal.timeout(ms),
  });
  if (res.status === 429) sttCool = Date.now() + 60_000;
  if (!res.ok) throw new Error(`Gemini STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return String(JSON.parse(raw).text ?? '').replace(/\s+/g, ' ').trim();
}

async function openaiStt(audio: Buffer, ms: number, lang: string) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), 'answer.mp3');
  form.append('model', process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe');
  form.append('language', lang);
  form.append('response_format', 'text');
  const res = await doFetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const code = oaCode(body);
    if (oaBlock(sttGate, res.status, code, body, res.headers.get('retry-after'), 'STT')) throw new TtsLimited(sttGate.why ?? 'cooldown');
    throw new Error(`OpenAI STT ${res.status} (${code})`);
  }
  return (await res.text()).replace(/\s+/g, ' ').trim();
}
