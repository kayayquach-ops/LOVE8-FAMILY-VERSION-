// Giọng tiếng Việt của máy (speechSynthesis). iPhone chỉ cho nói sau một lần chạm, nên mở khoá ở nút bấm.
// Một cuộc gọi chỉ dùng MỘT giọng: Gemini nếu kiểm ngay lúc đổ chuông được (voiceAvailable), không thì giọng máy từ đầu đến cuối.
import { token } from './api';
import { speechLang } from './i18n';

// Giọng máy theo ngôn ngữ đang hiện (vi-VN, en-US, ko-KR); tìm đúng vùng trước, không có thì giọng cùng ngôn ngữ.
const voices = new Map<string, SpeechSynthesisVoice | null>();
function viVoice() {
  const loc = speechLang();
  const hit = voices.get(loc);
  if (hit) return hit;
  const all = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  const v = all.find((x) => norm(x) === loc.toLowerCase()) ?? all.find((x) => norm(x).startsWith(loc.slice(0, 2).toLowerCase())) ?? null;
  voices.set(loc, v);
  return v;
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => { voices.clear(); });

export const canSpeak = () => typeof speechSynthesis !== 'undefined';

export function unlockSpeech() {
  if (!canSpeak()) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {}
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
  stopVoice();
}

// ---------- Giọng Gemini: máy chủ đọc sẵn thành mp3, phát qua AudioContext đã mở trong cú chạm ----------

let ctx: AudioContext | null = null;
let out: AnalyserNode | null = null;
let playing: { src: AudioBufferSourceNode; done: () => void } | null = null;
let off = false; // máy chủ báo chưa có giọng: thôi hỏi nữa trong lần này
const clips = new Map<string, Promise<ArrayBuffer | null>>();
const decoded = new Map<string, AudioBuffer>();

/** Gọi ngay trong cú chạm "Nghe máy": nối loa qua bộ đo âm lượng và phát một mẩu im lặng để iPhone mở khoá. */
export function setVoiceContext(ac: AudioContext | null) {
  ctx = ac;
  out = null;
  if (!ac) return;
  try {
    out = ac.createAnalyser();
    out.fftSize = 512;
    out.connect(ac.destination);
    const s = ac.createBufferSource();
    s.buffer = ac.createBuffer(1, 1, 22050);
    s.connect(ac.destination);
    s.start(0);
  } catch { out = null; }
}

async function fetchClip(text: string): Promise<ArrayBuffer | null> {
  if (off) return null;
  try {
    const t = token.get();
    const r = await fetch('/api/call/tts', { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ text }) });
    if (!r.ok) return null;
    const { url, off: none } = await r.json() as { url: string | null; off?: boolean };
    if (none) off = true;
    if (!url) return null;
    const a = await fetch(url);
    return a.ok ? await a.arrayBuffer() : null;
  } catch { return null; }
}

/** Xin trước âm thanh của một câu để lúc cần là phát ngay. */
export function prefetchVoice(text: string) {
  const k = text.trim();
  if (!k || off) return;
  if (!clips.has(k)) {
    const p = fetchClip(k);
    clips.set(k, p);
    void p.then((b) => { if (!b) clips.delete(k); });
  }
}

/** Kiểm giọng Gemini còn dùng được không bằng một câu đã nạp sẵn: có âm thanh trong ms thì true. Lỗi thì thử thêm một lần. */
export async function voiceAvailable(text: string, ms = 12_000): Promise<boolean> {
  const k = text.trim();
  const t0 = Date.now();
  for (let tries = 0; tries < 2; tries++) {
    if (off) return false;
    prefetchVoice(k);
    const p = clips.get(k);
    if (!p) return false;
    let t = 0;
    const data = await Promise.race([p, new Promise<null>((r) => { t = window.setTimeout(() => r(null), Math.max(500, ms - (Date.now() - t0))); })]);
    clearTimeout(t);
    if (data) return true;
    if (Date.now() - t0 >= ms - 1500) return false;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return false;
}

/** Câu này đã có âm thanh sẵn trong máy chưa (để chọn câu đáp mẫu khi câu đáp mới đến muộn). */
export function voiceReady(text: string) { return decoded.has(text.trim()); }

async function bufferOf(text: string, ms: number): Promise<AudioBuffer | null> {
  const k = text.trim();
  const hit = decoded.get(k);
  if (hit) return hit;
  if (!ctx) return null;
  prefetchVoice(k);
  const p = clips.get(k);
  if (!p) return null;
  let t = 0;
  const data = await Promise.race([p, new Promise<null>((r) => { t = window.setTimeout(() => r(null), ms); })]);
  clearTimeout(t);
  if (!data || !ctx) return null;
  try {
    const b = await ctx.decodeAudioData(data.slice(0));
    decoded.set(k, b);
    return b;
  } catch { return null; }
}

/** Giải mã sẵn khi đã tải xong, để voiceReady biết câu nào phát được ngay. */
export function warmVoice(text: string) { void bufferOf(text, 30_000); }

function stopVoice() {
  const p = playing;
  playing = null;
  if (p) { try { p.src.stop(); } catch {} p.done(); }
}

/** Phát câu bằng giọng Gemini. Quá ms chưa có âm thanh thì trả false (nơi gọi chờ thêm, không đổi sang giọng máy giữa chừng). level nhận âm lượng thật 0..1. */
export async function playVoice(text: string, level: (v: number) => void, ms = 4000, onStart?: () => void): Promise<boolean> {
  if (!ctx || !out || off) return false;
  const b = await bufferOf(text, ms);
  if (!b || !ctx || !out) return false;
  stopVoice();
  if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
  const ac = ctx, an = out;
  return new Promise<boolean>((resolve) => {
    const src = ac.createBufferSource();
    src.buffer = b;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let raf = 0, finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      clearTimeout(guard);
      level(0);
      if (playing?.src === src) playing = null;
      resolve(true);
    };
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
      level(Math.min(1, Math.max(0, (Math.sqrt(sum / buf.length) - 0.01) * 3.2)));
      raf = requestAnimationFrame(tick);
    };
    // Máy tạm dừng âm thanh (iPhone khoá màn hình) thì vẫn đi tiếp, không treo cuộc gọi.
    const guard = window.setTimeout(done, b.duration * 1000 + 1500);
    src.onended = done;
    playing = { src, done };
    src.start();
    onStart?.();
    raf = requestAnimationFrame(tick);
  });
}

/** Đọc chậm, đằm. Luôn trả về: có máy không báo xong nên có hẹn giờ dự phòng. */
export function speak(text: string, on: { start?: () => void; boundary?: () => void } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak() || !text.trim()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang();
    const v = viVoice();
    if (v) u.voice = v;
    u.rate = 0.88;
    u.pitch = 1;
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(t); resolve(); } };
    const t = setTimeout(finish, 2500 + text.split(/\s+/).length * 600);
    u.onstart = () => on.start?.();
    // Mỗi từ máy đọc tới (Safari, Chrome có báo) để miệng linh vật mở theo.
    u.onboundary = () => on.boundary?.();
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
  });
}
