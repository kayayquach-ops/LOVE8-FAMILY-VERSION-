// Ảnh thu nhỏ cho lưới ảnh, tin nhà, chat: ảnh gốc 2048 px (hoặc video) mà ô hiển thị chỉ vài trăm px thì iPhone tải và giải mã thừa, lướt bị khựng.
// /media/w/<cỡ>/<tệp>: cạnh ngắn về đúng cỡ (không phóng to), video lấy khung đầu làm ảnh. Dựng bằng ffmpeg một lần rồi giữ trên đĩa.
// ffmpeg lỗi hoặc không có thì chuyển về tệp gốc, giao diện vẫn chạy như cũ.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import type express from 'express';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const THUMB_SIZES = [160, 360, 1080] as const;
const NAME = /^[\w-]+\.(jpe?g|png|webp|mp4|webm|mov)$/i;
const VIDEO = /\.(mp4|webm|mov)$/i;

const running = new Map<string, Promise<void>>();
// Tệp ffmpeg không dựng được (hỏng, máy không có ffmpeg): nhớ lại để lần sau chuyển thẳng về tệp gốc, không chạy ffmpeg mỗi lần xem.
const failed = new Set<string>();
let active = 0;
const queue: Array<() => void> = [];
// Tối đa 2 ffmpeg cùng lúc để máy chủ không nặng khi cả nhà mở tin cùng lúc.
const slot = () => new Promise<void>((r) => { if (active < 2) { active++; r(); } else queue.push(() => { active++; r(); }); });
const free = () => { active--; queue.shift()?.(); };

function build(src: string, out: string, size: number) {
  const scale = `scale=w='min(iw,${size})':h='min(ih,${size})':force_original_aspect_ratio=increase`;
  const args = ['-hide_banner', '-loglevel', 'error', '-y',
    ...(VIDEO.test(src) ? ['-ss', '0.1'] : []), '-i', src, '-frames:v', '1', '-vf', scale, '-q:v', size <= 360 ? '6' : '4', out];
  return new Promise<void>((resolve, reject) => {
    execFile(FFMPEG, args, { timeout: 20_000, windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
}

/** Dựng sẵn (chạy nền) các cỡ hay dùng ngay khi có ảnh, video mới. */
export function warmThumbs(mediaDir: string, url: string | null, sizes: number[] = [360, 1080]) {
  const file = url?.startsWith('/media/') ? url.slice(7) : '';
  if (!NAME.test(file)) return;
  for (const s of sizes) void make(mediaDir, file, s).catch(() => {});
}

function make(mediaDir: string, file: string, size: number) {
  const out = path.join(mediaDir, `w${size}`, file.replace(/\.\w+$/, '.jpg'));
  if (existsSync(out)) return Promise.resolve(out);
  const key = `${size}/${file}`;
  if (failed.has(key)) return Promise.reject(new Error('thumb failed'));
  let p = running.get(key);
  if (!p) {
    p = (async () => {
      await slot();
      try {
        mkdirSync(path.dirname(out), { recursive: true });
        // Ghi ra tệp tạm rồi mới đổi tên: ffmpeg bị ngắt giữa chừng thì không để lại ảnh dở mà existsSync tưởng là xong.
        const part = out.replace(/\.jpg$/, '.part.jpg');
        await build(path.join(mediaDir, file), part, size);
        renameSync(part, out);
      } catch (e) { failed.add(key); throw e; } finally { free(); }
    })().finally(() => running.delete(key));
    running.set(key, p);
  }
  return p.then(() => out);
}

export function thumbRoute(mediaDir: string): express.RequestHandler {
  return (req, res) => {
    const size = Number(req.params.size);
    const file = String(req.params.file);
    if (!NAME.test(file)) return res.status(404).end();
    const original = `/media/${file}`;
    if (!THUMB_SIZES.includes(size as (typeof THUMB_SIZES)[number]) || !existsSync(path.join(mediaDir, file))) return res.redirect(302, original);
    make(mediaDir, file, size)
      .then((out) => res.sendFile(out, { maxAge: '30d', immutable: true }))
      .catch(() => { if (!res.headersSent) res.redirect(302, original); });
  };
}
