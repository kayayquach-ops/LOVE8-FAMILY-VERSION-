// Bộ âm thanh tự tạo (branding/sfx/make_sfx.py): kalimba gỗ, hộp nhạc, ngòi bút, gió nhẹ, cùng một gam. Phát bằng Web Audio để không trễ và chồng được lên nhau
// (tiếng gõ phím nhanh). iPhone chỉ cho phát sau lần chạm đầu tiên, nên âm thanh mở khoá ở đó.
type Name = 'key' | 'tap' | 'pop0' | 'pop1' | 'pop2' | 'pop3' | 'button' | 'shutter' | 'send' | 'arrive' | 'sparkle' | 'hug' | 'rec';
const VOLUME: Record<Name, number> = { key: 0.35, tap: 0.45, pop0: 0.45, pop1: 0.45, pop2: 0.45, pop3: 0.45, button: 0.45, shutter: 0.6, send: 0.55, arrive: 0.5, sparkle: 0.45, hug: 0.6, rec: 0.4 };

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

/** Nốt cho đáp án thứ i hiện ra: đi lên dần như một giai điệu nhỏ. */
export const popNote = (i: number) => sfx(`pop${Math.min(i, 3)}` as Name);
