import { useEffect, useRef, useState } from 'react';
import { token } from './api';
import { Mascot, type Drive, type MascotMode } from './Mascot';
import { AUDIO_TYPE, fileName, record, type Recording } from './media';
import type { CallScript, Me } from './shared';
import { buzz, sfx, tap } from './sound';
import { speak, stopSpeaking, unlockSpeech } from './speech';
import { Icon, toast } from './ui';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(path, { ...init, headers: { ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(t ? { authorization: `Bearer ${t}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi, thử lại nhé');
  return data as T;
}

const SNOOZE = 'homeletter-call-snooze';
export const snoozed = () => { try { return Number(localStorage.getItem(SNOOZE) || 0) > Date.now(); } catch { return false; } };
const snooze = () => { try { localStorage.setItem(SNOOZE, String(Date.now() + 3 * 3600e3)); } catch {} };

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
const FILLER = /(?:^|\s)(ờ|ừ|ừm|à|ơ|thì|là|mà|và|với|nhưng|rồi|cái|kiểu)\s*$/i;

type Heard = { recording: Recording | null; transcript: string; speechMs: number };
type Session = { id: string; script: CallScript };
type Phase = 'ring' | 'talk' | 'photo' | 'bye';

// Homeletter gọi: đổ chuông, nhấc máy, linh vật hỏi từng câu, tự nghe đến khi người kể ngừng, đáp lại rồi hỏi tiếp.
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
  const parent = role === 'bo' || role === 'me';
  const self = role === 'bo' ? 'bố' : role === 'me' ? 'mẹ' : me.me.name;
  const Self = self[0].toUpperCase() + self.slice(1);

  // Chuẩn bị câu hỏi ngay khi chuông reo để nhấc máy là nói được.
  useEffect(() => {
    prep.current = call<Session>('/api/call/start', { method: 'POST' });
    prep.current.then(setSession).catch(() => {});
    return () => { live.current = false; cleanup(); };
  }, []);

  useEffect(() => {
    if (phase !== 'ring') return;
    const ring = () => { sfx('hello'); buzz(400); };
    ring();
    const t = setInterval(ring, 3200);
    return () => clearInterval(t);
  }, [phase]);

  function cleanup() {
    stopSpeaking();
    endHear.current?.();
    try { rec.current?.stop(); } catch {}
    rec.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
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
      toast('Cho Homeletter dùng micro để kể nhé');
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

  /** Linh vật nói một câu, phụ đề hiện bên dưới. Lúc này không nghe để tiếng loa không lọt vào. */
  async function say(text: string) {
    if (!live.current || !text) return;
    setMode('talk');
    setCaption(text);
    drive.current.talking = true;
    await speak(text, { start: () => { drive.current.talking = true; }, boundary: () => { drive.current.pulse = performance.now(); } });
    drive.current.talking = false;
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
          r.lang = 'vi-VN';
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
        if (lastSeg < 700 || FILLER.test(text)) need += VAD.hesitateExtra;
        if (now - lastVoice > Math.min(need, VAD.endCap)) void finish(true);
      }, VAD.tick);
    });
    hearing.current = p;
    return p.finally(() => { if (hearing.current === p) hearing.current = null; });
  }

  function upload(s: Session, n: number, h: Heard) {
    if (!h.recording || h.recording.seconds < 1) return;
    const f = new FormData();
    f.set('idx', String(n));
    f.set('transcript', h.transcript);
    f.set('seconds', String(h.recording.seconds));
    f.set('file', h.recording.blob, fileName(h.recording.blob, 'answer'));
    uploads.current.push(call(`/api/call/${s.id}/answer`, { method: 'POST', body: f }).catch(() => toast('Chưa gửi được câu này')));
    count.current += 1;
    setAnswered(count.current);
  }

  /** Câu đáp ngắn: hỏi Claude nếu máy chủ có, quá 2 giây thì dùng câu mẫu. */
  async function replyFor(s: Session, n: number, h: Heard) {
    const short = h.speechMs < 3000;
    const local = pickOne(parent
      ? (short ? ['Dạ, con nghe rồi.', 'Ừm, dạ.', `Dạ, con cảm ơn ${self}.`] : ['Ừm, nghe hay quá ạ.', `Con thích nghe ${self} kể lắm.`, 'Thương quá ạ.', 'Dạ, con nhớ rồi.', `Hay quá. Lần sau ${self} kể tiếp con nghe nhé.`])
      : (short ? ['Ừm, mình nghe rồi.', 'Ừ, vậy à.', 'Cảm ơn nhé.'] : ['Ừm, nghe hay quá.', 'Thương ghê.', 'Mình nhớ rồi nhé.', 'Nghe mà thấy ấm ghê.', 'Hay quá. Lần sau kể tiếp nhé.']));
    if (!h.transcript) return local;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    try {
      const r = await call<{ text: string | null }>(`/api/call/${s.id}/reply`, { method: 'POST', body: JSON.stringify({ idx: n, transcript: h.transcript }), signal: ctrl.signal });
      return r.text || local;
    } catch { return local; } finally { clearTimeout(t); }
  }

  async function run(s: Session) {
    const qs = s.script.questions;
    await say(s.script.greeting);
    let silentRow = 0;
    for (let n = 0; n < qs.length; n++) {
      if (!live.current) return;
      idx.current = n;
      setI(n);
      setHeard('');
      await say(qs[n].text);
      await wait(250);
      let h = await hear();
      if (!live.current) return;
      if (!h) {
        await say(parent ? `${Self} cứ từ từ nhé, nhớ gì kể nấy.` : 'Cứ từ từ nhé, nhớ gì kể nấy.');
        await wait(250);
        setCaption(qs[n].text);
        h = await hear();
        if (!live.current) return;
      }
      if (!h || !h.recording || h.recording.seconds < 1) {
        silentRow += 1;
        if (silentRow >= 2 || n === qs.length - 1) {
          await say(parent ? `Chắc ${self} đang bận. Tuần sau con gọi lại nhé.` : 'Chắc bạn đang bận. Tuần sau mình gọi lại nhé.');
          return void bye(false);
        }
        await say(parent ? 'Dạ, không sao. Mình nói chuyện khác nhé.' : 'Không sao. Mình nói chuyện khác nhé.');
        continue;
      }
      silentRow = 0;
      upload(s, n, h);
      setMode('idle');
      await say(await replyFor(s, n, h));
      if (qs[n].photo && live.current) {
        setPhase('photo');
        const picked = new Promise<void>((r) => { photoDone.current = r; });
        await say(parent ? `${Self} có tấm ảnh nào ngày ấy không? Gửi con giữ giúp nhé.` : 'Có tấm ảnh nào ngày ấy không? Gửi Homeletter giữ giúp nhé.');
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
      uploads.current.push(call(`/api/call/${session.id}/photo`, { method: 'POST', body: f }).then(() => toast('Ảnh đã vào kho')).catch(() => toast('Chưa gửi được ảnh')));
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
    await Promise.all(uploads.current);
    await call(`/api/call/${s.id}/finish`, { method: 'POST' }).catch(() => {});
    if (spoke) { await say(s.script.goodbye); setMode('happy'); }
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
      await Promise.all(uploads.current);
      await call(`/api/call/${s.id}/finish`, { method: 'POST' }).catch(() => {});
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
          <div className="call-who">Homeletter đang gọi</div>
          <div className="call-sub">Cuộc gọi tuần này</div>
          <div style={{ flex: 1 }} />
          <div className="call-actions">
            <button className="call-btn later" onClick={hangUp}><Icon name="close" size={26} /><span>Để sau</span></button>
            <button className="call-btn pick" onClick={pickUp}><Icon name="phone" size={26} /><span>Nghe máy</span></button>
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
                  <Icon name="image" size={20} /> Chọn ảnh
                  <input type="file" accept="image/*" hidden onChange={(e) => sendPhoto(e.target.files?.[0])} />
                </label>
                <button className="link" onClick={() => sendPhoto(null)}>Để sau</button>
              </div>
            )}
            {phase === 'bye' && answered > 0 && <p className="call-note fade">Giọng kể sẽ thành một tập podcast, chờ ít phút nhé.</p>}
          </div>
          <div className="call-foot">
            {phase === 'bye'
              ? <button className="btn ghost" onClick={() => { tap(); live.current = false; cleanup(); onClose(answered > 0); }}>Xong</button>
              : <button className="call-end" onClick={hangUp} aria-label="Kết thúc"><Icon name="phone" size={26} /></button>}
          </div>
        </div>
      )}
    </div>
  );
}

function pickOne<T>(xs: T[]) { return xs[Math.floor(Math.random() * xs.length)]; }
