// Mây Live (thử, 21/11/2026): cuộc gọi tuần nói thẳng với Gemini Live như "gọi Nếp": Mây nghe và đáp liền, giọng liền mạch, không kịch bản soạn trước.
// App.tsx chỉ mở màn này cho người bật "Thử Mây mới" (Me.mayLive); xin token hay nối không được thì về cuộc gọi cũ (onFallback).
// Máy chủ phát token dùng một lần (POST /api/call/live, server/calllive.ts), máy nối thẳng tới Google; xong thì báo giây, token, độ trễ một lần (live-end).
// Logic cuộc gọi là hàm thuần ở src/liveTurns.ts (công cụ, ô chuyện, ghi từng lượt, các lời nhắc), màn này chỉ nối dây: mọi tin của Live đi qua
// captureNext theo đúng thứ tự tới; mỗi lượt có tiếng vào hàng chờ (src/outbox.ts) tới /answer?live=1 kèm bản ghi giọng người kể; cúp máy vì lý do
// gì cũng chốt bằng /finish (câu hẹn, các câu Mây đã nói) khi đã có lượt nào. ask_share: hai nút Chia sẻ, Giữ riêng; lời đồng ý chỉ từ nút hay bộ
// đọc câu trả lời chặt (callShare.ts), tiếng Mây tự đáp bị giữ tới lúc app quyết, đồng ý bằng giọng thì Giữ riêng còn tới lúc cúp. ask_photo: ô chọn ảnh cho chuyện vừa kể, ảnh vào hàng chờ, Mây được báo
// số ảnh. Chi tiết và cách thử trên điện thoại: docs/may-moi.md mục "Mây Live (thử)".
import { useCallback, useEffect, useRef, useState } from 'react';
import { token } from './api';
import { SHARE_START, SHARE_WAIT, shareNext, type ShareEnd, type ShareEvent, type ShareState } from './callShare';
import { snooze } from './callSnooze';
import { getLang, t } from './i18n';
import { livePlayer, type LivePlayer } from './livePlayer';
import {
  askKeyAt, askStep, awayMs, byeDue, CAPTURE_START, captureNext, clockCue, CUE, finishJob, guarded, holdNext, idleDue, liveStart, MIC_GATE_MS, onRec,
  onShareEnd, onShareUndo, onTool, onTurn, photoCue, recDue, relayLine, remindAllow, remindFor, shareJob, silentDue, waitingNo, type AskStep, type Capture, type CaptureAction, type CaptureEvent, type Hold, type LiveState,
} from './liveTurns';
import { addUsage, emptyUsage, type LiveUsage } from './liveUsage';
import { type Drive, type MascotMode } from './Mascot';
import { MascotAny as Mascot } from './Mascot3D';
import { AUDIO_TYPE, fileName, record, shrinkImage, type Recording } from './media';
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
/** Bước xin phép: Mây chưa hỏi xong sau chừng này (lượt hỏi không có tiếng hay không xong) thì coi như đã hỏi, để bước nào cũng có lối ra: chặng nghe
 *  và chặng chờ nút có hẹn giờ của SHARE_WAIT, hết giờ là giữ riêng. */
const SHARE_ASK_MS = 15_000;
/** Ô xin ảnh hiện tối đa chừng này; đang mở khung chọn ảnh thì lời nhắc im lặng, máy bỏ trên bàn, đồng hồ cũng chờ tối đa chừng này. */
const PHOTO_MS = 90_000;
/** Ảnh tối đa mỗi lần chọn (như Call.tsx). */
const MAX_PHOTOS = 12;
/** Cúp máy: chờ ảnh đang thu nhỏ vào hàng chờ tối đa chừng này rồi mới xếp lệnh chốt (như finishCall của Call.tsx). */
const PHOTO_WAIT_MS = 20_000;

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
  /** allow lúc nhấc máy, số lời nhắn chờ lúc nhấc máy, số ảnh đã chọn trong cuộc gọi: cho remindAllow. */
  allow: { prevCall: boolean; photos: boolean }; relays: number; photos: number;
  /** Bước xin phép chia sẻ (callShare.ts; null: chưa tới), hẹn giờ của chặng đang chờ, bước của lượt hỏi (askStep; null: đã hỏi hay đã xong), giữ tiếng Mây
   *  (holdNext), key của lượt ghi gần nhất lúc đã hỏi (chỉ lượt key lớn hơn mới là câu trả lời), đã đồng ý bằng giọng mà chưa gỡ (nút Giữ riêng còn). */
  sh: ShareState | null; shT: number; ask: AskStep | null; hold: Hold; askKey: number; undo: boolean;
  /** Ô xin ảnh đang hiện, ô chuyện của ảnh (state.lastStory lúc ask_photo, R5), hẹn giờ ẩn ô, lúc mở khung chọn ảnh (0: không mở), ảnh đang thu nhỏ để vào
   *  hàng chờ, lượt ghi kế tiếp là lượt đầu sau khi mở khung chọn ảnh (gác lời chép muộn). */
  photoOn: boolean; photoIdx: number; photoT: number; pickAt: number; photoWork: Promise<unknown>; pickGuard: boolean;
  /** Mây đã nói xong lượt (turnComplete), lúc gần nhất có tiếng (Mây nói, mic to, lời chép, lời nhắc), lúc nhắc im lặng (0: chưa, hay người kể đã
   *  nói lại), lúc nhắc Mây chào vì máy bỏ đó (0: chưa), đã nhắc đồng hồ. */
  mayDone: boolean; idleAt: number; nudgedAt: number; idleByeAt: number; clocked: boolean;
  /** Chạm linh vật lúc Mây đang nói: bỏ phần còn lại của lượt đang sinh (hush của gọi Nếp). */
  hush: boolean;
  said: string; heard: string; newSaid: boolean; newHeard: boolean; raf: number; timer: number;
  /** Hẹn giờ chờ phiên sẵn sàng (CONNECT_MS). */
  wait: number;
  /** Cúp sau lời chào (end_call): bước của lượt tạm biệt (askStep), lúc bắt đầu, lúc lượt ấy xong, lúc máy còn phát gần nhất, hẹn giờ kiểm (byeDue). */
  bye: AskStep | null; byeAt: number; byeDoneAt: number; talkAt: number; byeT: number;
  /** Google đã báo sắp đóng kết nối (goAway), hẹn giờ cúp cứng (awayMs). */
  away: boolean; awayT: number;
};
const fresh = (): Live => ({
  ctx: null, stream: null, node: null, player: null, ws: null, id: null, maxSec: 0, t0: 0, ended: false, usage: emptyUsage(), lats: [],
  quietAt: 0, loudAt: 0, waiting: false, gate: false, spoke: false, talking: false,
  st: null, cap: CAPTURE_START, recs: new Map(), work: [], count: 0, lines: [], allow: { prevCall: false, photos: false }, relays: 0, photos: 0,
  sh: null, shT: 0, ask: null, hold: null, askKey: Infinity, undo: false, photoOn: false, photoIdx: 0, photoT: 0, pickAt: 0, photoWork: Promise.resolve(), pickGuard: false,
  mayDone: false, idleAt: 0, nudgedAt: 0, idleByeAt: 0, clocked: false, hush: false,
  said: '', heard: '', newSaid: true, newHeard: true, raf: 0, timer: 0, wait: 0,
  bye: null, byeAt: 0, byeDoneAt: 0, talkAt: 0, byeT: 0, away: false, awayT: 0,
});

/** Đang ở bước xin phép chia sẻ (đã hiện hai nút, chưa có câu trả lời). */
const asking = (L: Live) => !!L.sh && L.sh.stage !== 'done';

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
  // Ô xin ảnh, hai nút xin phép chia sẻ đang hiện dưới linh vật.
  const [showPhoto, setShowPhoto] = useState(false);
  // Nút xin phép: 'ask' hai nút; 'undo' chỉ còn Giữ riêng sau lời đồng ý bằng giọng (gỡ được tới lúc cúp).
  const [shareUi, setShareUi] = useState<'ask' | 'undo' | null>(null);
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
    clearTimeout(L.awayT);
    clearTimeout(L.shT);
    clearTimeout(L.photoT);
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

  /** Kết thúc một lần, mọi lý do: bước xin phép đang dở thì dừng như cúp máy (chuyện giữ riêng), lượt đang ghi hay đang chờ gửi vào hàng chờ đúng một
   *  lần, dọn hết, có token thì báo live-end (chưa nối xong thì 0 giây). Đã có lượt nào thì hiện màn chào và xếp /share hay /keep theo ý định chia sẻ cuối
   *  (shareJob) rồi lệnh chốt /finish, sau mọi lượt và ảnh (hàng chờ gửi tiếp kể cả khi đóng app); chưa có thì hoãn lời mời một ngày như màn cũ rồi đóng. */
  async function end(why: Why) {
    const L = S.current;
    if (L.ended) return;
    L.ended = true;
    // Máy treo (khoá màn hình) thì đồng hồ vẫn chạy: không báo quá trần cuộc gọi. Máy chủ tự tính giây theo đồng hồ của nó, số này chỉ để ghi log.
    const sec = L.t0 ? Math.min(L.maxSec, Math.round((Date.now() - L.t0) / 1000)) : 0;
    // Trước captureNext: "dạ được" nói dở lúc cúp máy không thành lời đồng ý (như hangUp của Call.tsx).
    shareGo({ type: 'hangup' });
    if (L.st) feed({ type: 'hangup' });
    teardown();
    L.photoOn = false;
    L.undo = false;
    setShowPhoto(false);
    setShareUi(null);
    if (L.id) sendEnd(L.id, sec);
    if (why === 'fallback') return props.current.onFallback();
    const gone = why === 'gone', id = L.id;
    if (!L.count || !id) {
      if (!gone) { snooze(); props.current.onClose(false); }
      return;
    }
    if (!gone) { setPhase('bye'); setMode('happy'); setSent('wait'); }
    await Promise.all([Promise.race([Promise.all(L.work), wait(SETTLE_MS)]), Promise.race([L.photoWork, wait(PHOTO_WAIT_MS)])]);
    // Ý định chia sẻ cuối cùng mới thành /share hay /keep, ngay trước lệnh chốt (việc cuối nhóm, đi sau nó). Chưa tới đây (app bị tắt) thì chuyện giữ riêng.
    const sj = shareJob(L.st!);
    if (sj) void outbox({ group: id, ...sj });
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
    // Cuộc gọi đầu (chưa có cuộc gọi xong, DATA.trial): lời dặn bỏ bước lời nhắn khó nói.
    L.st = liveStart({ id: r.id, family: r.family, themes: r.themes, relays: r.relays.map((x) => x.id), trial: !r.allow.prevCall });
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
    // cả hai đều kết thúc êm như cúp máy: lượt đang ghi vẫn gửi, cuộc gọi vẫn chốt. Đóng sau goAway là đã báo trước: không toast (awayEnd).
    ws.onclose = (e) => {
      if (L.ended || L.ws !== ws) return;
      if (!L.t0) return void end('fallback');
      if (L.away) return awayEnd();
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

  /** Mỗi giây: đủ maxSec thì cúp; còn hai phút thì nhắc một lần lúc không ai nói (clockCue, R12); người kể im SILENT_MS thì nhắc một lần tới khi họ
   *  nói lại; nhắc rồi mà một phút sau vẫn im (máy bỏ trên bàn) thì nhắc Mây chào, Mây không vào bước chào thì cúp (idleDue). Đang chào, Google
   *  sắp đóng kết nối, đang xin phép chia sẻ (tiếng Mây bị giữ, bước ấy có hẹn giờ riêng) hay đang mở khung chọn ảnh (tối đa PHOTO_MS) thì thôi nhắc. */
  function tick() {
    const L = S.current, now = Date.now();
    if (L.ended) return;
    const el = (now - L.t0) / 1000;
    if (el >= L.maxSec) return void end('time');
    wake();
    if (L.bye || L.away || asking(L) || (L.pickAt && now - L.pickAt < PHOTO_MS)) return;
    const idle = idleDue({ now, nudgedAt: L.nudgedAt, byeAt: L.idleByeAt });
    if (idle === 'hang') return void end('bye');
    if (idle === 'bye') { L.idleByeAt = now; return cue(CUE.idle); }
    if (L.idleByeAt) return;
    const talking = !!L.player?.talking, quietMs = now - L.idleAt;
    if (!L.clocked && clockCue({ maxSec: L.maxSec, elapsedSec: el, mayDone: L.mayDone, talking, quietMs })) {
      L.clocked = true;
      return cue(CUE.clock);
    }
    if (silentDue({ mayDone: L.mayDone, talking, quietMs, nudged: L.nudgedAt > 0 })) {
      L.nudgedAt = now;
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
      // Lượt ngay sau lời nhắn khó nói, lượt bắt đầu lúc đang xin phép, lượt đầu sau khi mở khung chọn ảnh: gác (guarded), để lời chép muộn của lượt
      // trước (đuôi lời nhắn, "...thì được") không vào lượt này (captureNext bỏ lời chép trước tiếng to đầu tiên).
      if (guarded(L.st?.rec[a.key], L.pickGuard)) L.cap = captureNext(L.cap, { type: 'guard' }).capture;
      L.pickGuard = false;
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
    const out = onTurn(L.st, { key: a.key, question: a.question, transcript: a.transcript, seconds, askKey: L.askKey });
    L.st = out.state;
    // Chỉ lượt bắt đầu sau lúc đã hỏi (askKey) là câu trả lời, không gửi như lượt kể (job null), và chỉ bộ đọc câu trả lời quyết (shareNext). Lượt mở
    // trong khe giữa lời gọi ask_share và câu hỏi là lượt kể của ô lúc nó bắt đầu (onTurn), không bao giờ được đọc.
    if (out.consent) shareGo({ type: 'heard', text: a.transcript });
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
    // Mây hỏi lời nhắn khó nói mà quên relay_open: lượt kế vào ô 1 (relayLine). Ở đây trước khi lượt ấy bắt đầu ghi (openTurn sau feed done); lượt
    // đang ghi lúc này (chạm linh vật cắt câu hỏi rồi nói ngay) cũng sang ô 1.
    if (L.st) L.st = relayLine(L.st, text, L.cap.recording ? L.cap.key : undefined);
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
    if (m.goAway && !L.away) goAway(m.goAway.timeLeft);
    const calls = m.toolCall?.functionCalls;
    if (Array.isArray(calls) && calls.length) onTools(calls);
    const sc = m.serverContent;
    if (!sc) return;
    const now = Date.now();
    if (sc.inputTranscription?.text) {
      const text = String(sc.inputTranscription.text);
      // Người kể lên tiếng: lượt sau của Mây phát lại bình thường, lời nhắc im lặng dùng lại được.
      L.hush = false;
      L.nudgedAt = 0;
      L.idleByeAt = 0;
      L.idleAt = now;
      feed({ type: 'in', text });
      if (L.newHeard) { L.heard = ''; L.newHeard = false; }
      L.heard += text;
      setHeard(L.heard);
    }
    // Tiếng Mây (trừ phần bị chạm cắt): dừng lượt người kể đang ghi, rồi phát. Lúc xin phép (hold) không phát, không phụ đề, không đo độ trễ (phán
    // quyết 11), nhưng vẫn báo captureNext để lượt trả lời khép (R8).
    const audio: any[] = L.hush ? [] : (sc.modelTurn?.parts ?? []).filter((p: any) => p?.inlineData?.data);
    if (audio.length) {
      L.mayDone = false;
      feed({ type: 'audio' });
      if (L.bye) L.bye = askStep(L.bye, 'audio');
      if (L.ask) L.ask = askStep(L.ask, 'audio');
      if (L.hold) L.waiting = false;
      else for (const p of audio) onAudio(p.inlineData.data);
    }
    if (sc.outputTranscription?.text && !L.hush && !L.hold) {
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
      // Đang giữ tiếng mà lượt của Mây xong lúc lượt trả lời còn đang ghi (Mây im, lượt không có tiếng): lượt trả lời vẫn khép (R8).
      if (L.hold === 'share' && L.cap.recording) feed({ type: 'audio' });
      L.hold = holdNext(L.hold, { type: 'done' });
      feed({ type: 'done' });
      // Lượt hỏi chia sẻ có tiếng đã xong: chặng nghe câu trả lời, từ đây giữ tiếng Mây (askStep, R8). Sau feed done: lượt ghi trước câu hỏi khép
      // trước khi tính là đã hỏi; chỉ lượt sau askKey (mở ở openTurn ngay dưới, hay đang ghi vì người kể chạm linh vật cắt câu hỏi) mới là câu trả lời.
      if (L.ask) {
        const s = askStep(L.ask, 'done');
        L.ask = s === 'asked' ? null : s;
        if (s === 'asked') { L.askKey = askKeyAt(L.cap, true); shareGo({ type: 'asked' }); }
      }
      openTurn();
    }
  }

  /** Bắt đầu ghi lượt người kể khi mic đã mở lại và lượt của Mây đã xong hay bị chạm cắt (recDue: mic mở giữa lượt của Mây thì chưa, kẻo mất
   *  lượt đang chờ gửi). Gọi lúc mic vừa mở và lúc lượt của Mây xong (turnComplete có khi tới sau khi giọng đã phát hết). */
  function openTurn() {
    const L = S.current;
    if (recDue({ gate: L.gate, spoke: L.spoke, mayDone: L.mayDone, hush: L.hush, recording: L.cap.recording })) feed({ type: 'gate' });
  }

  /** Lời gọi công cụ: onTool cho từng lời, làm việc của chúng, rồi đáp tất cả trong một toolResponse. Mây sang chuyện khác, hỏi chia sẻ hay chào
   *  thì ô xin ảnh ẩn. */
  function onTools(calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>) {
    const L = S.current;
    const id = L.id;
    if (!L.st || !id) return;
    L.mayDone = false;
    L.idleAt = Date.now();
    const functionResponses: unknown[] = [];
    for (const f of calls) {
      const name = String(f.name ?? '');
      if (name === 'story_open' || name === 'ask_share' || name === 'end_call') photoStop();
      // App đã bảo Mây chào (máy bỏ trên bàn, Google sắp đóng kết nối): end_call không bị bảo gọi relay_open trước.
      const r = onTool(L.st, { name, args: f.args }, { wrap: L.away || L.idleByeAt > 0 });
      L.st = r.state;
      for (const e of r.effects) {
        if (e.kind === 'job') void outbox({ group: id, ...e.job });
        else if (e.kind === 'photo') photoStart(r.state.lastStory);
        else if (e.kind === 'share') shareStart();
        else {
          // end_call giữa bước xin phép (có khi giữa lượt Mây tự đáp, trước turnComplete): lượt trả lời đang chờ khép chỉ được đọc khi là lời từ chối
          // (waitingNo: lời chép lúc ấy có thể bị cắt, đồng ý thì không nhận), rồi bước dừng; còn lại chuyện giữ riêng. quiet: không nhắn model, thôi
          // giữ tiếng ngay để lời chào được nghe.
          const text = waitingNo(L.cap, L.st, L.askKey, getLang());
          if (text) shareGo({ type: 'heard', text }, true);
          shareGo({ type: 'hangup' }, true);
          startBye();
        }
      }
      functionResponses.push({ id: f.id, name: f.name, response: { result: r.result } });
    }
    send({ toolResponse: { functionResponses } });
  }

  // ---------- Xin phép chia sẻ (callShare.ts, phán quyết 4 và 11) ----------

  /** ask_share được nhận: hiện hai nút, chặng Mây hỏi. Lượt có tiếng sau lời đáp công cụ xong thì coi là đã hỏi (askStep trong onMessage, R8); quá
   *  SHARE_ASK_MS mà chưa thì sang thẳng chặng chờ nút. */
  function shareStart() {
    const L = S.current;
    L.sh = SHARE_START;
    L.ask = 'tool';
    L.askKey = Infinity;
    clearTimeout(L.shT);
    // Câu hỏi chưa thành tiếng: không có gì để nghe, chỉ chờ nút (asked rồi timeout: chặng chờ nút, hết giờ là giữ riêng).
    L.shT = window.setTimeout(() => {
      L.askKey = askKeyAt(L.cap, false);
      L.ask = null;
      shareGo({ type: 'asked' });
      shareGo({ type: 'timeout' });
    }, SHARE_ASK_MS);
    setShareUi('ask');
  }

  /** Một sự kiện của bước xin phép (shareNext, bộ đọc câu trả lời chặt): đã hỏi, lời của lượt trả lời (onTurn consent), nút, hết giờ, cúp máy. Đã hỏi
   *  thì giữ tiếng Mây; mỗi chặng có hẹn giờ của nó (SHARE_WAIT); xong thì shareEnd. Sự kiện không hợp chặng (lời tới sau khi đã quyết) thì bỏ qua.
   *  quiet: bước dừng vì Mây đang chào (end_call). */
  function shareGo(e: ShareEvent, quiet = false) {
    const L = S.current;
    if (!L.sh) return;
    const prev = L.sh, next = shareNext(prev, e, getLang(), { strict: true });
    if (next === prev) return;
    L.sh = next;
    clearTimeout(L.shT);
    if (e.type === 'asked') L.hold = holdNext(L.hold, { type: 'asked' });
    const ms = SHARE_WAIT[next.stage];
    if (ms) L.shT = window.setTimeout(() => shareGo({ type: 'timeout' }), ms);
    if (next.end) shareEnd(next.end, e.type === 'heard', quiet);
  }

  /** Bước xin phép xong: ý định chia sẻ (onShareEnd; /share hay /keep chỉ xếp lúc cúp máy, shareJob trong end); ẩn hai nút, trừ khi đồng ý bằng giọng
   *  (voice): Giữ riêng còn tới lúc cúp để đổi ý (undoShare); thôi giữ tiếng Mây (holdNext: còn giữa một lượt của Mây thì bỏ nốt lượt ấy); nhắn model
   *  câu trả lời. quiet (Mây đang chào): không nhắn, thôi giữ ngay. Quyết trước lúc tính là đã hỏi (bấm nút lúc Mây còn hỏi) thì askKey tính lúc này. */
  function shareEnd(end: ShareEnd, voice: boolean, quiet: boolean) {
    const L = S.current;
    if (L.askKey === Infinity) L.askKey = askKeyAt(L.cap, L.ask === 'spoke');
    L.ask = null;
    L.undo = voice && end === 'yes';
    setShareUi(L.undo ? 'undo' : null);
    if (!L.st) return;
    const r = onShareEnd(L.st, end);
    L.st = r.state;
    if (quiet) { L.hold = null; return; }
    // Bấm nút lúc Mây còn đang hỏi: thôi nói ngay (như bước chia sẻ của Call.tsx); câu đáp câu nhắn tới ngay sau.
    if (end !== 'hangup') L.player?.stop();
    L.hold = holdNext(L.hold, { type: 'decided', end, mayDone: L.mayDone });
    if (r.cue) cue(r.cue);
  }

  /** Đồng ý bằng giọng rồi bấm Giữ riêng (trước khi cúp): chỉ đổi ý định trên máy (onShareUndo; chưa có /share nào đã gửi, lúc cúp là /keep); Mây được
   *  nhắn chuyện giữ riêng, trừ lúc đang chào. Một lần. */
  function undoShare() {
    const L = S.current;
    if (!L.undo || !L.st) return;
    L.undo = false;
    setShareUi(null);
    const r = onShareUndo(L.st);
    L.st = r.state;
    if (r.cue && !L.bye && !L.away) cue(r.cue);
  }

  // ---------- Xin ảnh (như bước ảnh của Call.tsx) ----------

  /** Người kể vừa chạm nút ảnh hay nút chia sẻ: họ đang ở đây, lời nhắc im lặng và máy bỏ trên bàn tính lại từ đầu. */
  function here() {
    const L = S.current;
    L.nudgedAt = 0;
    L.idleByeAt = 0;
    L.idleAt = Date.now();
  }

  /** ask_photo được nhận: hiện ô xin ảnh cho ô chuyện idx (state.lastStory, R5), tối đa PHOTO_MS. */
  function photoStart(idx: number) {
    const L = S.current;
    clearTimeout(L.photoT);
    L.photoOn = true;
    L.photoIdx = idx;
    L.photoT = window.setTimeout(photoStop, PHOTO_MS);
    setShowPhoto(true);
  }

  /** Ẩn ô xin ảnh, không báo model. Ô chọn ảnh vẫn nằm trong cây: khung chọn còn mở thì ảnh chọn muộn vẫn tới đúng ô chuyện. */
  function photoStop() {
    const L = S.current;
    if (!L.photoOn) return;
    L.photoOn = false;
    clearTimeout(L.photoT);
    setShowPhoto(false);
  }

  /** Chọn xong n ảnh, hay bấm Để sau, huỷ khung chọn (0): đánh thức AudioContext (iPhone treo nó khi mở khung chọn ảnh), ẩn ô, báo model (photoCue). */
  function photoDone(n: number) {
    const L = S.current;
    L.pickAt = 0;
    here();
    wake();
    const on = L.photoOn;
    photoStop();
    if (L.ended) return;
    const c = photoCue({ n, on, quiet: !!L.bye || L.away || asking(L) });
    if (c) cue(c);
  }

  /** Ảnh cho ô chuyện idx (bản sao keepPhotos của Call.tsx): thu nhỏ rồi mỗi ảnh một việc trong hàng chờ, có key chống trùng khi gửi lại. Việc cuối
   *  nhóm (last) để đi sau /story của ô ấy (cũng là việc cuối): tới trước thì máy chủ chưa có ô, ảnh không thuộc chuyện nào. Chạy ở nền; lệnh chốt
   *  chờ ảnh vào hàng chờ tối đa PHOTO_WAIT_MS. */
  function keepPhotos(id: string, idx: number, files: File[]) {
    const L = S.current;
    const queued = (async () => {
      const blobs: Blob[] = [];
      for (const f of files) blobs.push(await shrinkImage(f));
      return blobs.map((blob) => outbox({
        group: id, url: `/api/call/${id}/photo`, blob, file: fileName(blob, 'photo'), last: true,
        fields: { idx: String(idx), key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` },
      }));
    })();
    L.photoWork = Promise.all([L.photoWork, queued.catch(() => null)]);
    void queued.then((jobs) => Promise.all(jobs)).then((rs) => {
      const k = rs.filter((r) => r !== null).length;
      toast(k ? t('call.photosSaved', { n: k }) : t('call.photoFailed'));
    }).catch(() => toast(t('call.photoFailed')));
  }

  /** Mở khung chọn ảnh: lượt đang ghi khép luôn (bản ghi không dính lúc lục ảnh; lượt sau bắt đầu khi Mây đáp xong câu báo ảnh), trừ khi đã có lượt chờ
   *  gửi (captureNext chỉ giữ một, khép thêm sẽ đè mất nó); mic thôi gửi Gemini, báo Gemini dòng tiếng đã dừng (audioStreamEnd) và các lời nhắc chờ (tick),
   *  tới khi khung chọn trả về (photoDone) hay tối đa PHOTO_MS. Lượt đầu sau đó bị gác: lời chép muộn của lời nói trước lúc chọn ảnh không vào nó. */
  function pickStart() {
    const L = S.current;
    here();
    L.pickAt = Date.now();
    L.gate = false;
    L.pickGuard = true;
    if (L.cap.recording && !L.cap.pending) { feed({ type: 'audio' }); feed({ type: 'done' }); }
    send({ realtimeInput: { audioStreamEnd: true } });
  }

  /** Khung chọn ảnh trả về (như Call.tsx). Chọn muộn mà ô đã ẩn vì Mây đi tiếp vẫn giữ ảnh cho đúng ô chuyện ấy. Khung chọn mở quá PHOTO_MS (mic, lời nhắc
   *  đã chạy lại) hay cuộc gọi đã kết thúc (lệnh chốt đã hay sắp xếp, ảnh tới sau không vào tập) thì bỏ ảnh, báo chưa gửi được. Ảnh đã chọn thì Mây được
   *  nhắc tới ảnh (remindAllow). */
  function pickPhotos(input: HTMLInputElement) {
    const L = S.current;
    const files = [...(input.files ?? [])].filter((f) => /^image\/(?!gif)/.test(f.type) || !f.type).slice(0, MAX_PHOTOS);
    input.value = '';
    const late = L.ended || (L.pickAt > 0 && Date.now() - L.pickAt >= PHOTO_MS);
    if (files.length && late) toast(t('call.photoFailed'));
    else if (files.length && L.id) {
      keepPhotos(L.id, L.photoIdx, files);
      L.photos += files.length;
    }
    photoDone(late ? 0 : files.length);
  }

  // Huỷ khung chọn ảnh: Safari và Chrome mới báo 'cancel' (React không nối sự kiện này cho ô chọn tệp), như Call.tsx. Máy không báo thì ô tự ẩn sau PHOTO_MS.
  const photoCancel = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    const f = () => photoDone(0);
    el.addEventListener('cancel', f);
    return () => el.removeEventListener('cancel', f);
  }, []);

  /** Google đóng mỗi kết nối Live sau chừng 10 phút và báo trước (goAway). Token dùng một lần nên chưa nối lại được (sessionResumption cần máy chủ
   *  phát thêm token). Ghi log giây đã gọi và timeLeft (đo giới hạn thật), nhắc Mây chào kèm câu hẹn (CUE.away, Mây gọi end_call rồi đường cúp sau
   *  lời chào lo tiếp), và hẹn cúp cứng trước timeLeft một chút (awayMs) nếu lời chào chưa xong. Đang xin phép chia sẻ thì bước ấy dừng không có câu
   *  trả lời (chuyện giữ riêng) để lời chào không bị giữ. */
  function goAway(timeLeft: unknown) {
    const L = S.current;
    L.away = true;
    console.info(`[call-live] goAway sau ${Math.round((Date.now() - L.t0) / 1000)} s, timeLeft ${String(timeLeft ?? '?')}`);
    shareGo({ type: 'hangup' });
    if (!L.bye && !L.idleByeAt) cue(CUE.away);
    L.awayT = window.setTimeout(awayEnd, awayMs(timeLeft));
  }

  /** Hết giờ sau goAway hay Google đã đóng: lời chào đã có tiếng thì để giọng đã tới phát hết (coi như lượt tạm biệt xong, byeDue tối đa 8 giây),
   *  chưa thì cúp ngay. Cúp kiểu nào cũng gửi lượt đang ghi và chốt cuộc gọi. */
  function awayEnd() {
    const L = S.current;
    if (L.ended) return;
    if (L.bye === 'spoke' || L.bye === 'asked') {
      if (L.bye === 'spoke') { L.bye = 'asked'; L.byeDoneAt = Date.now(); }
      return;
    }
    void end('closed');
  }

  /** Bắt đầu chờ cúp sau end_call: lời chào chưa tới ('tool'). byeDue quyết lúc cúp, kiểm mỗi 100 ms. */
  function startBye() {
    const L = S.current, now = Date.now();
    L.bye = 'tool';
    L.byeAt = now;
    L.talkAt = now;
    L.byeDoneAt = 0;
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
    // Khung chọn ảnh đang mở (tối đa PHOTO_MS): không gửi mic, không mở lượt; khung chọn trả về thì mic mở lại như sau lượt của Mây.
    if (L.pickAt && now - L.pickAt < PHOTO_MS) { L.gate = false; return; }
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
            {/* Ô chọn ảnh luôn nằm trong cây, chỉ ẩn đi: ô đã ẩn lúc khung chọn ảnh còn mở thì ảnh chọn muộn vẫn tới được (như Call.tsx). */}
            <div className={showPhoto ? 'call-photo fade' : 'call-photo off'}>
              <label className="btn">
                <Icon name="image" size={20} /> {t('call.pickPhoto')}
                <input ref={photoCancel} type="file" accept="image/*" multiple hidden
                  onClick={() => { tap(); pickStart(); }} onChange={(e) => pickPhotos(e.currentTarget)} />
              </label>
              <button className="link" onClick={() => { tap(); photoDone(0); }}>{t('common.later')}</button>
            </div>
            <div className={shareUi ? 'call-photo fade' : 'call-photo off'}>
              {shareUi === 'ask' && <button className="btn" onClick={() => { tap(); here(); shareGo({ type: 'yes' }); }}>{t('call.share.yes')}</button>}
              <button className="link" onClick={() => { tap(); here(); if (S.current.undo) undoShare(); else shareGo({ type: 'no' }); }}>{t('call.share.no')}</button>
            </div>
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
