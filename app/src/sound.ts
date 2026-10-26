// Âm thanh từ Mixkit (giấy phép miễn phí dùng trong app): chuông, lật trang, nhịp tim, lấp lánh. Phát bằng Web Audio để không trễ và chồng được lên nhau
// (tiếng gõ phím nhanh). iPhone chỉ cho phát sau lần chạm đầu tiên, nên âm thanh mở khoá ở đó.
type Name = 'hello' | 'reveal' | 'pop' | 'tap' | 'button' | 'shutter' | 'send' | 'arrive' | 'sparkle' | 'hug' | 'rec';
const VOLUME: Record<Name, number> = { hello: 0.3, reveal: 0.12, pop: 0.16, tap: 0.14, button: 0.16, shutter: 0.35, send: 0.12, arrive: 0.28, sparkle: 0.2, hug: 0.5, rec: 0.25 };

/** true: nút bấm chung im lặng (chỉ rung nhẹ), như Messenger/Locket/IG. Đặt false để bật lại tiếng tap, button, pop, shutter, rec. Onboarding gọi sfx(tên, true) nên không bị ảnh hưởng. */
export const QUIET_UI = true;
const UI_SOUNDS: Name[] = ['tap', 'button', 'pop', 'shutter', 'rec'];

let ctx: AudioContext | null = null;
const buffers: Partial<Record<Name, AudioBuffer>> = {};

const loading = new Set<Name>();

function unlock() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    for (const n of Object.keys(VOLUME) as Name[]) {
      // Đang tải dở thì thôi, không tải lại mỗi lần chạm (trước đây mỗi cú chạm đầu tải lại cả 11 file).
      if (buffers[n] || loading.has(n)) continue;
      loading.add(n);
      fetch(`/sfx/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx!.decodeAudioData(b)).then((buf) => { buffers[n] = buf; })
        .catch(() => {}).finally(() => loading.delete(n));
    }
  } catch {}
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

/** Người dùng bật trong Cài đặt thì tiếng chạm nút phát lại; mặc định im như QUIET_UI. */
export const uiSoundsOn = () => { try { return localStorage.getItem('hl-ui-sound') === '1'; } catch { return false; } };
export const setUiSounds = (on: boolean) => { try { localStorage.setItem('hl-ui-sound', on ? '1' : '0'); } catch {} };

export function sfx(name: Name, always = false) {
  if (QUIET_UI && !always && UI_SOUNDS.includes(name) && !uiSoundsOn()) return;
  const buf = buffers[name];
  // App đang ẩn thì im: tránh chuông dồn lại kêu một loạt khi mở lại.
  if (!ctx || !buf || document.hidden) return;
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
/** Tiếng chạm riêng cho onboarding (đã chỉnh êm), không bị QUIET_UI chặn. */
export const tapSoft = () => { sfx('tap', true); navigator.vibrate?.(10); };
export const buzz = (ms = 10) => navigator.vibrate?.(ms);

// Chuông điện thoại thật, tổng hợp bằng Web Audio (không dùng file âm thanh).
// 'in': chuông gọi đến kiểu chuông bàn cổ, hai hồi "kính coong" rồi nghỉ. 'out': tiếng chờ "tút ... tút" của người đang gọi.
let ringing: { stop: () => void } | null = null;

function bell(c: AudioContext, t0: number, dur: number, vol: number) {
  // Hai tần số lệch nhau, đóng mở 20 lần mỗi giây tạo tiếng chuông rung của điện thoại bàn.
  const out = c.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  out.gain.setValueAtTime(vol, t0 + dur - 0.04);
  out.gain.linearRampToValueAtTime(0, t0 + dur);
  const am = c.createGain();
  am.gain.value = 0.5;
  const lfo = c.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 20;
  const depth = c.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(am.gain);
  for (const f of [1180, 1480]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(am);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  am.connect(out).connect(c.destination);
  lfo.start(t0);
  lfo.stop(t0 + dur + 0.05);
}

function beep(c: AudioContext, t0: number, dur: number, vol: number) {
  const out = c.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(vol, t0 + 0.05);
  out.gain.setValueAtTime(vol, t0 + dur - 0.08);
  out.gain.linearRampToValueAtTime(0, t0 + dur);
  for (const f of [425, 450]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  out.connect(c.destination);
}

/** Đổ chuông cho tới khi gọi stopRing(). Gọi nhiều lần thì chỉ một chuông. iPhone cần app đã được chạm một lần mới phát được tiếng. */
export function startRing(kind: 'in' | 'out') {
  unlock();
  if (ringing || !ctx) return;
  const c = ctx;
  let alive = true;
  let timer = 0;
  const cycle = () => {
    if (!alive || document.hidden) { if (alive) timer = window.setTimeout(cycle, 1000); return; }
    const t = c.currentTime + 0.05;
    if (kind === 'in') {
      bell(c, t, 0.42, 0.22);
      bell(c, t + 0.62, 0.42, 0.22);
      navigator.vibrate?.([420, 200, 420]);
      timer = window.setTimeout(cycle, 3000);
    } else {
      beep(c, t, 1.1, 0.12);
      timer = window.setTimeout(cycle, 4000);
    }
  };
  cycle();
  ringing = { stop: () => { alive = false; clearTimeout(timer); navigator.vibrate?.(0); } };
}

export function stopRing() {
  ringing?.stop();
  ringing = null;
}

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
