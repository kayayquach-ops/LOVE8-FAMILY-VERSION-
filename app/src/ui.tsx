import { useEffect, useState, type ReactNode } from 'react';
import type { Member } from './shared';
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
  chat: <path d="M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2H10l-4 3v-3H5a2 2 0 01-2-2V7a2 2 0 012-2z" />,
  video: <><rect x="3" y="6.5" width="12.5" height="11" rx="2.5" /><path d="M15.5 10.5l5-3v9l-5-3z" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></>,
  micOff: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3M4 4l16 16" /></>,
  videoOff: <><rect x="3" y="6.5" width="12.5" height="11" rx="2.5" /><path d="M15.5 10.5l5-3v9l-5-3zM3 4l16 16" /></>,
  booth: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
};

export function Icon({ name, size }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/** Nền sương mờ: vùng sáng trắng, hồng đào và xám tím trôi rất chậm, phủ một lớp hạt mịn như ảnh phim. */
export function Mesh() {
  return (
    <div className="mist" aria-hidden>
      <i className="m1" /><i className="m2" /><i className="m3" /><i className="m4" />
      <b className="grain" />
    </div>
  );
}

export function Avatar({ m, size = 40 }: { m?: Member | null; size?: number }) {
  if (m?.avatar) return <img className="avatar" src={m.avatar} alt={m.name} style={{ width: size, height: size }} />;
  return <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(m?.name ?? '?').trim().split(/\s+/).pop()?.[0]?.toUpperCase()}</div>;
}

/** Chữ hiện dần từng từ: mờ thành rõ, nổi nhẹ lên, kèm tiếng chuông lật trang. Hiện xong gọi onDone. */
export function Typed({ text, onDone }: { text: string; onDone?: () => void }) {
  const words = text.split(' ');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(false);
    sfx('reveal');
    // Safari iOS đôi khi kẹt chữ ở trạng thái mờ, nên hết giờ thì ép về rõ hẳn.
    const t = setTimeout(() => { setDone(true); onDone?.(); }, 600 + words.length * 220 + 1700);
    return () => clearTimeout(t);
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
