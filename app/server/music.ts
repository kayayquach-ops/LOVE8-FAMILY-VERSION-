// Nhạc nền chung cho phim tuần và podcast: các bài nhạc không lời đặt trong server/music (mp3, m4a, wav, ogg).
// Chưa có bài nào thì trả null, nơi gọi tự dùng nhạc tổng hợp cũ.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MUSIC_DIR = process.env.MUSIC_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'music');

export function musicTracks(): string[] {
  try {
    return readdirSync(MUSIC_DIR).filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f)).sort().map((f) => path.join(MUSIC_DIR, f));
  } catch {
    return [];
  }
}

/** Chọn một bài theo khoá (cùng khoá luôn ra cùng bài). */
export function pickTrack(seed: string): string | null {
  const list = musicTracks();
  if (!list.length) return null;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
