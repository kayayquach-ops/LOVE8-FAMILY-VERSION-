import { useEffect, useReducer, useRef, useState } from 'react';
import { api } from './api';
import { drawBooth, H, THEMES, W, type Tile } from './booth';
import { FH, FW, loadStripFonts, renderStrip, snap, snapInto, STRIPS, stripTheme, tone as toneOver, type Tone } from './strip';
import './booth.css';
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

  // Photobooth xếp người theo thứ tự vào cuộc gọi.
  const boothTiles = (): Tile[] => (members.includes(meId) ? members : tiles).map((id) => {
    const p = peers.current.get(id);
    const off = id === meId ? !cam : p ? !p.cam : true;
    return { id, video: off ? null : videos.current.get(id) ?? null, name: id === meId ? me.me.name : nameOf(me, id), mirror: id === meId && !fake };
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ảnh xem trước nhỏ của từng chủ đề, dựng một lần bằng chính hàm vẽ. */
function useThumbs(title: string, photo: HTMLImageElement | null) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void Promise.all([...['500 20px BVP', '600 20px BVP', '400 20px BVP'].map((f) => fonts?.load(f, title).catch(() => null)), loadStripFonts(undefined, title)])
      .then(() => {
        if (!alive) return;
        const out: Record<string, string> = {};
        const one = document.createElement('canvas');
        one.width = 120; one.height = 150;
        const c1 = one.getContext('2d')!;
        for (const t of THEMES) {
          c1.setTransform(120 / W, 0, 0, 150 / H, 0, 0);
          drawBooth(c1, t.id, [{ video: null, name: 'Bố', mirror: false }, { video: null, name: 'Con', mirror: false }], title, photo);
          out[`one:${t.id}`] = one.toDataURL('image/jpeg', 0.8);
        }
        const blank = [null, null, null];
        for (const t of STRIPS) {
          const cv = renderStrip(t.id, blank, 3, { title, when: new Date(), photo }, t.tone, false, 0.2);
          out[`strip:${t.id}`] = cv.toDataURL('image/jpeg', 0.8);
        }
        setThumbs(out);
      });
    return () => { alive = false; };
  }, [title, photo]);
  return thumbs;
}

const TONES: { id: Tone; name: string }[] = [{ id: 'color', name: 'Ảnh màu' }, { id: 'bw', name: 'Đen trắng' }, { id: 'wine', name: 'Đỏ rượu' }];

/** Photobooth: một tấm chung, hoặc dải 3 đến 4 tấm chụp liền nhau. Chọn khung, đếm 3 2 1, rồi gửi vào nhà. */
function Booth({ me, tiles, onShoot, onClose }: { me: Me; tiles: () => Tile[]; onShoot: () => void; onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'one' | 'strip'>('one');
  const [theme, setTheme] = useState(THEMES[0].id);
  const [strip, setStrip] = useState(STRIPS[0].id);
  const [tone, setTone] = useState<Tone>(STRIPS[0].tone);
  const [shots, setShots] = useState(4);
  const [pair, setPair] = useState(false);
  const [frames, setFrames] = useState<{ cv: HTMLCanvasElement; thumb: string }[]>([]);
  const [when, setWhen] = useState<Date | null>(null);
  const [num, setNum] = useState(0);
  const [flash, setFlash] = useState(0);
  const [running, setRunning] = useState(false);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [count, setCount] = useState(0);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [saving, setSaving] = useState(false);
  const [group, setGroup] = useState<'all' | 'each'>('all');
  const live = useRef({ theme, photo, frozen: false, mode, tone, alive: true, group, locked: null as Tile[] | null, next: 0 });
  live.current.theme = theme; live.current.photo = photo; live.current.mode = mode; live.current.tone = tone; live.current.group = group;
  // Luôn đọc danh sách người mới nhất (có người vào hay ra giữa chừng).
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const people = tiles().length;

  /** Người trong một tấm: chốt danh sách lúc bấm chụp; ai thoát giữa chừng thì giữ ô chữ cái tên. */
  function facesFor(i: number): Tile[] {
    const L = live.current;
    const cur = tilesRef.current();
    const base = L.locked ? L.locked.map((t) => cur.find((x) => x.id === t.id) ?? { ...t, video: null }) : cur;
    if (L.group === 'all' || !base.length) return base;
    return [base[i % base.length]];
  }
  const title = me.family.name.toLowerCase().startsWith('nhà') ? me.family.name : `Nhà ${me.family.name}`;
  const thumbs = useThumbs(title, photo);

  // Một tấm: vẽ cả khung theo từng hình. Dải ảnh: chỉ vẽ ô ngắm 4:3, nhẹ hơn nhiều.
  useEffect(() => {
    let raf = 0;
    live.current.alive = true;
    const loop = () => {
      const L = live.current;
      if (!L.frozen) {
        if (L.mode === 'one') { const c = cv.current?.getContext('2d'); if (c) drawBooth(c, L.theme, tilesRef.current(), title, L.photo); }
        else { const c = view.current?.getContext('2d'); if (c) { snapInto(c, facesFor(L.next)); toneOver(c, L.tone, 0, 0, FW, FH); } }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); live.current.alive = false; };
  }, []);

  // Có đủ ảnh rồi thì dựng dải; đổi khung, tông màu, một hay hai dải đều dựng lại ngay.
  useEffect(() => {
    if (mode !== 'strip' || running || !when || frames.length < shots) return;
    let ok = true;
    void loadStripFonts([strip], title).then(() => {
      if (!ok) return;
      const out = renderStrip(strip, frames.map((f) => f.cv), shots, { title, when, photo }, tone, pair);
      out.toBlob((b) => { if (ok && b) setShot({ url: URL.createObjectURL(b), blob: b }); }, 'image/jpeg', 0.9);
    });
    return () => { ok = false; };
  }, [mode, running, when, frames, strip, tone, pair, photo, shots]);

  async function runStrip() {
    if (running) return;
    tap();
    setRunning(true); setFrames([]); setShot(null); setWhen(null);
    live.current.frozen = false;
    live.current.locked = tilesRef.current();
    live.current.next = 0;
    onShoot();
    const got: { cv: HTMLCanvasElement; thumb: string }[] = [];
    for (let i = 0; i < shots; i++) {
      for (let k = 3; k > 0; k--) {
        setNum(k); sfx('tap');
        await sleep(i === 0 ? 900 : 600);
        if (!live.current.alive) return;
      }
      setNum(0);
      const f = snap(facesFor(i));
      live.current.next = i + 1;
      const t = document.createElement('canvas');
      t.width = 160; t.height = Math.round((160 * FH) / FW);
      t.getContext('2d')!.drawImage(f, 0, 0, t.width, t.height);
      got.push({ cv: f, thumb: t.toDataURL('image/jpeg', 0.7) });
      setFrames([...got]);
      setFlash(Date.now()); sfx('shutter'); buzz(30);
      await sleep(i < shots - 1 ? 700 : 400);
      if (!live.current.alive) return;
    }
    live.current.frozen = true;
    live.current.locked = null; live.current.next = 0;
    setWhen(new Date());
    setRunning(false);
  }

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  useEffect(() => {
    if (!count) return;
    if (count === 4) { onShoot(); }
    if (count > 1) { sfx('tap'); const t = setTimeout(() => setCount(count - 1), 900); return () => clearTimeout(t); }
    const t = setTimeout(() => {
      const c = cv.current;
      if (!c) return;
      live.current.frozen = true;
      drawBooth(c.getContext('2d')!, live.current.theme, tilesRef.current(), title, live.current.photo);
      sfx('shutter'); buzz(30);
      c.toBlob((b) => { if (b) setShot({ url: URL.createObjectURL(b), blob: b }); setCount(0); }, 'image/jpeg', 0.9);
    }, 900);
    return () => clearTimeout(t);
  }, [count]);

  function pickPhoto(f?: File) {
    if (!f) return;
    const img = new Image();
    img.onload = () => { setPhoto(img); if (live.current.mode === 'one') setTheme('photo'); else { setStrip('photo'); setTone('color'); } };
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

  /** Điện thoại: mở bảng chia sẻ để lưu vào Ảnh. Máy tính: tải tệp về. */
  async function download() {
    if (!shot) return;
    tap();
    const name = `homeletter-${Date.now()}.jpg`;
    const file = new File([shot.blob], name, { type: 'image/jpeg' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch {}
      return;
    }
    const a = document.createElement('a');
    a.href = shot.url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function again() { tap(); setShot(null); setFrames([]); setWhen(null); live.current.frozen = false; }

  function pickMode(m: 'one' | 'strip') {
    if (m === mode) return;
    tap(); setMode(m); setShot(null); setFrames([]); setWhen(null); live.current.frozen = false;
    // Đúng 3 hoặc 4 người: mỗi người một ô, số ô bằng số người. Còn lại: cả nhà chung một ô.
    if (m === 'strip') {
      const n = tilesRef.current().length;
      if (n === 3 || n === 4) { setGroup('each'); setShots(n); } else setGroup('all');
    }
  }

  const busy = running || count > 0;
  const stripDone = mode === 'strip' && !!when;
  const list = mode === 'one' ? THEMES : STRIPS;
  const current = mode === 'one' ? theme : strip;
  const choose = (id: string) => {
    tap();
    if (mode === 'one') setTheme(id);
    else { setStrip(id); setTone(stripTheme(id).tone); }
  };

  return (
    <div className="ft-booth fade">
      <header className="ft-booth-top">
        <button className="icon-btn" onClick={() => { tap(); onClose(); }} aria-label="Quay lại"><Icon name="back" /></button>
        <div className={`ft-seg ${busy || shot ? 'dim' : ''}`}>
          <button className={mode === 'one' ? 'on' : ''} onClick={() => !busy && !shot && pickMode('one')}>Một tấm</button>
          <button className={mode === 'strip' ? 'on' : ''} onClick={() => !busy && !shot && pickMode('strip')}>Dải ảnh</button>
        </div>
        <span style={{ width: 44 }} />
      </header>
      <div className="ft-stage">
        {mode === 'one' ? (
          <>
            <canvas ref={cv} width={W} height={H} className="ft-canvas" style={shot ? { display: 'none' } : undefined} />
            {shot && <img src={shot.url} className="ft-canvas" alt="Ảnh chung" />}
            {count > 1 && <b key={count} className="ft-num">{count - 1}</b>}
          </>
        ) : stripDone ? (
          shot ? <img src={shot.url} className="ft-strip-out" alt="Dải ảnh chung" /> : null
        ) : (
          <div className="ft-shoot">
            <div className="ft-view-wrap">
              <canvas ref={view} width={FW} height={FH} className="ft-view" />
              {num > 0 && <b key={`${frames.length}-${num}`} className="ft-num">{num}</b>}
            </div>
            <div className="ft-slots">
              {Array.from({ length: shots }, (_, i) => (
                <span key={i} className={running && i === frames.length ? 'next' : ''}>{frames[i] && <img src={frames[i].thumb} alt="" />}</span>
              ))}
            </div>
          </div>
        )}
        {!!flash && <i key={flash} className="ft-flash" />}
      </div>
      <div className="ft-booth-foot">
        {!(mode === 'one' && shot) && !running && (
          <div className="ft-picks">
            {list.map((t) => {
              const src = thumbs[`${mode}:${t.id}`];
              const inner = <>{src ? <img src={src} alt="" /> : <i />}<span>{t.name}</span></>;
              const cls = `ft-pick ${mode} ${current === t.id ? 'on' : ''}`;
              return t.id === 'photo' ? (
                <label key={t.id} className={cls}>
                  {inner}
                  <input type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              ) : <button key={t.id} className={cls} onClick={() => choose(t.id)}>{inner}</button>;
            })}
          </div>
        )}
        {mode === 'strip' && !running && (
          <div className="ft-opts">
            {!stripDone && people > 1 && (
              <button className="chip" onClick={() => { tap(); setGroup(group === 'all' ? 'each' : 'all'); }}>{group === 'all' ? 'Chung một ô' : 'Mỗi người một ô'}</button>
            )}
            {!stripDone && <>
              <button className={`chip ${shots === 3 ? 'on' : ''}`} onClick={() => { tap(); setShots(3); }}>3 tấm</button>
              <button className={`chip ${shots === 4 ? 'on' : ''}`} onClick={() => { tap(); setShots(4); }}>4 tấm</button>
            </>}
            <button className="chip" onClick={() => { tap(); setPair(!pair); }}>{pair ? 'Hai dải' : 'Một dải'}</button>
            <button className="chip" onClick={() => { tap(); setTone(TONES[(TONES.findIndex((x) => x.id === tone) + 1) % TONES.length].id); }}>{TONES.find((x) => x.id === tone)?.name}</button>
          </div>
        )}
        {shot ? (
          <>
            <button className="btn" onClick={save} disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi vào nhà'}</button>
            <div className="ft-links">
              <button className="link" onClick={download}>Lưu về máy</button>
              <button className="link" onClick={again}>Chụp lại</button>
            </div>
          </>
        ) : (
          <button className="shutter" disabled={busy} onClick={() => { if (busy) return; if (mode === 'strip') void runStrip(); else setCount(4); }} aria-label="Chụp"><i /></button>
        )}
      </div>
    </div>
  );
}
