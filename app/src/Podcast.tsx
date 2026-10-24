import { useEffect, useRef, useState } from 'react';
import { token } from './api';
import type { Me, Podcast as Ep } from './shared';
import { tap } from './sound';
import { speak, stopSpeaking, unlockSpeech } from './speech';
import { Avatar, Icon, toast } from './ui';

type Photo = { id: string; memberId: string; media: string; caption: string | null; createdAt: string };

async function get<T>(path: string): Promise<T> {
  const t = token.get();
  const res = await fetch(path, { headers: t ? { authorization: `Bearer ${t}` } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi, thử lại nhé');
  return data as T;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Nghe podcast nhà mình: file ghép giọng thật và nhạc; lời dẫn đọc bằng giọng máy đúng mốc, giọng thật chờ lời dẫn đọc xong.
function Player({ ep, me }: { ep: Ep; me: Me }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [want, setWant] = useState(false);
  const [time, setTime] = useState(0);
  const [cur, setCur] = useState(0);
  const spoken = useRef(new Set<number>());
  const speaking = useRef(false);
  const holding = useRef(false);
  const wantRef = useRef(false);
  const who = ep.memberId ? me.members.find((m) => m.id === ep.memberId) : null;

  useEffect(() => () => { stopSpeaking(); }, []);
  useEffect(() => { spoken.current.clear(); setTime(0); setCur(0); setWant(false); wantRef.current = false; stopSpeaking(); }, [ep.id]);

  // Theo dõi từng khung hình khi đang phát: tới mốc thì đọc lời dẫn, lời dẫn chưa xong thì giữ giọng thật lại.
  useEffect(() => {
    if (!want) return;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (a) {
        const t = a.currentTime;
        setTime(t);
        ep.chapters.forEach((c, k) => {
          if (t >= c.at && !spoken.current.has(k)) {
            spoken.current.add(k);
            setCur(k);
            speaking.current = true;
            void speak(c.say).then(() => {
              speaking.current = false;
              if (holding.current && wantRef.current) { holding.current = false; void a.play(); }
            });
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
      void a.play().catch(() => toast('Chạm lần nữa để nghe nhé'));
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
  return (
    <div className="pod-player fade" key={ep.id}>
      <div className="pod-cover">{ep.cover ? <img src={ep.cover} alt="" /> : <Icon name="mic" size={44} />}</div>
      <div className="pod-title">{ep.title}</div>
      <div className="pod-meta">{who ? who.name : 'Cả nhà kể'} · {mmss(ep.duration)}</div>
      <audio ref={audio} src={ep.media ?? undefined} preload="metadata"
        onEnded={() => { wantRef.current = false; setWant(false); setTime(ep.duration); }} />
      <input className="pod-seek" type="range" min={0} max={ep.duration} step={0.1} value={Math.min(time, ep.duration)}
        onChange={(e) => seek(Number(e.target.value))} style={{ ['--p' as string]: `${(time / ep.duration) * 100}%` }} />
      <div className="pod-times"><span>{mmss(time)}</span><span>{mmss(ep.duration)}</span></div>
      <button className="pod-play" onClick={toggle} aria-label={want ? 'Dừng' : 'Nghe'}><Icon name={want ? 'pause' : 'play'} size={30} /></button>
      {c?.question && (
        <div className="pod-now" key={cur}>
          <b>{c.who}</b>
          <p>{c.question}</p>
          {c.transcript && <q>{c.transcript}</q>}
        </div>
      )}
    </div>
  );
}

function Shelf({ list, sel, onPick }: { list: Ep[]; sel?: string; onPick: (id: string) => void }) {
  return (
    <div className="pod-shelf">
      {list.map((e) => (
        <button key={e.id} className={`pod-ep${e.id === sel ? ' on' : ''}`} onClick={() => { tap(); onPick(e.id); }} disabled={e.status !== 'ready'}>
          <span className="pod-thumb">{e.cover ? <img src={e.cover} alt="" /> : <Icon name="mic" size={22} />}</span>
          <b>{e.title}</b>
          <span className="muted">{e.status === 'ready' ? mmss(e.duration) : 'Đang ghép...'}</span>
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
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy]);

  const ready = eps?.filter((e) => e.status === 'ready') ?? [];
  const shown = ready.find((e) => e.id === sel) ?? ready[0];
  const people = me.members.map((m) => ({ m, list: (eps ?? []).filter((e) => e.kind === 'person' && e.memberId === m.id) })).filter((x) => x.list.length);
  const topics = (eps ?? []).filter((e) => e.kind === 'topic');

  return (
    <div className="sheet podcast">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>Podcast nhà mình</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>
        {eps === null ? null : shown ? <Player ep={shown} me={me} /> : (
          <div className="recap-empty">
            <div className="h1">{busy ? 'Đang ghép tập đầu tiên' : 'Chưa có tập nào'}</div>
            <p>{busy ? 'Chờ ít phút, giọng kể của nhà mình sắp xong rồi.' : 'Mỗi tuần Sweet Home gọi hỏi chuyện. Giọng kể của cả nhà sẽ thành một tập ngắn.'}</p>
          </div>
        )}

        {people.map(({ m, list }) => (
          <section key={m.id}>
            <div className="h2 pod-h"><Avatar m={m} size={28} />{m.id === me.me.id ? 'Bạn kể' : `${m.name} kể`}</div>
            <Shelf list={list} sel={shown?.id} onPick={setSel} />
          </section>
        ))}

        {!!topics.length && (
          <section>
            <div className="h2">Theo chủ đề</div>
            <Shelf list={topics} sel={shown?.id} onPick={setSel} />
          </section>
        )}

        {!!photos.length && (
          <section>
            <div className="h2">Ảnh xưa</div>
            <div className="pod-photos">
              {photos.map((p) => <img key={p.id} src={p.media} alt={p.caption ?? ''} loading="lazy" />)}
            </div>
          </section>
        )}

        <button className="btn ghost" style={{ marginTop: 26 }} onClick={() => { tap(); onCall(); }}>
          <Icon name="phone" size={20} /> {ready.length ? 'Kể thêm một chuyện' : 'Gọi Sweet Home ngay'}
        </button>
      </div>
    </div>
  );
}
