import { useEffect, useState } from 'react';
import { token } from './api';
import type { Me } from './shared';
import { SILENT_HOURS } from './shared';
import { hoursSince, localTime, weather } from './time';
import { Avatar, Icon } from './ui';
import { tap } from './sound';

type Screen = 'camera' | 'feed' | 'chat' | 'calendar' | 'jar' | 'family' | 'podcast' | 'recap';
type Podcast = { id: string; title: string; topic: string; memberId: string; duration: number; cover?: string | null; createdAt: string };
type HomeData = {
  upcoming: Array<{ id: string; title: string; kind: string; inDays: number; years: number | null }>;
  latest: Array<{ id: string; media: string; kind: string; authorId: string; createdAt: string }>;
  jar: { level: number; capacity: number };
  week: Record<string, number>;
  podcasts: Podcast[];
};

async function load(): Promise<HomeData> {
  const t = token.get();
  const r = await fetch('/api/home', { headers: t ? { authorization: `Bearer ${t}` } : {} });
  if (!r.ok) throw new Error();
  return r.json();
}

function greet() {
  const h = new Date().getHours();
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
}

const isVideo = (m: string) => /\.(mp4|webm|mov)$/i.test(m);

function Thumb({ src }: { src: string }) {
  return isVideo(src)
    ? <video src={`${src}#t=0.1`} muted playsInline preload="metadata" />
    : <img src={src} alt="" loading="lazy" />;
}

export function Home({ me, onOpen }: { me: Me; onOpen: (s: Screen, arg?: string) => void }) {
  const [data, setData] = useState<HomeData | null>(null);
  const [wx, setWx] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const run = () => load().then(setData).catch(() => {});
    run();
    const t = setInterval(run, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all(me.members.map(async (m) => [m.id, await weather(m.city)] as const)).then((r) => live && setWx(Object.fromEntries(r)));
    return () => { live = false; };
  }, [me.members.map((m) => m.city).join('|')]);

  const go = (s: Screen, arg?: string) => () => { tap(); onOpen(s, arg); };
  const first = me.me.name.trim().split(/\s+/).pop();
  const byId = (id: string) => me.members.find((m) => m.id === id);
  const cover = data?.latest.find((p) => p.kind === 'photo')?.media;
  const weekTotal = data ? Object.values(data.week).reduce((a, b) => a + b, 0) : 0;
  const pct = data ? Math.round((data.jar.level / data.jar.capacity) * 100) : 0;
  const shelf = data?.podcasts ?? [];

  return (
    <div className="home scroll">
      <header className="home-head">
        <div>
          <h1 className="home-hi">{greet()}, {first}</h1>
          <div className="muted home-fam">{me.family.name}</div>
        </div>
        <button className="home-stack" onClick={go('family')} aria-label="Cả nhà">
          {me.members.slice(0, 4).map((m) => <Avatar key={m.id} m={m} size={34} />)}
        </button>
      </header>

      <section className="home-sec">
        <h2 className="home-h">Cả nhà lúc này</h2>
        <div className="home-row">
          {me.members.map((m) => {
            const quiet = m.id !== me.me.id && hoursSince(m.lastSeen) > SILENT_HOURS;
            const t = localTime(m.city);
            return (
              <button key={m.id} className={`home-mem${quiet ? ' quiet' : ''}`} onClick={go('family')}>
                <Avatar m={m} size={44} />
                <b>{m.id === me.me.id ? 'Bạn' : m.name}</b>
                <span>{t ? `${t}${wx[m.id] ? ` · ${wx[m.id]}` : ''}` : 'Chưa có giờ'}</span>
                {quiet && <em>{Math.floor(hoursSince(m.lastSeen) / 24)} ngày chưa mở app</em>}
              </button>
            );
          })}
        </div>
      </section>

      <button className="home-cta" onClick={go('camera')}>
        {cover && <img src={cover} alt="" />}
        <span className="home-cta-in">
          <i><Icon name="image" size={24} /></i>
          <b>Gửi cả nhà một tấm ảnh</b>
        </span>
      </button>

      {!!data?.upcoming.length && (
        <section className="home-sec">
          <h2 className="home-h">Sắp tới</h2>
          <div className="home-list">
            {data.upcoming.map((e) => (
              <button key={e.id} className="home-ev" onClick={go('calendar')}>
                <span className={`home-when${e.inDays === 0 ? ' today' : ''}`}>{e.inDays === 0 ? 'Hôm nay' : `Còn ${e.inDays} ngày`}</span>
                <b>{e.title}</b>
                {e.years != null && e.years > 0 && <span className="muted">{e.years} {e.kind === 'birthday' ? 'tuổi' : 'năm'}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {!!data?.latest.length && (
        <section className="home-sec">
          <div className="home-hrow">
            <h2 className="home-h">Ảnh tuần này</h2>
            <button className="chip" onClick={() => onOpen('recap')}>Phim tuần</button>
          </div>
          <div className="home-thumbs">
            {data.latest.slice(0, 6).map((p) => (
              <button key={p.id} onClick={go('feed', p.id)} aria-label={byId(p.authorId)?.name}><Thumb src={p.media} /></button>
            ))}
          </div>
        </section>
      )}

      <section className="home-sec">
        <h2 className="home-h">Podcast nhà mình</h2>
        <div className="home-row">
          {shelf.length ? shelf.map((p) => (
            <button key={p.id} className="home-album" onClick={go('podcast', p.id)}>
              <span className="home-cover">{p.cover ? <img src={p.cover} alt="" /> : <Icon name="mic" size={26} />}</span>
              <b>{p.title}</b>
              <span className="muted">{byId(p.memberId)?.name ?? p.topic}</span>
            </button>
          )) : (
            <button className="home-album empty" onClick={go('podcast')}>
              <span className="home-cover"><Icon name="mic" size={26} /></span>
              <b>Tập đầu tiên sẽ có sau cuộc gọi tuần này</b>
            </button>
          )}
        </div>
      </section>

      <button className="home-jar" onClick={go('jar')}>
        <Icon name="jar" size={22} />
        <span className="home-jar-main">
          <b>Lọ thương: {data?.jar.level ?? 0}/{data?.jar.capacity ?? 40} hạt</b>
          <i><u style={{ width: `${pct}%` }} /></i>
        </span>
      </button>
    </div>
  );
}
