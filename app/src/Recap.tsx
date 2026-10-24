import { useEffect, useRef, useState } from 'react';
import { errorText, token } from './api';
import { t } from './i18n';
import type { Me } from './shared';
import { tap } from './sound';
import { Icon, toast } from './ui';

type RecapRow = { week: string; status: 'rendering' | 'ready' | 'failed'; media: string | null; postsCount: number; createdAt: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(tk ? { authorization: `Bearer ${tk}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

// Tuần tính từ thứ Hai, giờ Việt Nam (giống máy chủ).
function currentWeek() {
  const d = new Date(Date.now() + 7 * 3600e3);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}
function label(week: string) {
  const a = new Date(`${week}T00:00:00Z`), b = new Date(a.getTime() + 6 * 86400e3);
  const am = a.getUTCMonth() + 1, bm = b.getUTCMonth() + 1;
  return am === bm ? `${a.getUTCDate()} - ${b.getUTCDate()}/${bm}` : `${a.getUTCDate()}/${am} - ${b.getUTCDate()}/${bm}`;
}

// Video tổng kết tuần: xem bản mới nhất, xem lại các tuần trước, tự làm video tuần này.
export function Recap({ me, onClose }: { me: Me; onClose: () => void }) {
  const [list, setList] = useState<RecapRow[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const week = currentWeek();

  const load = () => call<RecapRow[]>('/api/recaps').then(setList).catch((e) => toast(e.message));
  useEffect(() => { void load(); }, []);

  const rendering = list?.some((r) => r.status === 'rendering');
  useEffect(() => {
    if (!rendering) return;
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [rendering]);

  const ready = list?.filter((r) => r.status === 'ready' && r.media) ?? [];
  const shown = ready.find((r) => r.week === sel) ?? ready[0];
  const thisWeek = list?.find((r) => r.week === week);

  const [asking, setAsking] = useState(false);
  async function make() {
    if (asking) return;
    tap();
    setAsking(true);
    try {
      const r = await call<RecapRow & { skipped?: boolean; message?: string }>('/api/recaps/render', { method: 'POST', body: JSON.stringify({ week }) });
      if (r.skipped) return toast(r.message ?? t('recap.notEnough'));
      void load();
    } catch (e) { toast((e as Error).message); } finally { setAsking(false); }
  }

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (v.paused) { v.muted = false; void v.play(); } else v.pause();
  }

  async function share() {
    if (!shown?.media) return;
    tap();
    const url = new URL(shown.media, location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: t('recap.shareTitle', { family: me.family.name, week: label(shown.week) }), url });
      else { await navigator.clipboard.writeText(url); toast(t('recap.copied')); }
    } catch {}
  }

  return (
    <div className="sheet recap">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>{t('recap.title')}</div>
        {shown ? <button className="icon-btn" onClick={share} aria-label={t('recap.share')}><Icon name="share" /></button> : <span style={{ width: 44 }} />}
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>
        {list === null ? null : shown ? (
          <>
            <div className="recap-player" onClick={toggle}>
              <video key={shown.media} ref={video} src={`${shown.media}#t=0.1`} playsInline preload="metadata"
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
              {!playing && <div className="recap-play"><Icon name="play" /></div>}
            </div>
            <div className="recap-caption">{t('recap.caption', { week: label(shown.week), n: shown.postsCount })}</div>
          </>
        ) : !rendering && (
          <div className="recap-empty">
            <div className="h1">{t('recap.empty.title')}</div>
            <p>{t('recap.empty.body')}</p>
          </div>
        )}

        {rendering ? (
          <div className="recap-busy"><i />{t('recap.rendering')}</div>
        ) : list && (
          <button className={`btn${thisWeek?.status === 'ready' ? ' ghost' : ''}`} style={{ marginTop: 18 }} onClick={make} disabled={asking}>
            {thisWeek?.status === 'ready' ? t('recap.remake') : t('recap.make')}
          </button>
        )}
        {thisWeek?.status === 'failed' && !rendering && <div className="recap-note">{t('recap.failed')}</div>}

        {ready.length > 1 && (
          <>
            <div className="h2">{t('recap.past')}</div>
            <div className="recap-list">
              {ready.map((r) => (
                <button key={r.week} className={r.week === shown?.week ? 'on' : ''} onClick={() => { tap(); setSel(r.week); setPlaying(false); }}>
                  <Icon name="play" size={16} />
                  <span>{t('recap.week', { week: label(r.week) })}</span>
                  <small>{t('feed.stat.photos', { n: r.postsCount })}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
