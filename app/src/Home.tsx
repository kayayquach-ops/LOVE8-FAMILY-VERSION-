import { useEffect, useState } from 'react';
import { token } from './api';
import { cached, remember } from './cache';
import { thumb, type Me } from './shared';
import { SILENT_HOURS } from './shared';
import { hoursSince, localTime, weather } from './time';
import { Avatar, Icon } from './ui';
import { tap } from './sound';
import { CallCard } from './CallCard';
import { snooze, snoozed } from './callSnooze';
import { shareInvite } from './Onboarding';
import { t } from './i18n';

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
  const tk = token.get();
  const r = await fetch('/api/home', { headers: tk ? { authorization: `Bearer ${tk}` } : {} });
  if (!r.ok) throw new Error();
  return r.json();
}

function greet() {
  const h = new Date().getHours();
  return t(h < 11 ? 'home.greet.morning' : h < 14 ? 'home.greet.noon' : h < 18 ? 'home.greet.afternoon' : 'home.greet.evening');
}

// Ô nhỏ: ảnh thu nhỏ máy chủ dựng sẵn; video cũng là một ảnh (khung đầu), không còn 3 thẻ video tự tải dữ liệu.
function Thumb({ src }: { src: string }) {
  return <img src={thumb(src, 360)} alt="" loading="lazy" decoding="async" />;
}

export function Home({ me, callDue, onCall, onOpen }: { me: Me; callDue: boolean; onCall: () => void; onOpen: (s: Screen, arg?: string) => void }) {
  // Đổi qua lại Camera và Nhà là dựng lại màn này: hiện ngay bản lần trước, phần dưới không trống rồi mới hiện.
  const [data, setData] = useState<HomeData | null>(() => cached<HomeData>('home'));
  const [later, setLater] = useState(false);
  const invite = callDue && !later && !snoozed();
  const [wx, setWx] = useState<Record<string, string | null>>({});
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const alone = me.members.length < 2;

  useEffect(() => {
    const run = () => load().then((d) => {
      remember('home', d);
      setData((prev) => (prev && JSON.stringify(prev) === JSON.stringify(d) ? prev : d));
      setFailed(false);
    }).catch(() => setFailed(true));
    void run();
    const t = setInterval(() => { if (!document.hidden) void run(); }, 30000);
    const onVis = () => { if (!document.hidden) void run(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [tick]);

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
          <h1 className="home-hi">{t('home.hi', { greet: greet(), name: first as string })}</h1>
          <div className="muted home-fam">{me.family.name}</div>
        </div>
        <button className="home-stack" onClick={go('family')} aria-label={t('home.familyAria')}>
          {me.members.slice(0, 4).map((m) => <Avatar key={m.id} m={m} size={34} />)}
        </button>
      </header>

      {invite && <CallCard role={me.me.role} onAnswer={onCall} onLater={() => { snooze(); setLater(true); }} />}

      <section className="home-sec">
        <h2 className="home-h">{t('home.now')}</h2>
        <div className="home-row">
          {me.members.map((m) => {
            const quiet = m.id !== me.me.id && hoursSince(m.lastSeen) > SILENT_HOURS;
            const lt = localTime(m.city);
            return (
              <button key={m.id} className={`home-mem${quiet ? ' quiet' : ''}`} onClick={go('family')}>
                <Avatar m={m} size={44} />
                <b>{m.id === me.me.id ? t('common.you') : m.name}</b>
                <span>{lt ? `${lt}${wx[m.id] ? ` · ${wx[m.id]}` : ''}` : t('home.noTime')}</span>
                {quiet && <em>{t('home.quietDays', { n: Math.floor(hoursSince(m.lastSeen) / 24) })}</em>}
              </button>
            );
          })}
          {/* Nhà mới chỉ có mình: gợi ý mời người thân ngay ở đây, không phải đi tìm trong mục Gia đình. */}
          <button className={`home-mem home-invite${alone ? ' solo' : ''}`} onClick={() => { tap(); void shareInvite(me.family.code, me.family.name); }}>
            <span className="home-plus" aria-hidden><Icon name="share" size={20} /></span>
            <b>{alone ? (me.me.role === 'con' ? t('home.invite.parents') : t('home.invite.kids')) : t('home.invite.more')}</b>
            <span>{alone ? t('home.invite.alone') : t('home.invite.code', { code: me.family.code })}</span>
          </button>
        </div>
      </section>

      <button className="home-cta" onClick={go('camera')}>
        {/* Nền mờ: ảnh 160 px là đủ (làm mờ ảnh 2048 px tốn hơn nhiều lần mà nhìn như nhau). */}
        {cover && <img src={thumb(cover, 160)} alt="" decoding="async" />}
        <span className="home-cta-in">
          <i><Icon name="image" size={24} /></i>
          <b>{t('home.cta')}</b>
        </span>
      </button>

      {!!data?.upcoming.length && (
        <section className="home-sec">
          <h2 className="home-h">{t('common.upcoming')}</h2>
          <div className="home-list">
            {data.upcoming.map((e) => (
              <button key={e.id} className="home-ev" onClick={go('calendar')}>
                <span className={`home-when${e.inDays === 0 ? ' today' : ''}`}>{e.inDays === 0 ? t('common.today') : t('home.inDays', { n: e.inDays })}</span>
                <b>{e.title}</b>
                {e.years != null && e.years > 0 && <span className="muted">{t(e.kind === 'birthday' ? 'common.age' : 'common.years', { n: e.years })}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {!!data?.latest.length && (
        <section className="home-sec">
          <div className="home-hrow">
            <h2 className="home-h">{t('home.photos')}</h2>
            <button className="chip" onClick={() => onOpen('recap')}>{t('home.recap')}</button>
          </div>
          <div className="home-thumbs">
            {data.latest.slice(0, 6).map((p) => (
              <button key={p.id} onClick={go('feed', p.id)} aria-label={byId(p.authorId)?.name}><Thumb src={p.media} /></button>
            ))}
          </div>
        </section>
      )}

      {!data && failed && (
        <button className="home-retry" onClick={() => setTick((n) => n + 1)}>{t('home.retry')}</button>
      )}

      {/* Phần dưới chỉ hiện khi đã có dữ liệu, hiện một lần cùng nhau, không chen dần làm trang nhảy. */}
      {data && <>
      <section className="home-sec fade-only">
        <h2 className="home-h">{t('home.podcasts')}{invite && <i className="home-dot" aria-label={t('home.callWaiting')} />}</h2>
        <div className="home-row">
          {shelf.length ? shelf.map((p) => (
            <button key={p.id} className="home-album" onClick={go('podcast', p.id)}>
              <span className="home-cover">{p.cover ? <img src={thumb(p.cover, 360)} alt="" loading="lazy" decoding="async" /> : <Icon name="mic" size={26} />}</span>
              <b>{p.title}</b>
              <span className="muted">{byId(p.memberId)?.name ?? p.topic}</span>
            </button>
          )) : (
            <button className="home-album empty" onClick={go('podcast')}>
              <span className="home-cover"><Icon name="mic" size={26} /></span>
              <b>{t('home.podcastEmpty')}</b>
            </button>
          )}
        </div>
      </section>

      <button className="home-jar fade-only" onClick={go('jar')}>
        <Icon name="jar" size={22} />
        <span className="home-jar-main">
          <b>{t('home.jar', { level: data.jar.level, capacity: data.jar.capacity })}</b>
          <i><u style={{ width: `${pct}%` }} /></i>
        </span>
      </button>
      </>}
    </div>
  );
}
