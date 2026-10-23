// Âm thanh từ Mixkit (giấy phép miễn phí dùng trong app): chuông, lật trang, nhịp tim, lấp lánh. Phát bằng Web Audio để không trễ và chồng được lên nhau
// (tiếng gõ phím nhanh). iPhone chỉ cho phát sau lần chạm đầu tiên, nên âm thanh mở khoá ở đó.
type Name = 'hello' | 'reveal' | 'pop' | 'tap' | 'button' | 'shutter' | 'send' | 'arrive' | 'sparkle' | 'hug' | 'rec';
const VOLUME: Record<Name, number> = { hello: 0.5, reveal: 0.22, pop: 0.3, tap: 0.3, button: 0.3, shutter: 0.55, send: 0.5, arrive: 0.5, sparkle: 0.45, hug: 0.7, rec: 0.4 };

let ctx: AudioContext | null = null;
const buffers: Partial<Record<Name, AudioBuffer>> = {};

function unlock() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    for (const n of Object.keys(VOLUME) as Name[]) {
      if (buffers[n]) continue;
      fetch(`/sfx/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx!.decodeAudioData(b)).then((buf) => { buffers[n] = buf; }).catch(() => {});
    }
  } catch {}
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

export function sfx(name: Name) {
  const buf = buffers[name];
  if (!ctx || !buf) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = VOLUME[name];
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

export const tap = () => { sfx('tap'); navigator.vibrate?.(10); };
export const buzz = (ms = 10) => navigator.vibrate?.(ms);

// Nhạc nền piano nhẹ cho phần hỏi đầu: vào nhỏ dần, lặp lại, khi xong thì tắt dần.
let music: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let musicBuf: Promise<AudioBuffer | null> | null = null;

export async function startMusic() {
  unlock();
  if (!ctx || music) return;
  musicBuf ??= fetch('/sfx/bgm.mp3').then((r) => r.arrayBuffer()).then((b) => ctx!.decodeAudioData(b)).catch(() => null);
  const buf = await musicBuf;
  if (!buf || music) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  src.loop = true;
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 4);
  src.connect(gain).connect(ctx.destination);
  src.start();
  music = { src, gain };
}

export function stopMusic(seconds = 3) {
  if (!ctx || !music) return;
  const m = music;
  music = null;
  m.gain.gain.cancelScheduledValues(ctx.currentTime);
  m.gain.gain.setValueAtTime(m.gain.gain.value, ctx.currentTime);
  m.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
  m.src.stop(ctx.currentTime + seconds + 0.1);
}
