import { useEffect, useId, useRef } from 'react';

/** Điều khiển linh vật từ ngoài, đọc trong vòng rAF để không phải render lại React mỗi khung hình. */
export type Drive = { talking: boolean; pulse: number; level: number };
export type MascotMode = 'idle' | 'talk' | 'listen' | 'wave' | 'sleep' | 'happy';

const still: React.RefObject<Drive> = { current: { talking: false, pulse: 0, level: 0 } };

// "Mây", linh vật của Homeletter: tròn như viên kẹo dẻo tím lilac, mặt kem, ăng-ten có quả bi, tay chân ngắn mập.
// Dùng chung cả app: idle (chớp mắt, ăng-ten đung đưa), talk (miệng mở theo giọng), listen (nghiêng đầu, mắt to, nhún theo mic),
// wave (vẫy tay, mắt cười), sleep (nằm ngủ), happy (cười híp mắt). Chỉ animate transform và opacity cho mượt trên iPhone.
export function Mascot({ mode = 'idle', drive = still, size = 220, className = '' }: {
  mode?: MascotMode; drive?: React.RefObject<Drive>; size?: number; className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = (n: string) => `mc${uid}${n}`;
  const bob = useRef<SVGGElement>(null);
  const mouth = useRef<SVGGElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    let raf = 0;
    let m = 0, lv = 0;
    const loop = (t: number) => {
      const d = drive.current;
      let target = 0;
      if (d?.talking) {
        // Nhịp giả theo âm tiết, cộng thêm cú mở to mỗi khi máy báo đọc tới một từ mới.
        const beat = Math.abs(Math.sin(t / 95)) * 0.55 + Math.abs(Math.sin(t / 160 + 1)) * 0.25;
        const kick = Math.max(0, 1 - (t - d.pulse) / 200) * 0.45;
        target = Math.min(1, 0.15 + beat + kick);
      }
      m += (target - m) * (target > m ? 0.45 : 0.3);
      lv += ((modeRef.current === 'listen' ? d?.level ?? 0 : 0) - lv) * 0.25;
      if (mouth.current) mouth.current.style.transform = `scale(${(0.85 + m * 0.25).toFixed(3)}, ${Math.max(0.15, m).toFixed(3)})`;
      if (bob.current) {
        const breathe = modeRef.current === 'sleep' ? Math.sin(t / 1400) * 1.5 : Math.sin(t / 900) * 2;
        bob.current.style.transform = `translate3d(0, ${(breathe - lv * 12).toFixed(2)}px, 0) scale(${(1 + lv * 0.05).toFixed(3)}, ${(1 - lv * 0.03).toFixed(3)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [drive]);

  return (
    <svg className={`mascot ${mode} ${className}`} viewBox="0 0 240 260" width={size} height={size * 260 / 240} role="img" aria-label="Homeletter">
      <defs>
        <radialGradient id={g('body')} cx="36%" cy="26%" r="80%">
          <stop offset="0" stopColor="#E6DAFB" />
          <stop offset=".45" stopColor="#C9B6F2" />
          <stop offset="1" stopColor="#A992E0" />
        </radialGradient>
        <linearGradient id={g('shade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".55" stopColor="#9C84D6" stopOpacity="0" />
          <stop offset="1" stopColor="#9C84D6" stopOpacity=".45" />
        </linearGradient>
        <radialGradient id={g('shine')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity=".7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g('ball')} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#EADFFC" />
          <stop offset=".6" stopColor="#C4AFF0" />
          <stop offset="1" stopColor="#A38BDB" />
        </radialGradient>
        <radialGradient id={g('arm')} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#DCCDF9" />
          <stop offset=".6" stopColor="#C2ADEF" />
          <stop offset="1" stopColor="#A48CDC" />
        </radialGradient>
        <radialGradient id={g('face')} cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="#FFFAF0" />
          <stop offset=".75" stopColor="#FBF3E4" />
          <stop offset="1" stopColor="#EFE2CE" />
        </radialGradient>
        <radialGradient id={g('glow')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#F4EDFF" stopOpacity=".95" />
          <stop offset=".5" stopColor="#E0D2FA" stopOpacity=".45" />
          <stop offset="1" stopColor="#E0D2FA" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g('floor')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#7E6CA8" stopOpacity=".28" />
          <stop offset="1" stopColor="#7E6CA8" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse className="mc-floor" cx="120" cy="244" rx="88" ry="12" fill={`url(#${g('floor')})`} />
      <g ref={bob} className="mc-bob">
        <g className="mc-body">
          {/* ăng-ten */}
          <g className="mc-antenna">
            <circle className="mc-glow" cx="110" cy="16" r="26" fill={`url(#${g('glow')})`} />
            <path d="M120 48 Q118 32 111 20" fill="none" stroke="#B7A2EA" strokeWidth="7" strokeLinecap="round" />
            <circle cx="110" cy="16" r="12" fill={`url(#${g('ball')})`} />
            <circle cx="106" cy="12" r="3.5" fill="#fff" opacity=".6" />
          </g>
          {/* thân kẹo dẻo, hai chân ngắn */}
          <path d="M120 42C174 42 202 82 202 132L202 212Q202 230 184 230L150 230Q138 230 138 218Q137 202 120 202Q103 202 102 218Q102 230 90 230L56 230Q38 230 38 212L38 132C38 82 66 42 120 42Z" fill={`url(#${g('body')})`} />
          <path d="M120 42C174 42 202 82 202 132L202 212Q202 230 184 230L150 230Q138 230 138 218Q137 202 120 202Q103 202 102 218Q102 230 90 230L56 230Q38 230 38 212L38 132C38 82 66 42 120 42Z" fill={`url(#${g('shade')})`} />
          <ellipse cx="86" cy="70" rx="34" ry="20" fill={`url(#${g('shine')})`} transform="rotate(-24 86 70)" />
          {/* mặt kem */}
          <g className="mc-face">
            <path d="M62 112C62 84 88 70 122 70C158 70 182 86 182 110C182 138 156 154 120 154C86 154 62 140 62 112Z" fill={`url(#${g('face')})`} />
            <g className="mc-eyes">
              <g className="mc-eye"><ellipse cx="98" cy="110" rx="10.5" ry="13" fill="#2A2330" /><circle cx="101.5" cy="104.5" r="3.6" fill="#fff" /><circle cx="95" cy="116" r="1.5" fill="#fff" opacity=".6" /></g>
              <g className="mc-eye"><ellipse cx="146" cy="106" rx="10.5" ry="13" fill="#2A2330" /><circle cx="149.5" cy="100.5" r="3.6" fill="#fff" /><circle cx="143" cy="112" r="1.5" fill="#fff" opacity=".6" /></g>
            </g>
            <g className="mc-eyes-smile" fill="none" stroke="#2A2330" strokeWidth="4.5" strokeLinecap="round">
              <path d="M87 112Q98 99 109 112" /><path d="M135 108Q146 95 157 108" />
            </g>
            <g className="mc-eyes-sleep" fill="none" stroke="#2A2330" strokeWidth="4" strokeLinecap="round">
              <path d="M87 108Q98 119 109 108" /><path d="M135 104Q146 115 157 104" />
            </g>
            <ellipse cx="82" cy="128" rx="9" ry="5" fill="#F3B9C8" opacity=".35" />
            <ellipse cx="164" cy="124" rx="9" ry="5" fill="#F3B9C8" opacity=".35" />
            {/* miệng chỉ hiện khi nói */}
            <g ref={mouth} className="mc-mouth">
              <ellipse cx="122" cy="134" rx="7.5" ry="7" fill="#5E3A4C" />
              <ellipse cx="122" cy="138" rx="4.5" ry="2.6" fill="#E59AA6" />
            </g>
          </g>
          {/* tay */}
          <ellipse className="mc-arm mc-arm-l" cx="46" cy="166" rx="20" ry="24" fill={`url(#${g('arm')})`} />
          <g className="mc-arm-r-wrap">
            <ellipse className="mc-arm mc-arm-r" cx="194" cy="166" rx="20" ry="24" fill={`url(#${g('arm')})`} />
            <g className="mc-wave-lines" stroke="#A992E0" strokeWidth="4" strokeLinecap="round">
              <path d="M222 110l6-10" /><path d="M230 124l10-4" />
            </g>
          </g>
        </g>
        <g className="mc-zz" fill="#A992E0" fontSize="18" fontWeight="600"><text x="196" y="96">z</text><text x="210" y="76" fontSize="13">z</text></g>
      </g>
    </svg>
  );
}
