import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { thumb, type Me, type Member } from './shared';
import { cached, remember } from './cache';
import { autoTranslateOn, errorText, token, translateMessage } from './api';
import { locale, shownLang, t, useLang, type Key } from './i18n';
import { fileName, shrinkImage, useHoldMic } from './media';
import { Avatar, Icon, toast } from './ui';
import { STICKER_LIST, Sticker } from './stickers';

type Msg = {
  id: string; author_id: string; kind: 'text' | 'sticker' | 'photo' | 'voice'; text?: string | null; media?: string | null;
  sticker?: string | null; seconds?: number | null; reply_to?: string | null; created_at: string;
  // Thứ tiếng của người viết (máy chủ gửi kèm), để biết tin nào cần nút dịch.
  author_lang?: string | null;
  // Tin riêng: người nhận. null là tin cả nhà.
  to_id?: string | null;
};
type Summary = { last: Msg | null; unread: number };
type Threads = { family: Summary; people: Record<string, Summary> };

/** Khoá luồng cả nhà trong danh sách (mã thành viên là uuid nên không trùng). */
const FAMILY = 'family';
/** Tham số luồng gửi lên máy chủ: luồng cả nhà không có ?with=. */
const qs = (peer: string | null, extra = '') => {
  const p = [peer ? `with=${encodeURIComponent(peer)}` : '', extra].filter(Boolean).join('&');
  return p ? `?${p}` : '';
};
const given = (name: string) => name.trim().split(/\s+/).pop() ?? name;

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

/** Giờ ở danh sách luồng: hôm nay thì giờ phút, hôm qua, còn lại ngày/tháng. */
function when(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return hm(iso);
  const label = dayLabel(iso);
  return label === t('common.yesterday') ? label : d.toLocaleDateString(locale(), { day: 'numeric', month: 'numeric' });
}

/** Kênh tin tức thời. Máy chủ chỉ gửi tin mình được thấy: tin cả nhà, và tin riêng mình gửi hoặc nhận. */
function useStream(onMsg: (m: Msg) => void, onOpen: () => void) {
  const cb = useRef({ onMsg, onOpen });
  cb.current = { onMsg, onOpen };
  const es = useRef<EventSource | null>(null);
  useEffect(() => {
    try {
      const s = new EventSource(`/api/chat/stream?token=${encodeURIComponent(token.get() ?? '')}`);
      s.onmessage = (e) => { try { cb.current.onMsg(JSON.parse(e.data)); } catch {} };
      s.onopen = () => cb.current.onOpen();
      es.current = s;
    } catch {}
    return () => { es.current?.close(); es.current = null; };
  }, []);
  return es;
}

/** Chat: mở ra là danh sách luồng (cả nhà, rồi từng người), chạm vào một luồng thì mở luồng đó.
 *  start: mở thẳng luồng riêng với người này (chạm thông báo tin riêng). */
export function Chat({ me, onClose, onVideo, onVoice, live, start }: {
  me: Me; onClose: () => void; onVideo?: (memberId?: string) => void; onVoice?: (memberId: string) => void; live?: boolean; start?: string | null;
}) {
  const valid = (id?: string | null): id is string => !!id && id !== me.me.id && me.members.some((m) => m.id === id);
  const [open, setOpen] = useState<string | null>(() => (valid(start) ? start : null));
  // Đang mở chat mà chạm thông báo tin riêng khác: chuyển sang luồng đó.
  useEffect(() => { if (valid(start)) setOpen(start); }, [start]); // eslint-disable-line react-hooks/exhaustive-deps
  // Về danh sách: luồng vừa xem không còn chấm chưa đọc ngay từ bản lưu, khỏi nháy chấm cũ trong lúc chờ máy chủ.
  const back = () => {
    const th = cached<Threads>('chat-threads');
    if (th && open) {
      const seen = (s?: Summary): Summary => ({ last: s?.last ?? null, unread: 0 });
      remember('chat-threads', open === FAMILY ? { ...th, family: seen(th.family) } : { ...th, people: { ...th.people, [open]: seen(th.people[open]) } });
    }
    setOpen(null);
  };
  if (open) {
    return <Thread key={open} me={me} peer={open === FAMILY ? null : open} live={live} onBack={back} onVideo={onVideo} onVoice={onVoice} />;
  }
  return <ThreadList me={me} onClose={onClose} onOpen={setOpen} />;
}

/** Tin mới về khi đang xem danh sách: đổi tin cuối của luồng, thêm một tin chưa đọc nếu không phải tin mình. */
function bump(p: Threads | null, m: Msg, meId: string): Threads | null {
  if (!p) return p;
  const next = (s?: Summary): Summary => (s?.last?.id === m.id ? s : { last: m, unread: m.author_id === meId ? 0 : (s?.unread ?? 0) + 1 });
  if (!m.to_id) return { ...p, family: next(p.family) };
  const peer = m.author_id === meId ? m.to_id : m.author_id;
  return { ...p, people: { ...p.people, [peer]: next(p.people[peer]) } };
}

function ThreadList({ me, onClose, onOpen }: { me: Me; onClose: () => void; onOpen: (id: string) => void }) {
  const meId = me.me.id;
  const [th, setTh] = useState<Threads | null>(() => cached<Threads>('chat-threads'));
  const load = useCallback(() => {
    call<Threads>('/api/chat/threads').then((r) => { setTh(r); remember('chat-threads', r); }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const onShow = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);
  useStream((m) => setTh((p) => bump(p, m, meId)), load);

  const member = (id: string): Member | undefined => me.members.find((m) => m.id === id);
  const preview = (m: Msg | null, family: boolean) => {
    if (!m) return '';
    const body = m.kind === 'text' ? (m.text ?? '') : m.kind === 'sticker' ? t('chat.kind.sticker') : m.kind === 'photo' ? t('chat.photo') : t('chat.kind.voice');
    const who = m.author_id === meId ? t('chat.you') : family ? given(member(m.author_id)?.name ?? t('common.someone')) : '';
    return who ? `${who}: ${body}` : body;
  };
  // Cả nhà luôn đầu; sau đó người có tin mới nhất trước, ai chưa nhắn gì giữ thứ tự trong nhà.
  const people = me.members.filter((m) => m.id !== meId)
    .map((m, i) => ({ m, s: th?.people[m.id], i }))
    .sort((a, b) => (+new Date(b.s?.last?.created_at ?? 0) - +new Date(a.s?.last?.created_at ?? 0)) || a.i - b.i);
  const row = (id: string, name: string, av: ReactNode, s: Summary | undefined, family: boolean) => {
    const n = s?.unread ?? 0;
    const last = s?.last ?? null;
    return (
      <button key={id} className={`chat-thread ${n ? 'unread' : ''}`} onClick={() => onOpen(id)}>
        <span className="chat-thread-av">{av}</span>
        <span className="chat-thread-main">
          <b>{name}</b>
          {last && <span className="chat-thread-last">{preview(last, family)}</span>}
        </span>
        <span className="chat-thread-side">
          {last && <small>{when(last.created_at)}</small>}
          {n > 0 && <i className="chat-dot" role="img" aria-label={t('chat.unread', { n })} />}
        </span>
      </button>
    );
  };

  return (
    <div className="chat">
      <header className="chat-top">
        <button className="icon-btn" onClick={onClose} aria-label={t('common.back')}><Icon name="back" /></button>
        <div className="chat-title"><b>{t('tab.chat')}</b></div>
      </header>
      <div className="chat-threads">
        {row(FAMILY, t('chat.family'), <span className="chat-thread-fam"><Icon name="people" size={22} /></span>, th?.family, true)}
        {people.map(({ m, s }) => row(m.id, m.name, <Avatar m={m} size={44} />, s, false))}
      </div>
    </div>
  );
}

/** Một luồng: cả nhà (peer null) hoặc tin riêng với peer. Ảnh, giọng nói, hình dán, dịch như nhau. */
function Thread({ me, peer, onBack, onVideo, onVoice, live }: {
  me: Me; peer: string | null; onBack: () => void; onVideo?: (memberId?: string) => void; onVoice?: (memberId: string) => void; live?: boolean;
}) {
  // Mở luồng là thấy ngay các tin lần trước, tin mới về thì nối vào. Luồng cả nhà giữ khoá cũ.
  const cacheKey = peer ? `chat:${peer}` : 'chat';
  const [msgs, setMsgs] = useState<Msg[]>(() => cached<Msg[]>(cacheKey) ?? []);
  const [text, setText] = useState('');
  const [tray, setTray] = useState(false);
  const [vh, setVh] = useState<number | null>(null);
  // Số ảnh, đoạn nói đang gửi: hiện một dòng nhỏ cuối khung để biết là máy đang gửi.
  const [pending, setPending] = useState(0);
  const [viewer, setViewer] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const meId = me.me.id;
  const lang = useLang();
  const auto = autoTranslateOn();
  // me được tải lại mỗi lần mở chat (đối tượng mới): chỉ dựng lại danh sách khi thông tin thành viên thật sự đổi.
  const membersKey = JSON.stringify(me.members);
  const member = (id: string): Member | undefined => me.members.find((m) => m.id === id);

  const markRead = useCallback(() => { call(`/api/chat/read${qs(peer)}`, { method: 'POST' }).catch(() => {}); }, [peer]);
  // Kênh tức thời gửi mọi tin mình được thấy: chỉ lấy tin của luồng đang mở.
  const inThread = (m: Msg) => (peer ? (m.author_id === meId && m.to_id === peer) || (m.author_id === peer && m.to_id === meId) : !m.to_id);

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
    remember(cacheKey, real.slice(-60));
  }, [msgs, cacheKey]);
  const alive = useRef(true);
  const catchUp = useCallback(() => {
    const after = latest.current ? `after=${encodeURIComponent(latest.current)}` : '';
    call<Msg[]>(`/api/chat${qs(peer, after)}`).then((r) => alive.current && merge(r)).catch(() => {});
  }, [peer, merge]);
  // Kênh vừa nối (hoặc nối lại): hỏi bù các tin tới đúng khe kênh chưa nối, vì kênh nối rồi thì lần hỏi 8 giây bị bỏ qua. Tin trùng tự lọc.
  const es = useStream((m) => { if (inThread(m)) merge([m]); }, catchUp);
  useEffect(() => {
    alive.current = true;
    // Bản mới thay bản lưu, giữ lại các tin mình đang gửi dở.
    call<Msg[]>(`/api/chat${qs(peer)}`).then((r) => { if (alive.current) { setMsgs((p) => [...r, ...p.filter((m) => m.id.startsWith('tmp-'))]); markRead(); } }).catch((e) => toast(e.message));
    const poll = setInterval(() => {
      // Kênh tin tức thời đang nối thì không cần hỏi thêm; chỉ hỏi khi kênh rớt.
      if (document.hidden || es.current?.readyState === 1) return;
      catchUp();
    }, 8000);
    return () => { alive.current = false; clearInterval(poll); };
  }, [peer, markRead, catchUp, es]);

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
      const m = await call<Msg>(`/api/chat${qs(peer)}`, { method: 'POST', body: f });
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
    // Tự dịch chỉ với 30 tin mới nhất, để mở chat dài không bắn cả trăm lượt dịch một lúc.
    const recent = new Set(msgs.slice(-30).map((m) => m.id));
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
            {!mine && first && !peer && <small className="chat-name">{who?.name ?? t('common.someone')}</small>}
            {m.kind === 'sticker' ? <div className="chat-sticker"><Sticker id={m.sticker ?? ''} size={120} /></div>
              : m.kind === 'photo' ? <button className="chat-photo-btn" onClick={() => setViewer(m.media!)} aria-label={t('chat.viewPhoto')}><img className="chat-photo" src={thumb(m.media, 1080)} alt="" loading="lazy" decoding="async" onLoad={() => { if (stick.current && list.current) list.current.scrollTop = list.current.scrollHeight; }} /></button>
              : <div className={`bubble ${mine ? 'mine' : ''}`}>{m.kind === 'voice' ? <Voice url={m.media!} seconds={m.seconds} /> : m.text}</div>}
            {m.kind === 'text' && m.text && !mine && !m.id.startsWith('tmp-') && m.author_lang && m.author_lang !== lang
              && <Translated id={m.id} to={shownLang()} auto={auto && recent.has(m.id)} />}
            {last && <small className="chat-time">{hm(m.created_at)}</small>}
          </div>
        </div>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, membersKey, lang, auto, peer]);

  const other = peer ? member(peer) : undefined;
  const otherName = other?.name ?? t('common.someone');
  return (
    <div className="chat" style={vh ? { height: vh } : undefined}>
      <header className="chat-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}><Icon name="back" /></button>
        {peer ? (
          <>
            <div className="chat-title chat-title-dm"><Avatar m={other} size={32} /><b>{otherName}</b></div>
            {onVoice && <button className="icon-btn" onClick={() => onVoice(peer)} aria-label={t('chat.voiceCall')}><Icon name="phone" /></button>}
            {onVideo && <button className="icon-btn" onClick={() => onVideo(peer)} aria-label={t('chat.videoCall')}><Icon name="video" /></button>}
          </>
        ) : (
          <>
            <div className="chat-title">
              <b>{me.family.name}</b>
              <div className="chat-faces">{me.members.map((m) => <Avatar key={m.id} m={m} size={20} />)}</div>
            </div>
            {onVideo && <button className={`icon-btn ${live ? 'live' : ''}`} onClick={() => onVideo()} aria-label={t('chat.videoCall')}><Icon name="video" /></button>}
          </>
        )}
      </header>

      <div className="chat-list" ref={list} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {!msgs.length && <div className="chat-empty">{peer ? t('chat.emptyTo') : t('chat.empty')}</div>}
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
        <input className="chat-input" value={text} placeholder={rec ? t('common.listening') : peer ? t('chat.placeholderTo', { name: given(otherName) }) : t('chat.placeholder')} disabled={rec}
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

// Hết hạn mức hoặc máy chủ chưa có AI thì cả phiên này thôi hỏi dịch, khỏi bắn thêm lượt vô ích.
let noTranslate = false;

/** Nút "dịch" nhỏ dưới tin của người dùng thứ tiếng khác; bấm hiện bản dịch dưới tin gốc, bấm lại thì ẩn. auto: tự dịch khi hiện. */
function Translated({ id, to, auto }: { id: string; to: 'vi' | 'en' | 'ko'; auto: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(noTranslate);

  const load = useCallback(() => {
    if (busy) return;
    setBusy(true); setErr(null); setOpen(true);
    translateMessage(id, to)
      .then((r) => setText(r.text))
      .catch((e: Error & { code?: string }) => {
        setOpen(false);
        if (e.code === 'translate_unavailable') { noTranslate = true; setGone(true); } else setErr(e.message);
      })
      .finally(() => setBusy(false));
  }, [id, to, busy]);

  // Đổi thứ tiếng của mình thì bản dịch cũ không còn đúng.
  useEffect(() => { setText(null); setErr(null); setOpen(false); }, [to]);
  useEffect(() => { if (auto && !noTranslate && text == null && !open && !err) load(); }, [auto, to]); // eslint-disable-line react-hooks/exhaustive-deps

  if (gone && text == null) return null;
  const quiet = { fontSize: 12, color: 'var(--muted)' } as const;
  return (
    <div style={{ marginTop: 2, minWidth: 0 }}>
      {open && (
        <div style={{ margin: '2px 6px 0', padding: '2px 0 2px 10px', borderLeft: '2px solid var(--line)', fontSize: 14, lineHeight: 1.4, color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
          <small style={{ display: 'block', fontSize: 11 }}>{t('chat.translated')}</small>
          {text ?? t('chat.translating')}
        </div>
      )}
      {err && <div style={{ ...quiet, margin: '2px 6px 0' }}>{err}</div>}
      <button type="button" style={{ ...quiet, background: 'none', border: 0, padding: '4px 6px', minHeight: 28 }}
        onClick={() => { if (open) setOpen(false); else if (text != null) setOpen(true); else load(); }}>{t('chat.translate')}</button>
    </div>
  );
}
