import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { cached } from './cache';
import { fileName, record, recordZoomed, shrinkImage, useHoldMic, VIDEO_TYPE, type Recording } from './media';
import { SHOT_OCCASIONS, thumb, type Me, type Post, type Shot, type ShotOccasion } from './shared';
import { buzz, tap } from './sound';
import { Letter } from './Letter';
import { Avatar, Icon, toast } from './ui';
import { t } from './i18n';
import { cssFilter, FILTERS, shoot } from './camShot';
import { SendTo, type Draft } from './SendTo';
import { memberName, OccasionIcon, OccasionPicker, occasionTitle, ShotStencil, type StencilSeat } from './GroupShot';
import { partOf, SHOT_MAX_OTHERS, shortName } from './shot';
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
// Công tắc trên khung ngắm sang "chụp chung" (docs/chup-chung.md): chọn dịp, chọn người chụp cùng, khung ngắm có ghế trống của từng người.
// invite: lời rủ mình chưa chụp, camera tự sang chụp chung và khoá dịp. pending: lượt mình đã chụp còn dở, có viên mở lại màn chờ.
export function Camera({ me, active = true, invite = null, pending = null, onOpen, onSent, onShot, onOpenShot, onSkipInvite, onShotsStale }: {
  me: Me; active?: boolean; invite?: Shot | null; pending?: Shot | null;
  onOpen: (s: 'feed' | 'jar' | 'family' | 'calendar' | 'settings') => void; onSent: () => void;
  onShot: (s: Shot) => void; onOpenShot: (s: Shot) => void; onSkipInvite: (id: string) => void; onShotsStale: () => void;
}) {
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

  // Chụp chung: dịp đang chọn, người chụp cùng (mặc định mọi người khác, tối đa 3), đang gửi ảnh tới đâu (0..1).
  const [mode, setMode] = useState<'photo' | 'group'>('photo');
  const [occasion, setOccasion] = useState<ShotOccasion>('mam-com');
  const [custom, setCustom] = useState('');
  const [picked, setPicked] = useState<string[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const occList = useRef<HTMLDivElement>(null);
  const group = !!invite || mode === 'group';
  const others = me.members.filter((m) => m.id !== me.me.id);
  const withIds = picked ? others.filter((m) => picked.includes(m.id)).map((m) => m.id) : others.slice(0, SHOT_MAX_OTHERS).map((m) => m.id);
  // Chip dịp đang chọn luôn nằm trong tầm nhìn của hàng chip.
  useLayoutEffect(() => {
    const el = occList.current, b = el?.querySelector<HTMLElement>('.on');
    if (el && b) el.scrollTo({ left: b.offsetLeft + b.offsetWidth / 2 - el.clientWidth / 2, behavior: 'smooth' });
  }, [occasion, mode]);

  function setGroup(on: boolean) {
    if (on === (mode === 'group')) return;
    tap();
    if (on && !others.length) return toast(t('camera.send.alone'));
    setMode(on ? 'group' : 'photo');
  }
  function toggleWith(id: string) {
    const on = withIds.includes(id);
    // Phải còn ít nhất một người chụp cùng; một ảnh tối đa 4 người.
    if (on && withIds.length === 1) return buzz(8);
    if (!on && withIds.length >= SHOT_MAX_OTHERS) return toast(t('shot.max'));
    tap();
    setPicked(on ? withIds.filter((x) => x !== id) : [...withIds, id]);
  }
  // Ảnh chụp chung gửi thẳng, không qua màn "gửi tới": có lời rủ thì thêm ảnh của mình, không thì tạo lượt mới.
  async function sendGroup(blob: Blob) {
    if (sending !== null) return;
    if (!invite && !withIds.length) return toast(t('camera.send.alone'));
    setSending(0);
    try {
      const f = new FormData();
      f.set('file', blob, fileName(blob, 'photo'));
      let r: { shot: Shot };
      if (invite) r = await api.shotPhoto(invite.id, f, setSending);
      else {
        f.set('occasion', occasion);
        if (occasion === 'tu-viet') f.set('custom', custom.trim());
        f.set('with', withIds.join(','));
        r = await api.shotCreate(f, setSending);
      }
      tap();
      onShot(r.shot);
    } catch (e) {
      // Lời báo của máy chủ đã đúng thứ tiếng. Lượt đã bắt đầu rửa (409) hoặc không còn (404): hỏi lại danh sách để bỏ lời rủ cũ.
      const status = (e as { status?: number }).status;
      if (invite && (status === 409 || status === 404)) onShotsStale();
      toast((e as Error).message);
    } finally {
      setSending(null);
    }
  }

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

  // Nút chụp: chạm nhanh là ảnh, giữ quá 0,35 giây là quay video. Chụp chung thì chỉ chụp ảnh, không quay.
  function shutterDown() {
    if (!stream.current || busy.current || sending !== null) return;
    pressed.current = true;
    if (group) return;
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
      // Chụp chung không dùng bộ lọc: AI cần màu thật của ảnh.
      const blob = await shoot(video.current, { mirror: facing === 'user', zoom: hw.current ? 1 : zoomNow.current, ops: group ? FILTERS[0].ops : FILTERS[filter].ops }).finally(off);
      if (group) void sendGroup(blob);
      else setDraft({ kind: 'photo', blob, url: URL.createObjectURL(blob) });
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
    if (group) {
      if (isVideo) return toast(t('shot.photoOnly'));
      return sendGroup(await shrinkImage(f));
    }
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
  // Đang quay thì tạm bỏ màu: video quay ra không có bộ lọc, nên khung ngắm hiện đúng như video sẽ gửi. Chụp chung cũng không có màu lọc.
  const look = rec || group ? 'none' : cssFilter(FILTERS[filter].ops);
  const vStyle: React.CSSProperties = { filter: look };
  if (!hw.current && zoom > 1) vStyle.transform = facing === 'user' ? `scale(${-zoom}, ${zoom})` : `scale(${zoom})`;

  // Ghế trên khung ngắm: có lời rủ thì là những người trong lượt (ai chụp rồi thì hiện ảnh), không thì là người đang chọn chụp cùng.
  const seats: StencilSeat[] = invite
    ? invite.parts.filter((p) => p.memberId !== me.me.id).slice(0, SHOT_MAX_OTHERS).map((p) => ({ name: memberName(me, p.memberId), photo: p.media }))
    : withIds.map((id) => ({ name: memberName(me, id) }));
  const by = invite ? me.members.find((m) => m.id === invite.byId) : undefined;
  const byPhoto = invite ? partOf(invite, invite.byId)?.media : null;
  const byName = invite ? memberName(me, invite.byId) : '';

  return (
    <>
      <div ref={root} className={`screen with-tabs cam-screen cam-ui ${rec ? 'is-rec' : ''} ${invite ? 'is-invite' : mode === 'group' ? 'is-group' : ''}`}
        onTouchStart={(e) => { touchY.current = e.touches[0].clientY; swipeOk.current = e.touches.length === 1; }}
        onTouchEnd={(e) => { if (swipeOk.current && !draft && !recording && touchY.current - e.changedTouches[0].clientY > 80) onOpen('feed'); }}>
        {invite ? (
          // Lời rủ: "An rủ mẹ chụp chung", dịp đã khoá, ảnh người rủ vừa chụp. Nút x để chụp ảnh thường.
          <div className="cam-invite">
            <Avatar m={by} size={40} />
            <div className="cam-invite-txt">
              <b>{t(`shot.invite.${me.me.role}`, { name: byName })}</b>
              <span className="hand">{occasionTitle(invite.occasion, invite.custom)}</span>
            </div>
            {byPhoto && <img className="cam-invite-pola" src={thumb(byPhoto, 160)} alt={t('shot.photoOf', { name: byName })} decoding="async" />}
            <button className="cam-invite-x" onClick={() => { tap(); onSkipInvite(invite.id); }} aria-label={t('shot.invite.later')}><Icon name="close" /></button>
          </div>
        ) : (
          <div className="cam-mode" role="group" aria-label={t('camera.mode')}>
            <button className={mode === 'photo' ? 'on' : ''} aria-pressed={mode === 'photo'} onClick={() => setGroup(false)}>{t('camera.mode.photo')}</button>
            <button className={mode === 'group' ? 'on' : ''} aria-pressed={mode === 'group'} onClick={() => setGroup(true)}>{t('camera.mode.group')}</button>
          </div>
        )}
        {mode === 'group' && !invite && (
          <div className="cam-occ">
            <div className="cam-occ-list" ref={occList} role="group" aria-label={t('shot.picker.title')}>
              {occasion === 'tu-viet' && (
                <button className="cam-chip on custom" aria-pressed="true" onClick={() => { tap(); setPicking(true); }}>
                  <OccasionIcon o="tu-viet" size={18} /><span>{custom}</span>
                </button>
              )}
              {SHOT_OCCASIONS.map((o) => (
                <button key={o} className={`cam-chip ${o === occasion ? 'on' : ''}`} aria-pressed={o === occasion} onClick={() => { tap(); setOccasion(o); }}>
                  {o === occasion && <OccasionIcon o={o} size={18} />}{t(`shot.occ.${o}`)}
                </button>
              ))}
            </div>
            <button className="cam-chip more" onClick={() => { tap(); setPicking(true); }}>{t('shot.more')}</button>
          </div>
        )}
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
            {!error && group && <ShotStencil occasion={invite ? invite.occasion : occasion} seats={seats} />}
            {!error && (
              <>
                <span className={`zoom-hint ${zoomHint ? 'on' : ''}`} aria-hidden="true">{fmtZoom(zoom)}</span>
                <div className="vf-ctl" onPointerDown={(e) => e.stopPropagation()}>
                  {canFlash
                    ? <button className={`vf-btn ${flash ? 'on' : ''}`} onClick={() => { tap(); setFlash(!flash); }} aria-pressed={flash} aria-label={t('camera.flash')}><FlashIcon on={flash} /></button>
                    : <span className="vf-btn-gap" />}
                  {/* Chụp chung: đáy khung là mâm của dịp, nên đèn và zoom lên trên; giữa là viên mở lại lượt mình đang chờ. */}
                  {!group
                    ? <FilterStrip value={filter} onChange={setFilter} />
                    : pending && !invite
                    ? <button className="cam-pending" onClick={() => { tap(); onOpenShot(pending); }}>{t(`shot.pending.${pending.status}`)}</button>
                    : <span className="vf-fill" />}
                  <button className="vf-btn vf-zoom" onClick={() => zoomStep(cycle)} aria-label={t('camera.zoomTo', { n: nextZoom })}>{zoomLabel(zoom)}</button>
                </div>
              </>
            )}
          </div>
        </div>

        {mode === 'group' && !invite && (
          <div className="cam-with">
            <span className="cam-with-label">{t('shot.with')}</span>
            <div className="cam-with-list">
              {others.map((m) => {
                const on = withIds.includes(m.id);
                return (
                  <button key={m.id} className={`cam-chip who ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggleWith(m.id)}>
                    <Avatar m={m} size={28} />{shortName(m.name)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="shutter-row">
          <label className="cam-gallery" aria-label={t('camera.pickAria')}>
            {lastShot && badShot !== lastShot ? <img src={thumb(lastShot, 160)} alt="" decoding="async" onError={() => setBadShot(lastShot)} /> : <Icon name="image" />}
            <input type="file" accept={group ? 'image/*' : 'image/*,video/*'} hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className={`shutter ${rec === 'video' ? 'rec' : ''}`} aria-label={group ? t('shot.shutterAria') : t('camera.shutterAria')} disabled={sending !== null}
            onPointerDown={shutterDown} onPointerUp={shutterUp} onPointerLeave={shutterCancel} onPointerCancel={shutterCancel} onContextMenu={(e) => e.preventDefault()}>
            <i /><u />
          </button>
          <button className="cam-round" onClick={() => { tap(); setSpin((n) => n + 1); setFacing(facing === 'user' ? 'environment' : 'user'); }} aria-label={t('camera.flip')}>
            <span style={{ transform: `rotate(${spin * 180}deg)` }}><Icon name="flip" /></span>
          </button>
        </div>
        {group ? (
          // Chụp chung: thay nút giữ để nói và gợi ý vuốt lên bằng một dòng viết tay (đang gửi thì là tiến độ).
          <p className="cam-line hand">
            {sending !== null ? t('camera.send.progress', { n: Math.round(sending * 100) }) : invite ? t(`shot.smile.${me.me.role}`) : t(`shot.line.${occasion}`)}
          </p>
        ) : (
          <>
            <button className={`talk ${talk.rec ? 'rec' : ''}`} onPointerDown={() => void talk.down()} onPointerUp={() => void talk.up()}
              onPointerLeave={() => void talk.up()} onPointerCancel={() => void talk.up()} onContextMenu={(e) => e.preventDefault()}>
              <Icon name="mic" /> {talk.rec ? t('camera.talk.listening') : t('camera.talk.hold')}
            </button>

            <button className={`cam-peek ${me.unseen > 0 ? 'new' : ''}`} onClick={() => onOpen('feed')}>
              <svg viewBox="0 0 22 12" aria-hidden="true"><path d="M3 9 11 3l8 6" /></svg>
              <span>{t('camera.peek')}{me.unseen > 0 && <> · <b className="hand">{t('camera.peek.new', { n: me.unseen })}</b></>}</span>
            </button>
          </>
        )}
      </div>
      {flashing && <div className="cam-ui cam-flash" aria-hidden="true" />}
      {draft && <SendTo me={me} draft={draft} onBack={discard} onSent={sent} />}
      {picking && (
        <OccasionPicker me={me} value={occasion} custom={custom} onClose={() => setPicking(false)}
          onPick={(o, c) => { setPicking(false); setOccasion(o); if (o === 'tu-viet') setCustom(c ?? ''); }} />
      )}
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

