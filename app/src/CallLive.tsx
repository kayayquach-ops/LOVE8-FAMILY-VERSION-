// Mây Live (thử, 21/11/2026): cuộc gọi tuần nói thẳng với Gemini Live như "gọi Nếp": Mây nghe và đáp liền, giọng liền mạch, không kịch bản soạn trước.
// App.tsx chỉ mở màn này cho người bật "Thử Mây mới" (Me.mayLive); xin token hay nối không được thì về cuộc gọi cũ (onFallback).
// Máy chủ phát token dùng một lần (POST /api/call/live, server/calllive.ts), máy nối thẳng tới Google; xong thì báo giây, token, độ trễ một lần (live-end).
// Logic cuộc gọi là hàm thuần ở src/liveTurns.ts (công cụ, ô chuyện, ghi từng lượt, các lời nhắc), màn này chỉ nối dây: mọi tin của Live đi qua
// captureNext theo đúng thứ tự tới; mỗi lượt có tiếng vào hàng chờ (src/outbox.ts) tới /answer?live=1 kèm bản ghi giọng người kể; cúp máy vì lý do
// gì cũng chốt bằng /finish (câu hẹn, các câu Mây đã nói) khi đã có lượt nào. Chưa có (task 7): nút xin phép chia sẻ (ask_share trả "để sau",
// chuyện giữ riêng) và nút gửi ảnh (ask_photo được báo ngay "chưa có ảnh"). Chi tiết và cách thử trên điện thoại: docs/may-moi.md mục "Mây Live (thử)".
import { useEffect, useRef, useState } from 'react';
import { token } from './api';
import { snooze } from './callSnooze';
import { getLang, t } from './i18n';
import { livePlayer, type LivePlayer } from './livePlayer';
import {
  askStep, byeDue, CAPTURE_START, captureNext, clockDue, CUE, finishJob, liveStart, MIC_GATE_MS, onRec, onShareEnd, onTool, onTurn,
  recDue, remindAllow, remindFor, silentDue, type AskStep, type Capture, type CaptureAction, type CaptureEvent, type LiveState,
} from './liveTurns';
import { addUsage, emptyUsage, type LiveUsage } from './liveUsage';
import { type Drive, type MascotMode } from './Mascot';
import { MascotAny as Mascot } from './Mascot3D';
import { AUDIO_TYPE, fileName, record, type Recording } from './media';
import { send as outbox } from './outbox';
import { mascotNameOf, type CallRelay, type Me, type StoryTheme } from './shared';
import { startRing, stopRing, tap } from './sound';
import { Icon, toast } from './ui';

const LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=';
/** Mẩu mic (PCM 16 bit) có RMS trên ngưỡng này là người nghe đang nói. */
const LOUD_RMS = 1000;
/** Mở socket rồi mà chừng này mili giây chưa có setupComplete thì về cuộc gọi cũ. */
const CONNECT_MS = 15_000;
/** Dừng ghi mà máy chưa trả tệp sau chừng này (MediaRecorder kẹt): lượt vẫn gửi, chỉ có lời chép. */
const STOP_MS = 4000;
/** Cúp máy: chờ các lượt vừa khép vào hàng chờ tối đa chừng này rồi mới xếp lệnh chốt (lệnh chốt chỉ đi sau những việc xếp trước nó). */
const SETTLE_MS = 5000;
/** Màn chào: lệnh chốt chưa tới máy chủ sau chừng này thì báo mạng chập, lời kể tự gửi tiếp (như bye của Call.tsx). */
const LATER_MS = 5000;
/** Chưa có bước xin phép chia sẻ (task 7): ask_share trả câu này để Mây không đứng chờ câu trả lời không bao giờ tới; bước ấy kết thúc ngay như hết giờ
 *  (chuyện giữ riêng). Không bao giờ giả một câu trả lời có hay không. Tiếng Anh, chỉ model đọc. */
const SHARE_LATER = 'later: the family decides in the app after the call. Do not wait for an answer; thank them and go on to the goodbye.';

const toB64 = (buf: ArrayBuffer) => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const drop = (r: Recording | null) => { if (r) URL.revokeObjectURL(r.url); };

/** Bản ghi một lượt: hàm dừng (null khi máy không ghi được), lúc bắt đầu, lúc dừng, tệp sau khi dừng. */
type Rec = { stop: (() => Promise<Recording>) | null; t0: number; t1: number; p: Promise<Recording | null> | null };

/** Mọi thứ của một cuộc gọi, ngoài React (socket, mic gọi vào bất kỳ lúc nào). */
type Live = {
  ctx: AudioContext | null; stream: MediaStream | null; node: AudioWorkletNode | null; player: LivePlayer | null; ws: WebSocket | null;
  /** Mã hàng calls máy chủ tạo cùng token: có thì lúc kết thúc phải báo live-end. */
  id: string | null; maxSec: number; t0: number; ended: boolean; usage: LiveUsage; lats: number[];
  /** Lúc Mây vừa nói xong, lúc mic nghe to gần nhất, đang chờ Mây đáp lượt người nghe vừa nói, mic đang mở, Mây đã nói lần nào chưa, linh vật đang nói. */
  quietAt: number; loudAt: number; waiting: boolean; gate: boolean; spoke: boolean; talking: boolean;
  /** Trạng thái cuộc gọi (liveTurns), việc ghi từng lượt, bản ghi theo key, lượt đang chờ tệp để vào hàng chờ, số lượt đã xếp, các câu Mây đã nói. */
  st: LiveState | null; cap: Capture; recs: Map<number, Rec>; work: Promise<void>[]; count: number; lines: string[];
  /** allow lúc nhấc máy, số lời nhắn chờ lúc nhấc máy, số ảnh tới trong cuộc gọi (task 7): cho remindAllow. */
  allow: { prevCall: boolean; photos: boolean }; relays: number; photos: number;
  /** Mây đã nói xong lượt (turnComplete), lúc gần nhất có tiếng (Mây nói, mic to, lời chép, lời nhắc), đã nhắc im lặng, đã nhắc đồng hồ. */
  mayDone: boolean; idleAt: number; nudged: boolean; clocked: boolean;
  /** Chạm linh vật lúc Mây đang nói: bỏ phần còn lại của lượt đang sinh (hush của gọi Nếp). */
  hush: boolean;
  said: string; heard: string; newSaid: boolean; newHeard: boolean; raf: number; timer: number;
  /** Hẹn giờ chờ phiên sẵn sàng (CONNECT_MS). */
  wait: number;
  /** Cúp sau lời chào (end_call) hay khi Google báo sắp đóng kết nối (goAway): bước của lượt tạm biệt (askStep), lúc bắt đầu, lúc lượt ấy xong,
   *  lúc máy còn phát gần nhất, hẹn giờ kiểm (byeDue). */
  bye: AskStep | null; byeAt: number; byeDoneAt: number; talkAt: number; byeT: number;
};
const fresh = (): Live => ({
  ctx: null, stream: null, node: null, player: null, ws: null, id: null, maxSec: 0, t0: 0, ended: false, usage: emptyUsage(), lats: [],
  quietAt: 0, loudAt: 0, waiting: false, gate: false, spoke: false, talking: false,
  st: null, cap: CAPTURE_START, recs: new Map(), work: [], count: 0, lines: [], allow: { prevCall: false, photos: false }, relays: 0, photos: 0,
  mayDone: false, idleAt: 0, nudged: false, clocked: false, hush: false,
  said: '', heard: '', newSaid: true, newHeard: true, raf: 0, timer: 0, wait: 0,
  bye: null, byeAt: 0, byeDoneAt: 0, talkAt: 0, byeT: 0,
});

type Phase = 'ring' | 'connecting' | 'talk' | 'bye';
/** fallback: về cuộc gọi cũ; gone: màn đã bị gỡ, không báo App, không hiện gì. Còn lại chỉ để đọc mã: đều chốt rồi hiện màn chào hay đóng. */
type Why = 'hangup' | 'time' | 'closed' | 'bye' | 'fallback' | 'gone';
type LiveStart = { id: string; token: string; model: string; maxSec: number; relays: CallRelay[]; themes: StoryTheme[]; allow: { prevCall: boolean; photos: boolean }; family: number };

export function CallLive({ me, onClose, onFallback }: { me: Me; onClose: (finished: boolean) => void; onFallback: () => void }) {
  const mascot = mascotNameOf(me.family);
  const [phase, setPhase] = useState<Phase>('ring');
  const [mode, setMode] = useState<MascotMode>('idle');
  const [caption, setCaption] = useState('');
  const [heard, setHeard] = useState('');
  // Lệnh chốt: 'ok' khi máy chủ đã nhận (mới báo có podcast), 'later' khi mạng chập và hàng chờ còn đang gửi (như Call.tsx).
  const [sent, setSent] = useState<'none' | 'wait' | 'ok' | 'later'>('none');
  const drive = useRef<Drive>({ talking: false, pulse: 0, level: 0, voice: null });
  const S = useRef<Live>(fresh());
  const props = useRef({ onClose, onFallback });
  props.current = { onClose, onFallback };

  useEffect(() => {
    if (phase !== 'ring') return;
    startRing('in');
    return () => stopRing();
  }, [phase]);

  // Màn bị gỡ giữa chừng (không qua nút cúp máy): vẫn đóng mic, socket, chốt cuộc gọi và báo máy chủ.
  useEffect(() => () => void end('gone'), []);

  // iPhone treo AudioContext khi khoá màn hình hay mở khung chọn ảnh: quay lại app thì đánh thức (như Call.tsx).
  useEffect(() => {
    const f = () => { if (!document.hidden) wake(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  const send = (o: unknown) => { const ws = S.current.ws; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };
  /** Lời nhắn của app cho model (tiếng Anh, CUE), là một lượt người dùng xong ngay: model đáp liền. */
  const cue = (text: string) => {
    const L = S.current;
    L.idleAt = Date.now();
    L.mayDone = false;
    send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } });
  };
  /** Báo máy chủ một lần: giây đã gọi, token đã dùng, độ trễ từng lượt. keepalive: vẫn gửi khi màn đóng ngay sau đó. */
  const sendEnd = (id: string, sec: number) => {
    const L = S.current;
    void fetch(`/api/call/${encodeURIComponent(id)}/live-end`, {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.get()}` },
      body: JSON.stringify({ sec, usage: L.usage, lat: L.lats }),
    }).catch(() => {});
  };
  /** iPhone: AudioContext bị treo (khoá màn hình, khung chọn ảnh, cuộc gọi khác) thì đánh thức khi app đang hiện. */
  function wake() {
    const ctx = S.current.ctx;
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && !document.hidden) void ctx.resume().catch(() => {});
  }

  /** Đóng hết: đồng hồ, chuông, giọng, socket, bản ghi còn chạy, mic, AudioContext. Gọi lại được. */
  function teardown() {
    const L = S.current;
    clearInterval(L.timer);
    clearTimeout(L.wait);
    clearInterval(L.byeT);
    cancelAnimationFrame(L.raf);
    stopRing();
    L.player?.stop();
    const ws = L.ws;
    L.ws = null;
    try { ws?.close(); } catch { /* đã đóng */ }
    for (const [k, r] of L.recs) {
      if (r.p) continue;
      L.recs.delete(k);
      void r.stop?.().then(drop).catch(() => {});
    }
    L.stream?.getTracks().forEach((tr) => tr.stop());
    L.stream = null;
    L.node?.disconnect();
    L.node = null;
    const ctx = L.ctx;
    L.ctx = null;
    // Chờ mẩu tiếng cuối dừng hẳn rồi mới đóng (như gọi Nếp).
    if (ctx) setTimeout(() => void ctx.close().catch(() => {}), 300);
    drive.current.talking = false;
    drive.current.voice = null;
  }

  /** Kết thúc một lần, mọi lý do: lượt đang ghi hay đang chờ gửi vào hàng chờ đúng một lần, dọn hết, có token thì báo live-end (chưa nối xong
   *  thì 0 giây). Đã có lượt nào thì hiện màn chào và xếp lệnh chốt /finish sau mọi lượt (hàng chờ gửi tiếp kể cả khi đóng app); chưa có thì
   *  hoãn lời mời một ngày như màn cũ rồi đóng. */
  async function end(why: Why) {
    const L = S.current;
    if (L.ended) return;
    L.ended = true;
    // Máy treo (khoá màn hình) thì đồng hồ vẫn chạy: không báo quá trần cuộc gọi. Máy chủ tự tính giây theo đồng hồ của nó, số này chỉ để ghi log.
    const sec = L.t0 ? Math.min(L.maxSec, Math.round((Date.now() - L.t0) / 1000)) : 0;
    if (L.st) feed({ type: 'hangup' });
    teardown();
    if (L.id) sendEnd(L.id, sec);
    if (why === 'fallback') return props.current.onFallback();
    const gone = why === 'gone', id = L.id;
    if (!L.count || !id) {
      if (!gone) { snooze(); props.current.onClose(false); }
      return;
    }
    if (!gone) { setPhase('bye'); setMode('happy'); setSent('wait'); }
    await Promise.race([Promise.all(L.work), wait(SETTLE_MS)]);
    const finished = outbox({ group: id, ...finishJob(L.st!, L.lines) }).then((r) => r !== null);
    if (gone) return;
    void finished.then((ok) => setSent(ok ? 'ok' : 'none'));
    window.setTimeout(() => setSent((v) => (v === 'wait' ? 'later' : v)), LATER_MS);
  }

  // Nghe máy: mọi thứ cần cú chạm (AudioContext, mic, worklet) làm ngay trong cú chạm như Call.tsx, rồi mới xin token.
  async function pickUp() {
    tap();
    const L = S.current;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      L.ctx = new AC();
      void L.ctx!.resume();
    } catch { L.ctx = null; }
    setPhase('connecting');
    let r: LiveStart;
    try {
      const ctx = L.ctx;
      if (!ctx) throw new Error('audio');
      L.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      // Cúp máy lúc hộp xin mic còn mở: tắt mic ngay.
      if (L.ended) return teardown();
      await ctx.audioWorklet.addModule('/mic-worklet.js');
      if (L.ended) return teardown();
      L.node = new AudioWorkletNode(ctx, 'sh-mic');
      L.node.port.onmessage = (e: MessageEvent) => onMic(e.data as ArrayBuffer);
      ctx.createMediaStreamSource(L.stream).connect(L.node);
      const res = await fetch('/api/call/live', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token.get()}` } });
      if (!res.ok) throw new Error(String(res.status));
      r = await res.json();
      if (!r?.id || !r.token) throw new Error('token');
    } catch {
      // Máy chủ chưa cho (tắt, chưa bật thử, hết phút, Google lỗi), mất mạng, không có mic: về cuộc gọi cũ. Đã cúp máy thì chỉ dọn.
      if (L.ended) teardown();
      else void end('fallback');
      return;
    }
    L.id = r.id;
    // Cúp máy lúc đang xin token: hàng calls đã có, báo 0 giây.
    if (L.ended) { sendEnd(r.id, 0); return teardown(); }
    L.maxSec = r.maxSec;
    L.st = liveStart({ id: r.id, family: r.family, themes: r.themes, relays: r.relays.map((x) => x.id) });
    L.allow = r.allow;
    L.relays = r.relays.length;
    L.player = livePlayer(L.ctx!);
    connect(r.token, r.model);
  }

  function connect(tok: string, model: string) {
    const L = S.current;
    const ws = new WebSocket(LIVE_URL + encodeURIComponent(tok));
    L.ws = ws;
    // Quá CONNECT_MS mà phiên chưa sẵn sàng: về cuộc gọi cũ như khi xin token lỗi.
    L.wait = window.setTimeout(() => { if (!L.t0) void end('fallback'); }, CONNECT_MS);
    ws.binaryType = 'arraybuffer';
    const dec = new TextDecoder();
    ws.onopen = () => send({ setup: { model } });
    ws.onmessage = (e) => {
      let m: any;
      try { m = JSON.parse(typeof e.data === 'string' ? e.data : dec.decode(e.data)); } catch { return; }
      onMessage(m);
    };
    // Đóng trước khi phiên sẵn sàng: về cuộc gọi cũ. Sau đó: 1011, 1008 là Google từ chối (hết hạn mức, cấu hình sai), còn lại là mất mạng;
    // cả hai đều kết thúc êm như cúp máy: lượt đang ghi vẫn gửi, cuộc gọi vẫn chốt.
    ws.onclose = (e) => {
      if (L.ended || L.ws !== ws) return;
      if (!L.t0) return void end('fallback');
      toast(t(e.code === 1011 || e.code === 1008 ? 'call.live.busy' : 'call.live.lost', { mascot }));
      void end('closed');
    };
  }

  /** Phiên sẵn sàng: nhắc Mây chào, bắt đầu tính giờ, linh vật theo giọng Mây. */
  function connected() {
    const L = S.current;
    L.t0 = Date.now();
    clearTimeout(L.wait);
    setPhase('talk');
    setMode('listen');
    cue(CUE.open);
    L.timer = window.setInterval(tick, 1000);
    const anim = () => {
      const p = L.player;
      if (!p || L.ended) return;
      const talking = p.talking, d = drive.current;
      d.talking = talking;
      d.voice = talking ? Math.min(1, p.level() * 4) : null;
      if (talking !== L.talking) { L.talking = talking; setMode(talking ? 'talk' : 'listen'); }
      L.raf = requestAnimationFrame(anim);
    };
    anim();
  }

  /** Mỗi giây: đủ maxSec thì cúp; còn hai phút thì nhắc một lần (R12: clockDue); người kể im SILENT_MS thì nhắc một lần tới khi họ nói lại. */
  function tick() {
    const L = S.current, now = Date.now();
    if (L.ended) return;
    const el = (now - L.t0) / 1000;
    if (el >= L.maxSec) return void end('time');
    wake();
    if (L.bye) return;
    const talking = !!L.player?.talking;
    // Nhắc đồng hồ lúc Mây đã nói xong và người kể đang ngưng, để không chen ngang ai.
    if (!L.clocked && clockDue(L.maxSec, el) && L.mayDone && !talking && now - L.loudAt > 2000) {
      L.clocked = true;
      return cue(CUE.clock);
    }
    if (silentDue({ mayDone: L.mayDone, talking, quietMs: now - L.idleAt, nudged: L.nudged })) {
      L.nudged = true;
      cue(CUE.silent);
    }
  }

  // ---------- Ghi từng lượt (captureNext) ----------

  /** Một sự kiện cho việc ghi từng lượt, làm ngay các việc nó ra (không chen await, giữ đúng thứ tự tin tới). */
  function feed(e: CaptureEvent) {
    const L = S.current;
    const r = captureNext(L.cap, e);
    L.cap = r.capture;
    for (const a of r.actions) act(a);
    // Bản ghi đã dừng mà không thành lượt (lượt không có tiếng): bỏ tệp.
    for (const [k, rec] of L.recs) {
      if (!rec.p || L.cap.pending?.key === k) continue;
      L.recs.delete(k);
      void rec.p.then(drop);
    }
  }

  function act(a: CaptureAction) {
    const L = S.current;
    if (a.kind === 'startRec') {
      // Chụp ô của lượt lúc nó bắt đầu (onRec), mọi lượt, trước khi ghi và kể cả khi máy không ghi được: thiếu bản chụp thì onTurn bỏ lượt.
      if (L.st) L.st = onRec(L.st, a.key);
      let stop: Rec['stop'] = null;
      try { if (L.stream) stop = record(L.stream, AUDIO_TYPE()); } catch { /* máy không ghi được: lượt vẫn gửi lời chép */ }
      L.recs.set(a.key, { stop, t0: Date.now(), t1: 0, p: null });
    } else if (a.kind === 'stopRec') {
      const r = L.recs.get(a.key);
      if (!r || r.p) return;
      r.t1 = Date.now();
      r.p = r.stop ? Promise.race([r.stop().catch(() => null), wait(STOP_MS).then(() => null)]) : Promise.resolve(null);
    } else if (a.kind === 'turn') turn(a);
    else mayLine(a.text);
  }

  /** Lượt đã khép: onTurn ngay (ô theo bản chụp lúc lượt bắt đầu), chỉ chờ tệp ghi để xếp vào hàng chờ tới /answer?live=1. */
  function turn(a: { key: number; question: string; transcript: string }) {
    const L = S.current;
    const r = L.recs.get(a.key);
    L.recs.delete(a.key);
    const rec = r?.p ?? Promise.resolve(null);
    if (!L.st || !L.id) return void rec.then(drop);
    const seconds = r ? Math.round(((r.t1 || Date.now()) - r.t0) / 100) / 10 : 0;
    const out = onTurn(L.st, { key: a.key, question: a.question, transcript: a.transcript, seconds });
    L.st = out.state;
    const job = out.job, group = L.id;
    if (!job) return void rec.then(drop);
    L.count++;
    L.work.push(rec.then((x) => {
      drop(x);
      const blob = x?.blob.size ? x.blob : undefined;
      void outbox({ group, url: job.url, fields: job.fields, ...(blob ? { blob, file: fileName(blob, 'answer') } : {}) });
    }));
  }

  /** Mây nói xong một câu: giữ cho lệnh chốt (máy chủ ghi log chống bịa) và nhắc model một lần nếu câu có dấu hiệu bịa. */
  function mayLine(text: string) {
    const L = S.current;
    L.lines.push(text);
    if (L.lines.length > 120) L.lines.shift();
    // Sau lời chào thì thôi nhắc: nhắc lúc ấy làm Mây nói tiếp sau khi đã tạm biệt.
    if (!L.st || L.bye) return;
    const r = remindFor(L.st, text, remindAllow(L.allow, { relays: L.relays, photos: L.photos }), getLang());
    L.st = r.state;
    if (r.cue) cue(r.cue);
  }

  // ---------- Tin của Live ----------

  function onMessage(m: any) {
    const L = S.current;
    if (L.ended) return;
    if (m.setupComplete) return connected();
    if (m.usageMetadata) addUsage(L.usage, m.usageMetadata);
    // Google đóng mỗi kết nối Live sau chừng 10 phút và báo trước (goAway). Token dùng một lần nên chưa nối lại được (sessionResumption cần máy chủ
    // phát thêm token): Mây im là cúp êm như bấm nút, lượt đang ghi vẫn gửi, cuộc gọi vẫn chốt. Đóng trước lúc ấy thì ws.onclose cũng kết thúc êm.
    if (m.goAway && !L.bye) startBye('asked');
    const calls = m.toolCall?.functionCalls;
    if (Array.isArray(calls) && calls.length) onTools(calls);
    const sc = m.serverContent;
    if (!sc) return;
    const now = Date.now();
    if (sc.inputTranscription?.text) {
      const text = String(sc.inputTranscription.text);
      // Người kể lên tiếng: lượt sau của Mây phát lại bình thường, lời nhắc im lặng dùng lại được.
      L.hush = false;
      L.nudged = false;
      L.idleAt = now;
      feed({ type: 'in', text });
      if (L.newHeard) { L.heard = ''; L.newHeard = false; }
      L.heard += text;
      setHeard(L.heard);
    }
    // Tiếng Mây (trừ phần bị chạm cắt): dừng lượt người kể đang ghi, rồi phát.
    const audio: any[] = L.hush ? [] : (sc.modelTurn?.parts ?? []).filter((p: any) => p?.inlineData?.data);
    if (audio.length) {
      L.mayDone = false;
      feed({ type: 'audio' });
      if (L.bye) L.bye = askStep(L.bye, 'audio');
      for (const p of audio) onAudio(p.inlineData.data);
    }
    if (sc.outputTranscription?.text && !L.hush) {
      const text = String(sc.outputTranscription.text);
      feed({ type: 'out', text });
      if (L.newSaid) { L.said = ''; L.newSaid = false; }
      L.said += text;
      setCaption(L.said);
    }
    if (sc.interrupted) L.player?.stop();
    // Lượt của Mây xong (hay bị ngắt): lượt người kể vừa khép được gửi, câu Mây vừa nói thành câu hỏi của lượt sau. mayDone đặt trước: lời nhắc
    // chống bịa gửi trong feed làm Mây nói tiếp nên đặt lại nó.
    if (sc.turnComplete || sc.interrupted) {
      L.mayDone = true;
      L.hush = false;
      L.newSaid = true;
      L.newHeard = true;
      if (L.bye) {
        const s = askStep(L.bye, 'done');
        if (s === 'asked' && L.bye !== 'asked') L.byeDoneAt = now;
        L.bye = s;
      }
      feed({ type: 'done' });
      openTurn();
    }
  }

  /** Bắt đầu ghi lượt người kể khi mic đã mở lại và lượt của Mây đã xong hay bị chạm cắt (recDue: mic mở giữa lượt của Mây thì chưa, kẻo mất
   *  lượt đang chờ gửi). Gọi lúc mic vừa mở và lúc lượt của Mây xong (turnComplete có khi tới sau khi giọng đã phát hết). */
  function openTurn() {
    const L = S.current;
    if (recDue({ gate: L.gate, spoke: L.spoke, mayDone: L.mayDone, hush: L.hush, recording: L.cap.recording })) feed({ type: 'gate' });
  }

  /** Lời gọi công cụ: onTool cho từng lời, đáp tất cả trong một toolResponse, rồi làm việc của chúng. */
  function onTools(calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>) {
    const L = S.current;
    let st = L.st;
    const id = L.id;
    if (!st || !id) return;
    L.mayDone = false;
    L.idleAt = Date.now();
    const functionResponses: unknown[] = [], cues: string[] = [];
    for (const f of calls) {
      const r = onTool(st, { name: String(f.name ?? ''), args: f.args });
      st = r.state;
      let result = r.result;
      for (const e of r.effects) {
        if (e.kind === 'job') void outbox({ group: id, ...e.job });
        // R9: chưa có nút gửi ảnh (task 7): báo ngay "chưa có ảnh" để Mây không đứng chờ.
        else if (e.kind === 'photo') cues.push(CUE.photos(0));
        // Chưa có bước xin phép (task 7): xong ngay như hết giờ (chuyện giữ riêng, /keep), Mây được bảo cả nhà quyết sau trong app.
        else if (e.kind === 'share') {
          const s = onShareEnd(st, 'timeout');
          st = s.state;
          if (s.job) void outbox({ group: id, ...s.job });
          result = SHARE_LATER;
        } else if (e.kind === 'end') startBye('tool');
      }
      functionResponses.push({ id: f.id, name: f.name, response: { result } });
    }
    L.st = st;
    send({ toolResponse: { functionResponses } });
    cues.forEach(cue);
  }

  /** Bắt đầu chờ cúp: end_call ('tool': lời chào chưa tới) hay goAway ('asked': chỉ chờ Mây im). byeDue quyết lúc cúp, kiểm mỗi 100 ms. */
  function startBye(step: AskStep) {
    const L = S.current, now = Date.now();
    L.bye = step;
    L.byeAt = now;
    L.talkAt = now;
    L.byeDoneAt = step === 'asked' ? now : 0;
    clearInterval(L.byeT);
    L.byeT = window.setInterval(() => {
      const at = Date.now();
      if (L.player?.talking) L.talkAt = at;
      if (L.bye && byeDue({ step: L.bye, quietMs: at - L.talkAt, sinceEnd: at - L.byeAt, sinceDone: L.byeDoneAt ? at - L.byeDoneAt : 0 })) void end('bye');
    }, 100);
  }

  /** Mẩu tiếng của Mây: đo độ trễ lượt vừa rồi rồi phát. */
  function onAudio(b64: string) {
    const L = S.current;
    const now = Date.now();
    // Độ trễ: từ mẩu mic to cuối của người nghe tới mẩu tiếng đầu tiên Mây đáp (chỉ gửi trong live-end).
    if (L.waiting) { L.waiting = false; L.lats.push(now - L.loudAt); }
    L.spoke = true;
    L.idleAt = now;
    L.player?.play(b64);
  }

  /** Mẩu mic 40 ms từ worklet: chặn lúc Mây nói (như gọi Nếp), mic vừa mở lại thì bắt đầu ghi lượt người kể, đánh dấu lúc nghe to, gửi Gemini. */
  function onMic(buf: ArrayBuffer) {
    const L = S.current, p = L.player, ctx = L.ctx;
    if (!L.t0 || L.ended || !p || !ctx) return;
    const now = Date.now();
    // Loa điện thoại dội tiếng Mây vào mic: mic chờ lúc Mây nói và thêm MIC_GATE_MS cộng độ trễ loa trình duyệt báo.
    if (p.talking) { L.quietAt = now; L.idleAt = now; L.gate = false; return; }
    if (now - L.quietAt < MIC_GATE_MS + Math.round((ctx.outputLatency || ctx.baseLatency || 0) * 1000)) return;
    // Mic vừa mở lại: bắt đầu ghi lượt người kể nếu lượt của Mây đã xong (openTurn); lượt đầu tiên được ghi bắt đầu sau lời chào.
    if (!L.gate) { L.gate = true; openTurn(); }
    const pcm = new Int16Array(buf);
    let sum = 0;
    for (let i = 0; i < pcm.length; i += 4) sum += pcm[i] * pcm[i];
    if (Math.sqrt(sum / Math.ceil(pcm.length / 4)) > LOUD_RMS) {
      L.loudAt = now;
      L.idleAt = now;
      feed({ type: 'loud' });
      // Lời chào đầu không tính độ trễ: chỉ đo câu Mây đáp sau khi người nghe nói.
      if (L.spoke) L.waiting = true;
    }
    send({ realtimeInput: { audio: { data: toB64(buf), mimeType: 'audio/pcm;rate=16000' } } });
  }

  /** Chạm linh vật lúc Mây đang nói: Mây thôi nói ngay, phần lượt chưa phát bị bỏ nếu model còn đang sinh (hush của gọi Nếp), mic mở lại cho người kể. */
  function cut() {
    const L = S.current;
    if (L.ended || !L.t0 || !L.player?.talking) return;
    L.player.stop();
    if (!L.mayDone) L.hush = true;
    setMode('listen');
  }

  return (
    <div className="sheet call">
      {phase === 'ring' ? (
        <div className="call-ring fade">
          <div className="call-orb"><i /><i /><Mascot mode="wave" size={140} /></div>
          <div className="call-who">{t('call.ring.who')}</div>
          <div className="call-sub">{t('call.ring.sub')}</div>
          <div style={{ flex: 1 }} />
          <div className="call-actions">
            <button className="call-btn later" onClick={() => { tap(); snooze(); onClose(false); }}><Icon name="close" size={26} /><span>{t('common.later')}</span></button>
            <button className="call-btn pick" onClick={() => void pickUp()}><Icon name="phone" size={26} /><span>{t('call.pickUp')}</span></button>
          </div>
        </div>
      ) : (
        <div className="call-talk">
          <div className="call-top" />
          <div className="call-body">
            <div onClick={cut} style={{ alignSelf: 'center' }}><Mascot drive={drive} mode={mode} /></div>
            <p className="call-cap">{phase === 'connecting' ? t('call.live.connecting') : caption}</p>
            {phase === 'talk' && heard && <p className="call-heard">{heard.length > 140 ? '…' + heard.slice(-140) : heard}</p>}
            {phase === 'bye' && (sent === 'ok' || sent === 'later') && <p key={sent} className="call-note fade">{t(sent === 'ok' ? 'call.podcastSoon' : 'call.sendLater')}</p>}
          </div>
          <div className="call-foot">
            {phase === 'bye'
              ? <button className="btn ghost" onClick={() => { tap(); onClose(sent === 'ok'); }}>{t('common.done')}</button>
              : <button className="call-end" onClick={() => { tap(); void end('hangup'); }} aria-label={t('call.end')}><Icon name="phone" size={26} /></button>}
          </div>
        </div>
      )}
    </div>
  );
}
