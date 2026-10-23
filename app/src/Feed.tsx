import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { VoiceDot } from './Camera';
import { AUDIO_TYPE, fileName, record, type Recording } from './media';
import { cityOf, type Me, type Post, type Week } from './shared';
import { buzz, tap } from './sound';
import { ago, localTime } from './time';
import { Avatar, Icon, toast } from './ui';

const EMOJIS = ['❤️', '🥺', '😂', '🙏'];

// Tin nhà: mỗi trang một tin, vuốt lên xem tin tiếp. Trang đầu là chuyện của tuần này.
export function Feed({ me, onClose }: { me: Me; onClose: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [rec, setRec] = useState(false);
  const stop = useRef<(() => Promise<Recording>) | null>(null);
  const pager = useRef<HTMLDivElement>(null);

  const load = () => Promise.all([api.feed().then(setPosts), api.week().then(setWeek)]).catch((e) => toast(e.message));
  useEffect(() => { void load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const member = (id: string) => me.members.find((m) => m.id === id);
  // Trang 0 là "Tuần này"; trang i là tin i - 1.
  const current = index > 0 ? posts?.[index - 1] : undefined;

  async function voiceDown() {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!s) return toast('Cho phép micro để nói nhé');
    stop.current = record(s, AUDIO_TYPE());
    setRec(true);
    buzz(20);
  }
  async function voiceUp(questionWeek?: string) {
    if (!rec) return;
    setRec(false);
    const r = await stop.current?.();
    if (!r || r.seconds < 1) return toast('Giữ lâu hơn một chút để nói');
    const f = new FormData();
    f.set('file', r.blob, fileName(r.blob, 'voice'));
    f.set('seconds', String(r.seconds));
    if (current && !questionWeek) await api.reply(current.id, f);
    else { f.set('kind', 'voice'); if (questionWeek) f.set('questionWeek', questionWeek); await api.post(f); }
    tap();
    toast('Đã gửi');
    void load();
  }

  async function sendText() {
    if (!current || !text.trim()) return;
    const f = new FormData();
    f.set('text', text.trim());
    await api.reply(current.id, f);
    setText('');
    tap();
    void load();
  }

  async function react(p: Post, e: string) {
    tap();
    await api.react(p.id, p.reactions[me.me.id] === e ? '' : e);
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
          {week ? <WeekCard week={week} me={me} recording={rec} onDown={voiceDown} onUp={() => voiceUp(week.week)} /> : <div className="muted" style={{ textAlign: 'center' }}>Đang mở thư nhà...</div>}
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
                {p.authorId === me.me.id && <button className="link" style={{ marginLeft: 'auto', padding: '8px 4px' }} onClick={() => remove(p)}>Xoá</button>}
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

      {current && (
        <div className="reply-bar">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendText()}
            placeholder={`Trả lời ${current.authorId === me.me.id ? 'cả nhà' : member(current.authorId)?.name}...`} />
          {text.trim() ? (
            <button className="round dark" onClick={sendText} aria-label="Gửi"><Icon name="send" /></button>
          ) : (
            <button className={`round ${rec ? 'rec' : ''}`} onPointerDown={voiceDown} onPointerUp={() => voiceUp()} onPointerLeave={() => voiceUp()}
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
        <VoiceDot url={p.media!} seconds={p.seconds} />
      </div>
    );
  }
  return (
    <div className="card" onClick={() => p.kind === 'video' && setMuted(!muted)}>
      {p.kind === 'video' ? <video ref={v} src={p.media!} loop playsInline muted={muted} /> : <img src={p.media!} alt={p.caption ?? ''} loading="lazy" />}
      {p.caption && <div className="cap">{p.caption}</div>}
      {p.kind === 'video' && muted && <div className="cap" style={{ top: 16, bottom: 'auto' }}>Chạm để nghe tiếng</div>}
    </div>
  );
}

function MiniVoice({ url, seconds }: { url: string; seconds?: number | null }) {
  const a = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <button onClick={() => { if (on) a.current?.pause(); else void a.current?.play(); setOn(!on); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <audio ref={a} src={url} onEnded={() => setOn(false)} />
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
      <button className={`talk ${recording ? 'rec' : ''}`} style={{ marginTop: 0 }} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp} onContextMenu={(e) => e.preventDefault()}>
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
