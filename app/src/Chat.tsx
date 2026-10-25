import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { thumb, type Me, type Member } from './shared';
import { cached, remember } from './cache';
import { errorText, token } from './api';
import { locale, t, type Key } from './i18n';
import { fileName, shrinkImage, useHoldMic } from './media';
import { Avatar, Icon, toast } from './ui';
import { STICKER_LIST, Sticker } from './stickers';

type Msg = {
  id: string; author_id: string; kind: 'text' | 'sticker' | 'photo' | 'voice'; text?: string | null; media?: string | null;
  sticker?: string | null; seconds?: number | null; reply_to?: string | null; created_at: string;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { ...init, headers: { ...(tk ? { authorization: `Bearer ${tk}` } : {}), ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

const hm = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: locale().startsWith('vi') ? '2-digit' : 'numeric', minute: '2-digit' });
function dayLabel(iso: string) {
  const d = new Date(iso), n = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 86400e3);
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.yesterday');
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
}

export function Chat({ me, onClose, onCall, live }: { me: Me; onClose: () => void; onCall?: () => void; live?: boolean }) {
  // Mở chat là thấy ngay các tin lần trước, tin mới về thì nối vào.
  const [msgs, setMsgs] = useState<Msg[]>(() => cached<Msg[]>('chat') ?? []);
  const [text, setText] = useState('');
  const [tray, setTray] = useState(false);
  const [vh, setVh] = useState<number | null>(null);
  // Số ảnh, đoạn nói đang gửi: hiện một dòng nhỏ cuối khung để biết là máy đang gửi.
  const [pending, setPending] = useState(0);
  const [viewer, setViewer] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const meId = me.me.id;
  // me được tải lại mỗi lần mở chat (đối tượng mới): chỉ dựng lại danh sách khi thông tin thành viên thật sự đổi.
  const membersKey = JSON.stringify(me.members);
  const member = (id: string): Member | undefined => me.members.find((m) => m.id === id);

  const markRead = useCallback(() => { call('/api/chat/read', { method: 'POST' }).catch(() => {}); }, []);

  const merge = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    setMsgs((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      if (!added.length) return prev;
      if (added.some((m) => m.author_id !== meId)) markRead();
      // Tin thật của mình về qua kênh tức thời trước khi lệnh gửi trả lời: bỏ tin tạm tương ứng, không hiện hai lần.
      const same = (a: Msg, b: Msg) => a.author_id === b.author_id && a.kind === b.kind && (a.text ?? null) === (b.text ?? null) && (a.sticker ?? null) === (b.sticker ?? null);
      const kept = prev.filter((m) => !m.id.startsWith('tmp-') || !added.some((a) => same(a, m)));
      return [...kept, ...added].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    });
  }, [meId, markRead]);

  // Tải ban đầu, rồi nghe tin mới qua SSE; hỏi lại mỗi 8 giây phòng khi mạng rớt.
  const latest = useRef('');
  useEffect(() => {
    const real = msgs.filter((m) => !m.id.startsWith('tmp-'));
    latest.current = real.length ? real[real.length - 1].created_at : '';
    remember('chat', real.slice(-60));
  }, [msgs]);
  useEffect(() => {
    let alive = true;
    // Bản mới thay bản lưu, giữ lại các tin mình đang gửi dở.
    call<Msg[]>('/api/chat').then((r) => { if (alive) { setMsgs((p) => [...r, ...p.filter((m) => m.id.startsWith('tmp-'))]); markRead(); } }).catch((e) => toast(e.message));
    const poll = setInterval(() => {
      // Kênh tin tức thời đang nối thì không cần hỏi thêm; chỉ hỏi khi kênh rớt.
      if (document.hidden || es?.readyState === 1) return;
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
  }, [msgs, tray, vh, pending]);

  // Chữ và hình dán hiện ngay trong khung (tin tạm), máy chủ trả lời thì thay bằng tin thật; lỗi thì gỡ tin tạm và báo.
  async function send(f: FormData, tmp?: Msg) {
    const slow = f.has('file');
    stick.current = true;
    if (slow) setPending((n) => n + 1);
    if (tmp) setMsgs((p) => [...p, tmp]);
    try {
      const m = await call<Msg>('/api/chat', { method: 'POST', body: f });
      setMsgs((p) => {
        const rest = tmp ? p.filter((x) => x.id !== tmp.id) : p;
        // Kênh tức thời có thể đã đưa tin thật về trước.
        return rest.some((x) => x.id === m.id) ? rest : [...rest, m];
      });
    } catch (e) {
      if (tmp) setMsgs((p) => p.filter((x) => x.id !== tmp.id));
      toast((e as Error).message);
      throw e;
    } finally { if (slow) setPending((n) => n - 1); }
  }
  const tmpMsg = (x: Partial<Msg>): Msg => ({ id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, author_id: meId, kind: 'text', created_at: new Date().toISOString(), ...x });
  const lastSent = useRef({ t: '', at: 0 });
  function sendText() {
    const s = text.trim();
    // Hai lần bấm gửi sát nhau (state chưa kịp xoá ô chữ) thì chỉ gửi một lần.
    if (!s || (lastSent.current.t === s && Date.now() - lastSent.current.at < 800)) return;
    lastSent.current = { t: s, at: Date.now() };
    setText('');
    const f = new FormData(); f.set('kind', 'text'); f.set('text', s);
    // Gửi lỗi thì trả chữ về ô (nếu người dùng chưa gõ gì mới) để khỏi gõ lại.
    send(f, tmpMsg({ kind: 'text', text: s })).catch(() => setText((cur) => cur || s));
  }
  function sendSticker(id: string) {
    setTray(false);
    const f = new FormData(); f.set('kind', 'sticker'); f.set('sticker', id);
    send(f, tmpMsg({ kind: 'sticker', sticker: id })).catch(() => {});
  }
  async function sendPhoto(file?: File) {
    if (!file) return;
    setPending((n) => n + 1);
    const blob = await shrinkImage(file);
    setPending((n) => n - 1);
    const f = new FormData(); f.set('kind', 'photo'); f.set('file', blob, blob === file ? file.name : 'photo.jpg');
    send(f).catch(() => {});
  }

  // Giữ để nói: thả tay trước khi micro kịp mở thì không ghi, micro luôn tắt khi thả.
  const mic = useHoldMic((r) => {
    const f = new FormData(); f.set('kind', 'voice'); f.set('seconds', String(r.seconds)); f.set('file', r.blob, fileName(r.blob, 'voice'));
    send(f).catch(() => {});
  });
  const rec = mic.rec;
  function micDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    void mic.down();
  }
  const micUp = () => { void mic.up(); };

  // Danh sách tin chỉ dựng lại khi tin đổi, không dựng lại mỗi lần gõ một chữ (gõ trên iPhone từng khựng khi chat dài).
  const listBody = useMemo(() => {
    const rows: Array<{ type: 'day'; label: string; key: string } | { type: 'msg'; m: Msg; first: boolean; last: boolean }> = [];
    const days = msgs.map((m) => dayLabel(m.created_at));
    const near = (i: number, j: number) => msgs[i].author_id === msgs[j].author_id && days[i] === days[j] && Math.abs(+new Date(msgs[j].created_at) - +new Date(msgs[i].created_at)) < 5 * 60e3;
    msgs.forEach((m, i) => {
      const p = i > 0, n = i < msgs.length - 1;
      if (!p || days[i - 1] !== days[i]) rows.push({ type: 'day', label: days[i], key: `d${m.id}` });
      rows.push({ type: 'msg', m, first: !p || !near(i - 1, i), last: !n || !near(i, i + 1) });
    });
    return rows.map((r) => {
      if (r.type === 'day') return <div key={r.key} className="chat-day">{r.label}</div>;
      const { m, first, last } = r;
      const mine = m.author_id === meId;
      const who = member(m.author_id);
      return (
        <div key={m.id} className={`chat-row ${mine ? 'mine' : ''} ${first ? 'first' : ''}`}>
          {!mine && <div className="chat-av">{last ? <Avatar m={who} size={30} /> : null}</div>}
          <div className="chat-col">
            {!mine && first && <small className="chat-name">{who?.name ?? t('common.someone')}</small>}
            {m.kind === 'sticker' ? <div className="chat-sticker"><Sticker id={m.sticker ?? ''} size={120} /></div>
              : m.kind === 'photo' ? <button className="chat-photo-btn" onClick={() => setViewer(m.media!)} aria-label={t('chat.viewPhoto')}><img className="chat-photo" src={thumb(m.media, 1080)} alt="" loading="lazy" decoding="async" onLoad={() => { if (stick.current && list.current) list.current.scrollTop = list.current.scrollHeight; }} /></button>
              : <div className={`bubble ${mine ? 'mine' : ''}`}>{m.kind === 'voice' ? <Voice url={m.media!} seconds={m.seconds} /> : m.text}</div>}
            {last && <small className="chat-time">{hm(m.created_at)}</small>}
          </div>
        </div>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, membersKey]);

  return (
    <div className="chat" style={vh ? { height: vh } : undefined}>
      <header className="chat-top">
        <button className="icon-btn" onClick={onClose} aria-label={t('common.back')}><Icon name="back" /></button>
        <div className="chat-title">
          <b>{me.family.name}</b>
          <div className="chat-faces">{me.members.map((m) => <Avatar key={m.id} m={m} size={20} />)}</div>
        </div>
        {onCall && <button className={`icon-btn ${live ? 'live' : ''}`} onClick={onCall} aria-label={t('chat.videoCall')}><Icon name="video" /></button>}
      </header>

      <div className="chat-list" ref={list} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {!msgs.length && <div className="chat-empty">{t('chat.empty')}</div>}
        {listBody}
        {pending > 0 && <div className="chat-day chat-sending">{t('chat.sending')}</div>}
      </div>

      {tray && (
        <div className="chat-tray">
          {STICKER_LIST.map((s) => (
            <button key={s.id} onClick={() => sendSticker(s.id)}><Sticker id={s.id} size={64} /><span>{t(`sticker.${s.id}` as Key)}</span></button>
          ))}
        </div>
      )}

      <div className="chat-bar">
        <button className={`icon-btn ${tray ? 'on' : ''}`} onClick={() => setTray(!tray)} aria-label={t('chat.stickers')}><Icon name="heart" /></button>
        <label className="icon-btn" aria-label={t('chat.sendPhoto')}>
          <Icon name="image" />
          <input type="file" accept="image/*" hidden onChange={(e) => { void sendPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <input className="chat-input" value={text} placeholder={rec ? t('common.listening') : t('chat.placeholder')} disabled={rec}
          onChange={(e) => setText(e.target.value)} onFocus={() => { setTray(false); stick.current = true; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendText(); }} enterKeyHint="send" />
        {text.trim()
          ? <button className="icon-btn dark" onClick={sendText} aria-label={t('common.send')}><Icon name="send" /></button>
          : <button className={`icon-btn mic ${rec ? 'rec' : 'dark'}`} onPointerDown={micDown} onPointerUp={micUp} onPointerCancel={micUp} onContextMenu={(e) => e.preventDefault()} aria-label={t('chat.holdTalk')}><Icon name="mic" /></button>}
      </div>

      {/* Xem ảnh ngay trong app (mở tab mới thì app thêm vào màn hình chính bị văng ra Safari). Chụm hai ngón để phóng to. */}
      {viewer && (
        <div className="viewer" onClick={() => setViewer(null)} role="dialog" aria-label={t('chat.photo')}>
          <img src={viewer} alt="" />
          <button className="icon-btn viewer-close" aria-label={t('common.close')}><Icon name="close" /></button>
        </div>
      )}
    </div>
  );
}

function Voice({ url, seconds }: { url: string; seconds?: number | null }) {
  const a = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <button className="chat-voice" onClick={() => { if (on) a.current?.pause(); else void a.current?.play(); }}>
      <audio ref={a} src={url} preload="none" onEnded={() => setOn(false)} onPause={() => setOn(false)} onPlay={() => setOn(true)} />
      <Icon name={on ? 'pause' : 'play'} size={18} />
      <i className="chat-wave" />
      <span>{seconds ? `${Math.round(seconds)}s` : t('common.listen')}</span>
    </button>
  );
}
