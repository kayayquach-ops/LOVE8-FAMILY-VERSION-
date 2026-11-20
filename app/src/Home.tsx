import { useEffect, useState } from 'react';
import './home.css';
import { token } from './api';
import { cached, remember } from './cache';
import { cityOf, thumb, type Me, type Member } from './shared';
import { SILENT_HOURS } from './shared';
import { ago, hoursSince, localTime, weather } from './time';
import { Avatar, Doodle, Icon } from './ui';
import { tap } from './sound';
import { CallCard } from './CallCard';
import { snooze, snoozed } from './callSnooze';
import { shareInvite } from './Onboarding';
import { JarArt } from './JarArt';
import { JoinAsks } from './Sheets';
import { cityName, usePlaceNames } from './placeName';
import { fmtDate, fmtDayMonth, fmtTime, locale, shownLang, t } from './i18n';

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
// Phần của /api/jar mà Trang chủ cần: màu giấy từng người để vẽ lọ thật. Dùng chung bản lưu 'jar' với màn lọ.
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

/** Thứ và ngày hôm nay, chữ thường (trừ tiếng Hàn): "thứ bảy 14/11". */
function today() {
  const d = new Date();
  const s = t('home.date', { weekday: fmtDate(d, { weekday: 'long' }), date: fmtDayMonth(d.getDate(), d.getMonth() + 1) });
  return shownLang() === 'ko' ? s : s.toLocaleLowerCase(locale());
}

const given = (name: string) => name.trim().split(/\s+/).pop() ?? name;
const lower = (s: string) => (shownLang() === 'ko' ? s : s.toLocaleLowerCase(locale()));

export function Home({ me, callDue, onCall, onChanged, onOpen }: { me: Me; callDue: boolean; onCall: () => void; onChanged: () => void; onOpen: (s: Screen, arg?: string) => void }) {
  // Đổi qua lại Camera và Nhà là dựng lại màn này: hiện ngay bản lần trước, phần dưới không trống rồi mới hiện.
  const [data, setData] = useState<HomeData | null>(() => cached<HomeData>('home'));
  const [later, setLater] = useState(false);
  const invite = callDue && !later && !snoozed();
  const [wx, setWx] = useState<Record<string, string | null>>({});
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [, setJarTick] = useState(0);
  const alone = me.members.length < 2;
  usePlaceNames();

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

  // Lọ: đọc bản lưu mỗi lần vẽ (màn lọ đổi sao thì về đây thấy ngay), chỉ hỏi lại máy chủ khi số sao khác bản lưu.
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
  const others = me.members.filter((m) => m.id !== me.me.id);

  // Ảnh mới nhất của từng người (trong 6 ảnh gần nhất) để viết dòng "vừa gửi ảnh".
  const lastShot = new Map<string, string>();
  for (const p of data?.latest ?? []) if (!lastShot.has(p.authorId)) lastShot.set(p.authorId, p.createdAt);
  const status = (m: Member): { text: string } => {
    const h = hoursSince(m.lastSeen);
    if (h > SILENT_HOURS) return { text: t('home.status.quiet', { n: Math.floor(h / 24) }) };
    const shot = lastShot.get(m.id);
    if (shot && hoursSince(shot) < 1) return { text: t('home.status.justSent') };
    if (shot && hoursSince(shot) < 24) return { text: t('home.status.sent', { ago: ago(shot) }) };
    if (h < 0.25) return { text: t('home.status.online') };
    return { text: t('home.status.seen', { ago: ago(m.lastSeen) }) };
  };
  // Chữ báo vắng để xám như mọi dòng; chỉ người vắng lâu nhất có một dòng nhắc hỏi thăm dưới danh sách.
  const quietest = others.filter((m) => hoursSince(m.lastSeen) > SILENT_HOURS).sort((a, b) => hoursSince(b.lastSeen) - hoursSince(a.lastSeen))[0];
  // "gấp thêm 26 sao là mở quà": số sao viết tay mực tím, chen giữa câu theo thứ tự từng thứ tiếng.
  const [leftA, leftB] = t('home.jar.left', { stars: '\u0000' }).split('\u0000');

  const letters = (
    <button className={`home-mail${data?.letters ? ' new' : ''}`} onClick={go('letters')}>
      <span className="home-mail-in">
        <Doodle name="mail" size={28} />
        <span className="home-mail-text">
          <b>{t('home.letters')}</b>
          {data?.letters ? <span className="hand">{t('letters.homeNew', { n: data.letters })}</span> : <span>{t('home.letters.write')}</span>}
        </span>
        <span className="home-go"><Icon name="back" size={18} /></span>
      </span>
    </button>
  );

  return (
    <div className="home scroll">
      <header className="home-head">
        <div className="home-hello">
          <small>{me.family.name} · {today()}</small>
          <h1 className="display">{t('home.hi', { greet: greet() })}<br /><span className="hand">{t('home.hiName', { name: given(me.me.name) })}</span></h1>
        </div>
        <button className="home-set" onClick={go('settings')} aria-label={t('settings.title')}><Icon name="sliders" size={22} /></button>
      </header>

      {/* Có người xin vào nhà: chỉ người lập nhà thấy, nằm trên cùng vì người kia đang chờ. */}
      <JoinAsks me={me} onChanged={onChanged} />

      {invite && <CallCard role={me.me.role} onAnswer={onCall} onLater={() => { snooze(); setLater(true); }} />}

      {/* Nhà mới chỉ có mình: mời người thân là việc đầu tiên, nằm đúng chỗ của danh sách cả nhà. */}
      {alone ? (
        <button className="home-invite" onClick={inviteNow}>
          <Doodle name="plane" size={30} />
          <span>
            <b>{me.me.role === 'con' ? t('home.invite.parents') : t('home.invite.kids')}</b>
            <small>{t('home.invite.alone')} · {t('home.invite.code', { code: me.family.code })}</small>
          </span>
          <span className="home-go"><Icon name="back" size={18} /></span>
        </button>
      ) : (
        <section className="home-sec">
          <div className="home-h">
            <h2>{t('home.now')}</h2>
            <button className="home-link" onClick={inviteNow}>{t('home.invite.add')}</button>
          </div>
          <div className="home-people">
            {others.map((m) => {
              const st = status(m);
              const lt = localTime(m.city);
              const where = [cityName(m.city), wx[m.id]?.split(',')[0]].filter(Boolean).join(' · ');
              return (
                <button key={m.id} className="home-person" onClick={go('family')}>
                  <Avatar m={m} size={32} />
                  <span className="home-person-main"><b>{given(m.name)}</b><span>{st.text}</span></span>
                  <span className="home-person-time">
                    {lt ? <><b>{lt}</b>{where && <small>{where}</small>}</> : <small>{t('home.noTime')}</small>}
                  </span>
                </button>
              );
            })}
          </div>
          {quietest && (quietest.phone
            ? <a className="home-nudge hand" href={`tel:${quietest.phone}`} onClick={() => tap()}>{t('home.nudge', { name: given(quietest.name) })}</a>
            : <button className="home-nudge hand" onClick={go('family')}>{t('home.nudge', { name: given(quietest.name) })}</button>)}
        </section>
      )}

      {/* Lọ sao: lọ nhỏ vẽ tay, số sao, còn bao nhiêu sao là mở quà. Luôn giữ chỗ để phần dưới không nhảy khi số sao về. */}
      <button className="home-jar" onClick={go('jar')}>
        <JarArt rows={jar?.seeds ?? []} gifts={jar?.gifts ?? 0} family={me.family.id} width={110} ready={!!jar} />
        <span className={`home-jar-text${data || jar ? '' : ' wait'}`}>
          <b>{level}<small>{t('home.jar.of', { capacity })}</small></b>
          <span>{level ? <>{leftA}<span className="hand">{t('home.jar.stars', { n: capacity - level })}</span>{leftB}</> : t('jar.sub')}</span>
        </span>
      </button>

      {!data && failed && (
        <button className="home-retry" onClick={() => setTick((n) => n + 1)}>{t('home.retry')}</button>
      )}

      {/* Phần dưới chỉ hiện khi đã có dữ liệu, hiện một lần cùng nhau, không chen dần làm trang nhảy. */}
      {data && <>
        {!!data.latest.length && (
          <section className="home-sec fade-only">
            <div className="home-h">
              <h2>{t('home.photos')}</h2>
              <button className="home-link" onClick={go('recap')}>{t('home.recap')}<Icon name="back" size={16} /></button>
            </div>
            <div className="home-rail">
              {data.latest.slice(0, 6).map((p) => {
                const a = byId(p.authorId);
                const c = cityOf(a?.city);
                return (
                  <button key={p.id} className="home-shot" onClick={go('feed', p.id)} aria-label={a?.name}>
                    <img src={thumb(p.media, 360)} alt="" loading="lazy" decoding="async" />
                    {a && <span className="home-shot-who"><Avatar m={a} size={20} />{given(a.name)}</span>}
                    <span className="home-shot-stamp">
                      <b>{fmtTime(new Date(p.createdAt), c?.tz)}</b>
                      <small>{c ? `${cityName(a?.city)} · ${ago(p.createdAt)}` : ago(p.createdAt)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!!data.upcoming.length && (
          <section className="home-sec fade-only">
            <div className="home-h"><h2>{t('home.upcoming')}</h2></div>
            <div className="home-list">
              {data.upcoming.map((e) => {
                const d = new Date();
                d.setDate(d.getDate() + e.inDays);
                const now = e.inDays === 0;
                return (
                  <button key={e.id} className={`home-ev${now ? ' today' : ''}`} onClick={go('calendar')}>
                    <span className="home-stamp"><b>{d.getDate()}</b><small>{lower(fmtDate(d, { month: 'short' }))}</small></span>
                    <span className="home-ev-main">
                      <b>{e.title}</b>
                      <span>
                        {now ? t('home.today') : t('home.inDays', { n: e.inDays })}
                        {e.years != null && e.years > 0 && ` · ${t(e.kind === 'birthday' ? 'common.age' : 'common.years', { n: e.years })}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </>}

      {letters}

      {/* Nhà mình kể: mỗi chuyện là một tấm ảnh lấy liền, dải giấy dưới ảnh ghi tay "{tên} kể". Chuyện mới nhất to hơn. */}
      {data && (
        <section className="home-sec fade-only">
          <div className="home-h"><h2>{t('home.podcasts')}{invite && <i className="home-dot" aria-label={t('home.callWaiting')} />}</h2></div>
          {shelf.length ? (
            <div className="home-pods">
              {shelf.map((p, i) => {
                const who = byId(p.memberId);
                return (
                  <button key={p.id} className={`home-pod${i ? '' : ' new'}`} onClick={go('podcast', p.id)}>
                    <span className="home-polar">
                      <span className="home-polar-pic">{p.cover ? <img src={thumb(p.cover, 360)} alt="" loading="lazy" decoding="async" /> : <Doodle name="mic" size={i ? 30 : 38} />}</span>
                      <span className="home-polar-cap">
                        {who ? <Avatar m={who} size={i ? 18 : 20} /> : <Doodle name="house" size={18} />}
                        <span>{who ? t('home.podcastTeller', { name: given(who.name) }) : t('podcast.family')}</span>
                      </span>
                    </span>
                    <b>{p.title}</b>
                    <small><Icon name="play" size={11} />{Math.floor(p.duration / 60)}:{String(Math.floor(p.duration % 60)).padStart(2, '0')}</small>
                  </button>
                );
              })}
            </div>
          ) : (
            // Chưa có chuyện nào: một tấm ảnh trắng chờ chuyện đầu tiên, một câu mời và nút gọi linh vật.
            <div className="home-pod-empty">
              <span className="home-polar" aria-hidden>
                <span className="home-polar-pic"><Doodle name="mic" size={30} /></span>
                <span className="home-polar-cap" />
              </span>
              <span className="home-pod-invite">
                <span>{t('home.podcastEmpty')}</span>
                <button className="home-pod-call" onClick={() => { tap(); onCall(); }}><Icon name="phone" size={18} />{t('podcast.callNow')}</button>
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
