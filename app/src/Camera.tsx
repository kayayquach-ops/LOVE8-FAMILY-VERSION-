import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cached } from './cache';
import { record, recordZoomed, shrinkImage, useHoldMic, VIDEO_TYPE, type Recording } from './media';
import { thumb, type Me, type Post } from './shared';
import { buzz, tap } from './sound';
import { Letter } from './Letter';
import { Icon, toast } from './ui';
import { t } from './i18n';
import { cssFilter, FILTERS, shoot } from './camShot';
import { SendTo, type Draft } from './SendTo';
import './camera.css';

export { VoiceDot } from './SendTo';

const MAX_VIDEO = 15;
const MAX_DIGITAL = 5, MAX_HW = 10;
// Khoảng hở quanh khung khi đang quay, chỗ đường tiến độ chạy (px).
const REC_GAP = 7;
const fmtZoom = (z: number) => `${z.toFixed(1)}×`;
// Nút zoom một chạm kiểu YOPE: "1×", "2×", ".5×"; zoom bằng hai ngón thì hiện số lẻ "1.4×".
const zoomLabel = (z: number) => `${z < 0.95 ? `.${Math.round(z * 10)}` : Math.abs(z - Math.round(z)) < 0.05 ? Math.round(z) : z.toFixed(1)}×`;
// Tên ngắn trong viên trên cùng: tên đầy đủ ba chữ trở lên (Nguyễn Văn An) thì lấy chữ cuối; "Mẹ Lan", "Bố An" giữ nguyên.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Màn chính kiểu YOPE/Locket: mở ra là camera, nền tối dù app đang sáng. Chạm để chụp, giữ để quay. Giữ nút dưới để nói.
export function Camera({ me, active = true, onOpen, onSent }: { me: Me; active?: boolean; onOpen: (s: 'feed' | 'jar' | 'family' | 'calendar' | 'settings') => void; onSent: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [spin, setSpin] = useState(0);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flying, setFlying] = useState(false);
  const [rec, setRec] = useState<'video' | null>(null);
  const [filter, setFilter] = useState(0);
  const [flash, setFlash] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [blink, setBlink] = useState(0);
  const busy = useRef(false);
  const torch = useRef(false);
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
  // Một nút zoom như YOPE: chạm lần lượt 1× → 2× (→ .5× nếu máy có ống góc rộng) → 1×.
  function zoomStep(cycle: number[]) {
    tap();
    if (stopRec.current && !hw.current) return;
    const i = cycle.findIndex((z) => Math.abs(zoomNow.current - z) < 0.05);
    setZ(i < 0 ? 1 : cycle[(i + 1) % cycle.length]); showHint();
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
      // Về 1× mỗi lần bật hay đổi camera; dò xem track có zoom phần cứng, có đèn (camera sau) không.
      pointers.current.clear(); pinch.current = null;
      const cap = (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number }; torch?: boolean | boolean[] };
      hw.current = cap.zoom && cap.zoom.max > cap.zoom.min ? { min: cap.zoom.min, max: cap.zoom.max } : null;
      torch.current = Array.isArray(cap.torch) ? cap.torch.includes(true) : !!cap.torch;
      zoomNow.current = 1; setZoom(1);
      if (hw.current) void s.getVideoTracks()[0].applyConstraints({ advanced: [{ zoom: Math.max(1, hw.current.min) } as MediaTrackConstraintSet] }).catch(() => {});
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setError('');
    } catch {
      if (my === gen.current) setError(t('camera.noAccess'));
    }
  }

  // Camera chỉ bật khi đang nhìn thấy màn này. Mở tin nhà, gọi video hay ẩn app thì tắt: iPhone chỉ cho một nơi dùng camera,
  // và quay lại từ nền thì luồng cũ thường đã chết, màn hình đen. Đang ở màn "gửi tới" cũng tắt cho đỡ pin.
  const live = active && !draft && !flying;
  useEffect(() => {
    if (!live) { stopCam(); return; }
    void start();
    const onVis = () => { if (document.hidden) { if (!stopRec.current) stopCam(); } else if (!stream.current) void start(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); };
  }, [facing, live]);
  useEffect(() => () => { clearTimeout(holdTimer.current); clearTimeout(maxTimer.current); stopCam(); }, []);

  // Camera luôn tối: lúc đang mở thì thanh trạng thái iPhone (theme-color) cũng tối theo, rời màn thì trả lại màu cũ.
  useEffect(() => {
    if (!active || flying || !root.current) return;
    const bg = getComputedStyle(root.current).getPropertyValue('--cam-bg').trim();
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    if (!bg || !metas.length) return;
    const prev = metas.map((m) => m.content);
    metas.forEach((m) => { m.content = bg; });
    return () => metas.forEach((m, i) => { m.content = prev[i]; });
  }, [active, flying]);

  const recording = rec ?? (talk.rec ? 'voice' : null);
  // Ô ảnh cạnh nút chụp: ảnh gần nhất mình đã gửi (lấy từ bản lưu tin nhà), chưa có thì là hình bức ảnh. Mỗi lần quay về camera thì xem lại.
  const lastShot = useMemo(() => cached<Post[]>('feed')?.find((p) => p.authorId === me.me.id && p.kind === 'photo' && p.media)?.media ?? null, [active, me.me.id]);
  // Ảnh thu nhỏ chưa dựng được thì hiện hình bức ảnh, không để ô vỡ.
  const [badShot, setBadShot] = useState<string | null>(null);

  function setTorch(on: boolean) {
    const track = stream.current?.getVideoTracks()[0];
    if (track && torch.current) return track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => {});
  }
  // Đèn: camera trước thì màn hình sáng trắng một nhịp rọi mặt (như iPhone), camera sau thì bật đèn máy nếu trình duyệt cho.
  async function lightUp(): Promise<() => void> {
    if (!flash) return () => {};
    if (facing === 'user') { setFlashing(true); await wait(240); return () => setFlashing(false); }
    if (!torch.current) return () => {};
    await setTorch(true); await wait(350);
    return () => void setTorch(false);
  }

  // Nút chụp: chạm nhanh là ảnh, giữ quá 0,35 giây là quay video.
  function shutterDown() {
    if (!stream.current || busy.current) return;
    pressed.current = true;
    holdTimer.current = setTimeout(() => {
      if (!stream.current) return;
      const v = video.current, el = finder.current;
      // Khung lùi vào đều 7px mỗi cạnh để lộ đường tiến độ (chỉ scale, không đổi kích thước thật).
      if (el) { el.style.setProperty('--sx', String(1 - (2 * REC_GAP) / el.clientWidth)); el.style.setProperty('--sy', String(1 - (2 * REC_GAP) / el.clientHeight)); }
      stopRec.current = v && !hw.current && zoomNow.current > 1.001
        ? recordZoomed(stream.current, v, () => zoomNow.current, VIDEO_TYPE())
        : record(stream.current, VIDEO_TYPE());
      setRec('video');
      if (flash && facing === 'environment') void setTorch(true);
      buzz(12);
      maxTimer.current = setTimeout(() => void finishRec(), MAX_VIDEO * 1000);
      // Safari iOS hay làm khung xem trước đứng hình khi bắt đầu ghi cùng luồng: bật lại nếu bị dừng.
      if (v?.paused) void v.play().catch(() => {});
    }, 350);
  }
  async function shutterUp() {
    clearTimeout(holdTimer.current);
    if (stopRec.current) { pressed.current = false; return finishRec(); }
    // Chỉ chụp khi ngón tay bấm xuống đúng nút này, không chụp khi lướt ngang qua.
    if (!pressed.current) return;
    pressed.current = false;
    if (!video.current || !stream.current || busy.current) return;
    busy.current = true;
    buzz(12);
    try {
      const off = await lightUp();
      setBlink((n) => n + 1);
      const blob = await shoot(video.current, { mirror: facing === 'user', zoom: hw.current ? 1 : zoomNow.current, ops: FILTERS[filter].ops }).finally(off);
      setDraft({ kind: 'photo', blob, url: URL.createObjectURL(blob) });
    } catch {
      toast(t('common.error'));
    } finally {
      busy.current = false;
    }
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
    if (flash && facing === 'environment') void setTorch(false);
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

  function discard() {
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft(null);
  }
  function sent() {
    setFlying(true);
    discard();
    onSent();
  }

  if (flying) return <Letter onDone={() => setFlying(false)} />;

  const cycle = hw.current && hw.current.min < 0.95 ? [1, 2, hw.current.min] : [1, 2];
  const nextZoom = cycle[(cycle.findIndex((z) => Math.abs(zoom - z) < 0.05) + 1) % cycle.length] ?? 1;
  // Đèn chỉ hiện khi dùng được: camera trước luôn được (màn hình sáng), camera sau cần trình duyệt cho bật đèn.
  const canFlash = facing === 'user' || torch.current;
  // Đang quay thì tạm bỏ màu: video quay ra không có bộ lọc, nên khung ngắm hiện đúng như video sẽ gửi.
  const look = rec ? 'none' : cssFilter(FILTERS[filter].ops);
  const vStyle: React.CSSProperties = { filter: look };
  if (!hw.current && zoom > 1) vStyle.transform = facing === 'user' ? `scale(${-zoom}, ${zoom})` : `scale(${zoom})`;

  return (
    <>
      <div ref={root} className={`screen with-tabs cam-screen cam-ui ${rec ? 'is-rec' : ''}`}
        onTouchStart={(e) => { touchY.current = e.touches[0].clientY; swipeOk.current = e.touches.length === 1; }}
        onTouchEnd={(e) => { if (swipeOk.current && !draft && !recording && touchY.current - e.changedTouches[0].clientY > 80) onOpen('feed'); }}>
        <div className="viewfinder" ref={finder} style={{ '--rec-half': `${MAX_VIDEO / 2}s` } as React.CSSProperties}
          onPointerDown={onFinderDown} onPointerMove={onFinderMove} onPointerUp={onFinderUp} onPointerCancel={onFinderUp}>
          {rec === 'video' && <div className="vf-prog" aria-hidden="true"><i className="vf-half r"><b /></i><i className="vf-half l"><b /></i></div>}
          <div className="vf-inner">
            <video ref={video} className={facing === 'user' ? 'mirror' : ''} style={vStyle} muted playsInline autoPlay
              onPause={(e) => { if (stream.current) void e.currentTarget.play().catch(() => {}); }} />
            {blink > 0 && <span key={blink} className="vf-blink" aria-hidden="true" />}
            {error && (
              <div className="vf-off">
                <p>{error}</p>
                <button className="vf-on" onClick={() => void start()}>{t('camera.turnOn')}</button>
                <small>{t('camera.orPick')}</small>
              </div>
            )}
            {rec === 'video' && <span className="rec-dot" aria-hidden="true" />}
            {!error && (
              <>
                <span className={`zoom-hint ${zoomHint ? 'on' : ''}`} aria-hidden="true">{fmtZoom(zoom)}</span>
                <div className="vf-ctl" onPointerDown={(e) => e.stopPropagation()}>
                  {canFlash
                    ? <button className={`vf-btn ${flash ? 'on' : ''}`} onClick={() => { tap(); setFlash(!flash); }} aria-pressed={flash} aria-label={t('camera.flash')}><FlashIcon on={flash} /></button>
                    : <span className="vf-btn-gap" />}
                  <FilterStrip value={filter} onChange={setFilter} />
                  <button className="vf-btn vf-zoom" onClick={() => zoomStep(cycle)} aria-label={t('camera.zoomTo', { n: nextZoom })}>{zoomLabel(zoom)}</button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="shutter-row">
          <label className="cam-gallery" aria-label={t('camera.pickAria')}>
            {lastShot && badShot !== lastShot ? <img src={thumb(lastShot, 160)} alt="" decoding="async" onError={() => setBadShot(lastShot)} /> : <Icon name="image" />}
            <input type="file" accept="image/*,video/*" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className={`shutter ${rec === 'video' ? 'rec' : ''}`} aria-label={t('camera.shutterAria')}
            onPointerDown={shutterDown} onPointerUp={shutterUp} onPointerLeave={shutterCancel} onPointerCancel={shutterCancel} onContextMenu={(e) => e.preventDefault()}>
            <i /><u />
          </button>
          <button className="cam-round" onClick={() => { tap(); setSpin((n) => n + 1); setFacing(facing === 'user' ? 'environment' : 'user'); }} aria-label={t('camera.flip')}>
            <span style={{ transform: `rotate(${spin * 180}deg)` }}><Icon name="flip" /></span>
          </button>
        </div>
        <button className={`talk ${talk.rec ? 'rec' : ''}`} onPointerDown={() => void talk.down()} onPointerUp={() => void talk.up()}
          onPointerLeave={() => void talk.up()} onPointerCancel={() => void talk.up()} onContextMenu={(e) => e.preventDefault()}>
          <Icon name="mic" /> {talk.rec ? t('camera.talk.listening') : t('camera.talk.hold')}
        </button>

        <button className={`cam-peek ${me.unseen > 0 ? 'new' : ''}`} onClick={() => onOpen('feed')}>
          <svg viewBox="0 0 22 12" aria-hidden="true"><path d="M3 9 11 3l8 6" /></svg>
          <span>{t('camera.peek')}{me.unseen > 0 && <> · <b className="hand">{t('camera.peek.new', { n: me.unseen })}</b></>}</span>
        </button>
      </div>
      {flashing && <div className="cam-ui cam-flash" aria-hidden="true" />}
      {draft && <SendTo me={me} draft={draft} onBack={discard} onSent={sent} />}
    </>
  );
}

/** Dải bộ lọc vuốt ngang ở đáy khung, tên nào nằm giữa là đang dùng (như YOPE). Chạm một tên thì cuộn nó vào giữa. */
function FilterStrip({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const items = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
  const center = (b: HTMLElement, smooth: boolean) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: b.offsetLeft + b.offsetWidth / 2 - el.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
  };
  useLayoutEffect(() => { const b = items()[value]; if (b) center(b, false); }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  function onScroll() {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = value, bd = Infinity;
      items().forEach((b, i) => { const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
      if (best !== value) { buzz(6); onChange(best); }
    });
  }
  return (
    <div className="vf-filters" ref={ref} onScroll={onScroll} role="group" aria-label={t('camera.filters')}>
      <span className="vf-pad" />
      {FILTERS.map((f, i) => (
        <button key={f.id} className={i === value ? 'on' : ''} aria-pressed={i === value} onClick={(e) => center(e.currentTarget, true)}>
          {t(`camera.filter.${f.id}`)}
        </button>
      ))}
      <span className="vf-pad" />
    </div>
  );
}

function FlashIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.5 3 6 13.5h5.5L10.5 21 18 10.5h-5.5z" />
      {!on && <path d="M4 4l16 16" fill="none" />}
    </svg>
  );
}

