import { useEffect, useRef, useState, type ReactNode } from 'react';
import { errorText, token } from './api';
import { t } from './i18n';
import { fileName, shrinkImage } from './media';
import { thumb, type Me, type Podcast } from './shared';
import { tap } from './sound';
import { speak, stopSpeaking, unlockSpeech } from './speech';
import { ago } from './time';
import { Avatar, Doodle, Icon, toast } from './ui';
import './podcast.css';
import './story.css';

type Photo = { id: string; memberId: string; media: string; caption: string | null; createdAt: string };
/** Tập theo câu chuyện (key story:...) thêm được ảnh; tập cũ không có cờ này. */
type Ep = Podcast & { story?: boolean };
const MAX_PHOTOS = 12;

async function get<T>(path: string): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { headers: tk ? { authorization: `Bearer ${tk}` } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Câu dịch giữ chỗ {hand}; cụm ở chỗ đó viết tay mực tím. */
function withHand(s: string, hand: string): ReactNode {
  const [a, b = ''] = s.split('{hand}');
  return <>{a}<span className="hand">{hand}</span>{b}</>;
}

/** Ai kể tập này: tên người trong nhà, tập theo chủ đề là cả nhà. */
const teller = (ep: Ep, me: Me) => (ep.memberId ? me.members.find((m) => m.id === ep.memberId)?.name : null) ?? t('podcast.family');

/** Thanh tua: tiến độ mực đen trên nền vạch mảnh. */
function Seek({ time, duration, onSeek }: { time: number; duration: number; onSeek: (x: number) => void }) {
  return (
    <>
      <input className="pd-seek" type="range" min={0} max={duration} step={0.1} value={Math.min(time, duration)}
        onChange={(e) => onSeek(Number(e.target.value))} style={{ ['--p' as string]: `${(Math.min(time, duration) / duration) * 100}%` }} />
      <div className="pd-times"><span>{mmss(time)}</span><span>{mmss(duration)}</span></div>
    </>
  );
}

const MODE_KEY = 'sh-pod-mode';
const readMode = (): 'video' | 'audio' => { try { return localStorage.getItem(MODE_KEY) === 'audio' ? 'audio' : 'video'; } catch { return 'video'; } };

/** Thêm nhiều ảnh cho một tập câu chuyện: ảnh thu nhỏ trên máy rồi gửi một lần, máy chủ dựng lại video. */
function AddPhotos({ ep, onDone }: { ep: Ep; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function send(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, MAX_PHOTOS);
    if (input.current) input.current.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      for (const [i, f] of files.entries()) {
        const b = await shrinkImage(f);
        form.append('files', b, b === f ? f.name : fileName(b, `photo-${i}`));
      }
      const tk = token.get();
      const res = await fetch(`/api/podcasts/${ep.id}/photos`, { method: 'POST', headers: tk ? { authorization: `Bearer ${tk}` } : {}, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data));
      toast(t('podcast.photosAdded'));
      onDone();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="st-add-wrap">
      <button className="st-add" onClick={() => { tap(); input.current?.click(); }} disabled={busy}>
        <Icon name="image" size={20} /><span>{busy ? t('podcast.adding') : t('podcast.addPhotos')}</span>
      </button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void send(e.target.files)} />
    </div>
  );
}

/** Tập câu chuyện của chính mình: mặc định cả nhà nghe được, có nút "Giữ riêng" (một chạm); tập đã giữ riêng thì có dòng nhỏ và nút chia sẻ lại.
 *  Người khác không bao giờ nhận tập riêng. */
function ShareEp({ ep, onDone }: { ep: Ep; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  async function flip() {
    tap();
    setBusy(true);
    try {
      const tk = token.get();
      const res = await fetch(`/api/podcasts/${ep.id}/${ep.shared ? 'keep' : 'share'}`, { method: 'POST', headers: tk ? { authorization: `Bearer ${tk}` } : {} });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data));
      toast(t(ep.shared ? 'podcast.keptDone' : 'podcast.sharedDone'));
      onDone();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="pd-note">{t(ep.shared ? 'podcast.sharedNote' : 'podcast.private')}</p>
      <div className="pd-mode-wrap">
        <button className="btn line" onClick={() => void flip()} disabled={busy}>{t(ep.shared ? 'podcast.keepPrivate' : 'podcast.shareAll')}</button>
      </div>
    </>
  );
}

// Tập có video thì mặc định xem video, chuyển được sang chỉ nghe (tải nhẹ hơn nhiều). Tập cũ chỉ có tiếng vẫn nghe như trước.
function Player({ ep, me, onChange }: { ep: Ep; me: Me; onChange: () => void }) {
  // Video dựng xong trong lúc đang nghe thì không tự chuyển (khỏi ngắt tiếng), chỉ hiện nút chọn.
  const [mode, setMode] = useState<'video' | 'audio'>(() => (ep.video ? readMode() : 'audio'));
  const pick = (m: 'video' | 'audio') => { tap(); setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch {} };
  const video = !!ep.video && mode === 'video';
  return (
    <>
      {video ? <VideoPlayer ep={ep} me={me} /> : <AudioPlayer ep={ep} me={me} />}
      {ep.video ? (
        <div className="pd-mode-wrap">
          <div className="pd-mode" role="tablist">
            <button role="tab" aria-selected={video} className={video ? 'on' : ''} onClick={() => pick('video')}>{t('podcast.watch')}</button>
            <button role="tab" aria-selected={!video} className={video ? '' : 'on'} onClick={() => pick('audio')}>{t('podcast.listenOnly')}</button>
          </div>
        </div>
      ) : ep.videoStatus === 'rendering' && <p className="pd-note">{t('podcast.videoSoon')}</p>}
      {ep.video && ep.videoStatus === 'rendering' && <p className="pd-note">{t('podcast.videoRedo')}</p>}
      {ep.story && ep.memberId === me.me.id && <ShareEp ep={ep} onDone={onChange} />}
      {ep.story && <AddPhotos ep={ep} onDone={onChange} />}
    </>
  );
}

function VideoPlayer({ ep, me }: { ep: Ep; me: Me }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    tap();
    if (v.paused) { if (v.ended) v.currentTime = 0; void v.play().catch(() => toast(t('podcast.tapAgain'))); }
    else v.pause();
  }
  function seek(x: number) {
    const v = ref.current;
    if (!v) return;
    v.currentTime = x;
    setTime(x);
  }

  return (
    <div className="pd-player fade" key={ep.id}>
      <button className={`pd-video${playing ? ' on' : ''}`} onClick={toggle} aria-label={playing ? t('common.stop') : t('podcast.watch')}>
        <video ref={ref} src={ep.video ?? undefined} poster={ep.poster ?? undefined} playsInline preload="metadata"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(ep.duration); }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} />
        <span className="pd-vplay" aria-hidden><Icon name="play" size={30} /></span>
      </button>
      <div className="pd-title">{ep.title}</div>
      <div className="pd-meta">{teller(ep, me)} · {mmss(ep.duration)}</div>
      <Seek time={time} duration={ep.duration} onSeek={seek} />
    </div>
  );
}

// Nghe podcast nhà mình: file ghép giọng thật và nhạc. Tập cũ còn lời dẫn đọc bằng giọng máy đúng mốc (giọng thật chờ lời dẫn đọc xong);
// tập mới chỉ có giọng người kể nên mốc không có lời dẫn, chỉ hiện câu hỏi đang nghe.
function AudioPlayer({ ep, me }: { ep: Ep; me: Me }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [want, setWant] = useState(false);
  const [time, setTime] = useState(0);
  const [cur, setCur] = useState(0);
  const spoken = useRef(new Set<number>());
  const speaking = useRef(false);
  const holding = useRef(false);
  const wantRef = useRef(false);

  useEffect(() => () => { stopSpeaking(); }, []);
  useEffect(() => { spoken.current.clear(); setTime(0); setCur(0); setWant(false); wantRef.current = false; stopSpeaking(); }, [ep.id]);

  // Theo dõi từng khung hình khi đang phát: tới mốc thì đọc lời dẫn, lời dẫn chưa xong thì giữ giọng thật lại.
  useEffect(() => {
    if (!want) return;
    let raf = 0;
    let shown = -1;
    const tick = () => {
      const a = audio.current;
      if (a) {
        const t = a.currentTime;
        // Thanh tua chỉ cần vẽ lại 4 lần mỗi giây, không cần dựng lại cả màn 60 lần mỗi giây.
        if (Math.abs(t - shown) >= 0.25) { shown = t; setTime(t); }
        ep.chapters.forEach((c, k) => {
          if (t >= c.at && !spoken.current.has(k)) {
            spoken.current.add(k);
            setCur(k);
            // Không bao giờ đọc lời dẫn bằng giọng máy (tập cũ còn lời dẫn): chỉ hiện câu hỏi, giọng thật phát liền.
          }
        });
        const c = ep.chapters[cur];
        if (speaking.current && c && t >= c.until && !a.paused) { holding.current = true; a.pause(); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [want, cur, ep.id]);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    tap();
    if (wantRef.current) {
      wantRef.current = false; setWant(false); holding.current = false;
      a.pause(); stopSpeaking(); speaking.current = false;
      // Lời dẫn đang đọc dở thì lần sau đọc lại.
      spoken.current.delete(cur);
    } else {
      unlockSpeech();
      wantRef.current = true; setWant(true);
      if (a.ended) { a.currentTime = 0; spoken.current.clear(); }
      void a.play().catch(() => toast(t('podcast.tapAgain')));
    }
  }

  function seek(v: number) {
    const a = audio.current;
    if (!a) return;
    stopSpeaking(); speaking.current = false; holding.current = false;
    a.currentTime = v;
    setTime(v);
    spoken.current = new Set(ep.chapters.map((c, k) => (c.until <= v ? k : -1)).filter((k) => k >= 0));
    const k = ep.chapters.findIndex((c, n) => v >= c.at && v < (ep.chapters[n + 1]?.at ?? Infinity));
    setCur(Math.max(0, k));
    if (wantRef.current && a.paused) void a.play();
  }

  const c = ep.chapters[cur];
  const who = ep.memberId ? me.members.find((m) => m.id === ep.memberId) : undefined;
  return (
    <div className="pd-player fade" key={ep.id}>
      {/* Ảnh lấy liền như trên kệ ở Trang chủ: dải giấy dưới ảnh ghi tay ai kể; dòng dưới tên chuyện là lúc kể (độ dài đã có ở thanh tua). */}
      <div className="pd-polar">
        <div className={`pd-art${ep.story && !(ep.poster || ep.cover) ? ' st-note' : ''}`}>{ep.poster || ep.cover ? <img src={thumb(ep.poster ?? ep.cover, 1080)} alt="" decoding="async" /> : <Doodle name="mic" size={56} />}</div>
        <div className="pd-polar-cap">
          {who ? <Avatar m={who} size={24} /> : <Doodle name="house" size={22} />}
          <span>{who ? t('podcast.tells', { name: who.name }) : t('podcast.family')}</span>
        </div>
      </div>
      <div className="pd-title">{ep.title}</div>
      <div className="pd-meta">{ago(ep.createdAt)}</div>
      <audio ref={audio} src={ep.media ?? undefined} preload="metadata"
        onEnded={() => { wantRef.current = false; setWant(false); setTime(ep.duration); }} />
      <Seek time={time} duration={ep.duration} onSeek={seek} />
      <button className="pd-play" onClick={toggle} aria-label={want ? t('common.stop') : t('common.listen')}><Icon name={want ? 'pause' : 'play'} size={30} /></button>
      {c?.question && (
        <div className="pd-now" key={cur}>
          <b>{c.who}</b>
          <p>{c.question}</p>
          {c.transcript && <q>{c.transcript}</q>}
        </div>
      )}
    </div>
  );
}

function Shelf({ list, sel, me, onPick }: { list: Ep[]; sel?: string; me: Me; onPick: (id: string) => void }) {
  return (
    <div className="pd-shelf">
      {list.map((e) => (
        <button key={e.id} className={`pd-ep${e.id === sel ? ' on' : ''}`} onClick={() => { tap(); onPick(e.id); }} disabled={e.status !== 'ready'}>
          <span className={`pd-cover${e.story && !(e.poster || e.cover) ? ' st-note' : ''}`}>{e.poster || e.cover ? <img src={thumb(e.poster ?? e.cover, 360)} alt="" loading="lazy" decoding="async" /> : <Doodle name="mic" size={30} />}</span>
          <b>{e.title}</b>
          <span className="pd-meta">{e.status === 'ready' ? `${teller(e, me)} · ${mmss(e.duration)}` : t('podcast.rendering')}</span>
        </button>
      ))}
    </div>
  );
}

export function Podcast({ me, start, onClose, onCall }: { me: Me; start?: string | null; onClose: () => void; onCall: () => void }) {
  const [eps, setEps] = useState<Ep[] | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sel, setSel] = useState<string | null>(start ?? null);

  const load = () => get<Ep[]>('/api/podcasts').then(setEps).catch((e) => toast(e.message));
  useEffect(() => {
    void load();
    get<Photo[]>('/api/vault').then(setPhotos).catch(() => {});
  }, []);
  const busy = eps?.some((e) => e.status === 'rendering');
  const videoBusy = eps?.some((e) => e.videoStatus === 'rendering');
  useEffect(() => {
    if (!busy && !videoBusy) return;
    const iv = setInterval(load, busy ? 5000 : 15000);
    return () => clearInterval(iv);
  }, [busy, videoBusy]);

  const ready = eps?.filter((e) => e.status === 'ready') ?? [];
  const shown = ready.find((e) => e.id === sel) ?? ready[0];
  const people = me.members.map((m) => ({ m, list: (eps ?? []).filter((e) => e.kind === 'person' && e.memberId === m.id) })).filter((x) => x.list.length);
  const topics = (eps ?? []).filter((e) => e.kind === 'topic');
  const call = () => { tap(); onCall(); };
  // Chưa có tập nào và cũng không có tập đang ghép: một dòng và một nút gọi; còn lại nút gọi nằm cuối màn.
  const empty = eps !== null && !shown && !busy;

  return (
    <div className="sheet pd">
      <header className="pd-head">
        <h1 className="display">{withHand(t('podcast.title'), t('podcast.titleHand'))}</h1>
        <button className="pd-x" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
      </header>
      <div className="scroll pd-body">
        {eps === null ? null : shown ? <Player key={shown.id} ep={shown} me={me} onChange={load} /> : busy ? (
          <div className="pd-empty">
            <Doodle name="mic" size={52} />
            <b className="display">{t('podcast.busy.title')}</b>
            <p>{t('podcast.busy.body')}</p>
          </div>
        ) : (
          <div className="pd-empty">
            <Doodle name="mic" size={52} />
            <p>{t('podcast.emptyLine')}</p>
            <button className="btn" onClick={call}><Icon name="phone" size={20} />{t('podcast.callNow')}</button>
          </div>
        )}

        {people.map(({ m, list }) => (
          <section key={m.id}>
            <h2 className="pd-h"><Avatar m={m} size={28} />{m.id === me.me.id ? t('podcast.youTell') : t('podcast.tells', { name: m.name })}</h2>
            <Shelf list={list} sel={shown?.id} me={me} onPick={setSel} />
          </section>
        ))}

        {!!topics.length && (
          <section>
            <h2 className="pd-h">{t('podcast.topics')}</h2>
            <Shelf list={topics} sel={shown?.id} me={me} onPick={setSel} />
          </section>
        )}

        {!!photos.length && (
          <section>
            <h2 className="pd-h">{t('podcast.photos')}</h2>
            <div className="pd-photos">
              {photos.map((p) => <img key={p.id} src={thumb(p.media, 360)} alt={p.caption ?? ''} loading="lazy" decoding="async" />)}
            </div>
          </section>
        )}

        {eps !== null && !empty && (
          <button className="btn line pd-call" onClick={call}>
            <Icon name="phone" size={20} /> {ready.length ? t('podcast.more') : t('podcast.callNow')}
          </button>
        )}
      </div>
    </div>
  );
}
