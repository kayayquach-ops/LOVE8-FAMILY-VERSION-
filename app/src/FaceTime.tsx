import { useEffect, useReducer, useRef, useState } from 'react';
import { api } from './api';
import { drawBooth, H, stageColor, THEMES, W, type Tile } from './booth';
import { FH, FW, loadStripFonts, renderStrip, snap, snapInto, STRIPS, stripStage, stripTheme, tone as toneOver, type Tone } from './strip';
import './booth.css';
import { livePost, liveStats, onLive, reopenLive, type LiveMsg, type LiveRoom } from './live';
import { fixDelay, fixKind, hasTurn, iceCount, ICE_SHORT, mark, MAX_FIXES, newPeerDiag, pairOf, peerSummary, type PeerDiag } from './rtcDiag';
import type { Me } from './shared';
import { buzz, sfx, startRing, stopRing, tap } from './sound';
import { Avatar, Icon, toast } from './ui';
import { t, type Key } from './i18n';

// Mỗi cặp hai người chỉ một bên mời (mã nhỏ hơn), nên không bao giờ hai bên cùng mời nhau, không cần kiểu "perfect negotiation".
// sid: mã phiên của một RTCPeerConnection, bên mời đặt. Mọi gói tin mang sid để bỏ gói của phiên cũ và giữ lại gói đến sớm của phiên mới.
// g: lời mời thứ mấy trong phiên (khởi động lại ICE thì tăng); câu trả lời mang g cũ thì bỏ.
// Gói tin qua máy chủ có thể rơi (kênh SSE của người nhận đang nối lại): bên mời gửi lại lời mời đến khi có trả lời,
// bên trả lời báo "ready" đến khi nhận được lời mời. Rớt kết nối (đổi Wi-Fi sang 4G, iPhone xuống nền) thì sửa, có giới hạn số lần (rtcDiag.ts).
type Peer = {
  pc: RTCPeerConnection; stream: MediaStream | null; cam: boolean; mic: boolean; state: string;
  sid: string; g: number; offerer: boolean;
  sentAt: number; resends: number; answeredAt: number; // bên mời: lúc gửi lời mời gần nhất, số lần gửi lại, lúc nhận trả lời
  downAt: number; fixes: number; fixAt: number;         // rớt từ lúc nào, đã sửa mấy lần, lần sửa gần nhất
  d: PeerDiag;
};
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } };
const RESEND_MS = 4000, MAX_RESENDS = 10; // bên mời chưa có trả lời: 4 giây gửi lại lời mời một lần
const READY_MS = 4000, MAX_READY = 12;    // bên trả lời chưa có lời mời: 4 giây báo "ready" một lần
const DOWN_MS = 3000;                      // ICE "disconnected" quá 3 giây thì sửa, "failed" thì sửa ngay
const STUCK_MS = 12000;                    // có trả lời rồi mà 12 giây chưa nối được thì cũng sửa
const nameOf = (me: Me, id: string) => (id === me.me.id ? t('facetime.me') : me.members.find((m) => m.id === id)?.name ?? t('common.someone'));
const isUp = (p: Peer) => p.pc.connectionState === 'connected';
const newSid = () => Math.random().toString(36).slice(2, 10);

/** Không mở được camera (máy chặn, máy tính không có) thì vẫn lên hình bằng một ô chữ cái đầu tên, có micro nếu được. */
function fakeVideo(name: string) {
  const cv = document.createElement('canvas');
  cv.width = 480; cv.height = 640;
  const c = cv.getContext('2d')!;
  const letter = (name.trim().split(/\s+/).pop()?.[0] ?? '?').toUpperCase();
  const stream = cv.captureStream(12);
  const draw = () => {
    const sec = Date.now() / 1000;
    const g = c.createLinearGradient(0, 0, 480, 640);
    g.addColorStop(0, '#F1E2D8'); g.addColorStop(1, '#D9D2E0');
    c.fillStyle = g; c.fillRect(0, 0, 480, 640);
    c.fillStyle = 'rgba(154,90,68,.18)';
    c.beginPath(); c.arc(240, 300, 120 + Math.sin(sec * 1.6) * 8, 0, Math.PI * 2); c.fill();
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

/** kind (ghi vào chẩn đoán): cam; fake: ô chữ cái + micro; mute: ô chữ cái, không micro; mic: gọi thoại; none: gọi thoại mà không mở được micro. */
async function getMedia(name: string, voice: boolean): Promise<{ stream: MediaStream; kind: string }> {
  const md = navigator.mediaDevices;
  if (voice) {
    try { return { stream: await md.getUserMedia({ audio: AUDIO }), kind: 'mic' }; } catch { return { stream: new MediaStream(), kind: 'none' }; }
  }
  try {
    return { stream: await md.getUserMedia({ video: VIDEO, audio: AUDIO }), kind: 'cam' };
  } catch {}
  let audio: MediaStream | null = null;
  try { audio = await md.getUserMedia({ audio: AUDIO }); } catch {}
  const v = fakeVideo(name);
  return { stream: new MediaStream([...v.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])]), kind: audio ? 'fake' : 'mute' };
}

/** Gọi video cả nhà (audio: gọi thoại, không camera): mỗi người nối thẳng với từng người còn lại (WebRTC), máy chủ chỉ chuyển lời mời. */
export function FaceTime({ me, to, audio = false, onClose }: { me: Me; to?: string | null; audio?: boolean; onClose: () => void }) {
  const meId = me.me.id;
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [fake, setFake] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(!audio);
  const [booth, setBooth] = useState(false);
  const [smile, setSmile] = useState(0);
  const localRef = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, Peer>());
  // Ứng viên ICE đến trước lời mời/trả lời của đúng phiên: giữ lại (tối đa 60 giây), áp sau khi có mô tả của người kia.
  const pending = useRef(new Map<string, { sid?: string; c: RTCIceCandidateInit; at: number }[]>());
  const ice = useRef<RTCIceServer[]>([]);
  const iceAt = useRef(0);
  const joined = useRef(false);
  const joinedAt = useRef(0);
  const ended = useRef(false);
  const state = useRef({ mic: true, cam: !audio });
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const counted = useRef(false);
  // Phòng gần nhất có mình (để vào lại đúng phòng khi máy chủ quên), phòng gần nhất nhận được, hạn giữ kết nối khi đang vào lại.
  const known = useRef<LiveRoom>(null);
  const lastRoom = useRef<LiveRoom>(null);
  const grace = useRef(0);
  const graceEnd = useRef(0);
  // Bên trả lời: lần báo "ready" gần nhất và số lần đã báo, theo từng người.
  const ready = useRef(new Map<string, { at: number; n: number }>());
  // Gói tin xử lý lần lượt từng gói (trước đây chạy chen nhau: lời mời thứ hai đóng kết nối khi lời mời đầu còn đang áp dở).
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const reviving = useRef(false);
  // Chẩn đoán: lúc mở màn gọi, lúc nối được người đầu tiên, thời gian lấy cấu hình ICE (-1: lỗi, chỉ còn STUN dự phòng), loại micro/camera,
  // số lần mở kênh SSE lúc bắt đầu, số gói tin không tới được người nhận, chẩn đoán của người đã rời, đã gửi bản tóm tắt chưa.
  const t0 = useRef(Date.now());
  const firstUp = useRef(0);
  const cfgMs = useRef(-1);
  const mediaKind = useRef('');
  const sse0 = useRef(liveStats().opens);
  const drops = useRef(0);
  const done = useRef<PeerDiag[]>([]);
  const diagSent = useRef(false);

  // sent = 0: người nhận không còn trong phòng ở máy chủ, gói tin rơi.
  const signal = (to: string, data: unknown) => livePost<{ sent?: number }>('signal', { to, data })
    .then((r) => { if (to !== '*' && r?.sent === 0) drops.current++; })
    .catch(() => { drops.current++; });
  const note = (p: Peer, what: string) => mark(p.d, what, Date.now(), t0.current);

  /** keepDiag: kết nối được thay bằng kết nối mới của cùng người, chẩn đoán đi tiếp theo kết nối mới. */
  function close(id: string, keepDiag = false) {
    const p = peers.current.get(id);
    if (!p) return;
    p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = p.pc.oniceconnectionstatechange = null;
    p.pc.close();
    peers.current.delete(id);
    if (!keepDiag) done.current.push(p.d);
    bump();
  }

  /** carry: kết nối cũ của cùng người (dựng lại khi sửa), giữ số lần sửa và chẩn đoán. */
  function makePeer(id: string, sid: string, carry?: Peer) {
    if (peers.current.has(id)) close(id, true);
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    const s = localRef.current;
    s?.getTracks().forEach((tr) => pc.addTrack(tr, s));
    const offerer = meId < id;
    // Bên mời mà không có micro (hay camera) vẫn xin nhận tiếng (hình) của người kia, không thì lời mời thiếu hẳn phần đó.
    if (offerer && !s?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
    if (offerer && !audio && !s?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });
    const p: Peer = {
      pc, stream: null, cam: true, mic: true, state: 'new', sid, g: 0, offerer, sentAt: 0, resends: 0, answeredAt: 0,
      downAt: 0, fixes: carry?.fixes ?? 0, fixAt: carry?.fixAt ?? 0, d: carry?.d ?? newPeerDiag(id, offerer ? 'o' : 'a', Date.now()),
    };
    pc.onicecandidate = (e) => { if (e.candidate) void signal(id, { candidate: e.candidate.toJSON(), sid }); };
    pc.ontrack = (e) => {
      if (e.streams[0]) p.stream = e.streams[0];
      else { p.stream ??= new MediaStream(); p.stream.addTrack(e.track); }
      bump();
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      note(p, ICE_SHORT[st] ?? st);
      if (st === 'connected' || st === 'completed') p.downAt = 0;
      else if ((st === 'disconnected' || st === 'failed') && !p.downAt) p.downAt = Date.now();
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      p.state = st;
      p.d.up = st === 'connected';
      if (st === 'connected') {
        note(p, 'up');
        p.downAt = 0; p.fixes = 0; p.d.gaveUp = false;
        ready.current.delete(id);
        void signal(id, { state: state.current });
        if (!counted.current) { counted.current = true; api.mission('call').catch(() => {}); }
        if (!firstUp.current) firstUp.current = Date.now();
        // Lần đầu nối thông với người này: báo máy chủ (móc onCallConnected, không ghi log).
        if (!p.d.ok) { p.d.ok = true; p.d.ttc = Date.now() - p.d.t0; void livePost('diag', { up: id, room: known.current?.id }).catch(() => {}); }
        void readPair(p);
        setTimeout(() => void readPair(p), 3000);
      } else if (st === 'disconnected' || st === 'failed') {
        if (st === 'failed') note(p, 'pcfail');
        if (!p.downAt) p.downAt = Date.now();
      }
      bump();
    };
    peers.current.set(id, p);
    bump();
    return p;
  }

  /** Đường nối đang dùng (host/srflx/relay) và RTT, ghi vào chẩn đoán. */
  async function readPair(p: Peer) {
    try {
      const r = pairOf((await p.pc.getStats()).values());
      if (r) { p.d.pair = r.pair; p.d.rtt = r.rtt; }
    } catch {}
  }

  async function flush(id: string, p: Peer) {
    const now = Date.now();
    const list = (pending.current.get(id) ?? []).filter((e) => now - e.at < 60_000);
    const mine = list.filter((e) => e.sid === undefined || e.sid === p.sid);
    pending.current.set(id, list.filter((e) => !mine.includes(e)));
    for (const e of mine) await p.pc.addIceCandidate(e.c).catch(() => {});
  }

  /** Bên mời: lời mời mới (dựng kết nối mới), hoặc restart: khởi động lại ICE trên kết nối đang có. */
  async function offer(id: string, restart = false) {
    const old = peers.current.get(id);
    const p = restart && old ? old : makePeer(id, newSid(), old);
    const g = ++p.g;
    const o = await p.pc.createOffer(restart ? { iceRestart: true } : undefined);
    if (peers.current.get(id) !== p || ended.current || p.g !== g) return;
    await p.pc.setLocalDescription(o);
    p.resends = 0;
    sendOffer(id, p);
  }

  // Gửi lại thì dùng mô tả hiện tại (đã kèm các ứng viên ICE gom được tới giờ), nên ứng viên rơi giữa đường cũng được bù.
  function sendOffer(id: string, p: Peer) {
    p.sentAt = Date.now();
    note(p, p.resends ? 're' : 'off');
    void signal(id, { sdp: p.pc.localDescription, sid: p.sid, g: p.g });
  }

  /** Mật khẩu TURN có hạn, và lần đầu có thể chưa lấy được TURN: cấu hình cũ quá 30 phút hay thiếu TURN thì lấy lại trước khi sửa. */
  async function freshIce() {
    if (Date.now() - iceAt.current < 30 * 60_000) return;
    const cfg = await livePost<{ iceServers: RTCIceServer[] }>('config').catch(() => null);
    if (!cfg?.iceServers?.length) return;
    ice.current = cfg.iceServers;
    iceAt.current = hasTurn(cfg.iceServers) ? Date.now() : 0;
  }

  /** Sửa một kết nối đang rớt. Bên mời: khởi động lại ICE hoặc dựng lại hẳn (fixKind). Bên trả lời: nhờ bên mời sửa.
   * Hết lượt mà vẫn chưa nối được thì báo người dùng một câu và thôi (quay lại app thì được sửa lại từ đầu). */
  async function fix(id: string, p: Peer) {
    p.fixAt = Date.now();
    if (p.fixes >= MAX_FIXES) {
      if (!p.d.gaveUp) { p.d.gaveUp = true; note(p, 'giveup'); toast(t('facetime.lost')); }
      return;
    }
    if (p.fixes === 0) toast(t(audio ? 'facetime.failedVoice' : 'facetime.failed'));
    const kind = fixKind(p.fixes);
    p.fixes++;
    p.d.rs++;
    if (!p.offerer) { note(p, 'rq'); return void signal(id, { restart: true, sid: p.sid }); }
    note(p, kind === 'ice' ? 'rs' : 'new');
    await freshIce();
    if (peers.current.get(id) !== p || ended.current) return;
    if (kind === 'ice') { try { p.pc.setConfiguration({ ...p.pc.getConfiguration(), iceServers: ice.current }); } catch {} }
    await offer(id, kind === 'ice');
  }

  /** Mỗi giây: gửi lại lời mời chưa có trả lời, phát hiện kết nối treo hay rớt để sửa, bên trả lời báo "ready" khi chưa có lời mời. */
  function tick() {
    if (!joined.current || ended.current) return;
    const now = Date.now();
    for (const [id, p] of peers.current) {
      // Đã nối lại ổn định 10 giây (kết nối không chuyển trạng thái nên chưa đặt lại) thì lần rớt sau được sửa lại từ đầu.
      if (isUp(p) && !p.downAt && p.fixes && now - p.fixAt > 10_000) p.fixes = 0;
      if (p.offerer && p.pc.signalingState === 'have-local-offer') {
        if (now - p.sentAt > RESEND_MS && p.resends < MAX_RESENDS) {
          p.resends++;
          sendOffer(id, p);
          // Ba lần chưa thấy trả lời: có thể kênh SSE của mình chết mà chưa biết (trả lời gửi vào kênh chết), mở kênh mới.
          if (p.resends === 3) reopenLive();
        } else if (p.resends >= MAX_RESENDS && now - p.sentAt > RESEND_MS && !p.d.gaveUp) { p.d.gaveUp = true; note(p, 'giveup'); toast(t('facetime.lost')); }
      }
      if (p.offerer && !p.downAt && !isUp(p) && p.answeredAt && p.pc.signalingState === 'stable' && now - p.answeredAt > STUCK_MS) {
        p.downAt = now - DOWN_MS;
        note(p, 'stuck');
      }
      const down = !!p.downAt && (now - p.downAt >= DOWN_MS || p.pc.iceConnectionState === 'failed' || p.pc.connectionState === 'failed');
      if (down && !p.d.gaveUp && now - p.fixAt >= fixDelay(p.fixes) && (!p.offerer || p.pc.signalingState === 'stable')) void fix(id, p).catch(() => {});
    }
    // Bên trả lời: người có mã nhỏ hơn chưa mời mình (lời mời rơi, hoặc người đó chưa thấy mình vào phòng) thì báo "ready".
    if (now - joinedAt.current < 2000) return;
    for (const id of lastRoom.current?.members ?? []) {
      if (id >= meId) continue;
      const p = peers.current.get(id);
      if (p?.pc.remoteDescription) continue;
      const r = ready.current.get(id) ?? { at: 0, n: 0 };
      if (now - r.at < READY_MS || r.n >= MAX_READY) continue;
      ready.current.set(id, { at: now, n: r.n + 1 });
      void signal(id, { ready: true, sid: p?.sid ?? '' });
      if (r.n + 1 === 3) reopenLive();
      if (r.n + 1 === MAX_READY) toast(t('facetime.lost'));
    }
  }

  /** Vừa có kênh SSE mới (máy chủ gửi "hello") hoặc vừa quay lại app: gói tin lúc trước có thể đã rơi hết.
   * Gửi lại ngay lời mời đang chờ, báo "ready" lại, kết nối đã thôi sửa thì cho sửa lại từ đầu. */
  function retryAll() {
    ready.current.clear();
    for (const p of peers.current.values()) {
      if (p.offerer && p.pc.signalingState === 'have-local-offer') { p.resends = 0; p.sentAt = 0; }
      if (p.d.gaveUp && !isUp(p)) { p.d.gaveUp = false; p.fixes = 0; p.fixAt = 0; }
    }
  }

  /** iPhone ra khỏi nền, hay app khác vừa dùng camera: track của mình đã "ended", người kia thấy hình đứng và mất tiếng
   * (Camera.tsx cũng ghi: quay lại từ nền thì luồng cũ thường đã chết). Xin lại micro/camera, thay track cho mọi kết nối, không phải mời lại. */
  async function revive() {
    const s = localRef.current;
    if (!s || ended.current || reviving.current) return;
    const dead = s.getTracks().filter((tr) => tr.readyState === 'ended');
    if (!dead.length) return;
    reviving.current = true;
    try {
      const kinds = new Set(dead.map((tr) => tr.kind));
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: kinds.has('audio') ? AUDIO : false, video: kinds.has('video') ? VIDEO : false });
      if (ended.current) return fresh.getTracks().forEach((tr) => tr.stop());
      for (const tr of fresh.getTracks()) {
        const old = dead.find((x) => x.kind === tr.kind);
        tr.enabled = tr.kind === 'audio' ? state.current.mic : state.current.cam;
        if (old) s.removeTrack(old);
        s.addTrack(tr);
        for (const p of peers.current.values()) {
          const snd = p.pc.getSenders().find((x) => x.track === old) ?? p.pc.getSenders().find((x) => x.track?.kind === tr.kind);
          if (snd) void snd.replaceTrack(tr).catch(() => {});
        }
      }
      const next = new MediaStream(s.getTracks());
      localRef.current = next;
      setLocal(next);
    } catch {} finally { reviving.current = false; }
  }

  /** Vào phòng; về tới nơi mà mình đã cúp máy (bấm cúp đúng lúc đang vào) thì rời ngay, không để lại phòng ma đổ chuông cả nhà. */
  async function enter(body: Record<string, unknown>) {
    const r = await livePost<{ room: LiveRoom }>('join', body);
    if (ended.current) { void livePost('leave').catch(() => {}); return null; }
    return r;
  }

  /** Máy chủ quên phòng (khởi động lại khi deploy) hoặc đã cho mình ra: vào lại đúng phòng cũ (cùng mã phòng, người gọi, người được gọi riêng,
   * gọi thoại hay video) với cờ rejoin để máy chủ không đổ chuông cả nhà. 15 giây đầu giữ các kết nối đang chạy tốt trong lúc người khác lần lượt vào lại. */
  function rejoin() {
    const old = known.current;
    void enter(old
      ? { rejoin: true, id: old.id, by: old.by, to: old.to ?? null, started: old.started, audio: old.audio ?? audio }
      : { rejoin: true, ...(to ? { to } : {}), ...(audio ? { audio: true } : {}) }).catch(() => {});
  }

  function sync(room: LiveRoom) {
    lastRoom.current = room;
    const ids = room?.members ?? [];
    if (room && ids.includes(meId)) known.current = room;
    const lost = joined.current && !ended.current && !ids.includes(meId);
    if (lost) {
      grace.current = Date.now() + 15_000;
      clearTimeout(graceEnd.current);
      graceEnd.current = window.setTimeout(() => { if (!ended.current) sync(lastRoom.current); }, 15_500);
    }
    const keep = Date.now() < grace.current;
    for (const id of [...peers.current.keys()]) {
      if (ids.includes(id) || (keep && peers.current.get(id)?.state === 'connected')) continue;
      const p = peers.current.get(id);
      if (p) p.d.bye = true;
      close(id); pending.current.delete(id); ready.current.delete(id);
    }
    setMembers(keep ? [...new Set([...ids, ...peers.current.keys()])] : ids);
    if (!joined.current || ended.current) return;
    if (lost) return rejoin();
    for (const id of ids) if (id !== meId && !peers.current.has(id) && meId < id) void offer(id).catch(() => {});
  }

  async function handle(m: LiveMsg) {
    if (ended.current) return;
    if (m.type === 'hello' && joined.current) retryAll();
    if (m.type === 'hello' || m.type === 'room') return sync(m.room);
    if (m.type === 'declined') return toast(t('facetime.declined', { name: nameOf(me, m.from) }));
    if (m.type !== 'signal' || !m.data) return;
    const { from, data } = m;
    const p0 = peers.current.get(from);
    try {
      if (data.sdp?.type === 'offer') {
        if (!localRef.current) return;
        // Cùng phiên: gửi lại hoặc khởi động lại ICE, áp lên kết nối đang có. Phiên khác: bên mời đã dựng lại, dựng lại theo.
        // Không có sid: máy còn chạy bản cũ (bản cũ lần nào cũng dựng kết nối mới), cũng dựng lại.
        const sid = typeof data.sid === 'string' ? data.sid : '';
        const p = p0 && sid && p0.sid === sid ? p0 : makePeer(from, sid, p0);
        p.d.remote = true;
        note(p, 'off');
        await p.pc.setRemoteDescription(data.sdp);
        await flush(from, p);
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        void signal(from, { sdp: p.pc.localDescription, sid, g: data.g });
      } else if (data.sdp?.type === 'answer') {
        if (!p0 || p0.pc.signalingState !== 'have-local-offer') return;
        if ((data.sid !== undefined && data.sid !== p0.sid) || (data.g !== undefined && data.g !== p0.g)) return;
        await p0.pc.setRemoteDescription(data.sdp);
        p0.answeredAt = Date.now();
        p0.d.remote = true;
        note(p0, 'ans');
        await flush(from, p0);
      } else if (data.candidate) {
        const sid: string | undefined = typeof data.sid === 'string' ? data.sid : undefined;
        if (p0?.pc.remoteDescription && (sid === undefined || sid === p0.sid)) await p0.pc.addIceCandidate(data.candidate).catch(() => {});
        else pending.current.set(from, [...(pending.current.get(from) ?? []).filter((e) => Date.now() - e.at < 60_000), { sid, c: data.candidate, at: Date.now() }]);
      } else if (data.ready) {
        // Người kia đã vào mà chưa có lời mời của mình: mời ngay, gửi lại lời mời đang chờ, hoặc (người kia đã mất phiên) mời lại từ đầu.
        if (meId > from) return;
        if (!p0) return void offer(from).catch(() => {});
        if (p0.pc.signalingState === 'have-local-offer') { if (Date.now() - p0.sentAt > 2000) { p0.resends++; sendOffer(from, p0); } }
        else if (data.sid !== p0.sid && !isUp(p0) && Date.now() - p0.sentAt > 5000) void offer(from).catch(() => {});
      } else if (data.restart) {
        // Bên trả lời thấy rớt: bên mời sửa (theo cùng lịch chờ, không sửa dồn).
        if (p0?.offerer && (data.sid === undefined || data.sid === p0.sid) && p0.pc.signalingState === 'stable' && !p0.d.gaveUp
          && Date.now() - p0.fixAt >= Math.max(2500, fixDelay(p0.fixes))) void fix(from, p0).catch(() => {});
      } else if (data.state) {
        if (p0) { p0.cam = !!data.state.cam; p0.mic = !!data.state.mic; bump(); }
      } else if (data.smile) {
        setSmile(Date.now());
      }
    } catch (e) { console.warn('rtc', e); }
  }

  /** Một bản tóm tắt mỗi cuộc gọi (gác máy, đóng màn, đóng trang); máy chủ ghi đúng một dòng log "[facetime] diag". */
  function sendDiag(end: string) {
    if (diagSent.current || !mediaKind.current) return;
    diagSent.current = true;
    const now = Date.now();
    const list = [...done.current, ...[...peers.current.values()].map((p) => p.d)];
    void livePost('diag', {
      v: 1, room: known.current?.id ?? '', audio, turn: hasTurn(ice.current), ice: iceCount(ice.current), cfg: cfgMs.current, media: mediaKind.current,
      dur: now - t0.current, wait: firstUp.current ? firstUp.current - t0.current : -1, end, sse: liveStats().opens - sse0.current, drop: drops.current,
      peers: list.map(peerSummary),
    }, { keepalive: true }).catch(() => {});
  }

  const handleRef = useRef(handle);
  handleRef.current = handle;
  const tickRef = useRef(tick);
  tickRef.current = tick;
  const reviveRef = useRef(revive);
  reviveRef.current = revive;
  const retryRef = useRef(retryAll);
  retryRef.current = retryAll;

  useEffect(() => {
    let alive = true;
    // Gói nào treo quá 8 giây (trình duyệt không trả lời) thì bỏ qua để các gói sau không bị chặn.
    const off = onLive((m) => { chain.current = chain.current.then(() => Promise.race([handleRef.current(m), sleep(8000)])).catch((e) => console.warn('rtc', e)); });
    const iv = setInterval(() => tickRef.current(), 1000);
    const onHide = () => sendDiag('pagehide');
    window.addEventListener('pagehide', onHide);
    // Quay lại app: lấy lại micro/camera nếu đã chết; kết nối đã thôi sửa thì cho sửa lại từ đầu, bên trả lời báo "ready" lại.
    const onVis = () => {
      if (document.hidden || ended.current) return;
      void reviveRef.current();
      retryRef.current();
      tickRef.current();
    };
    document.addEventListener('visibilitychange', onVis);
    (async () => {
      const c0 = Date.now();
      const [cfg, media] = await Promise.all([
        livePost<{ iceServers: RTCIceServer[] }>('config').then((c) => { cfgMs.current = Date.now() - c0; return c; })
          .catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] as RTCIceServer[] })),
        getMedia(me.me.name, audio),
      ]);
      if (!alive) { media.stream.getTracks().forEach((tr) => tr.stop()); return; }
      ice.current = cfg.iceServers;
      iceAt.current = hasTurn(cfg.iceServers) ? Date.now() : 0;
      mediaKind.current = media.kind;
      localRef.current = media.stream;
      setLocal(media.stream);
      setFake(media.kind === 'fake' || media.kind === 'mute');
      if (media.kind === 'fake') toast(t('facetime.noCam'));
      else if (media.kind === 'mute') toast(t('facetime.noCamMic'));
      else if (media.kind === 'none') toast(t('facetime.noMic'));
      const r = await enter({ ...(to ? { to } : {}), ...(audio ? { audio: true } : {}) });
      if (!r) return;
      joined.current = true;
      joinedAt.current = Date.now();
      sync(r.room);
    })().catch((e) => toast((e as Error).message));
    return () => {
      alive = false; off(); clearInterval(iv); clearTimeout(graceEnd.current);
      window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVis);
      hangUp(true, 'unmount');
    };
  }, []);

  // Track của mình chết khi đang mở app (app khác lấy micro/camera): lấy lại ngay.
  useEffect(() => {
    const on = () => { if (!document.hidden) void reviveRef.current(); };
    const list = local?.getTracks() ?? [];
    list.forEach((tr) => tr.addEventListener('ended', on));
    return () => list.forEach((tr) => tr.removeEventListener('ended', on));
  }, [local]);

  // Còn một mình thì nghe tiếng chờ nhẹ.
  const alone = !members.filter((id) => id !== meId).length;
  const target = to ? me.members.find((m) => m.id === to) : null;
  // Gọi riêng một người mà 60 giây không ai nghe thì tự dừng.
  useEffect(() => {
    if (!to || !alone || !local) return;
    const id = setTimeout(() => { toast(t('facetime.noAnswer', { name: target?.name ?? '' })); hangUp(false, 'noanswer'); }, 60000);
    return () => clearTimeout(id);
  }, [to, alone, !!local]);
  useEffect(() => {
    if (!alone || !local) return;
    startRing('out');
    return () => stopRing();
  }, [alone, !!local]);

  function hangUp(silent = false, why = 'hangup') {
    if (ended.current) return;
    sendDiag(why);
    ended.current = true;
    for (const id of [...peers.current.keys()]) close(id, true);
    localRef.current?.getTracks().forEach((tr) => tr.stop());
    localRef.current = null;
    if (joined.current) void livePost('leave').catch(() => {});
    if (!silent) { tap(); onClose(); }
  }

  function toggle(kind: 'mic' | 'cam') {
    tap();
    const next = !(kind === 'mic' ? mic : cam);
    const tracks = kind === 'mic' ? localRef.current?.getAudioTracks() : localRef.current?.getVideoTracks();
    tracks?.forEach((tr) => { tr.enabled = next; });
    if (kind === 'mic') setMic(next); else setCam(next);
    state.current = { ...state.current, [kind]: next };
    void signal('*', { state: state.current });
  }

  const others = members.filter((id) => id !== meId);
  const micBtn = <button className={`ft-btn ${mic ? '' : 'off'}`} onClick={() => toggle('mic')} aria-label={mic ? t('facetime.micOff') : t('facetime.micOn')}><Icon name={mic ? 'mic' : 'micOff'} /></button>;
  const endBtn = <button className="ft-btn end" onClick={() => hangUp()} aria-label={t('facetime.hangUp')}><Icon name="phone" /></button>;

  // Gọi thoại: ảnh và tên người kia, dòng trạng thái (đổ chuông, đang nối, thời gian gọi); tiếng phát qua thẻ audio ẩn.
  if (audio) {
    const lead = others[0] ?? to ?? (known.current && known.current.by !== meId ? known.current.by : null);
    const who = me.members.find((m) => m.id === lead);
    const up = others.some((id) => peers.current.get(id)?.state === 'connected');
    return (
      <div className="sheet call ft">
        <div className="call-ring fade" style={{ paddingTop: '14vh', paddingBottom: 0 }}>
          <div className="call-orb">{!up && <><i /><i /></>}<b><Avatar m={who} size={96} /></b></div>
          <div className="call-who">{others.length ? others.map((id) => nameOf(me, id)).join(', ') : who?.name ?? me.family.name}</div>
          <div className="call-sub">{up && firstUp.current ? <Clock since={firstUp.current} /> : alone ? t('facetime.ringing') : t('facetime.joining')}</div>
        </div>
        {others.map((id) => { const s = peers.current.get(id)?.stream; return s ? <Sound key={id} stream={s} /> : null; })}
        <div className="ft-bar">{micBtn}{endBtn}</div>
      </div>
    );
  }

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
                {mine ? t('facetime.me') : nameOf(me, id)}
                {!mine && p && p.state !== 'connected' && <small>{t('facetime.connecting')}</small>}
              </span>
            </div>
          );
        })}
      </div>

      {alone && !!local && (
        <div className="ft-wait fade">
          <div className="ft-wait-faces">{me.members.filter((m) => (target ? m.id === target.id : m.id !== meId)).map((m) => <Avatar key={m.id} m={m} size={38} />)}</div>
          <span>{target ? t('facetime.callingOne', { name: target.name }) : t('facetime.calling')}</span>
        </div>
      )}
      {!!smile && <Countdown key={smile} onDone={() => setSmile(0)} />}

      <div className="ft-bar">
        {micBtn}
        <button className={`ft-btn ${cam ? '' : 'off'}`} onClick={() => toggle('cam')} aria-label={cam ? t('facetime.camOff') : t('facetime.camOn')}><Icon name={cam ? 'video' : 'videoOff'} /></button>
        <button className="ft-btn" onClick={() => { tap(); setBooth(true); }} aria-label={t('facetime.booth')}><Icon name="booth" /></button>
        {endBtn}
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

/** Gọi thoại: tiếng của người kia phát qua một thẻ audio ẩn. */
function Sound({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (a.srcObject !== stream) a.srcObject = stream;
    void a.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

/** Thời gian đã gọi, phút:giây. */
function Clock({ since }: { since: number }) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { const id = setInterval(tick, 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return <>{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</>;
}

function Countdown({ onDone }: { onDone: () => void }) {
  const [k, setK] = useState(3);
  useEffect(() => {
    if (k === 0) { const to = setTimeout(onDone, 500); return () => clearTimeout(to); }
    sfx('tap');
    const to = setTimeout(() => setK(k - 1), 900);
    return () => clearTimeout(to);
  }, [k]);
  return <div className="ft-count" aria-live="polite">{k ? <b key={k}>{k}</b> : <i className="ft-flash" />}<span>{t('facetime.smile')}</span></div>;
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
        const sample = [{ video: null, name: t('role.bo'), mirror: false }, { video: null, name: t('role.con'), mirror: false }];
        for (const th of THEMES) {
          c1.setTransform(120 / W, 0, 0, 150 / H, 0, 0);
          drawBooth(c1, th.id, sample, title, photo);
          out[`one:${th.id}`] = one.toDataURL('image/jpeg', 0.8);
        }
        const blank = [null, null, null];
        for (const th of STRIPS) {
          const cv = renderStrip(th.id, blank, 3, { title, when: new Date(), photo }, th.tone, false, 0.2);
          out[`strip:${th.id}`] = cv.toDataURL('image/jpeg', 0.8);
        }
        setThumbs(out);
      });
    return () => { alive = false; };
  }, [title, photo]);
  return thumbs;
}

const TONES: Tone[] = ['color', 'bw', 'wine'];

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
    const base = L.locked ? L.locked.map((f) => cur.find((x) => x.id === f.id) ?? { ...f, video: null }) : cur;
    if (L.group === 'all' || !base.length) return base;
    return [base[i % base.length]];
  }
  const pre = t('booth.familyPrefix');
  const title = pre && me.family.name.toLowerCase().startsWith(pre) ? me.family.name : t('booth.familyTitle', { name: me.family.name });
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
      const th = document.createElement('canvas');
      th.width = 160; th.height = Math.round((160 * FH) / FW);
      th.getContext('2d')!.drawImage(f, 0, 0, th.width, th.height);
      got.push({ cv: f, thumb: th.toDataURL('image/jpeg', 0.7) });
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
    if (count > 1) { sfx('tap'); const to = setTimeout(() => setCount(count - 1), 900); return () => clearTimeout(to); }
    const to = setTimeout(() => {
      const c = cv.current;
      if (!c) return;
      live.current.frozen = true;
      drawBooth(c.getContext('2d')!, live.current.theme, tilesRef.current(), title, live.current.photo);
      sfx('shutter'); buzz(30);
      c.toBlob((b) => { if (b) setShot({ url: URL.createObjectURL(b), blob: b }); setCount(0); }, 'image/jpeg', 0.9);
    }, 900);
    return () => clearTimeout(to);
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
      f.set('kind', 'photo'); f.set('caption', t('booth.caption')); f.set('file', shot.blob, 'booth.jpg');
      await api.post(f);
      sfx('send'); toast(t('booth.sent'));
      onClose();
    } catch (e) { toast((e as Error).message); setSaving(false); }
  }

  /** Điện thoại: mở bảng chia sẻ để lưu vào Ảnh. Máy tính: tải tệp về. */
  async function download() {
    if (!shot) return;
    tap();
    const name = `sweet-home-${Date.now()}.jpg`;
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
  const th1 = THEMES.find((x) => x.id === theme) ?? THEMES[0];
  const stage = mode === 'one' ? stageColor(th1.body, th1.frame) : stripStage(strip);
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
        <button className="icon-btn" onClick={() => { tap(); onClose(); }} aria-label={t('common.back')}><Icon name="back" /></button>
        <div className={`ft-seg ${busy || shot ? 'dim' : ''}`}>
          <button className={mode === 'one' ? 'on' : ''} onClick={() => !busy && !shot && pickMode('one')}>{t('booth.one')}</button>
          <button className={mode === 'strip' ? 'on' : ''} onClick={() => !busy && !shot && pickMode('strip')}>{t('booth.strip')}</button>
        </div>
        <span style={{ width: 44 }} />
      </header>
      <div className="ft-stage" style={{ background: stage }}>
        {mode === 'one' ? (
          <>
            <canvas ref={cv} width={W} height={H} className="ft-canvas" style={shot ? { display: 'none' } : undefined} />
            {shot && <img src={shot.url} className="ft-canvas" alt={t('booth.alt.one')} />}
            {count > 1 && <b key={count} className="ft-num">{count - 1}</b>}
          </>
        ) : stripDone ? (
          shot ? <img src={shot.url} className="ft-strip-out" alt={t('booth.alt.strip')} /> : null
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
            {list.map((th) => {
              const src = thumbs[`${mode}:${th.id}`];
              const inner = <>{src ? <img src={src} alt="" /> : <i />}<span>{t(`booth.${mode === 'one' ? 'theme' : 'strip'}.${th.id}` as Key)}</span></>;
              const cls = `ft-pick ${mode} ${current === th.id ? 'on' : ''}`;
              return th.id === 'photo' ? (
                <label key={th.id} className={cls}>
                  {inner}
                  <input type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              ) : <button key={th.id} className={cls} onClick={() => choose(th.id)}>{inner}</button>;
            })}
          </div>
        )}
        {mode === 'strip' && !running && (
          <div className="ft-opts">
            {!stripDone && people > 1 && (
              <button className="chip" onClick={() => { tap(); setGroup(group === 'all' ? 'each' : 'all'); }}>{group === 'all' ? t('booth.groupAll') : t('booth.groupEach')}</button>
            )}
            {!stripDone && <>
              <button className={`chip ${shots === 3 ? 'on' : ''}`} onClick={() => { tap(); setShots(3); }}>{t('booth.shots', { n: 3 })}</button>
              <button className={`chip ${shots === 4 ? 'on' : ''}`} onClick={() => { tap(); setShots(4); }}>{t('booth.shots', { n: 4 })}</button>
            </>}
            <button className="chip" onClick={() => { tap(); setPair(!pair); }}>{pair ? t('booth.pair.two') : t('booth.pair.one')}</button>
            <button className="chip" onClick={() => { tap(); setTone(TONES[(TONES.indexOf(tone) + 1) % TONES.length]); }}>{t(`booth.tone.${tone}`)}</button>
          </div>
        )}
        {shot ? (
          <>
            <button className="btn" onClick={save} disabled={saving}>{saving ? t('chat.sending') : t('booth.send')}</button>
            <div className="ft-links">
              <button className="link" onClick={download}>{t('booth.download')}</button>
              <button className="link" onClick={again}>{t('booth.again')}</button>
            </div>
          </>
        ) : (
          <button className="shutter" disabled={busy} onClick={() => { if (busy) return; if (mode === 'strip') void runStrip(); else setCount(4); }} aria-label={t('booth.shoot')}><i /></button>
        )}
      </div>
    </div>
  );
}
