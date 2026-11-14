// Nhạc nền chung cho phim tuần và podcast: các bài nhạc không lời đặt trong server/music (mp3, m4a, wav, ogg).
// Thư mục con theo việc: music/recap (có nhịp, cho phim tuần), music/podcast (nhẹ, nằm dưới giọng nói),
// music/story (chill, cho tập theo câu chuyện; trống thì dùng bài của music/podcast).
// Thư mục con trống thì lấy bài ở thư mục gốc; chưa có bài nào thì trả null, nơi gọi tự dùng nhạc tổng hợp cũ.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MUSIC_DIR = process.env.MUSIC_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'music');

export type MusicKind = 'recap' | 'podcast' | 'story';
const FALLBACK: Record<MusicKind, MusicKind[]> = { recap: ['recap'], podcast: ['podcast'], story: ['story', 'podcast'] };

export function musicTracks(kind?: MusicKind): string[] {
  const list = (dir: string) => {
    try {
      return readdirSync(dir).filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f)).sort().map((f) => path.join(dir, f));
    } catch {
      return [];
    }
  };
  for (const k of kind ? FALLBACK[kind] : []) {
    const own = list(path.join(MUSIC_DIR, k));
    if (own.length) return own;
  }
  return list(MUSIC_DIR);
}

/** Chọn một bài theo khoá (cùng khoá luôn ra cùng bài). */
export function pickTrack(seed: string, kind?: MusicKind): string | null {
  const list = musicTracks(kind);
  if (!list.length) return null;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
