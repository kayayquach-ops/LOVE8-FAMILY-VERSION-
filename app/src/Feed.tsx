import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import { VoiceDot } from './Camera';
import { fileName, useHoldMic, type Recording } from './media';
import { cached, remember, reuse } from './cache';
import { cityOf, thumb, type Me, type Member, type Post, type Reply } from './shared';
import { cityName, usePlaceNames } from './placeName';
import { tap } from './sound';
import { Avatar, Doodle, Icon, toast } from './ui';
import { fmtDayMonth, fmtTime, t } from './i18n';
import './camera.css';

const HEART = '❤️';
// Tim có nút riêng trên ảnh; hàng dưới ảnh là các cảm xúc còn lại.
const EMOJIS = ['🥺', '😂', '🙏'];

// Ngày (năm, tháng, ngày) của một thời điểm theo múi giờ nơi người đăng. Bộ định dạng tạo một lần cho mỗi múi giờ.
const ymdFmt = new Map<string, Intl.DateTimeFormat>();
function ymd(d: Date, tz?: string) {
  let f = ymdFmt.get(tz ?? '');
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }); ymdFmt.set(tz ?? '', f); }
  const parts = f.formatToParts(d);
  const n = (k: string) => Number(parts.find((x) => x.type === k)?.value);
  return { y: n('year'), m: n('month'), d: n('day') };
}
/** Dòng nhỏ cạnh giờ to: hôm nay thì trống, hôm qua thì "hôm qua", xa hơn thì ngày/tháng. */
function dayLabel(iso: string, tz?: string) {
  const a = ymd(new Date(iso), tz);
  const same = (b: { y: number; m: number; d: number }) => a.y === b.y && a.m === b.m && a.d === b.d;
  if (same(ymd(new Date(), tz))) return '';
  if (same(ymd(new Date(Date.now() - 864e5), tz))) return t('feed.yesterday');
  return fmtDayMonth(a.d, a.m);
}

// Ảnh nhà mình: mở ra là tin mới nhất, mỗi trang một tin, vuốt lên xem tin tiếp. Kéo xuống ở tin đầu là về camera.
// start: mở thẳng tới tin này (bấm ảnh ở Trang chủ).
export function Feed({ me, start, onClose }: { me: Me; start?: string | null; onClose: () => void }) {
  usePlaceNames();
  // Mở là hiện ngay bản lần trước (không còn chữ "đang tải" trên 4G), máy chủ trả lời thì thay bản mới.
  const [posts, setPosts] = useState<Post[] | null>(() => cached<Post[]>('feed'));
  const [fresh, setFresh] = useState(false);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const pager = useRef<HTMLDivElement>(null);
  const jumped = useRef(false);
  const pull = useRef<number | null>(null);
  // Tin đang xem, nhớ theo id (xem chú thích ở hiệu ứng neo bên dưới).
  const viewing = useRef<string | null>(null);

  // Lần tải nền 20 giây một lần thì im khi lỗi (mất mạng không bị báo lặp lại mãi), chỉ lần mở đầu mới báo.
  const load = (quiet = false) => api.feed()
    .then((p) => { remember('feed', p); setPosts((prev) => reuse(prev, p)); setFresh(true); })
    .catch((e) => { if (!quiet) toast(e.message); });
  useEffect(() => { void load(); const iv = setInterval(() => { if (!document.hidden) void load(true); }, 20000); return () => clearInterval(iv); }, []);
  // Trước khi vẽ: mở thẳng tới tin vừa bấm, không thấy tin khác lướt qua. Bản lưu chưa có tin đó thì đợi bản mới.
  useLayoutEffect(() => {
    if (jumped.current || !start || !posts || !pager.current) return;
    const i = posts.findIndex((p) => p.id === start);
    if (i >= 0) { jumped.current = true; pager.current.scrollTop = i * pager.current.clientHeight; setIndex(i); viewing.current = start; }
    else if (fresh) jumped.current = true;
  }, [posts, start, fresh]);

  // Tin mới chèn lên đầu (20 giây hỏi một lần) trong lúc đang xem: Safari không tự neo cuộn nên trang đang xem bị đẩy sang tin khác,
  // đang gõ trả lời có thể gửi nhầm tin. Nhớ tin đang xem theo id, danh sách đổi thì cuộn lại đúng tin đó.
  // Chưa vuốt lần nào thì chỉ bắt đầu nhớ sau khi có bản mới của máy chủ: bản lưu cũ thay bằng bản mới vẫn mở đúng tin mới nhất.
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const onScroll = (el: HTMLDivElement) => {
    const i = Math.round(el.scrollTop / el.clientHeight);
    setIndex(i);
    viewing.current = postsRef.current?.[i]?.id ?? null;
  };
  useLayoutEffect(() => {
    const el = pager.current, id = viewing.current;
    if (!el || !posts) return;
    if (!id) { if (fresh) viewing.current = posts[index]?.id ?? null; return; }
    const i = posts.findIndex((p) => p.id === id);
    if (i < 0 || i === Math.round(el.scrollTop / el.clientHeight)) return;
    el.scrollTop = i * el.clientHeight;
    setIndex(i);
  }, [posts]);

  const member = (id: string) => me.members.find((m) => m.id === id);
  const current = posts?.[index];

  // Giữ để nói: trả lời tin đang xem bằng giọng.
  const target = useRef<string | null>(null);
  const voice = useHoldMic(async (r: Recording) => {
    const postId = target.current;
    if (!postId) return;
    const f = new FormData();
    f.set('file', r.blob, fileName(r.blob, 'voice'));
    f.set('seconds', String(r.seconds));
    try {
      await api.reply(postId, f);
      tap();
      toast(t('common.sent'));
      void load();
    } catch (e) { toast((e as Error).message); }
  });
  const voiceDown = (postId: string) => { target.current = postId; void voice.down(); };
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
    setTyping(false);
    tap();
    patch(postId, (x) => ({ ...x, replies: [...x.replies, tmp] }));
    const f = new FormData();
    f.set('text', s);
    api.reply(postId, f).then(() => void load(), (e: Error) => {
      patch(postId, (x) => ({ ...x, replies: x.replies.filter((r) => r.id !== tmp.id) }));
      setText((cur) => cur || s);
      setTyping(true);
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
    <div className="sheet feed-sheet" role="dialog" aria-label={t('feed.title')}>
      <div className="feed-bar">
        <button className="feed-back" onClick={onClose}><Icon name="down" />{t('feed.toCamera')}</button>
        <span className="feed-title">{t('feed.everyone')}</span>
      </div>

      <div className="pager" ref={pager} onScroll={(e) => onScroll(e.currentTarget)}
        onTouchStart={(e) => { pull.current = e.touches.length === 1 && e.currentTarget.scrollTop <= 0 ? e.touches[0].clientY : null; }}
        onTouchEnd={(e) => { if (pull.current !== null && e.currentTarget.scrollTop <= 0 && e.changedTouches[0].clientY - pull.current > 90) onClose(); pull.current = null; }}>
        {!posts && <div className="page feed-empty"><span className="feed-muted">{t('feed.loading')}</span></div>}
        {posts?.length === 0 && (
          <div className="page feed-empty">
            <Doodle name="camera" size={72} />
            <p className="display">{t('feed.empty.title')}</p>
            <button className="btn" onClick={onClose}>{t('feed.empty.cta')}</button>
          </div>
        )}
        {posts?.map((p, i) => (
          <PostPage key={p.id} p={p} members={me.members} meId={meId} active={index === i} near={Math.abs(index - i) <= 2} onReact={react} onRemove={remove} />
        ))}
      </div>

      {/* Thanh trả lời nằm đè lên đáy, không chiếm chỗ: hiện ra hay ẩn đi đều không làm các trang co giãn và nhảy. */}
      {current && (
        <div className="feed-reply fade-only">
          {typing ? (
            <>
              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendText(); }}
                onBlur={() => { if (!text.trim()) setTyping(false); }} enterKeyHint="send"
                placeholder={t('feed.replyTo', { name: current.authorId === me.me.id ? t('feed.everyone') : member(current.authorId)?.name ?? t('common.someone') })} />
              <button className="feed-send" onClick={sendText} disabled={!text.trim()} aria-label={t('common.send')}><Icon name="send" /></button>
            </>
          ) : (
            <>
              <button className="feed-type" onClick={() => setTyping(true)} aria-label={t('feed.typeReply')}><Icon name="chat" /></button>
              <button className={`feed-voice mic ${voice.rec ? 'rec' : ''}`} onPointerDown={() => voiceDown(current.id)} onPointerUp={voiceUp} onPointerLeave={voiceUp} onPointerCancel={voiceUp}
                onContextMenu={(e) => e.preventDefault()}>
                <span>{voice.rec ? t('common.listening') : t('feed.holdVoice')}</span>
                <i><Icon name="mic" /></i>
              </button>
            </>
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
  const city = cityOf(a?.city);
  const mine = p.reactions[meId] ?? '';
  const count = (e: string) => Object.values(p.reactions).filter((x) => x === e).length;
  const hearts = count(HEART);
  const day = dayLabel(p.createdAt, city?.tz);
  const line = [cityName(a?.city), p.caption].filter(Boolean).join(' · ');
  const [muted, setMuted] = useState(true);
  const [pop, setPop] = useState(0);
  const lastTap = useRef(0);

  // Chạm vào thẻ: video thì bật tắt tiếng; chạm hai lần liền thì thả tim (hai lần bật tắt tiếng tự trả về như cũ).
  function onCardTap(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a')) return;
    if (p.kind === 'video') setMuted((m) => !m);
    const now = Date.now();
    if (now - lastTap.current > 320) { lastTap.current = now; return; }
    lastTap.current = 0;
    setPop((n) => n + 1);
    if (mine !== HEART) onReact(p, HEART);
  }

  return (
    <div className="page post-page">
      <div className={`post-card is-${p.kind}`} onClick={onCardTap}>
        <PostMedia p={p} active={active} near={near} muted={muted} name={a?.name ?? ''} />
        <span className="post-who"><Avatar m={a} size={24} /><b>{a?.id === meId ? t('common.you') : a?.name}</b></span>
        {/* Ảnh chụp chung do AI ghép: luôn có nhãn, và hàng ảnh thật của từng người ngay dưới thẻ. */}
        {p.shotId && <span className="post-ai"><Icon name="sparkle" />{t('shot.aiLabel')}</span>}
        <div className="post-stamp">
          <b>{fmtTime(new Date(p.createdAt), city?.tz)}{day && <small>{day}</small>}</b>
          {line && <span>{line}</span>}
        </div>
        <button className={`post-heart ${mine === HEART ? 'on' : ''}`} onClick={() => onReact(p, HEART)} aria-pressed={mine === HEART} aria-label={t('feed.reactAria', { e: HEART })}>
          <Doodle name={mine === HEART ? 'heartFill' : 'heart'} size={28} />
          {hearts > 0 && <small>{hearts}</small>}
        </button>
        {pop > 0 && <span key={pop} className="post-pop" aria-hidden="true" onAnimationEnd={() => setPop(0)}><Doodle name="heartFill" size={110} wobble={false} /></span>}
      </div>
      {p.shotId && !!p.shotParts?.length && (
        <div className="post-real">
          <span>{t('shot.real')}</span>
          {near && p.shotParts.map((u) => <img key={u} src={thumb(u, 160)} alt="" decoding="async" />)}
        </div>
      )}
      <div className="post-meta">
        {EMOJIS.map((e) => {
          const n = count(e);
          return (
            <button key={e} className={`post-react ${mine === e ? 'on' : ''}`} onClick={() => onReact(p, e)} aria-pressed={mine === e} aria-label={t('feed.reactAria', { e })}>
              {e}{n > 0 && <small>{n}</small>}
            </button>
          );
        })}
        {p.authorId === meId && <button className="post-del" onClick={() => onRemove(p)}>{t('common.delete')}</button>}
      </div>
      {p.replies.length > 0 && (
        <div className="post-replies">
          {p.replies.slice(-2).map((r) => {
            const m = member(r.authorId);
            return (
              <div key={r.id} className="post-reply">
                <Avatar m={m} size={28} />
                <div className="post-bub">
                  <b>{m?.id === meId ? t('common.you') : m?.name}</b>
                  {r.kind === 'voice' ? <MiniVoice url={r.media!} seconds={r.seconds} /> : <span>{r.text}</span>}
                </div>
              </div>
            );
          })}
          {p.replies.length > 2 && <span className="post-more">{t('feed.moreReplies', { n: p.replies.length - 2 })}</span>}
        </div>
      )}
    </div>
  );
});

// near: chỉ hai trang quanh trang đang xem mới có ảnh, video thật; trang xa là khung trống cùng cỡ.
// Lướt qua nhiều tin không giữ hàng chục ảnh đã giải mã trong bộ nhớ (iPhone hết bộ nhớ thì giật, có khi tải lại cả app).
function PostMedia({ p, active, near, muted, name }: { p: Post; active: boolean; near: boolean; muted: boolean; name: string }) {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (!v.current) return; if (active) void v.current.play().catch(() => {}); else v.current.pause(); }, [active, near]);
  if (p.kind === 'hug') {
    return (
      <div className="post-art">
        <Doodle name="heartFill" size={88} className="post-hug" />
        <p>{t('feed.hug', { name })}</p>
      </div>
    );
  }
  if (p.kind === 'voice') {
    return (
      <div className="post-art">
        {p.questionWeek && <span className="post-label">{t('feed.weekAnswer')}</span>}
        <VoiceDot url={p.media!} seconds={p.seconds} />
      </div>
    );
  }
  if (!near) return null;
  if (p.kind === 'video') {
    return (
      <>
        <video ref={v} className="post-media" src={p.media!} poster={thumb(p.media, 1080)} preload={active ? 'auto' : 'metadata'} loop playsInline muted={muted} />
        {muted && <span className="post-sound">{t('feed.tapSound')}</span>}
      </>
    );
  }
  // Ảnh quá dọc hay quá ngang so với khung thì hiện đủ ảnh, không cắt mất mặt người.
  return (
    <img className="post-media" src={thumb(p.media, 1080)} alt={p.caption ?? ''} decoding="async"
      onLoad={(e) => { const i = e.currentTarget, r = i.naturalHeight / (i.naturalWidth || 1); if (r > 1.6 || r < 0.85) i.classList.add('fit'); }} />
  );
}

function MiniVoice({ url, seconds }: { url: string; seconds?: number | null }) {
  const a = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <button onClick={() => { if (on) a.current?.pause(); else void a.current?.play().catch(() => {}); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, verticalAlign: 'middle' }}>
      <audio ref={a} src={url} preload="none" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
      <Icon name={on ? 'pause' : 'play'} size={14} /> {seconds ? t('common.seconds', { n: Math.round(seconds) }) : t('common.listen')}
    </button>
  );
}
