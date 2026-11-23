import { useEffect, useRef, useState, type ReactNode } from 'react';
import { thumb, type Member } from './shared';
import { sfx } from './sound';

// Icon nét mảnh tự vẽ, một bộ duy nhất cho cả app.
const PATHS: Record<string, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  down: <path d="M5 9l7 7 7-7" />,
  up: <path d="M5 15l7-7 7 7" />,
  flip: <><path d="M4 9a8 8 0 0114-3l2 2" /><path d="M20 4v4h-4" /><path d="M20 15a8 8 0 01-14 3l-2-2" /><path d="M4 20v-4h4" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M20 16l-5-5-8 8" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
  send: <path d="M12 19V5M6 11l6-6 6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />,
  heartFill: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="currentColor" />,
  home: <><path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-5h-6v5H5a1 1 0 01-1-1z" /></>,
  jar: <><path d="M8 3h8M9 3v3c-2.5 1-4 3-4 6v6a3 3 0 003 3h8a3 3 0 003-3v-6c0-3-1.5-5-4-6V3" /><path d="M7.5 13h9" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2A4.5 4.5 0 0120.5 19" /></>,
  phone: <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2 2A15 15 0 014.5 6a2 2 0 012-2z" />,
  share: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4 8l8 5.5L20 8" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  chat: <path d="M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2H10l-4 3v-3H5a2 2 0 01-2-2V7a2 2 0 012-2z" />,
  video: <><rect x="3" y="6.5" width="12.5" height="11" rx="2.5" /><path d="M15.5 10.5l5-3v9l-5-3z" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></>,
  micOff: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3M4 4l16 16" /></>,
  videoOff: <><rect x="3" y="6.5" width="12.5" height="11" rx="2.5" /><path d="M15.5 10.5l5-3v9l-5-3zM3 4l16 16" /></>,
  booth: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  // Chụp chung: nhãn ảnh ghép AI, nút nhắc, khung đang đợi.
  sparkle: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  bell: <><path d="M6 16v-5a6 6 0 0112 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  hourglass: <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />,
};

export function Icon({ name, size }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/** Nền giấy trắng phủ hạt rất mịn. Kèm bộ lọc #hl-wob làm nét vẽ tay hơi run như vẽ bút thật (Doodle dùng). */
export function Mesh() {
  return (
    <div className="mist" aria-hidden>
      <i className="m1" /><i className="m2" /><i className="m3" /><i className="m4" />
      <b className="grain" />
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <filter id="hl-wob" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>
      </svg>
    </div>
  );
}

// Hình vẽ tay nét mực (bộ giao diện 14/11). Dùng cho trang trí, trạng thái trống, tem thư, ô tích; nút bấm thường vẫn dùng Icon.
const DOODLES: Record<string, ReactNode> = {
  heart: <path d="M12.2 20.4C6.3 16 2.6 12.4 3.2 8.3 3.8 4.6 8.6 3.6 11.7 7.6 14.4 3.4 19.9 4 20.8 7.8 21.7 11.6 18.1 15.6 11.6 20.9" />,
  heartFill: <path fill="currentColor" d="M12.2 20.4C6.3 16 2.6 12.4 3.2 8.3 3.8 4.6 8.6 3.6 11.7 7.6 14.4 3.4 19.9 4 20.8 7.8 21.7 11.6 18.1 15.6 12.2 20.4Z" />,
  plane: <path d="M2.8 11.2 20.9 3.6 15.6 20.3 11.4 13.1Z M11.4 13.1 20.9 3.6 M11.4 13.1 10.9 18.4 13.4 16.2" />,
  house: <><path d="M3.4 11.4 12.1 4.1 20.7 11.2 M5.6 9.8V20.2H18.6V9.6 M10 20.1V14.6H14.2V20 M16.4 7.4V4.4H18.4V9" /><path d="M17.6 2.6c.8-.6.4-1.2 1.2-1.6" /></>,
  moon: <path d="M15.2 3.4A8.6 8.6 0 1 0 20.7 15 7 7 0 0 1 15.2 3.4Z" />,
  sun: <><circle cx="12" cy="12" r="4.3" /><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.4l1.8 1.8M16.9 17l1.8 1.8M5.4 18.7l1.8-1.8M17 7.1l1.8-1.8" /></>,
  bowl: <path d="M3.2 11.6H20.8C20.4 16.6 16.8 19.8 12 19.8S3.6 16.6 3.2 11.6Z M8 21H16.1 M9 8.6C8.2 7.4 9.8 6.6 9 5.2 M12.4 8.6C11.6 7.2 13.2 6.2 12.4 4.6 M15.8 8.4C15 7.4 16.6 6.4 15.8 5.2" />,
  mail: <path d="M3.2 6.2H20.8V18.2H3.2Z M3.6 6.6 12 13.2 20.4 6.4" />,
  star: <path d="M12 2.8 14.7 8.8 21.1 9.3 16.2 13.4 17.8 20 12.1 16.4 6.3 19.8 7.9 13.3 2.9 9.3 9.4 8.7Z" />,
  mic: <><path d="M9.2 6.4C9.2 4.6 10.4 3.4 12 3.4S14.8 4.6 14.8 6.4V11.4C14.8 13.2 13.6 14.4 12 14.4S9.2 13.2 9.2 11.4Z" /><path d="M5.8 11.4C6 15 8.6 17.6 12 17.6S18 15 18.2 11.4M12 17.8V20.8" /></>,
  camera: <><path d="M4 8h3.2L9 5.5h6L16.8 8H20v11H4Z" /><circle cx="12" cy="13.2" r="3.4" /></>,
  film: <><path d="M4.4 4.6H19.6V19.4H4.4Z M8 4.8V19.2 M16 4.8V19.2" /><path d="M4.6 9H7.8M4.6 15H7.8M16.2 9H19.4M16.2 15H19.4" /></>,
  arrow: <path d="M21 3.6C15.4 3.2 9 6 5.6 13.8 M3.2 9.6 5.4 14.2 9.6 12.4" />,
  box: <path d="M5 5.4C9.5 4.8 14.6 4.9 19.2 5.2 19.4 9.8 19.3 14.6 18.9 19 14.4 19.4 9.6 19.3 4.8 18.8 4.6 14.4 4.7 9.8 5 5.4Z" />,
  check: <><path d="M5 5.4C9.5 4.8 14.6 4.9 19.2 5.2 19.4 9.8 19.3 14.6 18.9 19 14.4 19.4 9.6 19.3 4.8 18.8 4.6 14.4 4.7 9.8 5 5.4Z" /><path stroke="var(--accent)" strokeWidth="2.4" d="M7.6 12.4 10.8 15.6 21.6 3.6" /></>,
  underline: <path d="M2 14C7 11.6 14 11.4 22 12.8" />,
  // Ưu đãi (Coupons.tsx): vé xé, rồi từng nhóm ưu đãi.
  ticket: <path d="M3.4 7.2C3.3 6.4 3.9 5.8 4.7 5.9H19.4C20.2 5.8 20.7 6.4 20.6 7.2V9.7C19.3 9.8 18.4 10.8 18.4 12.1S19.3 14.3 20.6 14.4V16.8C20.7 17.6 20.2 18.2 19.4 18.1H4.7C3.9 18.2 3.3 17.6 3.4 16.8V14.4C4.7 14.3 5.6 13.3 5.6 12S4.7 9.8 3.4 9.7Z M9.6 6.4V8.2 M9.7 10.9V13.1 M9.6 15.8V17.6" />,
  chair: <path d="M6.9 4.3C8.3 3.7 9.5 4.5 9.7 5.9L10.9 12.3H17.1C18.3 12.3 19.1 13.1 19.2 14.3V15.6H8.9C7.7 15.7 6.9 15 6.7 13.9L5.6 6.7C5.4 5.6 5.9 4.7 6.9 4.3Z M8.6 15.8 7.2 20.3 M17.3 15.7 18.6 20.2 M5.8 20.4H20.2 M11.1 9.6C12.6 9.3 14 9.4 15.5 9.7" />,
  pulse: <path d="M12.2 20.4C6.3 16 2.6 12.4 3.2 8.3 3.8 4.6 8.6 3.6 11.7 7.6 14.4 3.4 19.9 4 20.8 7.8 21.7 11.6 18.1 15.6 11.6 20.9 M3.6 12.3H8.1L9.7 9.4 12 14.9 13.8 11.1 15.1 12.2H20.2" />,
  pill: <path d="M5.5 13.7 13.3 5.9C14.9 4.2 17.6 4.2 19.2 5.8S20.9 10.1 19.2 11.7L11.4 19.5C9.8 21.1 7.1 21.1 5.5 19.4S3.9 15.3 5.5 13.7Z M9.3 9.9 15.1 15.7" />,
  bottle: <path d="M9.1 3.3H15.1V6.3H9.2Z M8.2 6.4H16C16.8 6.5 17.4 7.1 17.4 7.9V19.2C17.4 20 16.8 20.6 16 20.7H8.2C7.4 20.6 6.8 20 6.8 19.2V7.9C6.8 7 7.4 6.4 8.2 6.4Z M6.9 10.4C10.4 10.2 13.9 10.3 17.3 10.5 M6.9 16.6C10.4 16.8 13.9 16.7 17.3 16.5 M12.1 11.9V15.1 M10.5 13.5H13.7" />,
  homecare: <path d="M3.4 11.4 12.1 4.1 20.7 11.2 M5.6 9.8V20.2H18.6V9.6 M12.1 11.6V17.3 M9.2 14.5C11.1 14.3 13 14.3 15 14.5" />,
  // Hộp quà nhỏ: mốc lọ sao có quà trong kho (Jar.tsx), chỉ vẽ khi thật sự có quà.
  gift: <path d="M3.6 8.1C9.2 7.8 14.8 7.8 20.4 8.2L20.3 11.3C14.8 11.5 9.2 11.5 3.7 11.2Z M5 11.4 5.3 19.9C9.8 20.2 14.3 20.2 18.8 19.8L19 11.5 M12 8 12.1 20 M11.9 7.9C10.8 5.2 7.6 4.1 7.3 5.9 7 7.4 9.9 7.9 11.9 7.9 13.1 5.2 16.4 4 16.7 5.8 17 7.3 14 7.9 11.9 7.9" />,
};

export function Doodle({ name, size = 24, className, wobble = true }: { name: keyof typeof DOODLES | string; size?: number; className?: string; wobble?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`doodle${className ? ` ${className}` : ''}`} aria-hidden>
      <g filter={wobble ? 'url(#hl-wob)' : undefined}>{DOODLES[name]}</g>
    </svg>
  );
}

// Sao giấy may mắn kiểu học trò gấp bỏ lọ: thân phồng màu giấy, viền mực, nếp gấp mờ. Màu lệch nhẹ khỏi viền như tô tay.
export const LUCKY_STAR_PATH = 'M12 3C13 3 13.6 6.4 14.6 7.6 15.6 8.6 20.4 8.4 20.8 9.6 21.2 10.8 17.4 13 17 14.4 16.6 15.8 18.6 20.2 17.6 20.9 16.6 21.6 13.3 18.6 12 18.6 10.7 18.6 7.4 21.6 6.4 20.9 5.4 20.2 7.4 15.8 7 14.4 6.6 13 2.8 10.8 3.2 9.6 3.6 8.4 8.4 8.6 9.4 7.6 10.4 6.4 11 3 12 3Z';
export function LuckyStar({ color, size = 24, className }: { color: string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden style={{ overflow: 'visible', flex: 'none' }}>
      <path d={LUCKY_STAR_PATH} fill={color} transform="translate(.9 .9)" />
      <path d={LUCKY_STAR_PATH} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 12.6 12 5.4M12 12.6 18.6 10M12 12.6 16.4 19.4M12 12.6 7.6 19.4M12 12.6 5.4 10" fill="none" stroke="var(--ink)" strokeWidth="1" strokeLinecap="round" opacity=".4" />
    </svg>
  );
}

export function Avatar({ m, size = 40 }: { m?: Member | null; size?: number }) {
  // Ảnh đại diện hiện tối đa vài chục px: dùng bản 160 px thay ảnh gốc 800 px.
  if (m?.avatar) return <img className="avatar" src={size <= 60 ? thumb(m.avatar, 160) : m.avatar} alt={m.name} decoding="async" style={{ width: size, height: size }} />;
  return <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(m?.name ?? '?').trim().split(/\s+/).pop()?.[0]?.toUpperCase()}</div>;
}

export const SKIP_EVENT = 'hl-skip';

/** Chữ hiện dần từng từ: mờ thành rõ, nổi nhẹ lên, kèm tiếng chuông lật trang. Hiện xong gọi onDone. Sự kiện SKIP_EVENT hiện đủ ngay. */
export function Typed({ text, onDone }: { text: string; onDone?: () => void }) {
  const words = text.split(' ');
  const [done, setDone] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    setDone(false);
    fired.current = false;
    sfx('reveal');
    // Safari iOS đôi khi kẹt chữ ở trạng thái mờ, nên hết giờ thì ép về rõ hẳn.
    const t = setTimeout(() => setDone(true), 600 + words.length * 220 + 1700);
    // Đáp án bắt đầu hiện khi từ cuối đã hiện được nửa chừng, không đợi chữ rõ hẳn mới ra.
    const early = setTimeout(() => { fired.current = true; onDone?.(); }, 600 + (words.length - 1) * 220 + 700);
    const skip = () => {
      clearTimeout(t); clearTimeout(early);
      setDone(true);
      if (!fired.current) { fired.current = true; onDone?.(); }
    };
    window.addEventListener(SKIP_EVENT, skip);
    return () => { clearTimeout(t); clearTimeout(early); window.removeEventListener(SKIP_EVENT, skip); };
  }, [text]);
  return (
    <span key={text}>
      {words.map((w, i) => <span key={i} className={done ? 'word done' : 'word'} style={{ animationDelay: `${600 + i * 220}ms` }}>{w}{i < words.length - 1 ? ' ' : ''}</span>)}
    </span>
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let setToastText: ((t: string) => void) | undefined;
export function toast(text: string) {
  setToastText?.(text);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setToastText?.(''), 2200);
}
export function Toaster() {
  const [t, setT] = useState('');
  useEffect(() => { setToastText = setT; }, []);
  return t ? <div className="toast">{t}</div> : null;
}
