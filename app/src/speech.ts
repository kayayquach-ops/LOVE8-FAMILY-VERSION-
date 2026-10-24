// Giọng tiếng Việt của máy (speechSynthesis). iPhone chỉ cho nói sau một lần chạm, nên mở khoá ở nút bấm.

let voice: SpeechSynthesisVoice | null | undefined;
function viVoice() {
  if (voice !== undefined && voice) return voice;
  const all = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  voice = all.find((v) => v.lang.toLowerCase().replace('_', '-') === 'vi-vn') ?? all.find((v) => v.lang.toLowerCase().startsWith('vi')) ?? null;
  return voice;
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => { voice = undefined; viVoice(); });

export const canSpeak = () => typeof speechSynthesis !== 'undefined';

export function unlockSpeech() {
  if (!canSpeak()) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {}
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}

/** Đọc chậm, đằm. Luôn trả về: có máy không báo xong nên có hẹn giờ dự phòng. */
export function speak(text: string, on: { start?: () => void; boundary?: () => void } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak() || !text.trim()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
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
