import { useEffect, useState } from 'react';
import './home.css';
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
import { JarArt } from './JarArt';
import { fmtDate, t } from './i18n';

type Screen = 'camera' | 'feed' | 'chat' | 'calendar' | 'jar' | 'family' | 'podcast' | 'recap' | 'letters' | 'settings';
type Podcast = { id: string; title: string; topic: string; memberId: string; duration: number; cover?: string | null; createdAt: string };
type HomeData = {
  letters?: number;
  upcoming: Array<{ id: string; title: string; kind: string; inDays: number; years: number | null }>;
  latest: Array<{ id: string; media: string; kind: string; authorId: string; createdAt: string }>;
  jar: { level: number; capacity: number };
  week: Record<string, number>;
  podcasts: Podcast[];
};
// Phần của /api/jar mà Trang chủ cần: màu hạt từng người để vẽ lọ thật. Dùng chung bản lưu 'jar' với màn lọ.
type JarLite = { level: number; capacity: number; gifts?: number; seeds: Array<{ memberId: string; seed: string; count: number }> };

async function get<T>(path: string): Promise<T> {
  const tk = token.get();
  const r = await fetch(path, { headers: tk ? { authorization: `Bearer ${tk}` } : {} });
  if (!r.ok) throw new Error();
  return r.json();
}

function greet() {
  const h = new Date().getHours();
  return t(h < 11 ? 'home.greet.morning' : h < 14 ? 'home.greet.noon' : h < 18 ? 'home.greet.afternoon' : 'home.greet.evening');
}

const given = (name: string) => name.trim().split(/\s+/).pop() ?? name;

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
  const [, setJarTick] = useState(0);
  const alone = me.members.length < 2;

  useEffect(() => {
    const run = () => get<HomeData>('/api/home').then((d) => {
      remember('home', d);
      setData((prev) => (prev && JSON.stringify(prev) === JSON.stringify(d) ? prev : d));
      setFailed(false);
    }).catch(() => setFailed(true));
    void run();
    const t = setInterval(() => { if (!document.hidden) void run(); }, 30000);
    const onVis = () => { if (!document.hidden) void run(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('hl-letters', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('hl-letters', onVis); };
  }, [tick]);

  // Lọ: đọc bản lưu mỗi lần vẽ (màn lọ đổi hạt thì về đây thấy ngay), chỉ hỏi lại máy chủ khi số hạt khác bản lưu.
  const jar = cached<JarLite>('jar');
  useEffect(() => {
    if (!data || jar?.level === data.jar.level) return;
    let live = true;
    get<JarLite>('/api/jar').then((j) => { remember('jar', j); if (live) setJarTick((n) => n + 1); }).catch(() => {});
    return () => { live = false; };
  }, [data?.jar.level]);

  useEffect(() => {
    let live = true;
    Promise.all(me.members.map(async (m) => [m.id, await weather(m.city)] as const)).then((r) => live && setWx(Object.fromEntries(r)));
    return () => { live = false; };
  }, [me.members.map((m) => m.city).join('|')]);

  const go = (s: Screen, arg?: string) => () => { tap(); onOpen(s, arg); };
  const byId = (id: string) => me.members.find((m) => m.id === id);
  const level = data?.jar.level ?? jar?.level ?? 0;
  const capacity = data?.jar.capacity ?? jar?.capacity ?? 40;
  const shelf = data?.podcasts ?? [];
  const inviteNow = () => { tap(); void shareInvite(me.family.code, me.family.name); };

  return (
    <div className="home scroll">
      <i className="home-swirl" aria-hidden />

      <header className="home-head">
        <div className="home-top">
          <span className="home-fam">{me.family.name}</span>
          <button className="icon-btn home-set" onClick={go('settings')} aria-label={t('settings.title')}><Icon name="sliders" /></button>
        </div>
        <h1 className="home-hi">{t('home.hi', { greet: greet(), name: given(me.me.name) })}</h1>
      </header>

      {invite && <CallCard role={me.me.role} onAnswer={onCall} onLater={() => { snooze(); setLater(true); }} />}

      {/* Lọ yêu thương: khối lớn ngay dưới lời chào, chạm là mở lọ. Luôn giữ chỗ để phần dưới không nhảy khi số hạt về. */}
      <button className="home-jar" onClick={go('jar')}>
        <span className="home-jar-art"><JarArt rows={jar?.seeds ?? []} gifts={jar?.gifts ?? 0} family={me.family.id} width={118} ready={!!jar} /></span>
        <span className="home-jar-text">
          <span className="home-eyebrow">{t('jar.title')}</span>
          <span className={`home-jar-count${data || jar ? '' : ' wait'}`}>
            <b>{level}</b>
            <small>{t('home.jar.of', { capacity })}</small>
          </span>
          <span className="home-jar-bar"><i style={{ transform: `scaleX(${capacity ? level / capacity : 0})` }} /></span>
          <span className="home-jar-note">{level ? t('home.jar.left', { n: capacity - level }) : t('jar.sub')}</span>
        </span>
      </button>

      {/* Nhà mới chỉ có mình: mời người thân là việc đầu tiên, nằm ngay dưới lọ. */}
      {alone && (
        <button className="home-invite" onClick={inviteNow}>
          <i aria-hidden><Icon name="share" size={20} /></i>
          <span>
            <b>{me.me.role === 'con' ? t('home.invite.parents') : t('home.invite.kids')}</b>
            <small>{t('home.invite.alone')}</small>
          </span>
        </button>
      )}

      <div className="home-tiles">
        <button className="home-tile" onClick={go('camera')}>
          <i><Icon name="image" size={22} /></i>
          <b>{t('home.cta')}</b>
        </button>
        <button className={`home-tile${data?.letters ? ' new' : ''}`} onClick={go('letters')}>
          <i><Icon name="mail" size={22} /></i>
          <b>{t('letters.home')}</b>
          {!!data?.letters && <em>{t('letters.homeNew', { n: data.letters })}</em>}
        </button>
      </div>

      {!alone && <section className="home-sec">
        <h2 className="home-h">{t('home.now')}</h2>
        <div className="home-row">
          {me.members.map((m) => {
            const quiet = m.id !== me.me.id && hoursSince(m.lastSeen) > SILENT_HOURS;
            const lt = localTime(m.city);
            return (
              <button key={m.id} className={`home-mem${quiet ? ' quiet' : ''}`} onClick={go('family')}>
                <Avatar m={m} size={52} />
                <b>{m.id === me.me.id ? t('common.you') : given(m.name)}</b>
                <span>{lt ?? t('home.noTime')}</span>
                {quiet ? <em>{t('home.quietDays', { n: Math.floor(hoursSince(m.lastSeen) / 24) })}</em> : wx[m.id] && <small>{wx[m.id]}</small>}
              </button>
            );
          })}
          {/* Ô mời thêm người cuối hàng, kèm mã nhà. */}
          <button className="home-mem home-more" onClick={inviteNow}>
            <i aria-hidden><Icon name="share" size={20} /></i>
            <b>{t('home.invite.more')}</b>
            <span>{t('home.invite.code', { code: me.family.code })}</span>
          </button>
        </div>
      </section>}

      {!data && failed && (
        <button className="home-retry" onClick={() => setTick((n) => n + 1)}>{t('home.retry')}</button>
      )}

      {/* Phần dưới chỉ hiện khi đã có dữ liệu, hiện một lần cùng nhau, không chen dần làm trang nhảy. */}
      {data && <>
        {!!data.upcoming.length && (
          <section className="home-sec fade-only">
            <h2 className="home-h">{t('common.upcoming')}</h2>
            <div className="home-list">
              {data.upcoming.map((e) => {
                const d = new Date();
                d.setDate(d.getDate() + e.inDays);
                const today = e.inDays === 0;
                return (
                  <button key={e.id} className={`home-ev${today ? ' today' : ''}`} onClick={go('calendar')}>
                    <span className="home-date"><b>{d.getDate()}</b><small>{fmtDate(d, { month: 'short' })}</small></span>
                    <span className="home-ev-main">
                      <b>{e.title}</b>
                      <span>
                        {today ? t('common.today') : t('home.inDays', { n: e.inDays })}
                        {e.years != null && e.years > 0 && ` · ${t(e.kind === 'birthday' ? 'common.age' : 'common.years', { n: e.years })}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!!data.latest.length && (
          <section className="home-sec fade-only">
            <div className="home-hrow">
              <h2 className="home-h">{t('home.photos')}</h2>
              <button className="home-link" onClick={go('recap')}>{t('home.recap')}<Icon name="back" size={16} /></button>
            </div>
            <div className={`home-thumbs${data.latest.length === 3 || data.latest.length >= 6 ? ' lead' : ''}`}>
              {data.latest.slice(0, 6).map((p) => (
                <button key={p.id} onClick={go('feed', p.id)} aria-label={byId(p.authorId)?.name}><Thumb src={p.media} /></button>
              ))}
            </div>
          </section>
        )}

        <section className="home-sec fade-only">
          <h2 className="home-h">{t('home.podcasts')}{invite && <i className="home-dot" aria-label={t('home.callWaiting')} />}</h2>
          <div className="home-row">
            {shelf.length ? shelf.map((p) => (
              <button key={p.id} className="home-album" onClick={go('podcast', p.id)}>
                <span className="home-cover">{p.cover ? <img src={thumb(p.cover, 360)} alt="" loading="lazy" decoding="async" /> : <Icon name="mic" size={26} />}</span>
                <b>{p.title}</b>
                <span>{byId(p.memberId)?.name ?? p.topic}</span>
              </button>
            )) : (
              <button className="home-album empty" onClick={go('podcast')}>
                <span className="home-cover"><Icon name="mic" size={24} /></span>
                <b>{t('home.podcastEmpty')}</b>
              </button>
            )}
          </div>
        </section>
      </>}
    </div>
  );
}
