// Âm thanh lấy từ bộ sound effect của nhóm, phát bằng Web Audio để không trễ và chồng được lên nhau
// (tiếng gõ phím nhanh). iPhone chỉ cho phát sau lần chạm đầu tiên, nên âm thanh mở khoá ở đó.
type Name = 'key' | 'tap' | 'pop' | 'button' | 'shutter' | 'send' | 'arrive' | 'sparkle' | 'hug' | 'rec';
const VOLUME: Record<Name, number> = { key: 0.25, tap: 0.5, pop: 0.45, button: 0.5, shutter: 0.6, send: 0.55, arrive: 0.45, sparkle: 0.4, hug: 0.5, rec: 0.5 };

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
export const key = () => sfx('key');
export const buzz = (ms = 10) => navigator.vibrate?.(ms);
