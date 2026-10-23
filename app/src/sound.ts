// Tiếng "tóc" gỗ trầm khi chọn, tiếng phím nhẹ khi chữ hiện dần. Rung nhẹ nếu máy cho phép.
const cache: Record<string, HTMLAudioElement> = {};

function play(name: 'tap' | 'key', volume: number) {
  try {
    const a = (cache[name] ??= new Audio(`/sfx/${name}.wav`));
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {}
}

export const tap = () => { play('tap', 0.5); navigator.vibrate?.(12); };
export const key = () => play('key', 0.3);
export const buzz = (ms = 10) => navigator.vibrate?.(ms);
