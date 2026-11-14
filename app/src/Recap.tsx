import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { errorText, token } from './api';
import { cached } from './cache';
import { fmtDayMonth, shownLang, t } from './i18n';
import { thumb, type Me } from './shared';
import { tap } from './sound';
import { Doodle, Icon, toast } from './ui';
import './recap.css';

type RecapRow = { week: string; status: 'rendering' | 'ready' | 'failed'; media: string | null; cover: string | null; postsCount: number; createdAt: string };
type WeekNow = { week: string; posts: number; minPosts: number; dueAt: string };
/** Ảnh, video mới nhất của nhà (phần `latest` của /api/home, Trang chủ cũng lưu bản này). */
type Shot = { id: string; media: string; kind: string; createdAt: string };

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

/** Số tuần ISO của tuần bắt đầu thứ Hai `week`: tuần 1 là tuần có ngày 4/1. */
function weekNo(week: string) {
  const monday = new Date(`${week}T00:00:00Z`);
  const year = new Date(monday.getTime() + 3 * 86400e3).getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const first = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400e3;
  return 1 + Math.round((monday.getTime() - first) / (7 * 86400e3));
}

/** Câu dịch giữ chỗ {hand}; cụm ở chỗ đó viết tay mực tím. */
function withHand(s: string, hand: string): ReactNode {
  const [a, b = ''] = s.split('{hand}');
  return <>{a}<span className="hand">{hand}</span>{b}</>;
}

// Phim đã xem trên máy này (để thôi hiện chữ "mới"). Không đọc được bộ nhớ máy thì coi như chưa xem.
const SEEN = 'recapSeen';
const seenKey = (r: RecapRow) => `${r.week}@${r.createdAt}`;
const isSeen = (r: RecapRow) => { try { return localStorage.getItem(SEEN) === seenKey(r); } catch { return false; } };
const markSeen = (r: RecapRow) => { try { localStorage.setItem(SEEN, seenKey(r)); } catch {} };

/** Ảnh bìa của phim; phim cũ chưa có bìa thì lấy khung đầu của video. */
function Cover({ r }: { r: RecapRow }) {
  return r.cover ? <img src={r.cover} alt="" decoding="async" /> : <video src={`${r.media}#t=0.1`} muted playsInline preload="metadata" />;
}

const SLOTS = 5;
const TILT = [-4, 3, -2, 4, -3];

// Phim tuần kiểu mục tổng kết của YOPE: hàng thẻ dọc các tuần đã có phim, vuốt ngang, chạm là xem toàn màn hình.
// Dưới là tuần đang dở: ô ảnh đã gửi, còn thiếu mấy tấm. Phim tự có vào tối Chủ nhật; nút xem trước chỉ để xem sớm tuần đang dở.
export function Recap({ me, onClose, onCamera }: { me: Me; onClose: () => void; onCamera?: () => void }) {
  const [list, setList] = useState<RecapRow[] | null>(null);
  const [now, setNow] = useState<WeekNow | null>(null);
  const [shots, setShots] = useState<Shot[]>(() => cached<{ latest?: Shot[] }>('home')?.latest ?? []);
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
    call<{ latest?: Shot[] }>('/api/home').then((d) => setShots(d.latest ?? [])).catch(() => {});
  }, []);

  const rendering = list?.some((r) => r.status === 'rendering');
  useEffect(() => {
    if (!rendering) return;
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [rendering]);

  const films = list?.filter((r) => r.media) ?? [];
  const hero = films[0];
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

  // Tuần đang dở: ô đã có ảnh (ảnh mới nhất trong tuần), ô còn thiếu cho đủ phim, ô thêm cho vui.
  const need = now ? Math.max(0, now.minPosts - now.posts) : 0;
  const filled = now ? Math.min(SLOTS, now.posts) : 0;
  const since = now ? new Date(`${now.week}T00:00:00+07:00`).getTime() : 0;
  const weekShots = shots.filter((s) => new Date(s.createdAt).getTime() >= since);
  const canPreview = !!now && now.posts >= now.minPosts && !(thisWeek?.status === 'ready' && thisWeek.postsCount >= now.posts);
  const headline = rendering
    ? list?.find((r) => r.status === 'rendering')?.media ? t('recap.updating') : t('recap.rendering')
    : thisWeek?.status === 'ready' ? withHand(t('recap.ready'), t('recap.readyHand'))
    : need > 0 ? withHand(t('recap.need'), t('recap.needHand', { n: need }))
    : withHand(t('recap.enough'), t('recap.enoughHand', { n: now?.posts ?? 0 }));

  return (
    <div className="sheet rc">
      <header className="rc-head">
        <div>
          <h1 className="display">{t('recap.title')}</h1>
          <span>{t('recap.private')}</span>
        </div>
        <button className="rc-x" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
      </header>
      <div className="scroll rc-body">
        {list && (
          <div className="rc-rail">
            {films.length ? films.map((r, i) => (
              <button key={r.week} className="rc-card" style={{ '--i': i } as CSSProperties} onClick={() => play(r)}
                aria-label={`${t('recap.play')}, ${t('recap.weekNo', { n: weekNo(r.week) })}`}>
                <Cover r={r} />
                {r === hero && fresh && <span className="rc-new">{t('recap.new')}</span>}
                <span className="rc-badge"><Icon name="play" /></span>
                <span className="rc-stamp"><b>{t('recap.weekNo', { n: weekNo(r.week) })}</b><span>{label(r.week)}</span></span>
              </button>
            )) : (
              <div className="rc-card rc-blank"><Doodle name="film" size={40} /><span className="hand">{t('recap.first')}</span></div>
            )}
          </div>
        )}

        {list && now && (
          <div className="rc-now">
            <div className="rc-slots" aria-hidden>
              {Array.from({ length: SLOTS }, (_, i) => {
                const s = i < filled ? weekShots[i] : null;
                const kind = i < filled ? 'got' : i < filled + need ? 'need' : 'free';
                return (
                  <i key={i} className={`rc-slot ${kind}`} style={{ '--r': `${TILT[i]}deg` } as CSSProperties}>
                    {s && <img src={thumb(s.media, 160)} alt="" decoding="async" />}
                  </i>
                );
              })}
            </div>
            <h2 className={`display rc-line${rendering ? ' busy' : ''}`}>{rendering && <i aria-hidden />}{headline}</h2>
            {!rendering && <p>{t('recap.sub')}</p>}
            {thisWeek?.status === 'failed' && !rendering && <p className="rc-fail">{t('recap.failed')}</p>}
            <div className="rc-acts">
              <button className="rc-pill" onClick={() => { tap(); (onCamera ?? onClose)(); }}>
                <Doodle name="camera" size={18} wobble={false} />{t('recap.camera')}
              </button>
              {/* Xem trước khi tuần này chưa có phim, hoặc đã có thêm khoảnh khắc từ lần dựng trước. */}
              {canPreview && !rendering && (
                <button className="rc-pill line" onClick={preview} disabled={asking}>{t('recap.preview')}</button>
              )}
            </div>
          </div>
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
