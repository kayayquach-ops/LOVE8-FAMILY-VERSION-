import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import { VoiceDot } from './Camera';
import { fileName, useHoldMic, type Recording } from './media';
import { cached, remember, reuse } from './cache';
import { cityOf, thumb, type Me, type Member, type Post, type Reply, type Week } from './shared';
import { tap } from './sound';
import { ago, localTime } from './time';
import { Avatar, Icon, toast } from './ui';
import { t } from './i18n';

const EMOJIS = ['❤️', '🥺', '😂', '🙏'];

// Tin nhà: mỗi trang một tin, vuốt lên xem tin tiếp. Trang đầu là chuyện của tuần này.
// start: mở thẳng tới tin này (bấm ảnh ở Trang chủ).
export function Feed({ me, start, onClose }: { me: Me; start?: string | null; onClose: () => void }) {
  // Mở là hiện ngay bản lần trước (không còn chữ "đang tải" trên 4G), máy chủ trả lời thì thay bản mới.
  const [posts, setPosts] = useState<Post[] | null>(() => cached<Post[]>('feed'));
  const [week, setWeek] = useState<Week | null>(() => cached<Week>('week'));
  const [fresh, setFresh] = useState(false);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const pager = useRef<HTMLDivElement>(null);
  const jumped = useRef(false);

  const load = () => Promise.all([
    api.feed().then((p) => { remember('feed', p); setPosts((prev) => reuse(prev, p)); setFresh(true); }),
    api.week().then((w) => { remember('week', w); setWeek((prev) => (prev && JSON.stringify(prev) === JSON.stringify(w) ? prev : w)); }),
  ]).catch((e) => toast(e.message));
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 20000); return () => clearInterval(t); }, []);
  // Trước khi vẽ: mở thẳng tới tin vừa bấm, không thấy trang Tuần này lướt qua. Bản lưu chưa có tin đó thì đợi bản mới.
  useLayoutEffect(() => {
    if (jumped.current || !start || !posts || !pager.current) return;
    const i = posts.findIndex((p) => p.id === start);
    if (i >= 0) { jumped.current = true; pager.current.scrollTop = (i + 1) * pager.current.clientHeight; setIndex(i + 1); }
    else if (fresh) jumped.current = true;
  }, [posts, start, fresh]);

  const member = (id: string) => me.members.find((m) => m.id === id);
  // Trang 0 là "Tuần này"; trang i là tin i - 1.
  const current = index > 0 ? posts?.[index - 1] : undefined;

  // Giữ để nói: ở trang Tuần này là trả lời câu hỏi tuần, ở trang tin là trả lời tin đó.
  const target = useRef<{ week?: string; post?: string }>({});
  const voice = useHoldMic(async (r: Recording) => {
    const f = new FormData();
    f.set('file', r.blob, fileName(r.blob, 'voice'));
    f.set('seconds', String(r.seconds));
    try {
      const to = target.current;
      if (to.post) await api.reply(to.post, f);
      else { f.set('kind', 'voice'); if (to.week) f.set('questionWeek', to.week); await api.post(f); }
      tap();
      toast(t('common.sent'));
      void load();
    } catch (e) { toast((e as Error).message); }
  });
  const voiceDown = (t: { week?: string; post?: string }) => { target.current = t; void voice.down(); };
  const voiceUp = () => { void voice.up(); };

  const patch = (id: string, f: (p: Post) => Post) => setPosts((l) => l && l.map((x) => (x.id === id ? f(x) : x)));

  // Lời trả lời hiện ngay dưới tin, gửi lên máy chủ sau; lỗi thì gỡ ra, trả chữ về ô và báo.
  const lastSent = useRef({ t: '', at: 0 });
  function sendText() {
    const s = text.trim();
    // Hai lần bấm sát nhau (state chưa kịp xoá ô chữ) thì chỉ gửi một lần.
    if (!current || !s || (lastSent.current.t === s && Date.now() - lastSent.current.at < 800)) return;
    lastSent.current = { t: s, at: Date.now() };
    const postId = current.id;
    const tmp: Reply = { id: `tmp-${Date.now()}`, authorId: me.me.id, kind: 'text', text: s, createdAt: new Date().toISOString() };
    setText('');
    tap();
    patch(postId, (x) => ({ ...x, replies: [...x.replies, tmp] }));
    const f = new FormData();
    f.set('text', s);
    api.reply(postId, f).then(() => void load(), (e: Error) => {
      patch(postId, (x) => ({ ...x, replies: x.replies.filter((r) => r.id !== tmp.id) }));
      setText((cur) => cur || s);
      toast(e.message);
    });
  }

  const meId = me.me.id;
  const react = useCallback(async (p: Post, e: string) => {
    tap();
    const was = p.reactions[meId] ?? '';
    const next = was === e ? '' : e;
    // Hiện ngay trên màn, máy chủ trả lời sau; lỗi thì trả lại như cũ.
    patch(p.id, (x) => ({ ...x, reactions: { ...x.reactions, [meId]: next } }));
    try { await api.react(p.id, next); } catch (err) {
      patch(p.id, (x) => ({ ...x, reactions: { ...x.reactions, [meId]: was } }));
      toast((err as Error).message);
    }
  }, [meId]);

  const remove = useCallback(async (p: Post) => {
    if (!confirm(t('feed.confirmDelete'))) return;
    // Gỡ khỏi màn ngay; máy chủ không xoá được thì đặt lại chỗ cũ.
    setPosts((l) => l && l.filter((x) => x.id !== p.id));
    toast(t('common.deleted'));
    try { await api.remove(p.id); } catch (e) {
      setPosts((l) => (l && !l.some((x) => x.id === p.id) ? [...l, p].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) : l));
      toast((e as Error).message);
    }
  }, []);

  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>{t('feed.title')}</div>
        <span style={{ width: 44 }} />
      </div>

      <div className="pager" ref={pager} onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollTop / e.currentTarget.clientHeight))}>
        <div className="page">
          {week ? <WeekCard week={week} me={me} recording={voice.rec && !!target.current.week} onDown={() => voiceDown({ week: week.week })} onUp={voiceUp} /> : <div className="muted" style={{ textAlign: 'center' }}>{t('feed.loading')}</div>}
          {posts && posts.length > 0 && <div className="muted" style={{ textAlign: 'center', marginTop: 18 }}>{t('feed.swipe')}</div>}
        </div>
        {posts?.length === 0 && (
          <div className="page" style={{ textAlign: 'center' }}>
            <div className="h1">{t('feed.empty.title')}</div>
            <div className="muted">{t('feed.empty.body')}</div>
          </div>
        )}
        {posts?.map((p, i) => (
          <PostPage key={p.id} p={p} members={me.members} meId={meId} active={index === i + 1} near={Math.abs(index - (i + 1)) <= 2} onReact={react} onRemove={remove} />
        ))}
      </div>

      {/* Thanh trả lời nằm đè lên đáy, không chiếm chỗ: hiện ra hay ẩn đi đều không làm các trang co giãn và nhảy. */}
      {current && (
        <div className="reply-bar fade-only">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendText(); }}
            enterKeyHint="send" placeholder={t('feed.replyTo', { name: current.authorId === me.me.id ? t('feed.everyone') : member(current.authorId)?.name as string })} />
          {text.trim() ? (
            <button className="round dark" onClick={sendText} aria-label={t('common.send')}><Icon name="send" /></button>
          ) : (
            <button className={`round ${voice.rec && target.current.post ? 'rec' : ''}`} onPointerDown={() => voiceDown({ post: current.id })} onPointerUp={voiceUp} onPointerLeave={voiceUp} onPointerCancel={voiceUp}
              onContextMenu={(e) => e.preventDefault()} aria-label={t('feed.holdVoice')}><Icon name="mic" /></button>
          )}
        </div>
      )}
    </div>
  );
}

/** Một trang tin. memo: thả tim một tin, lướt sang trang khác, hay máy chủ trả bản mới thì chỉ vẽ lại tin có đổi. */
const PostPage = memo(function PostPage({ p, members, meId, active, near, onReact, onRemove }: {
  p: Post; members: Member[]; meId: string; active: boolean; near: boolean; onReact: (p: Post, e: string) => void; onRemove: (p: Post) => void;
}) {
  const member = (id: string) => members.find((m) => m.id === id);
  const a = member(p.authorId);
  const lt = localTime(a?.city);
  const counts = EMOJIS.map((e) => Object.values(p.reactions).filter((x) => x === e).length);
  return (
    <div className="page">
      <div className="who">
        <Avatar m={a} size={36} />
        <div>
          <b>{a?.id === meId ? t('common.you') : a?.name}</b>
          <div><span>{ago(p.createdAt)}{lt && a?.city ? ` · ${cityOf(a.city)?.name} ${lt}` : ''}</span></div>
        </div>
        {p.authorId === meId && <button className="link" style={{ marginLeft: 'auto', padding: '0 6px', minHeight: 44, minWidth: 44 }} onClick={() => onRemove(p)}>{t('common.delete')}</button>}
      </div>
      <PostCard p={p} active={active} near={near} name={a?.name ?? ''} />
      <div className="reacts">
        {EMOJIS.map((e, i) => (
          <button key={e} className={`react ${p.reactions[meId] === e ? 'on' : ''}`} onClick={() => onReact(p, e)} aria-label={t('feed.reactAria', { e })}>
            {e}{counts[i] > 0 && <small>{counts[i]}</small>}
          </button>
        ))}
      </div>
      <div className="replies">
        {p.replies.slice(-2).map((r) => (
          <div key={r.id} className="reply-pill">
            <b>{member(r.authorId)?.name}:</b>
            {r.kind === 'voice' ? <MiniVoice url={r.media!} seconds={r.seconds} /> : <span>{r.text}</span>}
          </div>
        ))}
        {p.replies.length > 2 && <span className="muted">{t('feed.moreReplies', { n: p.replies.length - 2 })}</span>}
      </div>
    </div>
  );
});

// near: chỉ hai trang quanh trang đang xem mới có ảnh, video thật; trang xa là khung trống cùng cỡ.
// Lướt qua nhiều tin không giữ hàng chục ảnh đã giải mã trong bộ nhớ (iPhone hết bộ nhớ thì giật, có khi tải lại cả app).
function PostCard({ p, active, near, name }: { p: Post; active: boolean; near: boolean; name: string }) {
  const v = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => { if (!v.current) return; if (active) void v.current.play().catch(() => {}); else v.current.pause(); }, [active, near]);
  if (p.kind === 'hug') {
    return (
      <div className="card hug-card">
        <div style={{ color: 'var(--accent)' }}><Icon name="heartFill" size={72} /></div>
        <div style={{ fontSize: 20 }}>{t('feed.hug', { name })}</div>
      </div>
    );
  }
  if (p.kind === 'voice') {
    return (
      <div className="card voice-card">
        {p.questionWeek && <div className="muted" style={{ color: '#6B5544' }}>{t('feed.weekAnswer')}</div>}
        {p.caption && <div className="muted" style={{ color: '#6B5544' }}>{p.caption}</div>}
        <VoiceDot url={p.media!} seconds={p.seconds} />
      </div>
    );
  }
  if (!near) return <div className="card" />;
  return (
    <div className="card" onClick={() => p.kind === 'video' && setMuted(!muted)}>
      {p.kind === 'video'
        ? <video ref={v} src={p.media!} poster={thumb(p.media, 1080)} preload={active ? 'auto' : 'metadata'} loop playsInline muted={muted} />
        : <img src={thumb(p.media, 1080)} alt={p.caption ?? ''} decoding="async" onLoad={(e) => { const i = e.currentTarget; if (i.naturalHeight > i.naturalWidth * 1.3) i.classList.add('tall'); }} />}
      {p.caption && <div className="cap">{p.caption}</div>}
      {p.kind === 'video' && muted && <div className="cap" style={{ top: 16, bottom: 'auto' }}>{t('feed.tapSound')}</div>}
    </div>
  );
}

function MiniVoice({ url, seconds }: { url: string; seconds?: number | null }) {
  const a = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <button onClick={() => { if (on) a.current?.pause(); else void a.current?.play().catch(() => {}); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32 }}>
      <audio ref={a} src={url} preload="none" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
      <Icon name={on ? 'pause' : 'play'} size={14} /> {seconds ? `${Math.round(seconds)}s` : t('common.listen')}
    </button>
  );
}

/** Tuần này: câu hỏi của tuần, tóm tắt cả nhà đã gửi gì, mâm cơm chung. */
function WeekCard({ week, me, recording, onDown, onUp }: { week: Week; me: Me; recording: boolean; onDown: () => void; onUp: () => void }) {
  const r = week.recap;
  return (
    <div className="panel">
      <div className="muted">{t('feed.week.question')}</div>
      <div style={{ fontSize: 22, lineHeight: 1.4, margin: '6px 0 14px' }}>{week.question}</div>
      <button className={`talk ${recording ? 'rec' : ''}`} style={{ marginTop: 0 }} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()}>
        <Icon name="mic" size={20} /> {recording ? t('common.listening') : t('feed.holdVoice')}
      </button>
      <div className="h2" style={{ marginTop: 22 }}>{t('feed.week.title')}</div>
      <div className="stat">
        <span>{t('feed.stat.photos', { n: r.photos })}</span><span>{t('feed.stat.videos', { n: r.videos })}</span><span>{t('feed.stat.voices', { n: r.voices })}</span><span>{t('feed.stat.hugs', { n: r.hugs })}</span>
      </div>
      {r.meals.length > 0 && (
        <>
          <div className="h2">{t('feed.week.meals')}</div>
          <div className="thumbs">{r.meals.map((m) => <img key={m.id} src={thumb(m.media, 360)} alt="" loading="lazy" decoding="async" />)}</div>
        </>
      )}
      {r.photos + r.videos + r.voices + r.hugs === 0 && <div className="muted" style={{ marginTop: 10 }}>{t('feed.week.empty', { name: me.me.name })}</div>}
    </div>
  );
}
