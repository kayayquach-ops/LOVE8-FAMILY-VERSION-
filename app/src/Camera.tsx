import { useEffect, useMemo, useRef, useState } from 'react';
import { upload } from './api';
import { cached } from './cache';
import { fileName, record, recordZoomed, shrinkImage, snap, useHoldMic, VIDEO_TYPE, type Recording } from './media';
import { SILENT_HOURS, thumb, type Me, type Member, type Post } from './shared';
import { buzz, tap } from './sound';
import { Letter } from './Letter';
import { hoursSince, localTime } from './time';
import { Avatar, Icon, toast } from './ui';
import { t } from './i18n';
import './camera.css';

type Draft = { kind: 'photo' | 'video' | 'voice'; blob: Blob; url: string; seconds?: number };
const MAX_VIDEO = 15;
const MAX_DIGITAL = 5, MAX_HW = 10;
const fmtZoom = (z: number) => `${z.toFixed(1)}×`;
// Nút zoom kiểu camera điện thoại: ".5", "1×", "2"; nút đang chọn mới có dấu ×.
const zoomLabel = (z: number, on: boolean) => `${z < 1 ? `.${Math.round(z * 10)}` : z}${on ? '×' : ''}`;
// Tên ngắn trong viên trên cùng: tên đầy đủ ba chữ trở lên (Nguyễn Văn An) thì lấy chữ cuối; "Mẹ Lan", "Bố An" giữ nguyên.
const shortName = (n: string) => { const w = n.trim().split(/\s+/); return w.length > 2 ? w[w.length - 1] : n.trim(); };

// Màn chính kiểu Locket: mở ra là camera. Chạm để chụp, giữ để quay. Giữ nút dưới để nói.
export function Camera({ me, active = true, onOpen, onSent }: { me: Me; active?: boolean; onOpen: (s: 'feed' | 'jar' | 'family' | 'calendar' | 'settings') => void; onSent: () => void }) {
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
  const stopRec = useRef<(() => Promise<Recording>) | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const maxTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touchY = useRef(0);
  const swipeOk = useRef(false);
  const finder = useRef<HTMLDivElement>(null);
  // Zoom: phần cứng (Android Chrome) nếu track cho phép, không thì phóng số bằng transform và cắt đúng vùng đó khi chụp, quay.
  const [zoom, setZoom] = useState(1);
  const [zoomHint, setZoomHint] = useState(false);
  const zoomNow = useRef(1);
  const hw = useRef<{ min: number; max: number } | null>(null);
  const hwNext = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gen = useRef(0);
  const pressed = useRef(false);
  const talk = useHoldMic((r) => setDraft({ kind: 'voice', blob: r.blob, url: r.url, seconds: r.seconds }), () => stream.current);

  function setZ(z: number) {
    const lo = hw.current?.min ?? 1, hi = hw.current ? Math.min(hw.current.max, MAX_HW) : MAX_DIGITAL;
    z = Math.min(hi, Math.max(lo, z));
    zoomNow.current = z;
    setZoom(z);
    const track = stream.current?.getVideoTracks()[0];
    if (hw.current && track && hwNext.current === null) {
      hwNext.current = z;
      requestAnimationFrame(() => {
        const v = hwNext.current; hwNext.current = null;
        if (v !== null) void track.applyConstraints({ advanced: [{ zoom: v } as MediaTrackConstraintSet] }).catch(() => {});
      });
    }
  }
  function showHint() {
    setZoomHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setZoomHint(false), 900);
  }
  function pinchStart() {
    const [a, b] = [...pointers.current.values()];
    pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoomNow.current };
  }
  function onFinderDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinchStart(); else pinch.current = null;
  }
  function onFinderMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size !== 2 || !pinch.current || (stopRec.current && !hw.current)) return;
    const [a, b] = [...pointers.current.values()];
    setZ(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d));
    showHint();
  }
  function onFinderUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 2) pinchStart(); else pinch.current = null;
  }
  function zoomTo(z: number) {
    tap();
    if (stopRec.current && !hw.current) return;
    setZ(z); showHint();
  }
  // iPhone còn có cử chỉ chụm riêng của trang (gesturestart): chặn để không phóng cả trang.
  useEffect(() => {
    const el = finder.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', stop); el.addEventListener('gesturechange', stop);
    return () => { el.removeEventListener('gesturestart', stop); el.removeEventListener('gesturechange', stop); };
  }, []);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

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
      // Về 1× mỗi lần bật hay đổi camera; dò xem track có zoom phần cứng không.
      pointers.current.clear(); pinch.current = null;
      const cap = (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } };
      hw.current = cap.zoom && cap.zoom.max > cap.zoom.min ? { min: cap.zoom.min, max: cap.zoom.max } : null;
      zoomNow.current = 1; setZoom(1);
      if (hw.current) void s.getVideoTracks()[0].applyConstraints({ advanced: [{ zoom: Math.max(1, hw.current.min) } as MediaTrackConstraintSet] }).catch(() => {});
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setError('');
    } catch {
      if (my === gen.current) setError(t('camera.noAccess'));
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
  useEffect(() => () => { clearTimeout(holdTimer.current); clearTimeout(maxTimer.current); stopCam(); }, []);

  const recording = rec ?? (talk.rec ? 'voice' : null);
  // Ô ảnh cạnh nút chụp: ảnh gần nhất mình đã gửi (lấy từ bản lưu tin nhà), chưa có thì là hình bức ảnh. Mỗi lần quay về camera thì xem lại.
  const lastShot = useMemo(() => cached<Post[]>('feed')?.find((p) => p.authorId === me.me.id && p.kind === 'photo' && p.media)?.media ?? null, [active, me.me.id]);

  // Nút chụp: chạm nhanh là ảnh, giữ quá 0,35 giây là quay video.
  function shutterDown() {
    if (!stream.current || sending !== null) return;
    pressed.current = true;
    holdTimer.current = setTimeout(() => {
      if (!stream.current) return;
      const v = video.current;
      stopRec.current = v && !hw.current && zoomNow.current > 1.001
        ? recordZoomed(stream.current, v, () => zoomNow.current, VIDEO_TYPE())
        : record(stream.current, VIDEO_TYPE());
      setRec('video');
      buzz(12);
      maxTimer.current = setTimeout(() => void finishRec(), MAX_VIDEO * 1000);
      // Safari iOS hay làm khung xem trước đứng hình khi bắt đầu ghi cùng luồng: bật lại nếu bị dừng.
      if (v?.paused) void v.play().catch(() => {});
    }, 350);
  }
  async function shutterUp() {
    clearTimeout(holdTimer.current);
    if (stopRec.current) return finishRec();
    // Chỉ chụp khi ngón tay bấm xuống đúng nút này, không chụp khi lướt ngang qua.
    if (!pressed.current) return;
    pressed.current = false;
    if (!video.current || !stream.current) return;
    buzz(12);
    const blob = await snap(video.current, facing === 'user', hw.current ? 1 : zoomNow.current);
    setDraft({ kind: 'photo', blob, url: URL.createObjectURL(blob) });
  }
  // Ngón tay trượt ra ngoài hoặc máy huỷ cú chạm: đang quay thì dừng và giữ đoạn đã quay, chưa quay thì thôi.
  function shutterCancel() {
    clearTimeout(holdTimer.current);
    pressed.current = false;
    if (stopRec.current) void finishRec();
  }

  async function finishRec() {
    clearTimeout(maxTimer.current);
    const go = stopRec.current;
    stopRec.current = null;
    setRec(null);
    if (!go) return;
    const r = await go().catch(() => null);
    if (!r) return;
    if (r.seconds < 1) return toast(t('camera.holdLonger'));
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
  const note = quiet.length > 0 && !draft;
  const zooms = hw.current && hw.current.min < 0.95 ? [hw.current.min, 1, 2] : [1, 2];

  return (
    <div className={`screen with-tabs cam-screen cam-ui ${note ? 'has-note' : ''}`}
      onTouchStart={(e) => { touchY.current = e.touches[0].clientY; swipeOk.current = e.touches.length === 1; }}
      onTouchEnd={(e) => { if (swipeOk.current && !draft && !recording && touchY.current - e.changedTouches[0].clientY > 80) onOpen('feed'); }}>
      <div className="cam-fam">
        <FamilyRow members={me.members} />
        {draft
          ? <button className="cam-set" onClick={() => setDraft(null)} disabled={sending !== null} aria-label={t('camera.discard')}><Icon name="close" /></button>
          : <button className="cam-set" onClick={() => onOpen('settings')} aria-label={t('settings.title')}><Icon name="sliders" /></button>}
      </div>

      {note && (
        <div className="cam-note fade">
          <Avatar m={quiet[0]} size={26} />
          <span>{t('camera.quiet', { name: quiet[0].name, days: Math.floor(hoursSince(quiet[0].lastSeen) / 24) })}</span>
          {quiet[0].phone ? <a href={`tel:${quiet[0].phone}`}>{t('camera.quiet.call')}</a> : <button onClick={() => onOpen('family')}>{t('camera.quiet.view')}</button>}
        </div>
      )}

      <div className="viewfinder" ref={finder} onPointerDown={onFinderDown} onPointerMove={onFinderMove} onPointerUp={onFinderUp} onPointerCancel={onFinderUp}>
        {draft?.kind === 'photo' && <img src={draft.url} alt="" />}
        {draft?.kind === 'video' && <video src={draft.url} autoPlay loop playsInline />}
        {draft?.kind === 'voice' && (
          <div className="cam-voice">
            <VoiceDot url={draft.url} seconds={draft.seconds} />
          </div>
        )}
        {!draft && <video ref={video} className={facing === 'user' ? 'mirror' : ''} style={hw.current || zoom <= 1 ? undefined : { transform: facing === 'user' ? `scale(${-zoom}, ${zoom})` : `scale(${zoom})` }} muted playsInline autoPlay onPause={(e) => { if (stream.current) void e.currentTarget.play().catch(() => {}); }} />}
        {!draft && error && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 30, textAlign: 'center' }}>
            <div>
              <div className="muted" style={{ marginBottom: 14 }}>{error}</div>
              <button className="btn" onClick={() => void start()}>{t('camera.turnOn')}</button>
              <div className="muted" style={{ marginTop: 12 }}>{t('camera.orPick')}</div>
            </div>
          </div>
        )}
        {draft && draft.kind !== 'voice' && <input className="cap-input" value={caption} maxLength={60} onChange={(e) => setCaption(e.target.value)} placeholder={t('camera.captionPlaceholder')} enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />}
        {rec === 'video' && <span className="rec-dot" aria-hidden="true" />}
        {!draft && !error && (
          <>
            <span className={`zoom-hint ${zoomHint ? 'on' : ''}`} aria-hidden="true">{fmtZoom(zoom)}</span>
            <div className="zoom-pills">
              {zooms.map((z) => {
                const on = Math.abs(zoom - z) < 0.05;
                return <button key={z} className={on ? 'on' : ''} onClick={() => zoomTo(z)} onPointerDown={(e) => e.stopPropagation()} aria-label={t('camera.zoomTo', { n: z })}>{zoomLabel(z, on)}</button>;
              })}
            </div>
          </>
        )}
      </div>

      {draft ? (
        <>
          <div className="chips">
            <button className={`chip ${meal ? 'on' : ''}`} onClick={() => { tap(); setMeal(!meal); }}>{t('camera.meal')}</button>
          </div>
          <div className="shutter-row">
            <button className="cam-round" onClick={() => setDraft(null)} disabled={sending !== null} aria-label={t('camera.redo')}><Icon name="close" /></button>
            <button className="shutter send" onClick={send} disabled={sending !== null} aria-label={sending !== null ? t('camera.sending') : t('common.send')}>
              {sending !== null ? <span className="send-pct">{Math.round(sending * 100)}%</span> : <Icon name="send" />}
            </button>
            <span />
          </div>
        </>
      ) : (
        <>
          <div className="shutter-row">
            <label className="cam-gallery" aria-label={t('camera.pickAria')}>
              {lastShot ? <img src={thumb(lastShot, 160)} alt="" decoding="async" /> : <Icon name="image" />}
              <input type="file" accept="image/*,video/*" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button className={`shutter ${rec === 'video' ? 'rec' : ''}`} aria-label={t('camera.shutterAria')}
              onPointerDown={shutterDown} onPointerUp={shutterUp} onPointerLeave={shutterCancel} onPointerCancel={shutterCancel} onContextMenu={(e) => e.preventDefault()}>
              <svg className="shutter-ring" viewBox="0 0 78 78" aria-hidden="true"><circle cx="39" cy="39" r="37" /></svg>
              <i />
            </button>
            <button className="cam-round" onClick={() => { tap(); setFacing(facing === 'user' ? 'environment' : 'user'); }} aria-label={t('camera.flip')}><Icon name="flip" /></button>
          </div>
          <button className={`talk ${talk.rec ? 'rec' : ''}`} onPointerDown={() => void talk.down()} onPointerUp={() => void talk.up()}
            onPointerLeave={() => void talk.up()} onPointerCancel={() => void talk.up()} onContextMenu={(e) => e.preventDefault()}>
            <Icon name="mic" /> {talk.rec ? t('camera.talk.listening') : t('camera.talk.hold')}
          </button>
        </>
      )}

      <button className={`cam-peek ${me.unseen > 0 ? 'new' : ''}`} onClick={() => onOpen('feed')}>
        <svg viewBox="0 0 22 12" aria-hidden="true"><path d="M3 9 11 3l8 6" /></svg>
        <span>{t('camera.peek')}{me.unseen > 0 && <> · <b className="hand">{t('camera.peek.new', { n: me.unseen })}</b></>}</span>
      </button>
    </div>
  );
}

/** Hàng trên cùng: mỗi người một viên, kèm giờ nơi người đó đang ở. Tự vẽ lại nửa phút một lần cho giờ chạy đúng (chỉ hàng này, không vẽ lại cả camera). */
function FamilyRow({ members }: { members: Member[] }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) tick((n) => n + 1); }, 30000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="cam-fam-list">
      {members.map((m) => (
        <span key={m.id} className="cam-who"><Avatar m={m} size={26} /><b>{shortName(m.name)}</b>{localTime(m.city)}</span>
      ))}
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
      <button className="play" onClick={() => { if (playing) audio.current?.pause(); else void audio.current?.play().catch(() => {}); }} aria-label={playing ? t('common.stop') : t('common.listen')}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div className="bars">
        {Array.from({ length: 22 }, (_, i) => (
          <i key={i} className={seconds && pos / seconds > i / 22 ? 'on' : ''} style={{ height: 8 + Math.abs(Math.sin(i * 1.7)) * 26 + (i % 3) * 3 }} />
        ))}
      </div>
      <div style={{ fontSize: 14 }}>{seconds ? t('common.seconds', { n: Math.round(seconds) }) : ''}</div>
    </>
  );
}
