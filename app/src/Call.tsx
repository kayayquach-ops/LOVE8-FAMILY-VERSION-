import { useEffect, useRef, useState } from 'react';
import { token } from './api';
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

type Phase = 'ring' | 'hello' | 'ask' | 'listen' | 'photo' | 'bye';

// Homeletter gọi: đổ chuông, nhấc máy, nghe từng câu hỏi, kể bằng giọng nói, gửi ảnh xưa nếu có.
export function Call({ me, onClose }: { me: Me; onClose: (finished: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('ring');
  const [session, setSession] = useState<{ id: string; script: CallScript } | null>(null);
  const [i, setI] = useState(0);
  const [heard, setHeard] = useState('');
  const [answered, setAnswered] = useState(0);
  const prep = useRef<Promise<{ id: string; script: CallScript }> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopRec = useRef<(() => Promise<Recording>) | null>(null);
  const rec = useRef<any>(null);
  const finalText = useRef('');
  const live = useRef(true);
  const uploads = useRef<Promise<unknown>[]>([]);
  const count = useRef(0);

  // Chuẩn bị câu hỏi ngay khi chuông reo để nhấc máy là nói được.
  useEffect(() => {
    prep.current = call<{ id: string; script: CallScript }>('/api/call/start', { method: 'POST' });
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
    try { rec.current?.stop(); } catch {}
    rec.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function pickUp() {
    tap();
    unlockSpeech();
    setPhase('hello');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast('Cho Homeletter dùng micro để kể nhé');
    }
    try {
      const s = session ?? (await prep.current!);
      setSession(s);
      await speak(s.script.greeting);
      if (live.current) ask(s, 0);
    } catch (e) {
      toast((e as Error).message);
      onClose(false);
    }
  }

  async function ask(s: { id: string; script: CallScript }, n: number) {
    setI(n);
    setHeard('');
    setPhase('ask');
    await speak(s.script.questions[n].text);
    if (live.current) listen();
  }

  function listen() {
    setPhase('listen');
    finalText.current = '';
    if (stream.current) stopRec.current = record(stream.current, AUDIO_TYPE());
    const R = Recognition();
    if (!R) return;
    try {
      const r = new R();
      r.lang = 'vi-VN';
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e: any) => {
        let interim = '';
        for (let k = e.resultIndex; k < e.results.length; k++) {
          const res = e.results[k];
          if (res.isFinal) finalText.current += res[0].transcript + ' ';
          else interim += res[0].transcript;
        }
        setHeard((finalText.current + interim).trim());
      };
      // Chrome tự dừng khi im lặng lâu: còn đang nghe thì bật lại.
      r.onend = () => { if (rec.current === r) { try { r.start(); } catch {} } };
      r.onerror = () => {};
      rec.current = r;
      r.start();
    } catch { rec.current = null; }
  }

  /** Dừng nghe, gửi đoạn vừa kể (đủ 1 giây trở lên). Trả về true nếu đã gửi. */
  async function saveAnswer(skip: boolean) {
    const r = rec.current;
    rec.current = null;
    try { r?.stop(); } catch {}
    const recording = stopRec.current ? await stopRec.current() : null;
    stopRec.current = null;
    if (skip || !session || (recording?.seconds ?? 0) < 1) return false;
    const f = new FormData();
    f.set('idx', String(i));
    f.set('transcript', finalText.current.trim());
    f.set('seconds', String(recording!.seconds));
    f.set('file', recording!.blob, fileName(recording!.blob, 'answer'));
    uploads.current.push(call(`/api/call/${session.id}/answer`, { method: 'POST', body: f }).catch(() => toast('Chưa gửi được câu này')));
    count.current += 1;
    setAnswered(count.current);
    return true;
  }

  async function doneAnswer(skip = false) {
    if (!session) return;
    tap();
    const sent = await saveAnswer(skip);
    if (sent && session.script.questions[i].photo) setPhase('photo');
    else next();
  }

  function sendPhoto(file?: File | null) {
    if (file && session) {
      const f = new FormData();
      f.set('idx', String(i));
      f.set('file', file);
      uploads.current.push(call(`/api/call/${session.id}/photo`, { method: 'POST', body: f }).then(() => toast('Ảnh đã vào kho')).catch(() => toast('Chưa gửi được ảnh')));
    }
    next();
  }

  function next() {
    if (!session) return;
    if (i + 1 < session.script.questions.length) void ask(session, i + 1);
    else void bye();
  }

  async function bye() {
    if (!session) return;
    setPhase('bye');
    stream.current?.getTracks().forEach((t) => t.stop());
    await Promise.all(uploads.current);
    await call(`/api/call/${session.id}/finish`, { method: 'POST' }).catch(() => {});
    await speak(session.script.goodbye);
  }

  async function hangUp() {
    tap();
    if (phase === 'ring') { snooze(); return onClose(false); }
    live.current = false;
    if (phase === 'listen') await saveAnswer(false);
    cleanup();
    if (session && count.current > 0 && phase !== 'bye') {
      await Promise.all(uploads.current);
      await call(`/api/call/${session.id}/finish`, { method: 'POST' }).catch(() => {});
    }
    if (!count.current) snooze();
    onClose(count.current > 0);
  }

  const q = session?.script.questions[i];
  const total = session?.script.questions.length ?? 0;

  return (
    <div className="sheet call">
      {phase === 'ring' ? (
        <div className="call-ring fade">
          <div className="call-orb"><i /><i /><b><Icon name="phone" size={34} /></b></div>
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
            {phase === 'hello' && <p key="hello" className="call-q fade">{session?.script.greeting ?? ''}</p>}
            {(phase === 'ask' || phase === 'listen') && q && <p key={`q${i}`} className="call-q fade">{q.text}</p>}
            {phase === 'listen' && (
              <div className="call-listen fade">
                <span className="call-wave"><i /><i /><i /><i /><i /></span>
                {heard && <p className="call-heard">{heard}</p>}
              </div>
            )}
            {phase === 'photo' && (
              <div key="photo" className="fade">
                <p className="call-q">Có tấm ảnh nào ngày ấy không? Gửi Homeletter giữ giúp nhé.</p>
                <label className="btn" style={{ marginTop: 28 }}>
                  <Icon name="image" size={20} /> Chọn ảnh
                  <input type="file" accept="image/*" hidden onChange={(e) => sendPhoto(e.target.files?.[0])} />
                </label>
                <button className="link" onClick={() => { tap(); next(); }}>Để sau</button>
              </div>
            )}
            {phase === 'bye' && (
              <div key="bye" className="fade">
                <p className="call-q">{session?.script.goodbye}</p>
                {answered > 0 && <p className="call-note">Giọng kể sẽ thành một tập podcast, chờ ít phút nhé.</p>}
              </div>
            )}
          </div>
          <div className="call-foot">
            {phase === 'listen' && (
              <>
                <button className="btn" onClick={() => doneAnswer()}>Kể xong</button>
                <button className="link" onClick={() => doneAnswer(true)}>Bỏ qua câu này</button>
              </>
            )}
            {phase === 'bye'
              ? <button className="btn ghost" onClick={() => { tap(); cleanup(); onClose(answered > 0); }}>Xong</button>
              : <button className="call-end" onClick={hangUp} aria-label="Kết thúc"><Icon name="phone" size={26} /></button>}
          </div>
        </div>
      )}
    </div>
  );
}
