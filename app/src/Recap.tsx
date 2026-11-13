import { useEffect, useRef, useState } from 'react';
import { errorText, token } from './api';
import { fmtDayMonth, shownLang, t } from './i18n';
import type { Me } from './shared';
import { tap } from './sound';
import { Icon, toast } from './ui';
import './recap.css';

type RecapRow = { week: string; status: 'rendering' | 'ready' | 'failed'; media: string | null; cover: string | null; postsCount: number; createdAt: string };
type WeekNow = { week: string; posts: number; minPosts: number; dueAt: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(tk ? { authorization: `Bearer ${tk}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

function label(week: string) {
  const a = new Date(`${week}T00:00:00Z`), b = new Date(a.getTime() + 6 * 86400e3);
  const am = a.getUTCMonth() + 1, bm = b.getUTCMonth() + 1;
  if (shownLang() !== 'vi') return `${fmtDayMonth(a.getUTCDate(), am)} - ${fmtDayMonth(b.getUTCDate(), bm)}`;
  return am === bm ? `${a.getUTCDate()} - ${b.getUTCDate()}/${bm}` : `${a.getUTCDate()}/${am} - ${b.getUTCDate()}/${bm}`;
}

// Phim đã xem trên máy này (để thôi hiện chữ "Mới"). Không đọc được bộ nhớ máy thì coi như chưa xem.
const SEEN = 'recapSeen';
const seenKey = (r: RecapRow) => `${r.week}@${r.createdAt}`;
const isSeen = (r: RecapRow) => { try { return localStorage.getItem(SEEN) === seenKey(r); } catch { return false; } };
const markSeen = (r: RecapRow) => { try { localStorage.setItem(SEEN, seenKey(r)); } catch {} };

/** Ảnh bìa của phim; phim cũ chưa có bìa thì lấy khung đầu của video. */
function Cover({ r }: { r: RecapRow }) {
  return r.cover ? <img src={r.cover} alt="" decoding="async" /> : <video src={`${r.media}#t=0.1`} muted playsInline preload="metadata" />;
}

// Phim tuần: bìa phim mới nhất, chạm là xem toàn màn hình kiểu story; dưới là tuần đang dở và các tuần trước.
// Phim tự có vào tối Chủ nhật, không cần bấm; nút xem trước chỉ để xem sớm tuần đang dở.
export function Recap({ me, onClose }: { me: Me; onClose: () => void }) {
  const [list, setList] = useState<RecapRow[] | null>(null);
  const [now, setNow] = useState<WeekNow | null>(null);
  const [open, setOpen] = useState<RecapRow | null>(null);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [asking, setAsking] = useState(false);
  const [, bump] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  const load = () => call<RecapRow[]>('/api/recaps').then(setList).catch((e) => toast(e.message));
  useEffect(() => {
    void load();
    call<WeekNow>('/api/recaps/week').then(setNow).catch(() => {});
  }, []);

  const rendering = list?.some((r) => r.status === 'rendering');
  useEffect(() => {
    if (!rendering) return;
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [rendering]);

  const films = list?.filter((r) => r.media) ?? [];
  const hero = films[0];
  const past = films.slice(1);
  const thisWeek = list?.find((r) => r.week === now?.week);
  const fresh = !!hero && !isSeen(hero) && Date.now() - new Date(hero.createdAt).getTime() < 4 * 86400e3;

  // Thanh tiến độ: đọc thời gian video mỗi khung hình, chỉ đổi transform.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const step = () => {
      const v = video.current;
      if (v && bar.current && v.duration) bar.current.style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Gọi play() ngay trong lúc chạm để iPhone cho phát có tiếng.
  function play(r: RecapRow) {
    const v = video.current;
    if (!v || !r.media) return;
    tap();
    if (v.getAttribute('src') !== r.media) v.src = r.media;
    v.currentTime = 0;
    v.muted = false;
    void v.play().catch(() => setPaused(true));
    setOpen(r);
    setPaused(false);
    setEnded(false);
    markSeen(r);
    bump((x) => x + 1);
  }
  function close() {
    video.current?.pause();
    setOpen(null);
  }
  function toggle() {
    const v = video.current;
    if (!v) return;
    if (ended) { v.currentTime = 0; setEnded(false); }
    if (v.paused) { void v.play(); setPaused(false); } else { v.pause(); setPaused(true); }
  }

  async function preview() {
    if (asking || !now) return;
    tap();
    setAsking(true);
    try {
      const r = await call<RecapRow & { skipped?: boolean; message?: string }>('/api/recaps/render', { method: 'POST', body: JSON.stringify({ week: now.week }) });
      if (r.skipped) return toast(r.message ?? t('recap.notEnough'));
      void load();
    } catch (e) { toast((e as Error).message); } finally { setAsking(false); }
  }

  async function share(r: RecapRow) {
    if (!r.media) return;
    tap();
    const url = new URL(r.media, location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: t('recap.shareTitle', { family: me.family.name, week: label(r.week) }), url });
      else { await navigator.clipboard.writeText(url); toast(t('recap.copied')); }
    } catch {}
  }

  return (
    <div className="sheet rc">
      <div className="rc-top">
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
        <div className="rc-title">{t('recap.title')}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll rc-body">
        {list === null ? null : hero ? (
          <>
            <button className="rc-hero" onClick={() => play(hero)} aria-label={t('recap.play')}>
              <Cover r={hero} />
              {fresh && <span className="rc-new">{t('recap.new')}</span>}
              <span className="rc-play"><Icon name="play" /></span>
            </button>
            <div className="rc-cap">{t('recap.caption', { week: label(hero.week), n: hero.postsCount })}</div>
          </>
        ) : !rendering && (
          <div className="recap-empty">
            <div className="h1">{t('recap.empty.title')}</div>
            <p>{t('recap.empty.body')}</p>
          </div>
        )}

        {list && now && (
          <div className="rc-now">
            {rendering ? (
              <div className="rc-busy"><i />{list.find((r) => r.status === 'rendering')?.media ? t('recap.updating') : t('recap.rendering')}</div>
            ) : (
              <>
                <p>{now.posts ? t('recap.soFar', { n: now.posts }) : t('recap.soFarNone')}</p>
                <small>{t('recap.next')}</small>
                {/* Xem trước khi tuần này chưa có phim, hoặc đã có thêm khoảnh khắc từ lần dựng trước. */}
                {now.posts >= now.minPosts && !(thisWeek?.status === 'ready' && thisWeek.postsCount >= now.posts) && (
                  <button className="rc-preview" onClick={preview} disabled={asking}>{t('recap.preview')}</button>
                )}
                {thisWeek?.status === 'failed' && <small className="rc-fail">{t('recap.failed')}</small>}
              </>
            )}
          </div>
        )}

        {past.length > 0 && (
          <>
            <div className="h2 rc-h">{t('recap.past')}</div>
            <div className="rc-grid">
              {past.map((r) => (
                <button key={r.week} className="rc-tile" onClick={() => play(r)}>
                  <span className="rc-thumb"><Cover r={r} /></span>
                  <span className="rc-tile-label">{label(r.week)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={`rc-player${open ? ' on' : ''}`} aria-hidden={!open}>
        <video ref={video} playsInline preload="none" onClick={toggle}
          onPause={() => setPaused(true)} onPlay={() => setPaused(false)} onEnded={() => { setEnded(true); setPaused(true); }} />
        <div className="rc-bar"><span ref={bar} /></div>
        <div className="rc-player-top">
          <span>{open && t('recap.week', { week: label(open.week) })}</span>
          <button className="icon-btn" onClick={close} aria-label={t('common.close')}><Icon name="close" /></button>
        </div>
        {open && paused && (
          <button className="rc-big" onClick={toggle} aria-label={ended ? t('recap.replay') : t('recap.play')}>
            <Icon name="play" />{ended && <span>{t('recap.replay')}</span>}
          </button>
        )}
        {open && (
          <button className="rc-share" onClick={() => share(open)}><Icon name="share" size={18} />{t('recap.share')}</button>
        )}
      </div>
    </div>
  );
}
