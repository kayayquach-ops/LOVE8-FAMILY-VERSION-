import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { VoiceDot } from './Camera';
import { fileName, useHoldMic, type Recording } from './media';
import { cityOf, type Me, type Post, type Week } from './shared';
import { tap } from './sound';
import { ago, localTime } from './time';
import { Avatar, Icon, toast } from './ui';

const EMOJIS = ['❤️', '🥺', '😂', '🙏'];

// Tin nhà: mỗi trang một tin, vuốt lên xem tin tiếp. Trang đầu là chuyện của tuần này.
// start: mở thẳng tới tin này (bấm ảnh ở Trang chủ).
export function Feed({ me, start, onClose }: { me: Me; start?: string | null; onClose: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const sendingRef = useRef(false);
  const pager = useRef<HTMLDivElement>(null);
  const jumped = useRef(false);

  const load = () => Promise.all([api.feed().then(setPosts), api.week().then(setWeek)]).catch((e) => toast(e.message));
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 20000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (jumped.current || !start || !posts || !pager.current) return;
    jumped.current = true;
    const i = posts.findIndex((p) => p.id === start);
    if (i >= 0) { pager.current.scrollTop = (i + 1) * pager.current.clientHeight; setIndex(i + 1); }
  }, [posts, start]);

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
      const t = target.current;
      if (t.post) await api.reply(t.post, f);
      else { f.set('kind', 'voice'); if (t.week) f.set('questionWeek', t.week); await api.post(f); }
      tap();
      toast('Đã gửi');
      void load();
    } catch (e) { toast((e as Error).message); }
  });
  const voiceDown = (t: { week?: string; post?: string }) => { target.current = t; void voice.down(); };
  const voiceUp = () => { void voice.up(); };

  async function sendText() {
    const t = text.trim();
    // Khoá bằng ref: hai lần bấm sát nhau vẫn chỉ gửi một lần (state chưa kịp đổi giữa hai lần).
    if (!current || !t || sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    try {
      const f = new FormData();
      f.set('text', t);
      await api.reply(current.id, f);
      setText('');
      tap();
      void load();
    } catch (e) { toast((e as Error).message); } finally { sendingRef.current = false; setBusy(false); }
  }

  async function react(p: Post, e: string) {
    tap();
    const next = p.reactions[me.me.id] === e ? '' : e;
    // Hiện ngay trên màn, máy chủ trả lời sau.
    setPosts((l) => l && l.map((x) => (x.id === p.id ? { ...x, reactions: { ...x.reactions, [me.me.id]: next } } : x)));
    try { await api.react(p.id, next); } catch (err) { toast((err as Error).message); }
    void load();
  }

  async function remove(p: Post) {
    if (!confirm('Xoá tin này khỏi nhà? Cả nhà sẽ không thấy nữa.')) return;
    try { await api.remove(p.id); } catch (e) { return toast((e as Error).message); }
    setPosts((l) => l && l.filter((x) => x.id !== p.id));
    toast('Đã xoá');
    void load();
  }

  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>Tin nhà</div>
        <span style={{ width: 44 }} />
      </div>

      <div className="pager" ref={pager} onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollTop / e.currentTarget.clientHeight))}>
        <div className="page">
          {week ? <WeekCard week={week} me={me} recording={voice.rec && !!target.current.week} onDown={() => voiceDown({ week: week.week })} onUp={voiceUp} /> : <div className="muted" style={{ textAlign: 'center' }}>Đang mở thư nhà...</div>}
          {posts && posts.length > 0 && <div className="muted" style={{ textAlign: 'center', marginTop: 18 }}>Vuốt lên để xem tin nhà</div>}
        </div>
        {posts?.length === 0 && (
          <div className="page" style={{ textAlign: 'center' }}>
            <div className="h1">Nhà mình chưa có tin nào</div>
            <div className="muted">Chụp một tấm, hoặc giữ nút để nói với cả nhà.</div>
          </div>
        )}
        {posts?.map((p) => {
          const a = member(p.authorId);
          const t = localTime(a?.city);
          const counts = EMOJIS.map((e) => Object.values(p.reactions).filter((x) => x === e).length);
          return (
            <div key={p.id} className="page">
              <div className="who">
                <Avatar m={a} size={36} />
                <div>
                  <b>{a?.id === me.me.id ? 'Bạn' : a?.name}</b>
                  <div><span>{ago(p.createdAt)}{t && a?.city ? ` · ${cityOf(a.city)?.name} ${t}` : ''}</span></div>
                </div>
                {p.authorId === me.me.id && <button className="link" style={{ marginLeft: 'auto', padding: '0 6px', minHeight: 44, minWidth: 44 }} onClick={() => remove(p)}>Xoá</button>}
              </div>
              <PostCard p={p} active={current?.id === p.id} name={a?.name ?? ''} />
              <div className="reacts">
                {EMOJIS.map((e, i) => (
                  <button key={e} className={`react ${p.reactions[me.me.id] === e ? 'on' : ''}`} onClick={() => react(p, e)} aria-label={`Thả ${e}`}>
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
                {p.replies.length > 2 && <span className="muted">và {p.replies.length - 2} lời khác</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Thanh trả lời nằm đè lên đáy, không chiếm chỗ: hiện ra hay ẩn đi đều không làm các trang co giãn và nhảy. */}
      {current && (
        <div className="reply-bar fade-only">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void sendText(); }}
            enterKeyHint="send" placeholder={`Trả lời ${current.authorId === me.me.id ? 'cả nhà' : member(current.authorId)?.name}...`} />
          {text.trim() ? (
            <button className="round dark" onClick={sendText} disabled={busy} aria-label="Gửi"><Icon name="send" /></button>
          ) : (
            <button className={`round ${voice.rec && target.current.post ? 'rec' : ''}`} onPointerDown={() => voiceDown({ post: current.id })} onPointerUp={voiceUp} onPointerLeave={voiceUp} onPointerCancel={voiceUp}
              onContextMenu={(e) => e.preventDefault()} aria-label="Giữ để trả lời bằng giọng nói"><Icon name="mic" /></button>
          )}
        </div>
      )}
    </div>
  );
}

function PostCard({ p, active, name }: { p: Post; active: boolean; name: string }) {
  const v = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => { if (!v.current) return; if (active) void v.current.play().catch(() => {}); else v.current.pause(); }, [active]);
  if (p.kind === 'hug') {
    return (
      <div className="card hug-card">
        <div style={{ color: 'var(--accent)' }}><Icon name="heartFill" size={72} /></div>
        <div style={{ fontSize: 20 }}>{name} ôm cả nhà một cái</div>
      </div>
    );
  }
  if (p.kind === 'voice') {
    return (
      <div className="card voice-card">
        {p.questionWeek && <div className="muted" style={{ color: '#6B5544' }}>Trả lời câu hỏi tuần</div>}
        {p.caption && <div className="muted" style={{ color: '#6B5544' }}>{p.caption}</div>}
        <VoiceDot url={p.media!} seconds={p.seconds} />
      </div>
    );
  }
  return (
    <div className="card" onClick={() => p.kind === 'video' && setMuted(!muted)}>
      {p.kind === 'video' ? <video ref={v} src={p.media!} loop playsInline muted={muted} /> : <img src={p.media!} alt={p.caption ?? ''} loading="lazy" onLoad={(e) => { const i = e.currentTarget; if (i.naturalHeight > i.naturalWidth * 1.3) i.classList.add('tall'); }} />}
      {p.caption && <div className="cap">{p.caption}</div>}
      {p.kind === 'video' && muted && <div className="cap" style={{ top: 16, bottom: 'auto' }}>Chạm để nghe tiếng</div>}
    </div>
  );
}

function MiniVoice({ url, seconds }: { url: string; seconds?: number | null }) {
  const a = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <button onClick={() => { if (on) a.current?.pause(); else void a.current?.play().catch(() => {}); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32 }}>
      <audio ref={a} src={url} preload="none" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
      <Icon name={on ? 'pause' : 'play'} size={14} /> {seconds ? `${Math.round(seconds)}s` : 'Nghe'}
    </button>
  );
}

/** Tuần này: câu hỏi của tuần, tóm tắt cả nhà đã gửi gì, mâm cơm chung. */
function WeekCard({ week, me, recording, onDown, onUp }: { week: Week; me: Me; recording: boolean; onDown: () => void; onUp: () => void }) {
  const r = week.recap;
  return (
    <div className="panel">
      <div className="muted">Câu hỏi tuần này</div>
      <div style={{ fontSize: 22, lineHeight: 1.4, margin: '6px 0 14px' }}>{week.question}</div>
      <button className={`talk ${recording ? 'rec' : ''}`} style={{ marginTop: 0 }} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()}>
        <Icon name="mic" size={20} /> {recording ? 'Đang nghe...' : 'Giữ để trả lời bằng giọng nói'}
      </button>
      <div className="h2" style={{ marginTop: 22 }}>Tuần này nhà mình</div>
      <div className="stat">
        <span>{r.photos} ảnh</span><span>{r.videos} video</span><span>{r.voices} lời nói</span><span>{r.hugs} cái ôm</span>
      </div>
      {r.meals.length > 0 && (
        <>
          <div className="h2">Mâm cơm chung</div>
          <div className="thumbs">{r.meals.map((m) => <img key={m.id} src={m.media!} alt="" />)}</div>
        </>
      )}
      {r.photos + r.videos + r.voices + r.hugs === 0 && <div className="muted" style={{ marginTop: 10 }}>Tuần này còn trống. {me.me.name} mở lời trước nhé.</div>}
    </div>
  );
}
