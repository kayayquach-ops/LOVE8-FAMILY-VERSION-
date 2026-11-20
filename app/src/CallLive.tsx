// Mây Live (thử, 21/11/2026): cuộc gọi tuần nói thẳng với Gemini Live như "gọi Nếp": Mây nghe và đáp liền, giọng liền mạch, không kịch bản soạn trước.
// App.tsx chỉ mở màn này cho người bật "Thử Mây mới" (Me.mayLive); xin token hay nối không được thì về cuộc gọi cũ (onFallback).
// Máy chủ phát token dùng một lần (POST /api/call/live, server/calllive.ts), máy nối thẳng tới Google; xong thì báo giây, token, độ trễ một lần (live-end).
// Bản thử: hiện độ trễ lượt cuối và ghi lượt nói gần nhất để nghe lại mic thu được gì. Chi tiết: docs/may-moi.md mục "Mây Live (thử)".
import { useEffect, useRef, useState } from 'react';
import { token } from './api';
import { locale, t } from './i18n';
import { livePlayer, type LivePlayer } from './livePlayer';
import { addUsage, emptyUsage, type LiveUsage } from './liveUsage';
import { type Drive, type MascotMode } from './Mascot';
import { MascotAny as Mascot } from './Mascot3D';
import { AUDIO_TYPE, record, type Recording } from './media';
import { mascotNameOf, type Me } from './shared';
import { startRing, stopRing, tap } from './sound';
import { Icon, toast } from './ui';

const LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=';
/** Lời nhắc đầu tiên gửi model khi phiên sẵn sàng (tiếng Anh, chỉ model đọc). */
const OPEN_CUE = '(The call just connected. Greet them by name and begin.)';
/** Mây nói xong chừng này mili giây (cộng độ trễ loa) mới mở lại mic: tiếng loa dội vào mic thì Gemini tưởng người nghe ngắt lời. */
const MIC_GATE_MS = 600;
/** Mẩu mic (PCM 16 bit) có RMS trên ngưỡng này là người nghe đang nói. */
const LOUD_RMS = 1000;
/** Lượt ghi ngắn hơn chừng này giây thì bỏ (mic mở giữa hai mẩu tiếng của Mây). */
const MIN_REC_SEC = 1;
/** Mở socket rồi mà chừng này mili giây chưa có setupComplete thì về cuộc gọi cũ. */
const CONNECT_MS = 15_000;

const toB64 = (buf: ArrayBuffer) => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Mọi thứ của một cuộc gọi, ngoài React (socket, mic gọi vào bất kỳ lúc nào). */
type Live = {
  ctx: AudioContext | null; stream: MediaStream | null; node: AudioWorkletNode | null; player: LivePlayer | null; ws: WebSocket | null;
  /** Mã hàng calls máy chủ tạo cùng token: có thì lúc kết thúc phải báo live-end. */
  id: string | null; maxSec: number; t0: number; ended: boolean; usage: LiveUsage; lats: number[];
  /** Lúc Mây vừa nói xong, lúc mic nghe to gần nhất, đang chờ Mây đáp lượt người nghe vừa nói, mic đang mở, Mây đã nói lần nào chưa. */
  quietAt: number; loudAt: number; waiting: boolean; gate: boolean; spoke: boolean; talking: boolean;
  stopRec: (() => Promise<Recording>) | null; recUrl: string;
  cap: string; heard: string; newCap: boolean; newHeard: boolean; raf: number; timer: number;
  /** Hẹn giờ chờ phiên sẵn sàng (CONNECT_MS). */
  wait: number;
};
const fresh = (): Live => ({
  ctx: null, stream: null, node: null, player: null, ws: null, id: null, maxSec: 0, t0: 0, ended: false, usage: emptyUsage(), lats: [],
  quietAt: 0, loudAt: 0, waiting: false, gate: false, spoke: false, talking: false, stopRec: null, recUrl: '',
  cap: '', heard: '', newCap: true, newHeard: true, raf: 0, timer: 0, wait: 0,
});

type Phase = 'ring' | 'connecting' | 'talk';
/** fallback: về cuộc gọi cũ; gone: màn đã bị gỡ, không báo App. */
type Why = 'hangup' | 'time' | 'closed' | 'fallback' | 'gone';

export function CallLive({ me, onClose, onFallback }: { me: Me; onClose: (finished: boolean) => void; onFallback: () => void }) {
  const mascot = mascotNameOf(me.family);
  const [phase, setPhase] = useState<Phase>('ring');
  const [mode, setMode] = useState<MascotMode>('idle');
  const [caption, setCaption] = useState('');
  const [heard, setHeard] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [rec, setRec] = useState<Recording | null>(null);
  const drive = useRef<Drive>({ talking: false, pulse: 0, level: 0, voice: null });
  const S = useRef<Live>(fresh());
  const props = useRef({ onClose, onFallback });
  props.current = { onClose, onFallback };

  useEffect(() => {
    if (phase !== 'ring') return;
    startRing('in');
    return () => stopRing();
  }, [phase]);

  // Màn bị gỡ giữa chừng (không qua nút cúp máy): vẫn đóng mic, socket và báo máy chủ.
  useEffect(() => () => { end('gone'); if (S.current.recUrl) URL.revokeObjectURL(S.current.recUrl); }, []);

  const num = (x: number) => x.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const send = (o: unknown) => { const ws = S.current.ws; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };
  /** Báo máy chủ một lần: giây đã gọi, token đã dùng, độ trễ từng lượt. keepalive: vẫn gửi khi màn đóng ngay sau đó. */
  const sendEnd = (id: string, sec: number) => {
    const L = S.current;
    void fetch(`/api/call/${encodeURIComponent(id)}/live-end`, {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.get()}` },
      body: JSON.stringify({ sec, usage: L.usage, lat: L.lats }),
    }).catch(() => {});
  };

  /** Đóng hết: đồng hồ, chuông, giọng, socket, lượt đang ghi, mic, AudioContext. Gọi lại được. */
  function teardown() {
    const L = S.current;
    clearInterval(L.timer);
    clearTimeout(L.wait);
    cancelAnimationFrame(L.raf);
    stopRing();
    L.player?.stop();
    const ws = L.ws;
    L.ws = null;
    try { ws?.close(); } catch { /* đã đóng */ }
    if (L.stopRec) { void L.stopRec().then((r) => URL.revokeObjectURL(r.url)); L.stopRec = null; }
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

  /** Kết thúc một lần: dọn hết, có token thì báo live-end (chưa nối xong thì 0 giây), rồi báo App. */
  function end(why: Why) {
    const L = S.current;
    if (L.ended) return;
    L.ended = true;
    // Máy treo (khoá màn hình) thì đồng hồ vẫn chạy: không báo quá trần cuộc gọi. Máy chủ tự tính giây theo đồng hồ của nó, số này chỉ để ghi log.
    const sec = L.t0 ? Math.min(L.maxSec, Math.round((Date.now() - L.t0) / 1000)) : 0;
    teardown();
    if (L.id) sendEnd(L.id, sec);
    if (why === 'gone') return;
    if (why === 'fallback') props.current.onFallback();
    else props.current.onClose(false);
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
    let r: { id: string; token: string; model: string; maxSec: number };
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
      else end('fallback');
      return;
    }
    L.id = r.id;
    // Cúp máy lúc đang xin token: hàng calls đã có, báo 0 giây.
    if (L.ended) { sendEnd(r.id, 0); return teardown(); }
    L.maxSec = r.maxSec;
    L.player = livePlayer(L.ctx!);
    connect(r.token, r.model);
  }

  function connect(tok: string, model: string) {
    const L = S.current;
    const ws = new WebSocket(LIVE_URL + encodeURIComponent(tok));
    L.ws = ws;
    // Quá CONNECT_MS mà phiên chưa sẵn sàng: về cuộc gọi cũ như khi xin token lỗi.
    L.wait = window.setTimeout(() => { if (!L.t0) end('fallback'); }, CONNECT_MS);
    ws.binaryType = 'arraybuffer';
    const dec = new TextDecoder();
    ws.onopen = () => send({ setup: { model } });
    ws.onmessage = (e) => {
      let m: any;
      try { m = JSON.parse(typeof e.data === 'string' ? e.data : dec.decode(e.data)); } catch { return; }
      onMessage(m);
    };
    // Đóng trước khi phiên sẵn sàng: về cuộc gọi cũ. Sau đó: 1011, 1008 là Google từ chối (hết hạn mức, cấu hình sai), còn lại là mất mạng.
    ws.onclose = (e) => {
      if (L.ended || L.ws !== ws) return;
      if (!L.t0) return end('fallback');
      toast(t(e.code === 1011 || e.code === 1008 ? 'call.live.busy' : 'call.live.lost', { mascot }));
      end('closed');
    };
  }

  /** Phiên sẵn sàng: nhắc Mây chào, bắt đầu tính giờ, linh vật theo giọng Mây. */
  function connected() {
    const L = S.current;
    L.t0 = Date.now();
    clearTimeout(L.wait);
    setPhase('talk');
    setMode('listen');
    send({ clientContent: { turns: [{ role: 'user', parts: [{ text: OPEN_CUE }] }], turnComplete: true } });
    L.timer = window.setInterval(() => { if (Date.now() - L.t0 >= L.maxSec * 1000) end('time'); }, 1000);
    const tick = () => {
      const p = L.player;
      if (!p || L.ended) return;
      const talking = p.talking, d = drive.current;
      d.talking = talking;
      d.voice = talking ? Math.min(1, p.level() * 4) : null;
      if (talking !== L.talking) { L.talking = talking; setMode(talking ? 'talk' : 'listen'); }
      L.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function onMessage(m: any) {
    const L = S.current;
    if (L.ended) return;
    if (m.setupComplete) return connected();
    if (m.usageMetadata) addUsage(L.usage, m.usageMetadata);
    // Mọi lời gọi công cụ trả "ok" ngay: bản thử chưa có công cụ, lời dặn đổi sau này cũng không làm màn này đứng.
    const calls: Array<{ id?: string; name?: string }> = m.toolCall?.functionCalls ?? [];
    if (calls.length) send({ toolResponse: { functionResponses: calls.map((f) => ({ id: f.id, name: f.name, response: { result: 'ok' } })) } });
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.interrupted) { L.player?.stop(); L.newCap = true; }
    for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) onAudio(p.inlineData.data);
    if (sc.outputTranscription?.text) {
      if (L.newCap) { L.cap = ''; L.newCap = false; }
      L.cap += sc.outputTranscription.text;
      setCaption(L.cap);
    }
    if (sc.inputTranscription?.text) {
      if (L.newHeard) { L.heard = ''; L.newHeard = false; }
      L.heard += sc.inputTranscription.text;
      setHeard(L.heard);
    }
    if (sc.turnComplete) { L.newCap = true; L.newHeard = true; }
  }

  /** Mẩu tiếng của Mây: đo độ trễ lượt vừa rồi, dừng lượt đang ghi, rồi phát. */
  function onAudio(b64: string) {
    const L = S.current;
    const now = Date.now();
    // Độ trễ: từ mẩu mic to cuối của người nghe tới mẩu tiếng đầu tiên Mây đáp.
    if (L.waiting) { L.waiting = false; L.lats.push(now - L.loudAt); setLat(now - L.loudAt); }
    if (L.stopRec) {
      const stop = L.stopRec;
      L.stopRec = null;
      void stop().then((r) => {
        if (r.seconds < MIN_REC_SEC || L.ended) return URL.revokeObjectURL(r.url);
        if (L.recUrl) URL.revokeObjectURL(L.recUrl);
        L.recUrl = r.url;
        setRec(r);
      });
    }
    L.spoke = true;
    L.player?.play(b64);
  }

  /** Mẩu mic 40 ms từ worklet: chặn lúc Mây nói (như gọi Nếp), ghi lượt nói khi mic vừa mở lại, đánh dấu lúc nghe to, gửi Gemini. */
  function onMic(buf: ArrayBuffer) {
    const L = S.current, p = L.player, ctx = L.ctx;
    if (!L.t0 || L.ended || !p || !ctx) return;
    // Loa điện thoại dội tiếng Mây vào mic: mic chờ lúc Mây nói và thêm MIC_GATE_MS cộng độ trễ loa trình duyệt báo.
    if (p.talking) { L.quietAt = Date.now(); L.gate = false; return; }
    if (Date.now() - L.quietAt < MIC_GATE_MS + Math.round((ctx.outputLatency || ctx.baseLatency || 0) * 1000)) return;
    if (!L.gate) {
      L.gate = true;
      if (L.spoke && !L.stopRec && L.stream) { try { L.stopRec = record(L.stream, AUDIO_TYPE()); } catch { /* máy không ghi được */ } }
    }
    const pcm = new Int16Array(buf);
    let sum = 0;
    for (let i = 0; i < pcm.length; i += 4) sum += pcm[i] * pcm[i];
    if (Math.sqrt(sum / Math.ceil(pcm.length / 4)) > LOUD_RMS) {
      L.loudAt = Date.now();
      // Lời chào đầu không tính độ trễ: chỉ đo câu Mây đáp sau khi người nghe nói.
      if (L.spoke) L.waiting = true;
    }
    send({ realtimeInput: { audio: { data: toB64(buf), mimeType: 'audio/pcm;rate=16000' } } });
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
            <button className="call-btn later" onClick={() => { tap(); onClose(false); }}><Icon name="close" size={26} /><span>{t('common.later')}</span></button>
            <button className="call-btn pick" onClick={() => void pickUp()}><Icon name="phone" size={26} /><span>{t('call.pickUp')}</span></button>
          </div>
        </div>
      ) : (
        <div className="call-talk">
          <div className="call-top" />
          <div className="call-body">
            <Mascot drive={drive} mode={mode} />
            <p className="call-cap">{phase === 'connecting' ? t('call.live.connecting') : caption}</p>
            {heard && <p className="call-heard">{heard.length > 140 ? '…' + heard.slice(-140) : heard}</p>}
            {lat !== null && <p className="call-note">{t('call.live.lat', { mascot, s: num(lat / 1000) })}</p>}
            {rec && (
              <div className="call-note">
                <div>{t('call.live.rec', { s: num(rec.seconds) })}</div>
                <audio controls src={rec.url} style={{ width: '100%', maxWidth: 300, marginTop: 6 }} />
              </div>
            )}
          </div>
          <div className="call-foot">
            <button className="call-end" onClick={() => { tap(); end('hangup'); }} aria-label={t('call.end')}><Icon name="phone" size={26} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
