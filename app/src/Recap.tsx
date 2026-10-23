import { useEffect, useRef, useState } from 'react';
import { token } from './api';
import type { Me } from './shared';
import { tap } from './sound';
import { Icon, toast } from './ui';

type RecapRow = { week: string; status: 'rendering' | 'ready' | 'failed'; media: string | null; postsCount: number; createdAt: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi, thử lại nhé');
  return data as T;
}

// Tuần tính từ thứ Hai, giờ Việt Nam (giống máy chủ).
function currentWeek() {
  const t = new Date(Date.now() + 7 * 3600e3);
  const day = (t.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - day)).toISOString().slice(0, 10);
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
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [rendering]);

  const ready = list?.filter((r) => r.status === 'ready' && r.media) ?? [];
  const shown = ready.find((r) => r.week === sel) ?? ready[0];
  const thisWeek = list?.find((r) => r.week === week);

  async function make() {
    tap();
    try {
      const r = await call<RecapRow & { skipped?: boolean; message?: string }>('/api/recaps/render', { method: 'POST', body: JSON.stringify({ week }) });
      if (r.skipped) return toast(r.message ?? 'Chưa đủ ảnh');
      void load();
    } catch (e) { toast((e as Error).message); }
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
      if (navigator.share) await navigator.share({ title: `${me.family.name}, tuần ${label(shown.week)}`, url });
      else { await navigator.clipboard.writeText(url); toast('Đã chép đường dẫn'); }
    } catch {}
  }

  return (
    <div className="sheet recap">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>Phim tuần</div>
        {shown ? <button className="icon-btn" onClick={share} aria-label="Chia sẻ"><Icon name="share" /></button> : <span style={{ width: 44 }} />}
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>
        {list === null ? null : shown ? (
          <>
            <div className="recap-player" onClick={toggle}>
              <video key={shown.media} ref={video} src={`${shown.media}#t=0.1`} playsInline preload="metadata"
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
              {!playing && <div className="recap-play"><Icon name="play" /></div>}
            </div>
            <div className="recap-caption">Tuần {label(shown.week)} · {shown.postsCount} khoảnh khắc</div>
          </>
        ) : !rendering && (
          <div className="recap-empty">
            <div className="h1">Chưa có phim nào</div>
            <p>Tối Chủ nhật, ảnh cả tuần của nhà mình sẽ thành một đoạn phim ngắn.</p>
          </div>
        )}

        {rendering ? (
          <div className="recap-busy"><i />Đang dựng video...</div>
        ) : list && (
          <button className={`btn${thisWeek?.status === 'ready' ? ' ghost' : ''}`} style={{ marginTop: 18 }} onClick={make}>
            {thisWeek?.status === 'ready' ? 'Làm lại tuần này' : 'Làm recap tuần này'}
          </button>
        )}
        {thisWeek?.status === 'failed' && !rendering && <div className="recap-note">Lần trước chưa dựng được, thử lại nhé.</div>}

        {ready.length > 1 && (
          <>
            <div className="h2">Các tuần trước</div>
            <div className="recap-list">
              {ready.map((r) => (
                <button key={r.week} className={r.week === shown?.week ? 'on' : ''} onClick={() => { tap(); setSel(r.week); setPlaying(false); }}>
                  <Icon name="play" size={16} />
                  <span>Tuần {label(r.week)}</span>
                  <small>{r.postsCount} ảnh</small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
