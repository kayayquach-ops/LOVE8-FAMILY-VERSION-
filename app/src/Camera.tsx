import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { AUDIO_TYPE, fileName, record, snap, VIDEO_TYPE, type Recording } from './media';
import { cityOf, SILENT_HOURS, type Me } from './shared';
import { buzz, sfx, tap } from './sound';
import { Letter } from './Letter';
import { hoursSince } from './time';
import { Avatar, Icon, toast } from './ui';

type Draft = { kind: 'photo' | 'video' | 'voice'; blob: Blob; url: string; seconds?: number };
const MAX_VIDEO = 15;

// Màn chính kiểu Locket: mở ra là camera. Chạm để chụp, giữ để quay. Giữ nút dưới để nói.
export function Camera({ me, onOpen, onSent }: { me: Me; onOpen: (s: 'feed' | 'jar' | 'family' | 'calendar') => void; onSent: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState('');
  const [meal, setMeal] = useState(false);
  const [sending, setSending] = useState(false);
  const [flying, setFlying] = useState(false);
  const [rec, setRec] = useState<'video' | 'voice' | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const stopRec = useRef<(() => Promise<Recording>) | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touchY = useRef(0);

  async function start() {
    stream.current?.getTracks().forEach((t) => t.stop());
    try {
      const opts = { video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1440 } } };
      stream.current = await navigator.mediaDevices.getUserMedia({ ...opts, audio: true }).catch(() => navigator.mediaDevices.getUserMedia(opts));
      if (video.current) { video.current.srcObject = stream.current; await video.current.play().catch(() => {}); }
      setError('');
    } catch {
      setError('Cho phép camera để chụp gửi cả nhà nhé.');
    }
  }

  useEffect(() => { if (!draft && !flying) start(); }, [facing, draft, flying]);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setElapsed((e) => {
      if (rec === 'video' && e + 0.1 >= MAX_VIDEO) void finishRec();
      return e + 0.1;
    }), 100);
    return () => clearInterval(t);
  }, [rec]);

  // Nút chụp: chạm nhanh là ảnh, giữ quá 0,35 giây là quay video.
  function shutterDown() {
    if (!stream.current) return;
    holdTimer.current = setTimeout(() => {
      stopRec.current = record(stream.current!, VIDEO_TYPE());
      setElapsed(0);
      setRec('video');
      sfx('rec'); buzz(20);
    }, 350);
  }
  async function shutterUp() {
    clearTimeout(holdTimer.current);
    if (rec === 'video') return finishRec();
    if (!video.current || !stream.current) return;
    sfx('shutter'); buzz(15);
    const blob = await snap(video.current, facing === 'user');
    setDraft({ kind: 'photo', blob, url: URL.createObjectURL(blob) });
  }

  async function talkDown() {
    let s = stream.current;
    if (!s?.getAudioTracks().length) {
      s = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      if (!s) return toast('Cho phép micro để nói nhé');
    }
    stopRec.current = record(new MediaStream(s.getAudioTracks()), AUDIO_TYPE());
    setElapsed(0);
    setRec('voice');
    sfx('rec'); buzz(20);
  }

  async function finishRec() {
    const kind = rec;
    setRec(null);
    sfx('rec');
    const r = await stopRec.current?.();
    stopRec.current = null;
    if (!r || !kind) return;
    if (r.seconds < 1) return toast(kind === 'voice' ? 'Giữ lâu hơn một chút để nói' : 'Giữ lâu hơn để quay');
    setDraft({ kind, blob: r.blob, url: r.url, seconds: r.seconds });
  }

  function pickFile(f?: File) {
    if (!f) return;
    setDraft({ kind: f.type.startsWith('video') ? 'video' : 'photo', blob: f, url: URL.createObjectURL(f) });
  }

  async function send() {
    if (!draft) return;
    setSending(true);
    try {
      const f = new FormData();
      f.set('kind', draft.kind);
      f.set('file', draft.blob, fileName(draft.blob, draft.kind));
      if (caption.trim()) f.set('caption', caption.trim());
      if (meal) f.set('meal', 'true');
      if (draft.seconds) f.set('seconds', String(draft.seconds));
      await api.post(f);
      setFlying(true);
      setDraft(null); setCaption(''); setMeal(false);
      onSent();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (flying) return <Letter onDone={() => setFlying(false)} />;

  const quiet = me.members.filter((m) => m.id !== me.me.id && hoursSince(m.lastSeen) > SILENT_HOURS);

  return (
    <div className="screen with-tabs"
      onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => { if (!draft && !rec && touchY.current - e.changedTouches[0].clientY > 80) onOpen('feed'); }}>
      <div className="top">
        <div style={{ display: 'flex' }}>
          {me.members.slice(0, 4).map((m, i) => <div key={m.id} style={{ marginLeft: i ? -10 : 0, borderRadius: 99, border: '2px solid var(--bg)' }}><Avatar m={m} size={32} /></div>)}
        </div>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 500 }}>{me.family.name}</div>
        {draft && <button className="icon-btn" onClick={() => setDraft(null)} aria-label="Bỏ"><Icon name="close" /></button>}
      </div>

      {quiet.length > 0 && !draft && (
        <div className="banner fade">
          <span>{quiet[0].name} chưa mở app {Math.floor(hoursSince(quiet[0].lastSeen) / 24)} ngày rồi. Gọi hỏi thăm nhé.</span>
          {quiet[0].phone ? <a href={`tel:${quiet[0].phone}`}>Gọi</a> : <a onClick={() => onOpen('family')}>Xem</a>}
        </div>
      )}

      <div className="viewfinder">
        {draft?.kind === 'photo' && <img src={draft.url} alt="" />}
        {draft?.kind === 'video' && <video src={draft.url} autoPlay loop playsInline />}
        {draft?.kind === 'voice' && (
          <div className="card voice-card" style={{ borderRadius: 0, height: '100%' }}>
            <VoiceDot url={draft.url} seconds={draft.seconds} />
          </div>
        )}
        {!draft && <video ref={video} className={facing === 'user' ? 'mirror' : ''} muted playsInline autoPlay />}
        {!draft && error && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 30, textAlign: 'center' }}>
            <div>
              <div className="muted" style={{ marginBottom: 14 }}>{error}</div>
              <button className="btn" onClick={start}>Bật camera</button>
            </div>
          </div>
        )}
        {draft && draft.kind !== 'voice' && <input className="cap-input" value={caption} maxLength={60} onChange={(e) => setCaption(e.target.value)} placeholder="Viết một dòng..." />}
        {rec === 'video' && <div className="cap-input" style={{ background: '#C8553F' }}>Đang quay {Math.floor(elapsed)}s / {MAX_VIDEO}s</div>}
      </div>

      {draft ? (
        <>
          <div className="chips" style={{ marginTop: 18 }}>
            <button className={`chip ${meal ? 'on' : ''}`} onClick={() => { tap(); setMeal(!meal); }}>Bữa cơm hôm nay</button>
          </div>
          <div className="shutter-row">
            <button className="icon-btn" onClick={() => setDraft(null)} aria-label="Làm lại"><Icon name="close" /></button>
            <button className="shutter" onClick={send} disabled={sending} aria-label="Gửi" style={{ background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff' }}>
              {sending ? '...' : <Icon name="send" size={34} />}
            </button>
            <span style={{ width: 44 }} />
          </div>
        </>
      ) : (
        <>
          <div className="shutter-row">
            <label className="icon-btn" aria-label="Chọn ảnh trong máy">
              <Icon name="image" />
              <input type="file" accept="image/*,video/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
            <button className={`shutter ${rec === 'video' ? 'rec' : ''}`} aria-label="Chạm để chụp, giữ để quay"
              onPointerDown={shutterDown} onPointerUp={shutterUp} onPointerLeave={() => rec === 'video' && finishRec()} onContextMenu={(e) => e.preventDefault()}>
              <i />
            </button>
            <button className="icon-btn" onClick={() => { tap(); setFacing(facing === 'user' ? 'environment' : 'user'); }} aria-label="Đổi camera"><Icon name="flip" /></button>
          </div>
          <button className={`talk ${rec === 'voice' ? 'rec' : ''}`} onPointerDown={talkDown} onPointerUp={() => rec === 'voice' && finishRec()}
            onPointerLeave={() => rec === 'voice' && finishRec()} onContextMenu={(e) => e.preventDefault()}>
            <Icon name="mic" size={20} /> {rec === 'voice' ? `Đang nghe... ${Math.floor(elapsed)}s` : 'Giữ để nói với cả nhà'}
          </button>
        </>
      )}

      <button className="news-pill" onClick={() => onOpen('feed')}>
        <Icon name="up" size={16} /> Tin nhà{me.unseen > 0 ? ` · ${me.unseen} mới` : ''}
      </button>
    </div>
  );
}

export function VoiceDot({ url, seconds }: { url: string; seconds?: number | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  return (
    <>
      <audio ref={audio} src={url} preload="metadata" onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onEnded={() => { setPlaying(false); setPos(0); }} />
      <button className="play" onClick={() => { if (playing) audio.current?.pause(); else void audio.current?.play(); setPlaying(!playing); }} aria-label={playing ? 'Dừng' : 'Nghe'}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div className="bars">
        {Array.from({ length: 22 }, (_, i) => (
          <i key={i} className={seconds && pos / seconds > i / 22 ? 'on' : ''} style={{ height: 8 + Math.abs(Math.sin(i * 1.7)) * 26 + (i % 3) * 3 }} />
        ))}
      </div>
      <div style={{ fontSize: 14 }}>{seconds ? `${Math.round(seconds)} giây` : ''}</div>
    </>
  );
}
