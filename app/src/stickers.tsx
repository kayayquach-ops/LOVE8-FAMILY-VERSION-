import type { ReactNode } from 'react';

// Hình dán tự vẽ, đơn giản, màu ấm. Mỗi hình kèm một câu ngắn.
const face = (cx: number, cy: number) => (
  <>
    <circle cx={cx - 8} cy={cy} r="2.2" fill="#2B2723" />
    <circle cx={cx + 8} cy={cy} r="2.2" fill="#2B2723" />
    <path d={`M${cx - 6} ${cy + 8}q6 6 12 0`} fill="none" stroke="#2B2723" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx={cx - 14} cy={cy + 6} r="3.5" fill="#F2A0A0" opacity=".6" />
    <circle cx={cx + 14} cy={cy + 6} r="3.5" fill="#F2A0A0" opacity=".6" />
  </>
);
const HEART = 'M50 82S18 62 18 40a16 16 0 0132-7 16 16 0 0132 7c0 22-32 42-32 42z';

const ART: Record<string, ReactNode> = {
  hug: <>
    <circle cx="36" cy="46" r="20" fill="#F6D2A8" />{face(36, 44)}
    <circle cx="66" cy="54" r="17" fill="#F2B9A0" /><circle cx="60" cy="52" r="2" fill="#2B2723" /><circle cx="72" cy="52" r="2" fill="#2B2723" />
    <path d="M18 70q32 22 64 0" fill="none" stroke="#C9886A" strokeWidth="8" strokeLinecap="round" />
    <path d="M50 24s-8-5-8-10a5 5 0 018-2 5 5 0 018 2c0 5-8 10-8 10z" fill="#D9534F" />
  </>,
  love: <>
    <path d={HEART} fill="#E8837C" /><path d="M30 38q4-10 14-10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".6" />
    <circle cx="80" cy="22" r="5" fill="#F6C453" /><circle cx="18" cy="20" r="3.5" fill="#F6C453" />
  </>,
  home: <>
    <path d="M14 52L50 20l36 32" fill="none" stroke="#9A5A44" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M24 48v34h52V48L50 26z" fill="#F6E3C8" /><rect x="42" y="58" width="16" height="24" rx="3" fill="#C9886A" />
    <rect x="28" y="52" width="10" height="10" rx="2" fill="#F6C453" /><rect x="62" y="52" width="10" height="10" rx="2" fill="#F6C453" />
    <path d="M70 28v-10h6v14" fill="#B9AEA0" />
  </>,
  rice: <>
    <ellipse cx="50" cy="48" rx="26" ry="20" fill="#fff" stroke="#E8DCC8" strokeWidth="2" />
    <path d="M26 56q24 26 48 0z" fill="#C9886A" /><path d="M24 54h52" stroke="#9A5A44" strokeWidth="3" />
    <path d="M30 56q4 24 20 24t20-24z" fill="#C9886A" />
    <path d="M70 18L52 44M78 22L58 46" stroke="#9A5A44" strokeWidth="3" strokeLinecap="round" />
    <path d="M40 24q-4-6 0-10M50 24q-4-6 0-12" fill="none" stroke="#B9AEA0" strokeWidth="2.4" strokeLinecap="round" />
  </>,
  sleep: <>
    <circle cx="50" cy="56" r="28" fill="#F6D2A8" />
    <path d="M35 54q5 4 10 0M55 54q5 4 10 0" fill="none" stroke="#2B2723" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M44 68q6 4 12 0" fill="none" stroke="#2B2723" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M22 44q28-36 56 0z" fill="#8E9AC8" />
    <text x="72" y="30" fontSize="16" fill="#8E9AC8" fontWeight="600">z</text><text x="82" y="20" fontSize="11" fill="#8E9AC8" fontWeight="600">z</text>
  </>,
  go: <>
    <circle cx="50" cy="52" r="26" fill="#F6D2A8" />{face(50, 50)}
    <path d="M26 40q24-20 48 0" fill="none" stroke="#D9534F" strokeWidth="7" strokeLinecap="round" />
    <path d="M74 66l10-16 8 12" fill="#F6D2A8" stroke="#E0B58A" strokeWidth="2" strokeLinejoin="round" /><rect x="72" y="62" width="14" height="14" rx="5" fill="#F6D2A8" />
  </>,
  thanks: <>
    <path d="M18 62q16 22 32 22t32-22" fill="none" stroke="#9A5A44" strokeWidth="5" strokeLinecap="round" />
    <path d="M50 52S30 40 30 28a10 10 0 0120-4 10 10 0 0120 4c0 12-20 24-20 24z" fill="#E8837C" />
    <circle cx="22" cy="58" r="9" fill="#F6D2A8" /><circle cx="78" cy="58" r="9" fill="#F6D2A8" />
  </>,
  heart: <>
    <path d={HEART} fill="#D9534F" /><path d="M30 38q4-10 14-10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".55" />
    <path d="M50 82S18 62 18 40" fill="none" stroke="#A23430" strokeWidth="0" />
  </>,
  bowl: <>
    <path d="M18 46h64q0 30-32 34-32-4-32-34z" fill="#F4EFE8" stroke="#D8CCB8" strokeWidth="2" />
    <path d="M24 46q4-16 26-16t26 16z" fill="#fff" />
    <circle cx="40" cy="38" r="2.4" fill="#E8DCC8" /><circle cx="52" cy="34" r="2.4" fill="#E8DCC8" /><circle cx="62" cy="40" r="2.4" fill="#E8DCC8" />
    <path d="M36 82h28" stroke="#C9886A" strokeWidth="5" strokeLinecap="round" />
    <path d="M38 24q-4-6 0-10M50 22q-4-6 0-12M62 24q-4-6 0-10" fill="none" stroke="#B9AEA0" strokeWidth="2.4" strokeLinecap="round" />
  </>,
  tea: <>
    <path d="M24 44h44v14q0 20-22 20t-22-20z" fill="#F4EFE8" stroke="#D8CCB8" strokeWidth="2" />
    <path d="M68 50h6a8 8 0 010 16h-8" fill="none" stroke="#D8CCB8" strokeWidth="4" strokeLinecap="round" />
    <path d="M26 46h40" stroke="#C9886A" strokeWidth="5" strokeLinecap="round" />
    <path d="M36 34q-4-6 0-12M48 34q-4-6 0-14M60 34q-4-6 0-12" fill="none" stroke="#B9AEA0" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M20 84h56" stroke="#C9886A" strokeWidth="4" strokeLinecap="round" />
  </>,
  sun: <>
    <path d="M10 76h80" stroke="#C9886A" strokeWidth="4" strokeLinecap="round" />
    <path d="M26 76a24 24 0 0148 0z" fill="#F6C453" />
    {[...Array(7)].map((_, i) => { const a = Math.PI + (i * Math.PI) / 6; return <path key={i} d={`M${50 + Math.cos(a) * 32} ${76 + Math.sin(a) * 32}L${50 + Math.cos(a) * 42} ${76 + Math.sin(a) * 42}`} stroke="#F6C453" strokeWidth="4" strokeLinecap="round" />; })}
  </>,
  moon: <>
    <circle cx="50" cy="50" r="34" fill="#E8EAF6" opacity=".5" />
    <path d="M62 20a32 32 0 100 60 26 26 0 010-60z" fill="#F6E7A8" />
    <circle cx="40" cy="48" r="2" fill="#2B2723" /><path d="M36 60q6 5 12 0" fill="none" stroke="#2B2723" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M78 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#F6C453" /><circle cx="76" cy="70" r="2.4" fill="#F6C453" />
  </>,
};

export const STICKER_LIST: Array<{ id: string; label: string }> = [
  { id: 'hug', label: 'Ôm cái nào' },
  { id: 'love', label: 'Thương con' },
  { id: 'home', label: 'Nhớ nhà' },
  { id: 'rice', label: 'Ăn cơm chưa?' },
  { id: 'sleep', label: 'Ngủ ngon' },
  { id: 'go', label: 'Cố lên!' },
  { id: 'thanks', label: 'Cảm ơn bố mẹ' },
  { id: 'heart', label: 'Tim' },
  { id: 'bowl', label: 'Bát cơm nhà' },
  { id: 'tea', label: 'Uống trà nhé' },
  { id: 'sun', label: 'Chào buổi sáng' },
  { id: 'moon', label: 'Trăng khuya' },
];

export function Sticker({ id, size = 96 }: { id: string; size?: number }) {
  return <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>{ART[id] ?? ART.heart}</svg>;
}

/** Bản đồ id -> component, để dùng như <STICKERS.hug />. */
export const STICKERS: Record<string, (p: { size?: number }) => ReactNode> = Object.fromEntries(
  STICKER_LIST.map((s) => [s.id, (p: { size?: number }) => <Sticker id={s.id} size={p.size} />]),
);

export const stickerLabel = (id?: string | null) => STICKER_LIST.find((s) => s.id === id)?.label ?? '';
