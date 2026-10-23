import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Me, Member } from './shared';
import { token } from './api';
import { AUDIO_TYPE, fileName, record } from './media';
import { Avatar, Icon, toast } from './ui';
import { sfx, buzz } from './sound';
import { STICKER_LIST, Sticker } from './stickers';

type Msg = {
  id: string; author_id: string; kind: 'text' | 'sticker' | 'photo' | 'voice'; text?: string | null; media?: string | null;
  sticker?: string | null; seconds?: number | null; reply_to?: string | null; created_at: string;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(path, { ...init, headers: { ...(t ? { authorization: `Bearer ${t}` } : {}), ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || 'Có lỗi, thử lại nhé');
  return data as T;
}

const hm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
function dayLabel(iso: string) {
  const d = new Date(iso), n = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 86400e3);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
}

export function Chat({ me, onClose, onCall, live }: { me: Me; onClose: () => void; onCall?: () => void; live?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [tray, setTray] = useState(false);
  const [rec, setRec] = useState(false);
  const [vh, setVh] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const stop = useRef<(() => Promise<{ blob: Blob; seconds: number }>) | null>(null);
  const stick = useRef(true);
  const meId = me.me.id;
  const member = (id: string): Member | undefined => me.members.find((m) => m.id === id);

  const markRead = useCallback(() => { call('/api/chat/read', { method: 'POST' }).catch(() => {}); }, []);

  const merge = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    setMsgs((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      if (!added.length) return prev;
      if (added.some((m) => m.author_id !== meId)) { sfx('pop'); markRead(); }
      return [...prev, ...added].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    });
  }, [meId, markRead]);

  // Tải ban đầu, rồi nghe tin mới qua SSE; hỏi lại mỗi 8 giây phòng khi mạng rớt.
  const latest = useRef('');
  useEffect(() => { latest.current = msgs.length ? msgs[msgs.length - 1].created_at : ''; }, [msgs]);
  useEffect(() => {
    let alive = true;
    call<Msg[]>('/api/chat').then((r) => { if (alive) { setMsgs(r); markRead(); } }).catch((e) => toast(e.message));
    const poll = setInterval(() => {
      const q = latest.current ? `?after=${encodeURIComponent(latest.current)}` : '';
      call<Msg[]>(`/api/chat${q}`).then((r) => alive && merge(r)).catch(() => {});
    }, 8000);
    let es: EventSource | undefined;
    try {
      es = new EventSource(`/api/chat/stream?token=${encodeURIComponent(token.get() ?? '')}`);
      es.onmessage = (e) => { try { merge([JSON.parse(e.data)]); } catch {} };
    } catch {}
    return () => { alive = false; clearInterval(poll); es?.close(); };
  }, [merge, markRead]);

  // Bàn phím bật lên thì khung co lại theo vùng nhìn thấy.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => { setVh(vv.height); window.scrollTo(0, 0); };
    f();
    vv.addEventListener('resize', f);
    vv.addEventListener('scroll', f);
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); };
  }, []);

  useLayoutEffect(() => {
    if (stick.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [msgs, tray, vh]);

  async function send(f: FormData) {
    try {
      const m = await call<Msg>('/api/chat', { method: 'POST', body: f });
      stick.current = true;
      setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
      sfx('send');
    } catch (e) { toast((e as Error).message); }
  }
  function sendText() {
    const t = text.trim();
    if (!t) return;
    setText('');
    const f = new FormData(); f.set('kind', 'text'); f.set('text', t);
    void send(f);
  }
  function sendSticker(id: string) {
    setTray(false);
    const f = new FormData(); f.set('kind', 'sticker'); f.set('sticker', id);
    void send(f);
  }
  function sendPhoto(file?: File) {
    if (!file) return;
    const f = new FormData(); f.set('kind', 'photo'); f.set('file', file, file.name);
    void send(f);
  }

  async function micDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const s = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!s) return toast('Cho phép micro để nói nhé');
    const stopRec = record(s, AUDIO_TYPE());
    stop.current = async () => { const r = await stopRec(); s.getTracks().forEach((t) => t.stop()); return r; };
    setRec(true); sfx('rec'); buzz(20);
  }
  async function micUp() {
    if (!stop.current) return;
    const go = stop.current; stop.current = null;
    setRec(false);
    const r = await go();
    if (r.seconds < 1) return toast('Giữ lâu hơn một chút để nói');
    const f = new FormData(); f.set('kind', 'voice'); f.set('seconds', String(r.seconds)); f.set('file', r.blob, fileName(r.blob, 'voice'));
    void send(f);
  }

  const rows: Array<{ type: 'day'; label: string; key: string } | { type: 'msg'; m: Msg; first: boolean; last: boolean }> = [];
  const near = (a: Msg, b: Msg) => a.author_id === b.author_id && dayLabel(a.created_at) === dayLabel(b.created_at) && Math.abs(+new Date(b.created_at) - +new Date(a.created_at)) < 5 * 60e3;
  msgs.forEach((m, i) => {
    const p = msgs[i - 1], n = msgs[i + 1];
    if (!p || dayLabel(p.created_at) !== dayLabel(m.created_at)) rows.push({ type: 'day', label: dayLabel(m.created_at), key: `d${m.id}` });
    rows.push({ type: 'msg', m, first: !p || !near(p, m), last: !n || !near(m, n) });
  });

  return (
    <div className="chat" style={vh ? { height: vh } : undefined}>
      <header className="chat-top">
        <button className="icon-btn" onClick={onClose} aria-label="Quay lại"><Icon name="back" /></button>
        <div className="chat-title">
          <b>{me.family.name}</b>
          <div className="chat-faces">{me.members.map((m) => <Avatar key={m.id} m={m} size={20} />)}</div>
        </div>
        {onCall && <button className={`icon-btn ${live ? 'live' : ''}`} onClick={onCall} aria-label="Gọi video"><Icon name="video" /></button>}
      </header>

      <div className="chat-list" ref={list} onScroll={(e) => { const t = e.currentTarget; stick.current = t.scrollHeight - t.scrollTop - t.clientHeight < 80; }}>
        {!msgs.length && <div className="chat-empty">Chưa có tin nào. Nhắn một câu cho cả nhà nhé.</div>}
        {rows.map((r) => {
          if (r.type === 'day') return <div key={r.key} className="chat-day">{r.label}</div>;
          const { m, first, last } = r;
          const mine = m.author_id === meId;
          const who = member(m.author_id);
          return (
            <div key={m.id} className={`chat-row ${mine ? 'mine' : ''} ${first ? 'first' : ''}`}>
              {!mine && <div className="chat-av">{last ? <Avatar m={who} size={30} /> : null}</div>}
              <div className="chat-col">
                {!mine && first && <small className="chat-name">{who?.name ?? 'Ai đó'}</small>}
                {m.kind === 'sticker' ? <div className="chat-sticker"><Sticker id={m.sticker ?? ''} size={120} /></div>
                  : m.kind === 'photo' ? <a href={m.media!} target="_blank" rel="noreferrer"><img className="chat-photo" src={m.media!} alt="" loading="lazy" onLoad={() => { if (stick.current && list.current) list.current.scrollTop = list.current.scrollHeight; }} /></a>
                  : <div className={`bubble ${mine ? 'mine' : ''}`}>{m.kind === 'voice' ? <Voice url={m.media!} seconds={m.seconds} /> : m.text}</div>}
                {last && <small className="chat-time">{hm(m.created_at)}</small>}
              </div>
            </div>
          );
        })}
      </div>

      {tray && (
        <div className="chat-tray">
          {STICKER_LIST.map((s) => (
            <button key={s.id} onClick={() => sendSticker(s.id)}><Sticker id={s.id} size={64} /><span>{s.label}</span></button>
          ))}
        </div>
      )}

      <div className="chat-bar">
        <button className={`icon-btn ${tray ? 'on' : ''}`} onClick={() => setTray(!tray)} aria-label="Hình dán"><Icon name="heart" /></button>
        <label className="icon-btn" aria-label="Gửi ảnh">
          <Icon name="image" />
          <input type="file" accept="image/*" hidden onChange={(e) => { sendPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <input className="chat-input" value={text} placeholder={rec ? 'Đang nghe...' : 'Nhắn cho cả nhà'} disabled={rec}
          onChange={(e) => setText(e.target.value)} onFocus={() => { setTray(false); stick.current = true; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendText(); }} enterKeyHint="send" />
        {text.trim()
          ? <button className="icon-btn dark" onClick={sendText} aria-label="Gửi"><Icon name="send" /></button>
          : <button className={`icon-btn mic ${rec ? 'rec' : 'dark'}`} onPointerDown={micDown} onPointerUp={micUp} onPointerCancel={micUp} onContextMenu={(e) => e.preventDefault()} aria-label="Giữ để nói"><Icon name="mic" /></button>}
      </div>
    </div>
  );
}

function Voice({ url, seconds }: { url: string; seconds?: number | null }) {
  const a = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <button className="chat-voice" onClick={() => { if (on) a.current?.pause(); else void a.current?.play(); }}>
      <audio ref={a} src={url} onEnded={() => setOn(false)} onPause={() => setOn(false)} onPlay={() => setOn(true)} />
      <Icon name={on ? 'pause' : 'play'} size={18} />
      <i className="chat-wave" />
      <span>{seconds ? `${Math.round(seconds)}s` : 'Nghe'}</span>
    </button>
  );
}
