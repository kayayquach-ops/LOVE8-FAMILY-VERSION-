import { useEffect, useRef, useState } from 'react';
import { upload } from './api';
import { fileName, record, shrinkImage, snap, useHoldMic, VIDEO_TYPE, type Recording } from './media';
import { SILENT_HOURS, type Me } from './shared';
import { buzz, sfx, tap } from './sound';
import { Letter } from './Letter';
import { hoursSince } from './time';
import { Avatar, Icon, toast } from './ui';

type Draft = { kind: 'photo' | 'video' | 'voice'; blob: Blob; url: string; seconds?: number };
const MAX_VIDEO = 15;

// Màn chính kiểu Locket: mở ra là camera. Chạm để chụp, giữ để quay. Giữ nút dưới để nói.
export function Camera({ me, active = true, onOpen, onSent }: { me: Me; active?: boolean; onOpen: (s: 'feed' | 'jar' | 'family' | 'calendar') => void; onSent: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState('');
  const [meal, setMeal] = useState(false);
  // null: chưa gửi; số 0..1: đang tải lên tới đâu.
  const [sending, setSending] = useState<number | null>(null);
  const [flying, setFlying] = useState(false);
  const [rec, setRec] = useState<'video' | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const stopRec = useRef<(() => Promise<Recording>) | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touchY = useRef(0);
  const gen = useRef(0);
  const pressed = useRef(false);
  const talk = useHoldMic((r) => setDraft({ kind: 'voice', blob: r.blob, url: r.url, seconds: r.seconds }), () => stream.current);

  function stopCam() {
    gen.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  async function start() {
    stopCam();
    const my = gen.current;
    try {
      const opts = { video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1440 } } };
      const s = await navigator.mediaDevices.getUserMedia({ ...opts, audio: true }).catch(() => navigator.mediaDevices.getUserMedia(opts));
      // Trong lúc chờ quyền mà người dùng đã rời màn (mở tin nhà, gọi video) thì tắt ngay, không giữ camera.
      if (my !== gen.current) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setError('');
    } catch {
      if (my === gen.current) setError('Cho phép camera để chụp gửi cả nhà nhé.');
    }
  }

  // Camera chỉ bật khi đang nhìn thấy màn này. Mở tin nhà, gọi video hay ẩn app thì tắt: iPhone chỉ cho một nơi dùng camera,
  // và quay lại từ nền thì luồng cũ thường đã chết, màn hình đen. Đang xem lại ảnh vừa chụp cũng tắt cho đỡ pin.
  const live = active && !draft && !flying;
  useEffect(() => {
    if (!live) { stopCam(); return; }
    void start();
    const onVis = () => { if (document.hidden) { if (!stopRec.current) stopCam(); } else if (!stream.current) void start(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); };
  }, [facing, live]);
  useEffect(() => () => { clearTimeout(holdTimer.current); stopCam(); }, []);

  const recording = rec ?? (talk.rec ? 'voice' : null);
  useEffect(() => {
    if (!recording) return;
    setElapsed(0);
    const t0 = Date.now();
    const t = setInterval(() => {
      const e = (Date.now() - t0) / 1000;
      setElapsed(e);
      if (recording === 'video' && e >= MAX_VIDEO) void finishRec();
    }, 250);
    return () => clearInterval(t);
  }, [recording]);

  // Nút chụp: chạm nhanh là ảnh, giữ quá 0,35 giây là quay video.
  function shutterDown() {
    if (!stream.current || sending !== null) return;
    pressed.current = true;
    holdTimer.current = setTimeout(() => {
      if (!stream.current) return;
      stopRec.current = record(stream.current, VIDEO_TYPE());
      setRec('video');
      sfx('rec'); buzz(20);
    }, 350);
  }
  async function shutterUp() {
    clearTimeout(holdTimer.current);
    if (stopRec.current) return finishRec();
    // Chỉ chụp khi ngón tay bấm xuống đúng nút này, không chụp khi lướt ngang qua.
    if (!pressed.current) return;
    pressed.current = false;
    if (!video.current || !stream.current) return;
    sfx('shutter'); buzz(15);
    const blob = await snap(video.current, facing === 'user');
    setDraft({ kind: 'photo', blob, url: URL.createObjectURL(blob) });
  }
  // Ngón tay trượt ra ngoài hoặc máy huỷ cú chạm: đang quay thì dừng và giữ đoạn đã quay, chưa quay thì thôi.
  function shutterCancel() {
    clearTimeout(holdTimer.current);
    pressed.current = false;
    if (stopRec.current) void finishRec();
  }

  async function finishRec() {
    const go = stopRec.current;
    stopRec.current = null;
    setRec(null);
    if (!go) return;
    sfx('rec');
    const r = await go().catch(() => null);
    if (!r) return;
    if (r.seconds < 1) return toast('Giữ lâu hơn để quay');
    setDraft({ kind: 'video', blob: r.blob, url: r.url, seconds: r.seconds });
  }

  async function pickFile(f?: File) {
    if (!f) return;
    const isVideo = f.type.startsWith('video');
    const blob = isVideo ? f : await shrinkImage(f);
    setDraft({ kind: isVideo ? 'video' : 'photo', blob, url: URL.createObjectURL(blob) });
  }

  async function send() {
    if (!draft || sending !== null) return;
    setSending(0);
    try {
      const f = new FormData();
      f.set('kind', draft.kind);
      f.set('file', draft.blob, fileName(draft.blob, draft.kind));
      if (caption.trim()) f.set('caption', caption.trim());
      if (meal) f.set('meal', 'true');
      if (draft.seconds) f.set('seconds', String(draft.seconds));
      await upload('/api/posts', f, (p) => setSending(p));
      setFlying(true);
      URL.revokeObjectURL(draft.url);
      setDraft(null); setCaption(''); setMeal(false);
      onSent();
    } catch (e) {
      // Giữ nguyên ảnh và dòng chữ để bấm gửi lại, không bắt chụp lại.
      toast((e as Error).message);
    } finally {
      setSending(null);
    }
  }

  if (flying) return <Letter onDone={() => setFlying(false)} />;

  const quiet = me.members.filter((m) => m.id !== me.me.id && hoursSince(m.lastSeen) > SILENT_HOURS);

  return (
    <div className="screen with-tabs cam-screen"
      onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => { if (!draft && !recording && touchY.current - e.changedTouches[0].clientY > 80) onOpen('feed'); }}>
      <div className="top">
        <div style={{ display: 'flex' }}>
          {me.members.slice(0, 4).map((m, i) => <div key={m.id} style={{ marginLeft: i ? -10 : 0, borderRadius: 99, border: '2px solid var(--bg)' }}><Avatar m={m} size={32} /></div>)}
        </div>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.family.name}</div>
        {draft && <button className="icon-btn" onClick={() => setDraft(null)} disabled={sending !== null} aria-label="Bỏ"><Icon name="close" /></button>}
      </div>

      {quiet.length > 0 && !draft && (
        <div className="banner fade">
          <span>{quiet[0].name} chưa mở app {Math.floor(hoursSince(quiet[0].lastSeen) / 24)} ngày rồi. Gọi hỏi thăm nhé.</span>
          {quiet[0].phone ? <a href={`tel:${quiet[0].phone}`}>Gọi</a> : <button className="banner-go" onClick={() => onOpen('family')}>Xem</button>}
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
              <button className="btn" onClick={() => void start()}>Bật camera</button>
              <div className="muted" style={{ marginTop: 12 }}>Hoặc chọn ảnh có sẵn ở nút bên dưới.</div>
            </div>
          </div>
        )}
        {draft && draft.kind !== 'voice' && <input className="cap-input" value={caption} maxLength={60} onChange={(e) => setCaption(e.target.value)} placeholder="Viết một dòng..." enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />}
        {rec === 'video' && <div className="cap-input" style={{ background: '#C8553F' }}>Đang quay {Math.floor(elapsed)}s / {MAX_VIDEO}s</div>}
      </div>

      {draft ? (
        <>
          <div className="chips" style={{ marginTop: 18 }}>
            <button className={`chip ${meal ? 'on' : ''}`} onClick={() => { tap(); setMeal(!meal); }}>Bữa cơm hôm nay</button>
          </div>
          <div className="shutter-row">
            <button className="icon-btn" onClick={() => setDraft(null)} disabled={sending !== null} aria-label="Làm lại"><Icon name="close" /></button>
            <button className="shutter" onClick={send} disabled={sending !== null} aria-label={sending !== null ? 'Đang gửi' : 'Gửi'} style={{ background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff' }}>
              {sending !== null ? <span className="send-pct">{Math.round(sending * 100)}%</span> : <Icon name="send" size={34} />}
            </button>
            <span style={{ width: 44 }} />
          </div>
        </>
      ) : (
        <>
          <div className="shutter-row">
            <label className="icon-btn" aria-label="Chọn ảnh trong máy">
              <Icon name="image" />
              <input type="file" accept="image/*,video/*" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button className={`shutter ${rec === 'video' ? 'rec' : ''}`} aria-label="Chạm để chụp, giữ để quay"
              onPointerDown={shutterDown} onPointerUp={shutterUp} onPointerLeave={shutterCancel} onPointerCancel={shutterCancel} onContextMenu={(e) => e.preventDefault()}>
              <i />
            </button>
            <button className="icon-btn" onClick={() => { tap(); setFacing(facing === 'user' ? 'environment' : 'user'); }} aria-label="Đổi camera"><Icon name="flip" /></button>
          </div>
          <button className={`talk ${talk.rec ? 'rec' : ''}`} onPointerDown={() => void talk.down()} onPointerUp={() => void talk.up()}
            onPointerLeave={() => void talk.up()} onPointerCancel={() => void talk.up()} onContextMenu={(e) => e.preventDefault()}>
            <Icon name="mic" size={20} /> {talk.rec ? `Đang nghe... ${Math.floor(elapsed)}s` : 'Giữ để nói với cả nhà'}
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
      <audio ref={audio} src={url} preload="metadata" onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onEnded={() => { setPlaying(false); setPos(0); }} />
      <button className="play" onClick={() => { if (playing) audio.current?.pause(); else void audio.current?.play().catch(() => {}); }} aria-label={playing ? 'Dừng' : 'Nghe'}>
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
