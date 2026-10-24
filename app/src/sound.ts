// Âm thanh từ Mixkit (giấy phép miễn phí dùng trong app): chuông, lật trang, nhịp tim, lấp lánh. Phát bằng Web Audio để không trễ và chồng được lên nhau
// (tiếng gõ phím nhanh). iPhone chỉ cho phát sau lần chạm đầu tiên, nên âm thanh mở khoá ở đó.
type Name = 'hello' | 'reveal' | 'pop' | 'tap' | 'button' | 'shutter' | 'send' | 'arrive' | 'sparkle' | 'hug' | 'rec';
const VOLUME: Record<Name, number> = { hello: 0.3, reveal: 0.12, pop: 0.16, tap: 0.14, button: 0.16, shutter: 0.35, send: 0.3, arrive: 0.28, sparkle: 0.2, hug: 0.5, rec: 0.25 };

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
  // Cắt bớt âm chói, nâng nhẹ âm trầm, vào êm rồi mới lên để nghe đằm, ấm như nhạc nền.
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 2400;
  soft.Q.value = 0.4;
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowshelf';
  warm.frequency.value = 300;
  warm.gain.value = 3;
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(VOLUME[name], t + 0.03);
  src.buffer = buf;
  src.connect(soft).connect(warm).connect(gain).connect(ctx.destination);
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

/** Hạ nhạc nền xuống gần như im khi đang thu giọng (nhạc ra loa sẽ lọt vào mic), rồi trả lại. */
export function duckMusic(on: boolean) {
  if (!ctx || !music) return;
  const g = music.gain.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(on ? 0.0001 : 0.32, ctx.currentTime + (on ? 0.1 : 1.5));
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
