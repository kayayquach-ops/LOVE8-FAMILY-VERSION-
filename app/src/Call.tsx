import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText, token } from './api';
import { PHOTO_HEAR_MS, PHOTO_START, PHOTO_WAIT, photoMic, photoNext, type PhotoEnd, type PhotoEvent } from './callPhoto';
import { type Drive, type MascotMode } from './Mascot';
import { MascotAny as Mascot } from './Mascot3D';
import { AUDIO_TYPE, fileName, record, shrinkImage, type Recording } from './media';
import { send as outbox } from './outbox';
import { callLines, MAX_STORY_FOLLOW, relayNone, type CallRelay, type CallScript, type Me, type TurnAI } from './shared';
import { buzz, sfx, startRing, stopRing, tap } from './sound';
import { playVoice, prefetchVoice, resetVoice, setVoiceContext, speak, stopSpeaking, ttsReady, unlockSpeech, voiceCut, voiceProvider, voiceReady, warmVoice, type Kind } from './speech';
import { Icon, toast } from './ui';
import { snooze } from './callSnooze';
import { shownLang, speechLang, t, type Key, type Lang } from './i18n';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(path, { ...init, headers: { ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(t ? { authorization: `Bearer ${t}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

/** Máy có chép lời được không (Chrome, Safari mới có webkitSpeechRecognition). */
function Recognition(): any {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Nhịp nghe: im bao lâu thì coi là kể xong, im bao lâu thì nhắc.
const VAD = {
  tick: 50,
  calibrate: 350, // đo tiếng ồn nền lúc đầu
  startMs: 150, // có tiếng liên tục chừng này mới tính là bắt đầu nói
  endMs: 1900, // ngừng chừng này là xong câu
  shortExtra: 700, // câu trả lời còn ngắn thì chờ thêm
  hesitateExtra: 600, // vừa ờ, à, thì, là... thì chờ thêm
  endCap: 3400,
  silence: 9000, // không nói gì
  maxAnswer: 180_000,
};
// Từ ngập ngừng ở cuối lời đang nói (người nói còn định nói tiếp) theo thứ tiếng của người nói.
const FILLER: Record<Lang, RegExp> = {
  // i18n-ok
  vi: /(?:^|\s)(ờ|ừ|ừm|à|ơ|thì|là|mà|và|với|nhưng|rồi|cái|kiểu)\s*$/i,
  en: /(?:^|\s)(um+|uh+|er+|erm|hmm+|so|and|but|like|because|the|a|with|then|or)\s*$/i,
  ko: /(?:^|\s)(음+|어+|그+|저기|그러니까|그래서|그리고|근데|그런데|뭐지|있잖아요?)\s*$/,
};

type Heard = { recording: Recording | null; transcript: string; speechMs: number };
type Saved = { transcript?: string | null; reply?: string | null; ai?: TurnAI | null } | null;
type Session = { id: string; script: CallScript; relays?: CallRelay[] };
/** Một câu chuyện đang kể: các lượt đã xong (gửi kèm cho AI), đã có ngày chưa, có xin ảnh không. */
type Story = { prior: Array<{ q: string; a: string }>; dated: boolean; photo: boolean };
const NO_AI: TurnAI = { reply: null, follow: null, date: null, confirm: null, story: false, say: null };
/** Ảnh tối đa mỗi lần chọn. */
const MAX_PHOTOS = 12;
type Phase = 'ring' | 'talk' | 'photo' | 'bye';

// Sweet Home gọi: đổ chuông, nhấc máy, linh vật hỏi thăm, mời kể một chuyện chính rồi hỏi thêm, xin ảnh, lời nhắn.
export function Call({ me, onClose }: { me: Me; onClose: (finished: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('ring');
  const [mode, setMode] = useState<MascotMode>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [i, setI] = useState(0);
  const [caption, setCaption] = useState('');
  const [heard, setHeard] = useState('');
  // Lệnh kết thúc cuộc gọi: 'ok' khi máy chủ đã nhận (mới báo có podcast), 'later' khi mạng chập và hàng chờ còn đang gửi.
  const [sent, setSent] = useState<'none' | 'wait' | 'ok' | 'later'>('none');
  const drive = useRef<Drive>({ talking: false, pulse: 0, level: 0 });
  const prep = useRef<Promise<Session> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const rec = useRef<any>(null);
  const live = useRef(true);
  const idx = useRef(0);
  // Lượt đang nghe trong câu chuyện (0 là câu chính) và đúng câu Mây vừa hỏi: cúp máy giữa chừng vẫn gửi đúng hàng.
  const turnRef = useRef(0);
  const askedRef = useRef('');
  // Số câu trả lời đã vào hàng chờ gửi (outbox.ts giữ tới khi máy chủ nhận).
  const count = useRef(0);
  const hearing = useRef<Promise<Heard | null> | null>(null);
  const endHear = useRef<(() => void) | null>(null);
  // Bước xin ảnh đang chạy: nút, khung chọn ảnh và nút cúp máy báo vào đây (xem callPhoto.ts). photoIdx là câu chuyện của bước ảnh gần nhất.
  const photoEvent = useRef<((e: PhotoEvent) => void) | null>(null);
  const photoIdx = useRef(0);
  // Ảnh đang thu nhỏ ở nền: lệnh kết thúc chờ ảnh vào hàng chờ trước để podcast có ảnh.
  const photoWork = useRef<Promise<unknown>>(Promise.resolve());
  // Câu Mây đang nói (mỗi câu một số): hush() hay câu mới đến thì câu cũ thôi, không chen tiếng hay đụng vào linh vật nữa.
  const sayGen = useRef(0);
  const sayCut = useRef<() => void>(() => {});

  const role = me.me.role;
  const lines = callLines(role, (k, v) => t(k as Key, v));
  // Một giọng cho cả cuộc gọi: Gemini, hoặc giọng máy nếu Gemini không dùng được ngay từ đầu.
  const machine = useRef(false);

  // Chuẩn bị câu hỏi ngay khi chuông reo để nhấc máy là nói được.
  useEffect(() => {
    resetVoice();
    void ttsReady();
    prep.current = call<Session>('/api/call/start', { method: 'POST' });
    prep.current.then(setSession).catch(() => {});
    return () => { live.current = false; cleanup(); };
  }, []);

  // Có bộ câu hỏi (và máy chủ báo còn hạn mức) là xin trước giọng đọc lời chào + câu đầu (một yêu cầu), chuông còn reo thì giọng đã sẵn.
  useEffect(() => {
    if (!session) return;
    const first = opening(session.script);
    if (first) void ttsReady().then((ok) => ok && prefetchVoice(first));
  }, [session]);

  useEffect(() => {
    if (phase !== 'ring') return;
    startRing('in');
    return () => stopRing();
  }, [phase]);

  function cleanup() {
    stopSpeaking();
    endHear.current?.();
    try { rec.current?.stop(); } catch {}
    rec.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setVoiceContext(null);
    audio.current?.close().catch(() => {});
    audio.current = null;
    analyser.current = null;
  }

  async function pickUp() {
    tap();
    unlockSpeech();
    // iPhone chỉ cho mở âm thanh và micro ngay trong cú chạm, nên tạo AudioContext trước mọi lệnh chờ.
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      audio.current = new AC();
      void audio.current!.resume();
    } catch { audio.current = null; }
    setVoiceContext(audio.current);
    setPhase('talk');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (audio.current) {
        const a = audio.current.createAnalyser();
        a.fftSize = 1024;
        audio.current.createMediaStreamSource(stream.current).connect(a);
        analyser.current = a;
      }
    } catch {
      toast(t('call.needMic'));
    }
    let s: Session | null = session;
    try {
      s = s ?? (await prep.current!);
      setSession(s);
      await run(s);
    } catch (e) {
      toast((e as Error).message);
      // Đã kể được câu nào thì vẫn chốt cuộc gọi, để câu chuyện không nằm mãi ở trạng thái dở dang.
      if (s && count.current) void finishCall(s);
      onClose(false);
    }
  }

  /** Linh vật nói một câu, phụ đề hiện bên dưới. Lúc này không nghe để tiếng loa không lọt vào.
   * Cả cuộc gọi một giọng: Gemini thì chờ tới khi có tiếng (tối đa khoảng 12 giây, linh vật chớp mắt), không rơi sang giọng máy;
   * giọng máy chỉ khi ngay từ lúc đổ chuông đã biết Gemini không dùng được. */
  async function say(text: string, alt?: string, kind?: Kind) {
    if (!live.current || !text) return;
    const gen = ++sayGen.current;
    const cut = new Promise<void>((r) => { sayCut.current = r; });
    const on = () => live.current && gen === sayGen.current;
    setCaption(text);
    const d = drive.current;
    d.voice = 0;
    if (machine.current) {
      setMode('talk');
      d.talking = true;
      d.voice = null;
      await speak(text, { start: () => { d.talking = true; }, boundary: () => { d.pulse = performance.now(); } });
    } else {
      setMode('idle');
      d.talking = false;
      const level = (v: number) => { d.voice = v; };
      const start = () => { d.talking = true; setMode('talk'); };
      let ok = await playVoice(text, level, kind === 'fixed' ? 1500 : 4000, start, kind);
      // Chưa kịp thì dùng câu mẫu cùng giọng Gemini nếu đã sẵn, không thì chờ tiếp (hết hạn mức thì không chờ nữa).
      if (!ok && alt && voiceReady(alt) && on()) { setCaption(alt); ok = await playVoice(alt, level, 500, start); }
      if (!ok && kind !== 'fixed' && !voiceCut() && on()) ok = await playVoice(text, level, 8000, start, kind);
      // Không có tiếng (hết hạn mức, câu mẫu chưa có sẵn): chuông nhẹ, chữ ở phụ đề đủ lâu để đọc, rồi đi tiếp. Tuyệt đối không chen giọng máy vào.
      if (!ok && on()) {
        sfx('sparkle', true);
        await Promise.race([wait(Math.min(kind === 'fixed' ? 2500 : 5000, 1200 + text.split(/\s+/).length * 350)), cut]);
      }
      if (gen !== sayGen.current) return;
      d.talking = false;
    }
    if (gen !== sayGen.current) return;
    d.voice = null;
    d.talking = false;
    setMode((m) => (m === 'talk' ? 'idle' : m));
  }

  /** Dừng ngay câu Mây đang nói, kể cả câu còn đang tải giọng hay đang hiện chữ chờ đọc (bấm nút ở bước ảnh thì không phải chờ hết câu). */
  function hush() {
    sayGen.current++;
    sayCut.current();
    stopSpeaking();
    const d = drive.current;
    d.talking = false;
    d.voice = null;
    setMode((m) => (m === 'talk' ? 'idle' : m));
  }

  /** Bật tắt mic mà không đóng luồng (đóng rồi mở lại thì iPhone có thể hỏi quyền lần nữa giữa cuộc gọi). */
  function micOn(on: boolean) {
    stream.current?.getAudioTracks().forEach((tr) => { tr.enabled = on; });
  }

  /** Bật mic và nghe đến khi người kể ngừng hẳn. Không nói gì trong 9 giây thì trả null. maxMs: nghe tối đa chừng này. */
  function hear(maxMs = VAD.maxAnswer): Promise<Heard | null> {
    if (!live.current) return Promise.resolve(null);
    micOn(true);
    setMode('listen');
    setHeard('');
    // Sau khi chọn ảnh, có cuộc gọi đến hay khoá màn hình, iPhone có thể treo AudioContext ('interrupted'): đánh thức lại trước khi nghe.
    const ac = audio.current;
    if (ac && ac.state !== 'running' && ac.state !== 'closed') void ac.resume().catch(() => {});
    const p = new Promise<Heard | null>((resolve) => {
      const a = analyser.current;
      const buf = a ? new Float32Array(a.fftSize) : null;
      const stopRec = stream.current ? record(stream.current, AUDIO_TYPE()) : null;
      let text = '';
      const t0 = performance.now();
      let floorSum = 0, floorN = 0, floor = 0.004;
      let started = false, inSpeech = false, voiceRun = 0, lastVoice = 0, segStart = 0, lastSeg = 0, speechMs = 0;
      let ended = false;
      // Mức âm lớn nhất đo được: bộ đo có mà toàn số 0 (iPhone đôi khi) thì coi như không đo được, lấy chữ chép làm dấu hiệu đang nói.
      let peak = 0;
      // Nhận dạng tự tắt thì bật lại, nhưng có giới hạn; máy không cho dùng (iOS PWA báo service-not-allowed) thì thôi hẳn.
      let restarts = 0, denied = false;

      const R = Recognition();
      let r: any = null;
      if (R) {
        try {
          r = new R();
          r.lang = speechLang();
          r.continuous = true;
          r.interimResults = true;
          let final = '';
          r.onresult = (e: any) => {
            let interim = '';
            for (let k = e.resultIndex; k < e.results.length; k++) {
              const res = e.results[k];
              if (res.isFinal) final += res[0].transcript + ' ';
              else interim += res[0].transcript;
            }
            text = (final + interim).trim();
            setHeard(text);
            // Không đo được âm lượng thì lấy chữ chép được làm dấu hiệu đang nói.
            if (!a || peak < 0.002) { const now = performance.now(); if (!started) { started = true; segStart = now; } inSpeech = true; lastVoice = now; }
          };
          r.onend = () => { if (!ended && !denied && restarts++ < 30) { try { r.start(); } catch {} } };
          r.onerror = (e: any) => { if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e?.error)) denied = true; };
          rec.current = r;
          r.start();
        } catch { r = null; }
      }

      const finish = async (got: boolean) => {
        if (ended) return;
        ended = true;
        clearInterval(timer);
        endHear.current = null;
        drive.current.level = 0;
        rec.current = null;
        try { r?.stop(); } catch {}
        const recording = stopRec ? await stopRec() : null;
        resolve(got ? { recording, transcript: text.trim(), speechMs } : null);
      };
      endHear.current = () => void finish(started);

      const timer = setInterval(() => {
        const now = performance.now();
        const elapsed = now - t0;
        if (a && buf) {
          a.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
          const rms = Math.sqrt(sum / buf.length);
          peak = Math.max(peak, rms);
          drive.current.level = Math.min(1, Math.max(0, (rms - floor) * 14));
          if (elapsed < VAD.calibrate) { floorSum += rms; floorN++; return; }
          if (floorN) { floor = Math.min(0.02, Math.max(0.002, floorSum / floorN)); floorN = 0; }
          const thr = Math.max(0.012, floor * 2.4);
          const voiced = rms > (inSpeech ? thr * 0.75 : thr);
          if (voiced) {
            voiceRun += VAD.tick;
            lastVoice = now;
            if (!inSpeech && voiceRun >= VAD.startMs) { inSpeech = true; segStart = now - voiceRun; if (!started) started = true; }
            if (inSpeech) speechMs += VAD.tick;
          } else {
            voiceRun = 0;
            if (inSpeech && now - lastVoice > 250) { inSpeech = false; lastSeg = lastVoice - segStart; }
          }
        } else if (inSpeech && now - lastVoice > 250) {
          inSpeech = false; speechMs += lastVoice - segStart; lastSeg = lastVoice - segStart;
        }

        if (!started) { if (elapsed > VAD.silence) void finish(false); return; }
        if (elapsed > maxMs) return void finish(true);
        if (inSpeech) return;
        let need = VAD.endMs;
        if (speechMs < 2500) need += VAD.shortExtra;
        if (lastSeg < 700 || FILLER[shownLang()].test(text)) need += VAD.hesitateExtra;
        if (now - lastVoice > Math.min(need, VAD.endCap)) void finish(true);
      }, VAD.tick);
    });
    hearing.current = p;
    return p.finally(() => { if (hearing.current === p) hearing.current = null; });
  }

  /** Gửi một lượt kể qua hàng chờ: mạng chập thì tự thử lại, bản ghi không mất. Máy không chép được lời thì máy chủ nhờ Gemini chép và trả về luôn câu đáp.
   * idx là câu hỏi, turn là lượt (0 câu chính, 1..script.follow câu hỏi thêm, kèm đúng câu Mây đã hỏi). Gửi lại thì máy chủ thay hàng cũ cùng (idx, turn). */
  function upload(s: Session, n: number, turn: number, asked: string, h: Heard, st?: Story): Promise<Saved> {
    if (!h.recording || h.recording.seconds < 1) return Promise.resolve(null);
    count.current += 1;
    return outbox({
      group: s.id, url: `/api/call/${s.id}/answer`, blob: h.recording.blob, file: fileName(h.recording.blob, 'answer'),
      fields: {
        idx: String(n), turn: String(turn), ...(turn ? { question: asked } : {}), transcript: h.transcript, seconds: String(h.recording.seconds),
        provider: (!machine.current && voiceProvider()) || '', dated: st?.dated ? '1' : '', prior: st ? JSON.stringify(st.prior) : '',
      },
    }).then((r: Saved) => { if (r === null) toast(t('call.answerFailed')); return r; });
  }

  /** Báo máy chủ cuộc gọi đã xong (rút ngày vào lịch, ghép podcast). Hàng chờ chỉ gửi lệnh này sau mọi câu trả lời và ảnh của cuộc gọi.
   * Ảnh còn đang thu nhỏ ở nền thì chờ chúng vào hàng chờ trước (tối đa 20 giây, không bao giờ kẹt lệnh kết thúc). */
  const finishCall = (s: Session): Promise<boolean> => Promise.race([photoWork.current, wait(20_000)])
    .then(() => outbox({ group: s.id, url: `/api/call/${s.id}/finish`, last: true })).then((r) => r !== null);

  /** Sau mỗi lượt kể: câu đáp, câu hỏi thêm, ngày nghe được (TurnAI). Có lời chép thì hỏi AI (quá 3 giây thôi); không có thì chờ máy chủ chép (quá 5 giây thôi).
   * Không có gì thì null: đi tiếp như cũ, không hỏi thêm. */
  async function turnFor(s: Session, n: number, turn: number, asked: string, h: Heard, saved: Promise<Saved>, st: Story): Promise<TurnAI | null> {
    if (!h.transcript) {
      const r = await Promise.race([saved, wait(5000).then(() => null)]);
      return r?.ai ?? (r?.reply ? { ...NO_AI, reply: r.reply } : null);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const r = await call<{ text: string | null; ai?: TurnAI | null }>(`/api/call/${s.id}/reply`, {
        method: 'POST', signal: ctrl.signal,
        body: JSON.stringify({ idx: n, turn, question: turn ? asked : undefined, transcript: h.transcript, prior: st.prior, dated: st.dated, provider: machine.current ? null : voiceProvider() }),
      });
      return r.ai ?? (r.text ? { ...NO_AI, reply: r.text } : null);
    } catch { return null; } finally { clearTimeout(timer); }
  }

  /** Lời nhắn người khác gửi cho mình: Mây nói lại từng lời, nói xong thì báo máy chủ đã chuyển. */
  async function deliver(s: Session) {
    for (const [k, r] of (s.relays ?? []).entries()) {
      if (!live.current) return;
      if (k === 0) await say(lines.relayIntro);
      await say(r.said);
      if (!live.current) return;
      void outbox({ group: s.id, url: `/api/call/${s.id}/relay/${encodeURIComponent(r.id)}/heard` });
    }
  }

  /** Bước lời nhắn khó nói (cuối cuộc gọi): hỏi, nghe, gửi. Không nói gì hay chỉ "không có đâu" thì thôi, không ép. */
  async function relayStep(s: Session, n: number) {
    await say(s.script.questions[n].text);
    await wait(250);
    const h = await hear();
    if (!live.current || !h || !h.recording || h.recording.seconds < 1) return;
    const saved = upload(s, n, 0, s.script.questions[n].text, h);
    setMode('idle');
    let text = h.transcript;
    if (!text) text = (await Promise.race([saved, wait(5000).then(() => null)]))?.transcript ?? '';
    if (!live.current) return;
    if (text && relayNone(text, s.script.lang ?? shownLang())) return;
    // Biết có lời nhắn thì nhận lời; chưa biết (máy chủ chép chưa kịp) thì một câu đáp trung tính.
    await say(text ? lines.relayOk : lines.short[1], undefined, 'fixed');
  }

  /** Nghe câu trả lời cho câu hỏi chính. Im lặng thì nhắc "cứ từ từ" một lần rồi nghe lại; vẫn im (hay dưới 1 giây) thì null. */
  async function answer(text: string): Promise<Heard | null> {
    await wait(250);
    let h = await hear();
    if (!live.current) return null;
    if (!h) {
      await say(lines.slow, undefined, 'fixed');
      await wait(250);
      setCaption(text);
      h = await hear();
    }
    return live.current && h?.recording && h.recording.seconds >= 1 ? h : null;
  }

  /** Chờ câu đáp của AI. Chưa kịp về thì "ừm, mình nghe đây" một tiếng (đúng giọng Gemini, câu có sẵn trong kho) cho khỏi im. */
  async function reaction(ai: Promise<TurnAI | null>): Promise<TurnAI | null> {
    setMode('idle');
    const early = await Promise.race([ai, wait(900).then(() => undefined)]);
    if (early === undefined && !machine.current && voiceReady(lines.ack)) await say(lines.ack, undefined, 'fixed');
    return ai;
  }

  /** Bộ câu v2: hỏi thăm, một chuyện chính (câu mở rồi tối đa script.follow câu hỏi thêm), xin ảnh, xin phép chia sẻ, lời nhắn khó nói, tạm biệt. */
  async function run(s: Session) {
    const qs = s.script.questions;
    const ci = qs.findIndex((q) => q.part === 'checkin');
    const si = qs.findIndex((q) => q.part === 'story');
    const ri = qs.findIndex((q) => q.topic === 'loi-nhan');
    // Câu đang hỏi: cúp máy giữa chừng vẫn gửi đúng hàng (câu, lượt, đúng câu Mây đã hỏi).
    const aim = (n: number) => { idx.current = n; turnRef.current = 0; askedRef.current = qs[n].text; setI(n); setHeard(''); };
    // Kiểm giọng Gemini một lần ngay lúc nhấc máy. Không bao giờ dùng giọng máy: Gemini không dùng được thì câu đó hiện chữ + chuông nhẹ.
    await ttsReady();
    machine.current = false;
    if (!live.current) return;
    // Câu đáp mẫu chọn trước. Câu cố định chỉ lấy từ kho (không tốn hạn mức).
    const fallback = { short: pickOne(lines.short), long: pickOne(lines.long) };
    if (!machine.current) [fallback.short, fallback.long, lines.ack, lines.slow, lines.busy].forEach((x) => warmVoice(x, 'fixed'));

    // Hỏi thăm. Lời chào + câu hỏi thăm đọc trong MỘT yêu cầu (một file) nếu vừa độ dài cho phép.
    // Lúc người nghe đang đáp không xin trước giọng câu mở chuyện chính: câu gộp (joined) thay nó, xin trước là phí một câu giọng.
    aim(ci);
    const first = opening(s.script);
    if (first) { setCaption(first); await say(first); } else { await say(s.script.greeting); await say(qs[ci].text); }
    let h = await answer(qs[ci].text);
    if (!live.current) return;
    if (!h) { await say(lines.busy, undefined, 'fixed'); return void bye(false); }
    const checkin: Story = { prior: [], dated: false, photo: false };
    const res0 = await reaction(turnFor(s, ci, 0, qs[ci].text, h, upload(s, ci, 0, qs[ci].text, h, checkin), checkin));
    if (!live.current) return;

    // Chuyện chính bắt đầu: xin sẵn các câu cố định của phần cuối và lời người khác nhắn cho mình.
    const story = qs[si];
    aim(si);
    if (!machine.current) {
      warmVoice(lines.bye, 'fixed');
      if (s.relays?.length) { warmVoice(lines.relayIntro); s.relays.forEach((r) => warmVoice(r.said)); }
    }
    // Câu đáp hỏi thăm đã gồm câu mở: một câu bắt buộc (không phải câu đáp phụ, không thay bằng câu mẫu). Không thì câu đáp rồi câu mở.
    if (res0?.joined && res0.say) await say(res0.say);
    else {
      if (!machine.current) warmVoice(story.text);
      if (res0?.reply) await say(res0.reply, fallback.short, 'reply');
      else await say(fallback.short, undefined, 'fixed');
      await say(story.text);
    }
    h = await answer(story.text);
    if (!live.current) return;
    if (!h) { await say(lines.busy, undefined, 'fixed'); return void bye(false); }
    const cap = s.script.follow ?? MAX_STORY_FOLLOW;
    const st: Story = { prior: [], dated: false, photo: story.photo };
    let asked = story.text;
    for (let turn = 0; ; turn++) {
      turnRef.current = turn;
      askedRef.current = asked;
      const entry = { q: asked, a: h.transcript };
      const saved = upload(s, si, turn, asked, h, st);
      if (!entry.a) void saved.then((r) => { if (r?.transcript) entry.a = r.transcript; });
      const res = await reaction(turnFor(s, si, turn, asked, h, saved, st));
      if (!live.current) return;
      st.prior.push(entry);
      if (res?.story) st.photo = true;
      if (res?.date) st.dated = true;
      if (st.photo && !machine.current) warmVoice(lines.photo, 'fixed');
      const local = h.speechMs < 3000 ? fallback.short : fallback.long;
      const follow = res?.follow && turn < cap ? res.follow : null;
      // Máy chủ đã gộp sẵn câu đáp + nhắc ngày + câu hỏi thêm thành một câu (một lần xin giọng). Không có thì câu đáp AI hoặc câu mẫu như cũ.
      if (res?.say && (follow || !res.follow)) {
        const plain = !follow && !res.confirm;
        await say(res.say, plain ? local : undefined, plain ? 'reply' : undefined);
      } else if (res?.reply) await say(res.reply, local, 'reply');
      else await say(local, undefined, 'fixed');
      if (!follow || !live.current) break;
      asked = follow;
      turnRef.current = turn + 1;
      askedRef.current = asked;
      await wait(250);
      const more = await hear();
      if (!live.current) return;
      // Không nói gì sau câu hỏi thêm thì thôi, không hỏi lại. Chỉ một câu nhận lời ngắn có sẵn trong kho: bước sau vẫn là chuyện này
      // (ảnh) hay lời nhắn, tạm biệt, nên không nói "mình nói chuyện khác nhé".
      if (!more || !more.recording || more.recording.seconds < 1) { await say(fallback.short, undefined, 'fixed'); break; }
      h = more;
    }

    // Chuyện chính đã có ít nhất một lượt kể: xin ảnh nếu là chuyện thật.
    if (st.photo && live.current) {
      const end = await askPhoto(s, si);
      if (!live.current) return;
      // Nói "để sau" hay im lặng tới hết giờ: Mây nhận lời ngắn (câu có sẵn trong kho) rồi sang bước sau. Bấm nút thì đi tiếp luôn.
      if (end === 'no' || end === 'timeout') await say(fallback.short, undefined, 'fixed');
    }

    // Lời nhắn khó nói: chuyển lời người khác nhắn trước, rồi mới hỏi. Không có câu lời nhắn thì vẫn chuyển lời nhắn trước khi chào.
    if (ri >= 0 && live.current) {
      aim(ri);
      await deliver(s);
      if (!machine.current) warmVoice(lines.relayOk, 'fixed');
      await relayStep(s, ri);
    } else if (live.current) await deliver(s);
    if (live.current) await bye(true);
  }

  /** Bước xin ảnh (chặng và lối ra ở callPhoto.ts): hiện nút, Mây hỏi, rồi nghe câu trả lời.
   * Bấm nút, nói "để sau", huỷ khung chọn ảnh hay hết giờ đều đi tiếp; nút có tác dụng ngay, kể cả khi Mây chưa nói xong. */
  function askPhoto(s: Session, n: number): Promise<PhotoEnd> {
    return new Promise<PhotoEnd>((resolve) => {
      const lang = s.script.lang ?? shownLang();
      let st = PHOTO_START;
      let timer = 0;
      const go = (e: PhotoEvent) => {
        const prev = st, next = photoNext(st, e, lang);
        if (next === prev) return;
        st = next;
        clearTimeout(timer);
        if (prev.stage === 'ask' && next.stage !== 'listen') hush();
        if (prev.stage === 'listen' && next.stage !== 'listen') { endHear.current?.(); setMode('idle'); }
        micOn(photoMic(next));
        const ms = PHOTO_WAIT[next.stage];
        if (ms) timer = window.setTimeout(() => go({ type: 'timeout' }), ms);
        if (next.end) {
          if (photoEvent.current === go) photoEvent.current = null;
          setPhase('talk');
          resolve(next.end);
        }
      };
      photoIdx.current = n;
      photoEvent.current = go;
      setPhase('photo');
      void (async () => {
        await say(lines.photo, undefined, 'fixed');
        go({ type: 'asked' });
        if (st.stage === 'listen') await wait(250);
        if (st.stage !== 'listen') return;
        const h = await hear(PHOTO_HEAR_MS);
        if (st.stage !== 'listen') return;
        if (h?.transcript) return go({ type: 'heard', text: h.transcript });
        if (!h?.recording || h.recording.seconds < 1) return go({ type: 'heard', text: '' });
        // Có nói mà máy không tự chép được (iPhone cài app hay vậy): nhờ máy chủ chép, nút vẫn bấm được trong lúc chờ.
        go({ type: 'heard', text: null });
        go({ type: 'heard', text: await hearText(s, h.recording) });
      })().catch(() => { go({ type: 'asked' }); go({ type: 'heard', text: '' }); });
    });
  }

  /** Chép câu trả lời ngắn ở bước ảnh qua máy chủ (không lưu gì). Quá 6 giây hay lỗi thì coi như không nghe rõ. */
  async function hearText(s: Session, r: Recording): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const body = new FormData();
      body.set('file', r.blob, fileName(r.blob, 'answer'));
      const res = await call<{ transcript?: string | null }>(`/api/call/${s.id}/hear`, { method: 'POST', body, signal: ctrl.signal });
      return res.transcript ?? '';
    } catch { return ''; } finally { clearTimeout(timer); }
  }

  /** Ảnh cho câu chuyện: thu nhỏ rồi mỗi ảnh một việc trong hàng chờ (gửi lại riêng, có key chống trùng).
   * Chạy ở nền, cuộc gọi không chờ: ảnh nặng hay mạng chậm không làm cuộc gọi đứng. Lệnh kết thúc chờ ảnh vào hàng chờ (finishCall). */
  function keepPhotos(s: Session, story: number, files: File[]) {
    const queued = (async () => {
      const blobs: Blob[] = [];
      for (const f of files) blobs.push(await shrinkImage(f));
      return blobs.map((blob) => outbox({
        group: s.id, url: `/api/call/${s.id}/photo`, blob, file: fileName(blob, 'photo'),
        fields: { idx: String(story), key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` },
      }));
    })();
    const prev = photoWork.current;
    photoWork.current = Promise.all([prev, queued.catch(() => null)]);
    void queued.then((jobs) => Promise.all(jobs)).then((rs) => {
      const k = rs.filter((r) => r !== null).length;
      toast(k ? t('call.photosSaved', { n: k }) : t('call.photoFailed'));
    }).catch(() => toast(t('call.photoFailed')));
  }

  /** Khung chọn ảnh trả về. Chọn muộn (bước ảnh đã hết giờ) vẫn giữ ảnh cho đúng câu chuyện đó. */
  function pickPhotos(input: HTMLInputElement) {
    const files = [...(input.files ?? [])].filter((f) => /^image\/(?!gif)/.test(f.type) || !f.type).slice(0, MAX_PHOTOS);
    input.value = '';
    if (files.length && session) keepPhotos(session, photoIdx.current, files);
    photoEvent.current?.({ type: 'files', n: files.length });
  }

  // Huỷ khung chọn ảnh: Safari và Chrome mới báo 'cancel' (React không nối sự kiện này cho ô chọn tệp). Máy không báo thì hẹn giờ lo.
  const photoCancel = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    const f = () => photoEvent.current?.({ type: 'files', n: 0 });
    el.addEventListener('cancel', f);
    return () => el.removeEventListener('cancel', f);
  }, []);

  async function bye(spoke: boolean) {
    if (!session && !prep.current) return;
    const s = session ?? (await prep.current!);
    setPhase('bye');
    setMode(count.current ? 'happy' : 'sleep');
    stream.current?.getTracks().forEach((t) => t.stop());
    if (!count.current) { snooze(); return; }
    // Chào trong lúc máy chủ còn chép lời câu cuối, không bắt người nghe chờ.
    setSent('wait');
    const finished = finishCall(s);
    void finished.then((ok) => { if (live.current) setSent(ok ? 'ok' : 'none'); });
    if (spoke) { await say(s.script.goodbye, undefined, 'fixed'); setMode('happy'); }
    // Chào xong mà vẫn chưa gửi được (mạng chập): nói thật là đang gửi tiếp, không báo có podcast.
    if (!(await Promise.race([finished, wait(5000).then(() => null)])) && live.current) setSent((v) => (v === 'wait' ? 'later' : v));
  }

  async function hangUp() {
    tap();
    if (phase === 'ring') { snooze(); return onClose(false); }
    live.current = false;
    stopSpeaking();
    // Đang ở bước ảnh thì lời vừa nghe chỉ là câu trả lời có hay không, không phải câu kể: không gửi (gửi sẽ đè lên lượt kể cuối của câu chuyện).
    const inStep = !!photoEvent.current;
    photoEvent.current?.({ type: 'hangup' });
    const pending = hearing.current;
    endHear.current?.();
    const h = pending ? await pending : null;
    const s = session;
    if (s && h && !inStep) void upload(s, idx.current, turnRef.current, askedRef.current, h);
    cleanup();
    // Hàng chờ gửi tiếp ở nền kể cả khi đóng màn. Chỉ mở Podcast khi máy chủ nhận lệnh kết thúc ngay (chờ tối đa 1,5 giây).
    let done = false;
    if (s && count.current > 0) done = await Promise.race([finishCall(s), wait(1500).then(() => false)]);
    if (!count.current) snooze();
    onClose(done);
  }

  const total = session?.script.questions.length ?? 0;

  return (
    <div className="sheet call">
      {phase === 'ring' ? (
        <div className="call-ring fade">
          <div className="call-orb"><i /><i /><Mascot mode="wave" size={140} /></div>
          <div className="call-who">{t('call.ring.who')}</div>
          <div className="call-sub">{t('call.ring.sub')}</div>
          <div style={{ flex: 1 }} />
          <div className="call-actions">
            <button className="call-btn later" onClick={hangUp}><Icon name="close" size={26} /><span>{t('common.later')}</span></button>
            <button className="call-btn pick" onClick={pickUp}><Icon name="phone" size={26} /><span>{t('call.pickUp')}</span></button>
          </div>
        </div>
      ) : (
        <div className="call-talk">
          <div className="call-top">
            <span className="call-dots">{Array.from({ length: total }, (_, k) => <i key={k} className={k < i || phase === 'bye' ? 'done' : k === i ? 'on' : ''} />)}</span>
          </div>
          <div className="call-body">
            <Mascot drive={drive} mode={mode} />
            <p key={caption} className="call-cap fade">{caption}</p>
            {mode === 'listen' && heard && <p className="call-heard">{heard.length > 140 ? '…' + heard.slice(-140) : heard}</p>}
            {/* Ô chọn ảnh luôn nằm trong cây, chỉ ẩn đi: bước ảnh hết giờ lúc khung chọn ảnh còn mở thì ảnh chọn muộn vẫn tới được. */}
            <div className={phase === 'photo' ? 'call-photo fade' : 'call-photo off'}>
              <label className="btn">
                <Icon name="image" size={20} /> {t('call.pickPhoto')}
                <input ref={photoCancel} type="file" accept="image/*" multiple hidden
                  onClick={() => { tap(); photoEvent.current?.({ type: 'pick' }); }} onChange={(e) => pickPhotos(e.currentTarget)} />
              </label>
              <button className="link" onClick={() => { tap(); photoEvent.current?.({ type: 'later' }); }}>{t('common.later')}</button>
            </div>
            {phase === 'bye' && (sent === 'ok' || sent === 'later') && <p key={sent} className="call-note fade">{t(sent === 'ok' ? 'call.podcastSoon' : 'call.sendLater')}</p>}
          </div>
          <div className="call-foot">
            {phase === 'bye'
              ? <button className="btn ghost" onClick={() => { tap(); live.current = false; cleanup(); onClose(sent === 'ok'); }}>{t('common.done')}</button>
              : <button className="call-end" onClick={hangUp} aria-label={t('call.end')}><Icon name="phone" size={26} /></button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Lời chào + câu hỏi đầu gộp thành một câu để đọc trong một yêu cầu giọng (giữ dưới giới hạn 300 chữ của máy chủ). */
function opening(sc: CallScript) {
  const q = sc.questions[0]?.text;
  const t = q ? `${sc.greeting} ${q}`.replace(/\s+/g, ' ').trim() : '';
  return t && t.length <= 300 ? t : null;
}
function pickOne<T>(xs: T[]) { return xs[Math.floor(Math.random() * xs.length)]; }
