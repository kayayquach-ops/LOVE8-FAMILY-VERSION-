import { useEffect, useRef, useState } from 'react';
import { AUDIO_TYPE, record, type Recording } from './media';
import { buzz, duckMusic, tap } from './sound';
import { Icon } from './ui';
import './voice.css';

const MAX = 20;
const BARS = 7;

/** Giữ nút tròn để nói một câu (tối đa 20 giây), thả ra là xong. Có sóng âm nhỏ khi đang nói, nghe lại khi đã thu. */
export function VoiceNote({ value, onChange, onDenied }: { value: Recording | null; onChange: (r: Recording | null) => void; onDenied: () => void }) {
  const [rec, setRec] = useState(false);
  const [left, setLeft] = useState(MAX);
  const [playing, setPlaying] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const stop = useRef<(() => Promise<Recording>) | null>(null);
  const holding = useRef(false);
  const ac = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const bars = useRef<Array<HTMLElement | null>>([]);
  const raf = useRef(0);
  const timer = useRef(0);
  const audio = useRef<HTMLAudioElement>(null);

  // Rời bước này thì tắt mic, trả nhạc lại.
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    clearInterval(timer.current);
    if (stop.current) { void stop.current(); stop.current = null; duckMusic(false); }
    stream.current?.getTracks().forEach((t) => t.stop());
    void ac.current?.close().catch(() => {});
  }, []);

  async function down() {
    if (value || rec) return;
    holding.current = true;
    // AudioContext tạo ngay trong cử chỉ chạm để iPhone cho chạy.
    try { ac.current ??= new AudioContext(); void ac.current.resume(); } catch {}
    const first = !stream.current;
    if (first) {
      stream.current = await navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => null) ?? null;
      if (!stream.current) { holding.current = false; return onDenied(); }
      try {
        const src = ac.current!.createMediaStreamSource(stream.current);
        analyser.current = ac.current!.createAnalyser();
        analyser.current.fftSize = 256;
        src.connect(analyser.current);
      } catch {}
    }
    // Lần đầu máy hỏi quyền mic, ngón tay thường đã nhấc ra. Khi đó chờ lần giữ sau.
    if (!holding.current || !stream.current) return;
    duckMusic(true);
    stop.current = record(stream.current, AUDIO_TYPE());
    setRec(true);
    setLeft(MAX);
    buzz(20);
    const t0 = Date.now();
    timer.current = window.setInterval(() => {
      const s = MAX - Math.floor((Date.now() - t0) / 1000);
      setLeft(s);
      if (s <= 0) void up();
    }, 250);
    wave();
  }

  function wave() {
    const a = analyser.current;
    if (!a) return;
    const data = new Uint8Array(a.fftSize);
    const tick = () => {
      a.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) * (v - 128);
      const level = Math.min(1, Math.sqrt(sum / data.length) / 40);
      const now = performance.now() / 1000;
      bars.current.forEach((b, i) => {
        if (!b) return;
        const k = 0.35 + 0.65 * Math.abs(Math.sin(now * 3 + i * 0.9));
        b.style.transform = `scaleY(${(0.15 + level * k * 0.85).toFixed(3)})`;
        b.style.opacity = String(0.4 + level * 0.6);
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  async function up() {
    holding.current = false;
    const s = stop.current;
    if (!s) return;
    stop.current = null;
    clearInterval(timer.current);
    cancelAnimationFrame(raf.current);
    setRec(false);
    const r = await s();
    duckMusic(false);
    if (r.seconds < 1) { URL.revokeObjectURL(r.url); return; }
    tap();
    onChange(r);
  }

  function play() {
    const a = audio.current;
    if (!a) return;
    if (playing) { a.pause(); a.currentTime = 0; setPlaying(false); return; }
    duckMusic(true);
    void a.play().then(() => setPlaying(true)).catch(() => duckMusic(false));
  }
  const ended = () => { setPlaying(false); duckMusic(false); };

  if (value) {
    return (
      <div className="vn">
        <button className="vn-btn done" onClick={play} aria-label={playing ? 'Dừng' : 'Nghe lại'}>
          <Icon name={playing ? 'pause' : 'play'} size={40} />
        </button>
        <div className="vn-note">{playing ? 'Đang nghe lại' : `Nghe lại · ${Math.max(1, Math.round(value.seconds))} giây`}</div>
        <audio ref={audio} src={value.url} onEnded={ended} onPause={ended} playsInline />
      </div>
    );
  }

  return (
    <div className="vn">
      <div className={`vn-btn ${rec ? 'rec' : ''}`} role="button" aria-label="Giữ để nói"
        onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}>
        <i className="vn-glow" />
        <span className="vn-icon"><Icon name="mic" size={40} /></span>
      </div>
      <div className="vn-wave" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => <i key={i} ref={(el) => { bars.current[i] = el; }} />)}
      </div>
      <div className="vn-note">{rec ? `Đang nghe... còn ${left} giây` : 'Giữ nút tròn để nói'}</div>
    </div>
  );
}
