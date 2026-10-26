import { useEffect, useRef, useState } from 'react';
import { errorText, token } from './api';
import { type Drive, type MascotMode } from './Mascot';
import { MascotAny as Mascot } from './Mascot3D';
import { AUDIO_TYPE, fileName, record, type Recording } from './media';
import { callLines, type CallScript, type Me } from './shared';
import { buzz, sfx, startRing, stopRing, tap } from './sound';
import { playVoice, prefetchVoice, resetVoice, setVoiceContext, speak, stopSpeaking, ttsReady, unlockSpeech, voiceCut, voiceReady, warmVoice, type Kind } from './speech';
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
type Saved = { transcript?: string | null; reply?: string | null } | null;
type Session = { id: string; script: CallScript };
type Phase = 'ring' | 'talk' | 'photo' | 'bye';

// Sweet Home gọi: đổ chuông, nhấc máy, linh vật hỏi từng câu, tự nghe đến khi người kể ngừng, đáp lại rồi hỏi tiếp.
export function Call({ me, onClose }: { me: Me; onClose: (finished: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('ring');
  const [mode, setMode] = useState<MascotMode>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [i, setI] = useState(0);
  const [caption, setCaption] = useState('');
  const [heard, setHeard] = useState('');
  const [answered, setAnswered] = useState(0);
  const drive = useRef<Drive>({ talking: false, pulse: 0, level: 0 });
  const prep = useRef<Promise<Session> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const rec = useRef<any>(null);
  const live = useRef(true);
  const idx = useRef(0);
  const uploads = useRef<Promise<unknown>[]>([]);
  const count = useRef(0);
  const hearing = useRef<Promise<Heard | null> | null>(null);
  const endHear = useRef<(() => void) | null>(null);
  const photoDone = useRef<(() => void) | null>(null);

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
    try {
      const s = session ?? (await prep.current!);
      setSession(s);
      await run(s);
    } catch (e) {
      toast((e as Error).message);
      onClose(false);
    }
  }

  /** Linh vật nói một câu, phụ đề hiện bên dưới. Lúc này không nghe để tiếng loa không lọt vào.
   * Cả cuộc gọi một giọng: Gemini thì chờ tới khi có tiếng (tối đa khoảng 12 giây, linh vật chớp mắt), không rơi sang giọng máy;
   * giọng máy chỉ khi ngay từ lúc đổ chuông đã biết Gemini không dùng được. */
  async function say(text: string, alt?: string, kind?: Kind) {
    if (!live.current || !text) return;
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
      if (!ok && alt && voiceReady(alt) && live.current) { setCaption(alt); ok = await playVoice(alt, level, 500, start); }
      if (!ok && kind !== 'fixed' && !voiceCut() && live.current) ok = await playVoice(text, level, 8000, start, kind);
      // Không có tiếng (hết hạn mức, câu mẫu chưa có sẵn): chuông nhẹ, chữ ở phụ đề đủ lâu để đọc, rồi đi tiếp. Tuyệt đối không chen giọng máy vào.
      if (!ok && live.current) {
        sfx('sparkle', true);
        await wait(Math.min(kind === 'fixed' ? 2500 : 5000, 1200 + text.split(/\s+/).length * 350));
      }
      d.talking = false;
    }
    d.voice = null;
    d.talking = false;
    setMode((m) => (m === 'talk' ? 'idle' : m));
  }

  /** Bật mic và nghe đến khi người kể ngừng hẳn. Không nói gì trong 9 giây thì trả null. */
  function hear(): Promise<Heard | null> {
    if (!live.current) return Promise.resolve(null);
    setMode('listen');
    setHeard('');
    const p = new Promise<Heard | null>((resolve) => {
      const a = analyser.current;
      const buf = a ? new Float32Array(a.fftSize) : null;
      const stopRec = stream.current ? record(stream.current, AUDIO_TYPE()) : null;
      let text = '';
      const t0 = performance.now();
      let floorSum = 0, floorN = 0, floor = 0.004;
      let started = false, inSpeech = false, voiceRun = 0, lastVoice = 0, segStart = 0, lastSeg = 0, speechMs = 0;
      let ended = false;

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
            if (!a) { const now = performance.now(); if (!started) { started = true; segStart = now; } inSpeech = true; lastVoice = now; }
          };
          r.onend = () => { if (!ended) { try { r.start(); } catch {} } };
          r.onerror = () => {};
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
        if (elapsed > VAD.maxAnswer) return void finish(true);
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

  /** Gửi câu trả lời. Máy không chép được lời thì máy chủ nhờ Gemini chép và trả về luôn câu đáp. */
  function upload(s: Session, n: number, h: Heard): Promise<Saved> {
    if (!h.recording || h.recording.seconds < 1) return Promise.resolve(null);
    const f = new FormData();
    f.set('idx', String(n));
    f.set('transcript', h.transcript);
    f.set('seconds', String(h.recording.seconds));
    f.set('file', h.recording.blob, fileName(h.recording.blob, 'answer'));
    const p = call<Saved>(`/api/call/${s.id}/answer`, { method: 'POST', body: f }).catch(() => { toast(t('call.answerFailed')); return null; });
    uploads.current.push(p);
    count.current += 1;
    setAnswered(count.current);
    return p;
  }

  /** Câu đáp ngắn theo điều vừa kể. Có lời chép thì hỏi AI (quá 2 giây thôi); không có thì chờ Gemini chép (quá 4 giây thôi). */
  async function replyFor(s: Session, n: number, h: Heard, saved: Promise<Saved>): Promise<string | null> {
    if (!h.transcript) {
      const r = await Promise.race([saved, wait(4000).then(() => null)]);
      return r?.reply || null;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    try {
      const r = await call<{ text: string | null }>(`/api/call/${s.id}/reply`, { method: 'POST', body: JSON.stringify({ idx: n, transcript: h.transcript }), signal: ctrl.signal });
      return r.text || null;
    } catch { return null; } finally { clearTimeout(t); }
  }

  async function run(s: Session) {
    const qs = s.script.questions;
    // Kiểm giọng Gemini một lần ngay lúc nhấc máy bằng câu đã nạp sẵn; hỏng thì cả cuộc gọi dùng giọng máy.
    machine.current = !audio.current || !(await ttsReady());
    if (!live.current) return;
    // Lời chào + câu đầu đọc trong MỘT yêu cầu (một file) nếu vừa độ dài cho phép.
    const first = opening(s.script);
    if (!first) await say(s.script.greeting);
    let silentRow = 0;
    for (let n = 0; n < qs.length; n++) {
      if (!live.current) return;
      idx.current = n;
      setI(n);
      setHeard('');
      // Câu đáp mẫu chọn trước; giọng của chúng và của câu hỏi kế tiếp được xin sẵn trong lúc người kể đang nói.
      const fallback = { short: pickOne(lines.short), long: pickOne(lines.long) };
      const next = qs[n + 1]?.text ?? s.script.goodbye;
      // Câu cố định chỉ lấy từ kho (không tốn hạn mức); chỉ xin trước đúng một câu hỏi kế tiếp.
      if (!machine.current) {
        [fallback.short, fallback.long, lines.ack, lines.slow, lines.skip, lines.busy].forEach((t) => warmVoice(t, 'fixed'));
        warmVoice(next);
      }
      if (n === 0 && first) { setCaption(first); await say(first); } else await say(qs[n].text);
      await wait(250);
      let h = await hear();
      if (!live.current) return;
      if (!h) {
        await say(lines.slow, undefined, 'fixed');
        await wait(250);
        setCaption(qs[n].text);
        h = await hear();
        if (!live.current) return;
      }
      if (!h || !h.recording || h.recording.seconds < 1) {
        silentRow += 1;
        if (silentRow >= 2 || n === qs.length - 1) {
          await say(lines.busy, undefined, 'fixed');
          return void bye(false);
        }
        await say(lines.skip, undefined, 'fixed');
        continue;
      }
      silentRow = 0;
      if (qs[n].photo && !machine.current) warmVoice(lines.photo, 'fixed');
      const reply = replyFor(s, n, h, upload(s, n, h));
      setMode('idle');
      // Câu đáp chưa kịp về thì "ừm, mình nghe đây" một tiếng (đúng giọng Gemini) cho khỏi im.
      const early = await Promise.race([reply, wait(900).then(() => undefined)]);
      if (early === undefined && !machine.current && voiceReady(lines.ack)) await say(lines.ack, undefined, 'fixed');
      const local = h.speechMs < 3000 ? fallback.short : fallback.long;
      const text = (await reply) || local;
      await say(text, text === local ? undefined : local, text === local ? 'fixed' : 'reply');
      if (qs[n].photo && live.current) {
        setPhase('photo');
        const picked = new Promise<void>((r) => { photoDone.current = r; });
        await say(lines.photo, undefined, 'fixed');
        await picked;
        if (!live.current) return;
        setPhase('talk');
      }
    }
    if (live.current) await bye(true);
  }

  function sendPhoto(file?: File | null) {
    tap();
    if (file && session) {
      const f = new FormData();
      f.set('idx', String(idx.current));
      f.set('file', file);
      uploads.current.push(call(`/api/call/${session.id}/photo`, { method: 'POST', body: f }).then(() => toast(t('call.photoSaved'))).catch(() => toast(t('call.photoFailed'))));
    }
    stopSpeaking();
    photoDone.current?.();
    photoDone.current = null;
  }

  async function bye(spoke: boolean) {
    if (!session && !prep.current) return;
    const s = session ?? (await prep.current!);
    setPhase('bye');
    setMode(count.current ? 'happy' : 'sleep');
    stream.current?.getTracks().forEach((t) => t.stop());
    if (!count.current) { snooze(); return; }
    // Chào trong lúc máy chủ còn chép lời câu cuối, không bắt người nghe chờ.
    const finished = Promise.all(uploads.current).then(() => call(`/api/call/${s.id}/finish`, { method: 'POST' })).catch(() => {});
    if (spoke) { await say(s.script.goodbye); setMode('happy'); }
    await finished;
  }

  async function hangUp() {
    tap();
    if (phase === 'ring') { snooze(); return onClose(false); }
    live.current = false;
    stopSpeaking();
    photoDone.current?.();
    const pending = hearing.current;
    endHear.current?.();
    const h = pending ? await pending : null;
    const s = session;
    if (s && h) upload(s, idx.current, h);
    cleanup();
    if (s && count.current > 0 && phase !== 'bye') {
      // Máy chủ có thể còn đang chép lời: gửi xong thì báo kết thúc, không giữ màn hình lại.
      void Promise.all(uploads.current).then(() => call(`/api/call/${s.id}/finish`, { method: 'POST' })).catch(() => {});
    }
    if (!count.current) snooze();
    onClose(count.current > 0);
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
            {phase === 'photo' && (
              <div className="call-photo fade">
                <label className="btn">
                  <Icon name="image" size={20} /> {t('call.pickPhoto')}
                  <input type="file" accept="image/*" hidden onChange={(e) => sendPhoto(e.target.files?.[0])} />
                </label>
                <button className="link" onClick={() => sendPhoto(null)}>{t('common.later')}</button>
              </div>
            )}
            {phase === 'bye' && answered > 0 && <p className="call-note fade">{t('call.podcastSoon')}</p>}
          </div>
          <div className="call-foot">
            {phase === 'bye'
              ? <button className="btn ghost" onClick={() => { tap(); live.current = false; cleanup(); onClose(answered > 0); }}>{t('common.done')}</button>
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
