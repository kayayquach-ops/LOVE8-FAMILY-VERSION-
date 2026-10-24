// Ghi âm, quay video và chụp ảnh bằng chính camera của trình duyệt.
import { useEffect, useRef, useState } from 'react';
import { buzz, sfx } from './sound';
import { toast } from './ui';

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
    const done = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mime });
      resolve({ blob, seconds: Math.round((Date.now() - started) / 100) / 10, url: URL.createObjectURL(blob) });
    };
    rec.onstop = done;
    // Gọi dừng hai lần (thả tay rồi trượt ra ngoài nút) thì không ném lỗi.
    if (rec.state !== 'inactive') rec.stop(); else done();
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

/** Ảnh chọn từ máy (ảnh iPhone 3 đến 5 MB) thu về cạnh dài 2048 px trước khi gửi: tải nhanh hơn nhiều, nhìn vẫn nét. Lỗi thì gửi bản gốc. */
export async function shrinkImage(file: Blob, max = 2048): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.86));
    return out && out.size < file.size ? out : file;
  } catch { return file; }
}

/**
 * Giữ để nói. Bấm xuống mới mở micro; thả tay trước khi micro kịp mở (lần đầu máy hỏi quyền) thì không ghi gì.
 * Micro luôn được tắt khi thả tay hoặc rời màn, để chấm cam trên iPhone không sáng mãi.
 * borrow: dùng tạm micro của luồng đang có (camera), không tắt luồng đó.
 */
export function useHoldMic(onDone: (r: Recording) => void, borrow?: () => MediaStream | null) {
  const [rec, setRec] = useState(false);
  const held = useRef(false);
  const stop = useRef<(() => Promise<Recording>) | null>(null);
  const own = useRef<MediaStream | null>(null);
  const release = () => { own.current?.getTracks().forEach((t) => t.stop()); own.current = null; };
  useEffect(() => () => { held.current = false; const s = stop.current; stop.current = null; void s?.().catch(() => {}); release(); }, []);

  async function down() {
    if (held.current || stop.current) return;
    held.current = true;
    const lent = borrow?.();
    let s: MediaStream | null = lent?.getAudioTracks().length ? new MediaStream(lent.getAudioTracks()) : null;
    if (!s) {
      s = (await navigator.mediaDevices?.getUserMedia({ audio: true }).catch(() => null)) ?? null;
      if (!s) { held.current = false; toast('Cho phép micro để nói nhé'); return; }
      if (!held.current) { s.getTracks().forEach((t) => t.stop()); return; }
      own.current = s;
    }
    stop.current = record(s, AUDIO_TYPE());
    setRec(true); sfx('rec'); buzz(20);
  }
  async function up() {
    held.current = false;
    const go = stop.current;
    if (!go) return;
    stop.current = null;
    setRec(false);
    const r = await go().catch(() => null);
    release();
    if (!r) return;
    if (r.seconds < 1) { URL.revokeObjectURL(r.url); toast('Giữ lâu hơn một chút để nói'); return; }
    onDone(r);
  }
  return { rec, down, up };
}
