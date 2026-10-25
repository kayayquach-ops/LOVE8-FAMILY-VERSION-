// Kiểu của một lá thư: giấy, khung, chữ, màu chữ, nền. Thư lưu mã ngắn; mã lạ hoặc thiếu thì dùng mục đầu.
export type LetterStyle = { paper?: string; frame?: string; font?: string; ink?: string; bg?: string };

export const PAPERS = [
  { id: 'cream', c: '#FBF4E6' }, { id: 'rose', c: '#F9E1E3' }, { id: 'mint', c: '#E1F1E6' }, { id: 'sky', c: '#E0EEF8' },
  { id: 'butter', c: '#FBEFB8' }, { id: 'lavender', c: '#ECE4F6' }, { id: 'white', c: '#FFFFFF' }, { id: 'kraft', c: '#E9D5B8' },
] as const;

export const INKS = [
  { id: 'black', c: '#2B2723' }, { id: 'brown', c: '#5A3B2A' }, { id: 'navy', c: '#1F3A5F' }, { id: 'wine', c: '#7A1F2B' },
  { id: 'moss', c: '#46603F' }, { id: 'plum', c: '#5B3A78' }, { id: 'rose', c: '#B24A63' },
] as const;

export const FRAMES = ['none', 'line', 'double', 'dotted', 'dashed', 'round', 'corners', 'ribbon'] as const;

// Mỗi chữ có phông Latin + Việt riêng, phông Hàn đi kèm để chữ Hàn cũng đẹp (phông Hàn chỉ tải khi có tiếng Hàn).
export const FONTS = [
  { id: 'hand', css: "'Patrick Hand', 'Gaegu', cursive", size: 22 },
  { id: 'script', css: "'Dancing Script', 'Nanum Pen Script', cursive", size: 24 },
  { id: 'serif', css: "'Playfair Display', 'Noto Serif KR', serif", size: 19 },
  { id: 'round', css: "'Pacifico', 'Gaegu', cursive", size: 19 },
  { id: 'plain', css: "'Inter', 'Noto Sans KR', system-ui, sans-serif", size: 17 },
] as const;

export const BGS = [
  { id: 'plain', css: '#F3ECE2' },
  { id: 'dusk', css: 'linear-gradient(170deg, #F6D9C8 0%, #D9C2D6 55%, #B9B4D9 100%)' },
  { id: 'sea', css: 'linear-gradient(170deg, #D6EAF0 0%, #A9CCDB 100%)' },
  { id: 'meadow', css: 'linear-gradient(170deg, #EAF0D8 0%, #C3D7A4 100%)' },
  { id: 'night', css: 'radial-gradient(circle at 20% 25%, rgba(255,255,255,.7) 0 1px, transparent 2px) 0 0 / 70px 70px, radial-gradient(circle at 70% 60%, rgba(255,255,255,.55) 0 1.2px, transparent 2.4px) 0 0 / 110px 110px, linear-gradient(170deg, #2E3550 0%, #4A4F7A 100%)' },
  { id: 'dots', css: 'radial-gradient(rgba(178,74,99,.28) 2px, transparent 2.5px) 0 0 / 22px 22px, #FBE4E8' },
  { id: 'grid', css: 'linear-gradient(rgba(70,96,63,.14) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, rgba(70,96,63,.14) 1px, transparent 1px) 0 0 / 24px 24px, #F6F4E8' },
] as const;

export const DEFAULT_STYLE: Required<LetterStyle> = { paper: 'cream', frame: 'line', font: 'hand', ink: 'brown', bg: 'plain' };

const pick = <T extends { id: string }>(list: readonly T[], id?: string) => list.find((x) => x.id === id) ?? list[0];

export function resolveStyle(s: LetterStyle = {}) {
  const paper = pick(PAPERS, s.paper ?? DEFAULT_STYLE.paper);
  const ink = pick(INKS, s.ink ?? DEFAULT_STYLE.ink);
  const font = pick(FONTS, s.font ?? DEFAULT_STYLE.font);
  const bg = pick(BGS, s.bg ?? DEFAULT_STYLE.bg);
  const frame = (FRAMES as readonly string[]).includes(s.frame ?? '') ? (s.frame as string) : DEFAULT_STYLE.frame;
  return { paper, ink, font, bg, frame };
}

let loaded: Promise<void> | undefined;
/** Phông thư chỉ tải khi mở màn Thư; phông Hàn chỉ khi dùng tiếng Hàn. CSS chia lát theo unicode-range nên máy chỉ tải lát có chữ đang dùng. */
export function loadLetterFonts(ko: boolean) {
  loaded ??= Promise.all([
    import('@fontsource/patrick-hand/latin-400.css'), import('@fontsource/patrick-hand/vietnamese-400.css'),
    import('@fontsource/dancing-script/latin-400.css'), import('@fontsource/dancing-script/vietnamese-400.css'),
    import('@fontsource/playfair-display/latin-400.css'), import('@fontsource/playfair-display/vietnamese-400.css'),
    import('@fontsource/pacifico/latin-400.css'), import('@fontsource/pacifico/vietnamese-400.css'),
    import('@fontsource/inter/latin-400.css'), import('@fontsource/inter/vietnamese-400.css'),
  ]).then(() => {}).catch(() => { loaded = undefined; });
  const kor = ko ? Promise.all([import('@fontsource/gaegu/400.css'), import('@fontsource/nanum-pen-script/400.css')]).then(() => {}).catch(() => {}) : Promise.resolve();
  return Promise.all([loaded, kor]).then(() => {});
}
