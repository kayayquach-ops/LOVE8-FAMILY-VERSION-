import { useId } from 'react';

// Hình vẽ cho thư: tem, dấu bưu điện, dấu sáp. Màu theo màu chữ của thư (currentColor) để hợp mọi kiểu giấy.

export const STAMPS = ['stamp-heart', 'stamp-key', 'stamp-bloom'] as const;

function Perf({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 80 100" aria-hidden>
      <rect x="2" y="2" width="76" height="96" rx="3" fill="#FFF8EE" />
      <rect x="2" y="2" width="76" height="96" rx="3" fill="none" stroke="currentColor" strokeWidth="3.4" strokeDasharray="0.1 5.6" strokeLinecap="round" opacity=".85" />
      <rect x="8.5" y="8.5" width="63" height="83" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {children}
    </svg>
  );
}

const HEART = 'M40 74 C 18 58 14 44 22 36 C 29 29 37 33 40 40 C 43 33 51 29 58 36 C 66 44 62 58 40 74z';

/** Tem nhỏ trang trí để dán lên thư. */
export function StampArt({ id }: { id: string }) {
  if (id === 'stamp-key') {
    return (
      <Perf>
        <path d="M22 28 c0 -6 8 -9 12 -4 c4 -5 12 -2 12 4 c0 6 -7 10 -12 15 c-5 -5 -12 -9 -12 -15z" fill="currentColor" opacity=".9" transform="translate(-6 -4) scale(.8)" />
        <rect x="31" y="34" width="4" height="30" rx="1.5" fill="currentColor" transform="translate(-6 -2)" />
        <path d="M26 56 h8 M26 63 h6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" transform="translate(-2 -2)" />
        <path d="M52 46 a10 10 0 0 1 20 0" fill="none" stroke="currentColor" strokeWidth="3" transform="translate(-6 0)" />
        <path d="M44 48 h26 v22 a4 4 0 0 1 -4 4 h-18 a4 4 0 0 1 -4 -4z" fill="currentColor" transform="translate(-4 0)" opacity=".92" />
        <circle cx="53" cy="58" r="3" fill="#FFF8EE" />
        <path d="M53 59 v6" stroke="#FFF8EE" strokeWidth="2.4" strokeLinecap="round" />
        <text x="40" y="92" textAnchor="middle" fontSize="8" fontFamily="system-ui, sans-serif" fontWeight="700" fill="currentColor" letterSpacing="1">POSTAGE</text>
      </Perf>
    );
  }
  if (id === 'stamp-bloom') {
    return (
      <Perf>
        {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="40" cy="36" rx="8" ry="13" fill="currentColor" opacity=".78" transform={`rotate(${a} 40 50)`} />)}
        <circle cx="40" cy="50" r="6.5" fill="#FFF8EE" />
        <path d="M40 62 v22" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M40 74 c-8 -2 -12 -8 -12 -8 c8 -1 12 3 12 8z" fill="currentColor" opacity=".7" />
        <text x="40" y="94" textAnchor="middle" fontSize="8" fontFamily="system-ui, sans-serif" fontWeight="700" fill="currentColor" letterSpacing="1">POSTAGE</text>
      </Perf>
    );
  }
  return (
    <Perf>
      <path d={HEART} fill="currentColor" opacity=".88" transform="translate(0 -6)" />
      <path d={HEART} fill="#FFF8EE" opacity=".5" transform="translate(11 6) scale(.72)" />
      <circle cx="40" cy="22" r="3" fill="currentColor" opacity=".7" />
      <text x="40" y="92" textAnchor="middle" fontSize="8" fontFamily="system-ui, sans-serif" fontWeight="700" fill="currentColor" letterSpacing="1">POSTAGE</text>
    </Perf>
  );
}

/** Dấu bưu điện tròn có vòng chữ và mấy đường lượn, đóng ở góc dưới thư. */
export function Postmark({ text }: { text: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="lp-postmark" viewBox="0 0 150 100" aria-hidden>
      <defs><path id={`pm${id}`} d="M30 50 a30 30 0 1 1 60 0 a30 30 0 1 1 -60 0" /></defs>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" opacity=".6">
        <circle cx="60" cy="50" r="40" />
        <circle cx="60" cy="50" r="23" strokeWidth="1.2" />
        <path d="M96 30 q12 -6 24 0 t24 0 M98 42 q12 -6 24 0 t24 0 M98 54 q12 -6 24 0 t24 0 M96 66 q12 -6 24 0 t24 0" />
      </g>
      <text fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="2.4" fill="currentColor" opacity=".7">
        <textPath href={`#pm${id}`} startOffset="2%">{text}</textPath>
      </text>
      <path d={HEART} fill="currentColor" opacity=".6" transform="translate(32 17) scale(.46)" />
    </svg>
  );
}

/** Dấu sáp trái tim trên phong bì. */
export function WaxSeal() {
  return (
    <svg className="lt-seal" viewBox="0 0 100 100" aria-hidden>
      <path d="M50 8 c8 -2 14 4 20 6 c8 3 16 2 20 10 c4 8 -2 14 -2 22 c0 9 6 14 2 22 c-4 8 -12 8 -20 10 c-6 2 -12 8 -20 8 c-8 0 -14 -6 -20 -8 c-8 -2 -16 -2 -20 -10 c-4 -8 2 -13 2 -22 c0 -8 -6 -14 -2 -22 c4 -8 12 -7 20 -10 c6 -2 12 -8 20 -6z" fill="#A82B2B" />
      <path d="M50 74 C 28 58 24 44 32 36 C 39 29 47 33 50 40 C 53 33 61 29 68 36 C 76 44 72 58 50 74z" fill="#8E1F1F" />
      <path d="M50 70 C 31 56 28 45 34 39 C 40 33 47 37 50 43" fill="none" stroke="#D86B6B" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
