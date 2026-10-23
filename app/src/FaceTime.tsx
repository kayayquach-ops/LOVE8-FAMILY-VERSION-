import { useEffect, useReducer, useRef, useState } from 'react';
import { api } from './api';
import { drawBooth, H, THEMES, W, type Tile } from './booth';
import { livePost, onLive, type LiveMsg, type LiveRoom } from './live';
import type { Me } from './shared';
import { buzz, sfx, tap } from './sound';
import { Avatar, Icon, toast } from './ui';

type Peer = { pc: RTCPeerConnection; stream: MediaStream | null; cam: boolean; mic: boolean; state: string };
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const nameOf = (me: Me, id: string) => (id === me.me.id ? 'Mình' : me.members.find((m) => m.id === id)?.name ?? 'Ai đó');

/** Không mở được camera (máy chặn, máy tính không có) thì vẫn lên hình bằng một ô chữ cái đầu tên, có micro nếu được. */
function fakeVideo(name: string) {
  const cv = document.createElement('canvas');
  cv.width = 480; cv.height = 640;
  const c = cv.getContext('2d')!;
  const letter = (name.trim().split(/\s+/).pop()?.[0] ?? '?').toUpperCase();
  const stream = cv.captureStream(12);
  const draw = () => {
    const t = Date.now() / 1000;
    const g = c.createLinearGradient(0, 0, 480, 640);
    g.addColorStop(0, '#F1E2D8'); g.addColorStop(1, '#D9D2E0');
    c.fillStyle = g; c.fillRect(0, 0, 480, 640);
    c.fillStyle = 'rgba(154,90,68,.18)';
    c.beginPath(); c.arc(240, 300, 120 + Math.sin(t * 1.6) * 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9A5A44'; c.font = '600 120px BVP, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(letter, 240, 306);
  };
  draw();
  const timer = setInterval(() => {
    if (stream.getVideoTracks()[0]?.readyState === 'ended') return clearInterval(timer);
    draw();
  }, 1000 / 12);
  return stream;
}

async function getMedia(name: string): Promise<{ stream: MediaStream; fake: boolean }> {
  const md = navigator.mediaDevices;
  try {
    const s = await md.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: AUDIO });
    return { stream: s, fake: false };
  } catch {}
  let audio: MediaStream | null = null;
  try { audio = await md.getUserMedia({ audio: AUDIO }); } catch {}
  const v = fakeVideo(name);
  return { stream: new MediaStream([...v.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])]), fake: true };
}

/** Chuông gọi video đến: ai đó trong nhà vừa gọi, hoặc cả nhà đang gọi dở. */
export function Incoming({ me, room, onAccept, onDecline }: { me: Me; room: NonNullable<LiveRoom>; onAccept: () => void; onDecline: (missed: boolean) => void }) {
  const caller = me.members.find((m) => m.id === room.by) ?? me.members.find((m) => room.members.includes(m.id));
  const others = room.members.filter((id) => id !== me.me.id);
  useEffect(() => {
    const ring = () => { sfx('hello'); buzz(400); };
    ring();
    const t = setInterval(ring, 3200);
    const miss = setTimeout(() => onDecline(true), 45000);
    return () => { clearInterval(t); clearTimeout(miss); };
  }, [room.id]);
  return (
    <div className="sheet call ft-ring">
      <div className="call-ring fade">
        <div className="call-orb"><i /><i /><b><Avatar m={caller} size={96} /></b></div>
        <div className="call-who">{caller?.name ?? 'Nhà mình'} đang gọi</div>
        <div className="call-sub">{others.length > 1 ? `${others.length} người đang trò chuyện` : 'Gọi video cả nhà'}</div>
        <div style={{ flex: 1 }} />
        <div className="call-actions">
          <button className="call-btn later" onClick={() => { tap(); void livePost('decline').catch(() => {}); onDecline(false); }}><Icon name="close" size={26} /><span>Để sau</span></button>
          <button className="call-btn pick" onClick={() => { tap(); onAccept(); }}><Icon name="video" size={26} /><span>Nghe</span></button>
        </div>
      </div>
    </div>
  );
}

/** Gọi video cả nhà: mỗi người nối thẳng với từng người còn lại (WebRTC), máy chủ chỉ chuyển lời mời. */
export function FaceTime({ me, onClose }: { me: Me; onClose: () => void }) {
  const meId = me.me.id;
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [fake, setFake] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [booth, setBooth] = useState(false);
  const [smile, setSmile] = useState(0);
  const localRef = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const pending = useRef(new Map<string, RTCIceCandidateInit[]>());
  const ice = useRef<RTCIceServer[]>([]);
  const joined = useRef(false);
  const ended = useRef(false);
  const state = useRef({ mic: true, cam: true });
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const counted = useRef(false);

  const signal = (to: string, data: unknown) => livePost('signal', { to, data }).catch(() => {});

  function close(id: string) {
    const p = peers.current.get(id);
    if (!p) return;
    p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null;
    p.pc.close();
    peers.current.delete(id);
    bump();
  }

  function makePeer(id: string) {
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    const s = localRef.current;
    s?.getTracks().forEach((t) => pc.addTrack(t, s));
    const p: Peer = { pc, stream: null, cam: true, mic: true, state: 'new' };
    pc.onicecandidate = (e) => { if (e.candidate) void signal(id, { candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      if (e.streams[0]) p.stream = e.streams[0];
      else { p.stream ??= new MediaStream(); p.stream.addTrack(e.track); }
      bump();
    };
    pc.onconnectionstatechange = () => {
      p.state = pc.connectionState;
      if (pc.connectionState === 'connected') {
        void signal(id, { state: state.current });
        if (!counted.current) { counted.current = true; api.mission('call').catch(() => {}); }
      }
      // Rớt hẳn thì người có mã nhỏ hơn mời lại.
      if (pc.connectionState === 'failed' && meId < id) {
        close(id);
        setTimeout(() => { if (!ended.current && !peers.current.has(id)) void offer(id); }, 1500);
      }
      bump();
    };
    peers.current.set(id, p);
    bump();
    return p;
  }

  async function flush(id: string, p: Peer) {
    const list = pending.current.get(id) ?? [];
    pending.current.delete(id);
    for (const c of list) await p.pc.addIceCandidate(c).catch(() => {});
  }

  async function offer(id: string) {
    const p = makePeer(id);
    await p.pc.setLocalDescription(await p.pc.createOffer());
    void signal(id, { sdp: p.pc.localDescription });
  }

  // Mỗi cặp hai người chỉ một bên mời (mã nhỏ hơn), nên không bao giờ hai bên cùng mời nhau.
  function sync(room: LiveRoom) {
    const ids = room?.members ?? [];
    setMembers(ids);
    for (const id of [...peers.current.keys()]) if (!ids.includes(id)) { close(id); pending.current.delete(id); }
    if (!joined.current || ended.current) return;
    if (!ids.includes(meId)) { void livePost('join').catch(() => {}); return; }
    for (const id of ids) if (id !== meId && !peers.current.has(id) && meId < id) void offer(id).catch(() => {});
  }

  async function handle(m: LiveMsg) {
    if (ended.current) return;
    if (m.type === 'hello' || m.type === 'room') return sync(m.room);
    if (m.type === 'declined') return toast(`${nameOf(me, m.from)} chưa nghe được`);
    if (m.type !== 'signal' || !m.data) return;
    const { from, data } = m;
    try {
      if (data.sdp?.type === 'offer') {
        if (!localRef.current) return;
        close(from);
        const p = makePeer(from);
        await p.pc.setRemoteDescription(data.sdp);
        await flush(from, p);
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        void signal(from, { sdp: p.pc.localDescription });
      } else if (data.sdp?.type === 'answer') {
        const p = peers.current.get(from);
        if (p?.pc.signalingState === 'have-local-offer') { await p.pc.setRemoteDescription(data.sdp); await flush(from, p); }
      } else if (data.candidate) {
        const p = peers.current.get(from);
        if (p?.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate).catch(() => {});
        else pending.current.set(from, [...(pending.current.get(from) ?? []), data.candidate]);
      } else if (data.state) {
        const p = peers.current.get(from);
        if (p) { p.cam = !!data.state.cam; p.mic = !!data.state.mic; bump(); }
      } else if (data.smile) {
        setSmile(Date.now());
      }
    } catch (e) { console.warn('rtc', e); }
  }

  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    let alive = true;
    const off = onLive((m) => { void handleRef.current(m); });
    (async () => {
      const [cfg, media] = await Promise.all([
        livePost<{ iceServers: RTCIceServer[] }>('config').catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })),
        getMedia(me.me.name),
      ]);
      if (!alive) { media.stream.getTracks().forEach((t) => t.stop()); return; }
      ice.current = cfg.iceServers;
      localRef.current = media.stream;
      setLocal(media.stream);
      setFake(media.fake);
      if (media.fake) toast(media.stream.getAudioTracks().length ? 'Chưa mở được camera' : 'Chưa mở được camera và micro');
      const r = await livePost<{ room: LiveRoom }>('join');
      joined.current = true;
      sync(r.room);
    })().catch((e) => toast((e as Error).message));
    return () => { alive = false; off(); hangUp(true); };
  }, []);

  // Còn một mình thì nghe tiếng chờ nhẹ.
  const alone = !members.filter((id) => id !== meId).length;
  useEffect(() => {
    if (!alone || !local) return;
    const t = setInterval(() => sfx('reveal'), 2600);
    return () => clearInterval(t);
  }, [alone, !!local]);

  function hangUp(silent = false) {
    if (ended.current) return;
    ended.current = true;
    for (const id of [...peers.current.keys()]) close(id);
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    if (joined.current) void livePost('leave').catch(() => {});
    if (!silent) { tap(); onClose(); }
  }

  function toggle(kind: 'mic' | 'cam') {
    tap();
    const next = !(kind === 'mic' ? mic : cam);
    const tracks = kind === 'mic' ? localRef.current?.getAudioTracks() : localRef.current?.getVideoTracks();
    tracks?.forEach((t) => { t.enabled = next; });
    if (kind === 'mic') setMic(next); else setCam(next);
    state.current = { ...state.current, [kind]: next };
    void signal('*', { state: state.current });
  }

  const others = members.filter((id) => id !== meId);
  const tiles = [meId, ...others];
  const n = tiles.length;
  const cols = n <= 2 ? 1 : n <= 6 ? 2 : 3;
  const rows = Math.ceil(n / cols);

  const boothTiles = (): Tile[] => tiles.map((id) => {
    const p = peers.current.get(id);
    const off = id === meId ? !cam : p ? !p.cam : true;
    return { video: off ? null : videos.current.get(id) ?? null, name: id === meId ? me.me.name : nameOf(me, id), mirror: id === meId && !fake };
  });

  return (
    <div className="sheet call ft">
      <div className="ft-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {tiles.map((id, i) => {
          const p = peers.current.get(id);
          const mine = id === meId;
          const stream = mine ? local : p?.stream ?? null;
          const camOn = mine ? cam : p ? p.cam : false;
          const span = cols > 1 && i === n - 1 && n % cols ? { gridColumn: `span ${cols - (n % cols) + 1}` } : undefined;
          return (
            <div key={id} className="ft-tile" style={span}>
              {stream && <Video stream={stream} muted={mine} mirror={mine && !fake} hidden={!camOn}
                el={(v) => { if (v) videos.current.set(id, v); else videos.current.delete(id); }} />}
              {(!stream || !camOn) && <div className="ft-face"><Avatar m={mine ? me.me : me.members.find((m) => m.id === id)} size={84} /></div>}
              <span className="ft-name">
                {(mine ? !mic : p && !p.mic) && <Icon name="micOff" size={14} />}
                {mine ? 'Mình' : nameOf(me, id)}
                {!mine && p && p.state !== 'connected' && <small>đang nối</small>}
              </span>
            </div>
          );
        })}
      </div>

      {alone && !!local && (
        <div className="ft-wait fade">
          <div className="ft-wait-faces">{me.members.filter((m) => m.id !== meId).map((m) => <Avatar key={m.id} m={m} size={38} />)}</div>
          <span>Đang gọi cả nhà...</span>
        </div>
      )}
      {!!smile && <Countdown key={smile} onDone={() => setSmile(0)} />}

      <div className="ft-bar">
        <button className={`ft-btn ${mic ? '' : 'off'}`} onClick={() => toggle('mic')} aria-label={mic ? 'Tắt mic' : 'Bật mic'}><Icon name={mic ? 'mic' : 'micOff'} /></button>
        <button className={`ft-btn ${cam ? '' : 'off'}`} onClick={() => toggle('cam')} aria-label={cam ? 'Tắt camera' : 'Bật camera'}><Icon name={cam ? 'video' : 'videoOff'} /></button>
        <button className="ft-btn" onClick={() => { tap(); setBooth(true); }} aria-label="Chụp chung"><Icon name="booth" /></button>
        <button className="ft-btn end" onClick={() => hangUp()} aria-label="Gác máy"><Icon name="phone" /></button>
      </div>

      {booth && <Booth me={me} tiles={boothTiles} onShoot={() => void signal('*', { smile: true })} onClose={() => setBooth(false)} />}
    </div>
  );
}

function Video({ stream, muted, mirror, hidden, el }: { stream: MediaStream; muted: boolean; mirror: boolean; hidden: boolean; el: (v: HTMLVideoElement | null) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    void v.play().catch(() => {});
  }, [stream]);
  useEffect(() => { el(ref.current); return () => el(null); }, []);
  return <video ref={ref} className={`ft-video ${mirror ? 'mirror' : ''}`} style={hidden ? { opacity: 0 } : undefined} autoPlay playsInline muted={muted} />;
}

function Countdown({ onDone }: { onDone: () => void }) {
  const [k, setK] = useState(3);
  useEffect(() => {
    if (k === 0) { const t = setTimeout(onDone, 500); return () => clearTimeout(t); }
    sfx('tap');
    const t = setTimeout(() => setK(k - 1), 900);
    return () => clearTimeout(t);
  }, [k]);
  return <div className="ft-count" aria-live="polite">{k ? <b key={k}>{k}</b> : <i className="ft-flash" />}<span>Cười lên nào</span></div>;
}

/** Photobooth: chọn chủ đề, xem trước, đếm 3 2 1, chụp một tấm chung rồi gửi vào nhà. */
function Booth({ me, tiles, onShoot, onClose }: { me: Me; tiles: () => Tile[]; onShoot: () => void; onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState(THEMES[0].id);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [count, setCount] = useState(0);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [saving, setSaving] = useState(false);
  const live = useRef({ theme, photo, frozen: false });
  live.current.theme = theme; live.current.photo = photo;
  const title = me.family.name.toLowerCase().startsWith('nhà') ? me.family.name : `Nhà ${me.family.name}`;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = cv.current?.getContext('2d');
      if (c && !live.current.frozen) drawBooth(c, live.current.theme, tiles(), title, live.current.photo);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  useEffect(() => {
    if (!count) return;
    if (count === 4) { onShoot(); }
    if (count > 1) { sfx('tap'); const t = setTimeout(() => setCount(count - 1), 900); return () => clearTimeout(t); }
    const t = setTimeout(() => {
      const c = cv.current;
      if (!c) return;
      live.current.frozen = true;
      drawBooth(c.getContext('2d')!, live.current.theme, tiles(), title, live.current.photo);
      sfx('shutter'); buzz(30);
      c.toBlob((b) => { if (b) setShot({ url: URL.createObjectURL(b), blob: b }); setCount(0); }, 'image/jpeg', 0.9);
    }, 900);
    return () => clearTimeout(t);
  }, [count]);

  function pickPhoto(f?: File) {
    if (!f) return;
    const img = new Image();
    img.onload = () => { setPhoto(img); setTheme('photo'); };
    img.src = URL.createObjectURL(f);
  }

  async function save() {
    if (!shot || saving) return;
    setSaving(true);
    try {
      const f = new FormData();
      f.set('kind', 'photo'); f.set('caption', 'Cả nhà chụp chung'); f.set('file', shot.blob, 'booth.jpg');
      await api.post(f);
      sfx('send'); toast('Đã gửi vào nhà');
      onClose();
    } catch (e) { toast((e as Error).message); setSaving(false); }
  }

  function again() { tap(); setShot(null); live.current.frozen = false; }

  return (
    <div className="ft-booth fade">
      <header className="ft-booth-top">
        <button className="icon-btn" onClick={() => { tap(); onClose(); }} aria-label="Quay lại"><Icon name="back" /></button>
        <b>Chụp chung</b>
        <span style={{ width: 44 }} />
      </header>
      <div className="ft-stage">
        <canvas ref={cv} width={W} height={H} className="ft-canvas" style={shot ? { display: 'none' } : undefined} />
        {shot && <img src={shot.url} className="ft-canvas" alt="Ảnh chung" />}
        {count > 1 && <b key={count} className="ft-num">{count - 1}</b>}
      </div>
      {shot ? (
        <div className="ft-booth-foot">
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi vào nhà'}</button>
          <button className="link" onClick={again}>Chụp lại</button>
        </div>
      ) : (
        <div className="ft-booth-foot">
          <div className="ft-themes">
            {THEMES.map((t) => t.id === 'photo' ? (
              <label key={t.id} className={`chip ${theme === t.id ? 'on' : ''}`}>
                {t.name}
                <input type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            ) : (
              <button key={t.id} className={`chip ${theme === t.id ? 'on' : ''}`} onClick={() => { tap(); setTheme(t.id); }}>{t.name}</button>
            ))}
          </div>
          <button className="shutter" onClick={() => { if (!count) setCount(4); }} aria-label="Chụp"><i /></button>
        </div>
      )}
    </div>
  );
}
