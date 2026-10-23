import { useEffect, useState } from 'react';
import { api } from './api';
import { buzz, tap } from './sound';
import { Icon, toast, Typed } from './ui';

// Mở app mỗi ngày lần đầu: giữ ngón tay để ôm cả nhà, rồi vào camera gửi vài lời.
export function Hug({ name, onDone }: { name: string; onDone: () => void }) {
  const [typed, setTyped] = useState(false);
  const [p, setP] = useState(0);
  const [holding, setHolding] = useState(false);
  const done = p >= 1;

  useEffect(() => {
    if (done) return;
    if (!holding) {
      if (p <= 0) return;
      const t = setTimeout(() => setP(Math.max(0, p - 0.08)), 30);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      const np = Math.min(1, p + 0.02);
      if (Math.floor(np * 4) > Math.floor(p * 4)) buzz(12);
      setP(np);
      if (np >= 1) {
        tap();
        api.hug().catch((e) => toast(e.message));
        setTimeout(onDone, 1600);
      }
    }, 32);
    return () => clearTimeout(t);
  }, [p, holding, done]);

  return (
    <div className="screen">
      <div className="center">
        <h1 className="q"><Typed text={done ? 'Cả nhà đã nhận được cái ôm.' : `Nhớ nhà thì ôm một cái, ${name}.`} onDone={() => setTyped(true)} /></h1>
        {typed && !done && <p className="sub fade">Giữ ngón tay vào vòng tròn</p>}
        <div style={{ height: 40 }} />
        {typed && (
          <div className="hold fade" onPointerDown={() => setHolding(true)} onPointerUp={() => setHolding(false)} onPointerLeave={() => setHolding(false)}
            onContextMenu={(e) => e.preventDefault()} role="button" aria-label="Giữ để ôm">
            <i style={{ transform: `scale(${0.25 + p * 0.75})`, opacity: 0.25 + p * 0.75 }} />
            <span style={{ color: done ? '#fff' : 'var(--accent)', position: 'relative' }}><Icon name={done ? 'heartFill' : 'heart'} size={46} /></span>
          </div>
        )}
      </div>
      {!done && <button className="link" onClick={onDone}>Để sau</button>}
    </div>
  );
}
