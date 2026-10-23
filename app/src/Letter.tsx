import { useEffect } from 'react';
import { sfx } from './sound';

// Gửi xong: máy bay giấy bay theo đường thư qua biển, rồi lá thư thả xuống tới cả nhà (từ bản vẽ tay ý tưởng).
const ROUTE = 'M30 560 C 110 360, 250 250, 330 300';

export function Letter({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    sfx('send');
    const a = setTimeout(() => sfx('arrive'), 2100);
    const b = setTimeout(onDone, 3600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  return (
    <button className="letter" onClick={onDone} aria-label="Đã gửi về nhà">
      <svg viewBox="0 0 390 700" preserveAspectRatio="xMidYMid meet">
        <g className="ink">
          {/* biển */}
          <path d="M0 470 H390" opacity=".35" />
          <path className="wave" d="M20 500 q15 -10 30 0 t30 0 t30 0 t30 0" />
          <path className="wave" style={{ animationDelay: '.3s' }} d="M60 530 q15 -10 30 0 t30 0 t30 0 t30 0 t30 0" />
          <path className="wave" style={{ animationDelay: '.6s' }} d="M10 560 q15 -10 30 0 t30 0 t30 0" />
          {/* đường thư */}
          <path id="route" className="route" d={ROUTE} />
          {/* nhà và cả nhà đang chờ */}
          <g className="family">
            <path d="M232 430 l30 -24 l30 24 v40 h-60z" /><path d="M254 470 v-18 h16 v18" />
            <circle cx="300" cy="560" r="12" /><path d="M300 572 v34 M300 584 l-14 10 M300 584 l14 10 M300 606 l-10 20 M300 606 l10 20" />
            <circle cx="345" cy="566" r="10" /><path d="M345 576 v28 M345 586 l-12 8 M345 586 l12 8 M345 604 l-8 16 M345 604 l8 16" />
          </g>
          {/* sợi chỉ và lá thư thả xuống */}
          <path className="string" d="M330 300 V520" />
        </g>
        <text className="route-text"><textPath href="#route" startOffset="34%">đường thư về nhà</textPath></text>
        <g className="drop">
          <rect x="316" y="505" width="28" height="22" rx="3" fill="#FBF7F0" stroke="#2B2723" strokeWidth="1.6" />
          <path d="M316 507 l14 10 l14 -10" fill="none" stroke="#2B2723" strokeWidth="1.4" />
          <path d="M330 492 c-4 -4 -9 -2 -9 2 c0 4 5 6 9 9 c4 -3 9 -5 9 -9 c0 -4 -5 -6 -9 -2z" fill="#9A5A44" className="pop-heart" />
        </g>
        <g className="plane">
          <path d="M-14 -8 L16 0 L-14 8 L-6 0 Z" fill="#FBF7F0" stroke="#2B2723" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M-6 0 L16 0" stroke="#2B2723" strokeWidth="1" />
          <animateMotion dur="2s" begin="0.2s" fill="freeze" rotate="auto" path={ROUTE} keyTimes="0;1" keySplines=".4 0 .2 1" calcMode="spline" />
        </g>
      </svg>
      <div className="letter-note">Lá thư đang về nhà</div>
    </button>
  );
}
