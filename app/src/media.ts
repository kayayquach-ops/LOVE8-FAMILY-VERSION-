// Ghi âm, quay video và chụp ảnh bằng chính camera của trình duyệt.

function pick(types: string[]) {
  return types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
}
export const VIDEO_TYPE = () => pick(['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']);
export const AUDIO_TYPE = () => pick(['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']);

export type Recording = { blob: Blob; seconds: number; url: string };

/** Bắt đầu ghi; gọi hàm trả về để dừng và lấy file. */
export function record(stream: MediaStream, mime: string): () => Promise<Recording> {
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  const started = Date.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(250);
  return () => new Promise((resolve) => {
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mime });
      resolve({ blob, seconds: Math.round((Date.now() - started) / 100) / 10, url: URL.createObjectURL(blob) });
    };
    rec.stop();
  });
}

/** Chụp một khung vuông từ video đang chạy, lật lại nếu là camera trước. */
export function snap(video: HTMLVideoElement, mirror: boolean): Promise<Blob> {
  const s = Math.min(video.videoWidth, video.videoHeight);
  const out = Math.min(s, 1440);
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const g = c.getContext('2d')!;
  if (mirror) { g.translate(out, 0); g.scale(-1, 1); }
  g.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, out, out);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.86));
}

export function fileName(blob: Blob, base: string) {
  const t = blob.type;
  const ext = t.includes('mp4') ? (t.startsWith('audio') ? 'm4a' : 'mp4') : t.includes('webm') ? 'webm' : t.includes('jpeg') ? 'jpg' : 'bin';
  return `${base}.${ext}`;
}
