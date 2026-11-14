import { useEffect, useRef, useState } from 'react';
import './jar.css';
import { api, errorText, token } from './api';
import { locale, t, type Key } from './i18n';
import type { Me, Week } from './shared';
import { cached, remember } from './cache';
import { buzz, sfx, tap } from './sound';
import { Doodle, Icon, toast } from './ui';
import { JarArt, PaperStar } from './JarArt';

type SeedDef = { id: string; price: number };
type JarData = {
  capacity: number; level: number; gifts: number; seeds: Array<{ memberId: string; seed: string; count: number }>;
  catalog: SeedDef[]; owned: string[]; mine: string;
};

// Mỗi mã là một loại giấy gấp sao (hình vẽ ở JarArt.tsx); máy chủ giữ danh sách và giá tương ứng (server/jar.ts).
const CATALOG: SeedDef[] = [
  { id: 'heart_red', price: 0 }, { id: 'lotus', price: 0 }, { id: 'sun', price: 0 }, { id: 'leaf', price: 0 },
  { id: 'pearl', price: 19000 }, { id: 'sakura', price: 19000 }, { id: 'gold', price: 29000 },
  { id: 'crystal', price: 29000 }, { id: 'rainbow', price: 39000 }, { id: 'dew', price: 19000 },
];
const seedName = (s: SeedDef) => t(`jar.seed.${s.id}` as Key);
const money = (n: number) => `${n.toLocaleString(locale())}₫`;
const given = (name: string) => name.trim().split(/\s+/).pop() ?? name;

async function jfetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(tk ? { authorization: `Bearer ${tk}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

function Shell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet oly jr">
      <div className="jr-head">
        <button className="jr-x" onClick={onClose} aria-label={t('common.close')}><Icon name="down" size={20} /></button>
        <b>{t('jar.title')}</b>
        <span className="jr-x-sp" />
      </div>
      <div className="scroll jr-body">{children}</div>
    </div>
  );
}

const GIFTS = [1, 2, 3, 4] as const;

export function Jar({ me, onClose }: { me: Me; onClose: () => void }) {
  // Mở là hiện ngay bản lần trước, không còn màn "đang tải".
  const [w, setW] = useState<Week | null>(() => cached<Week>('week'));
  const [j, setJ] = useState<JarData | null>(() => cached<JarData>('jar'));
  const [soon, setSoon] = useState<SeedDef | null>(null);
  const [doing, setDoing] = useState<string | null>(null);
  const art = useRef<HTMLDivElement>(null);
  const load = () => {
    api.week().then((v) => { remember('week', v); setW(v); }).catch((e) => toast(e.message));
    jfetch<JarData>('/api/jar').then((v) => { remember('jar', v); setJ(v); }).catch((e) => toast(e.message));
  };
  useEffect(load, []);

  if (!w || !j) return <Shell onClose={onClose}><div className="muted jr-wait">{t('common.loading')}</div></Shell>;

  async function pick(s: SeedDef) {
    tap();
    if (s.price > 0 && !j!.owned.includes(s.id)) { setSoon(s); return; }
    // Đổi giấy hiện ngay; máy chủ từ chối thì trả lại giấy cũ.
    const was = j!.mine;
    setJ((x) => x && { ...x, mine: s.id, seeds: x.seeds.map((r) => (r.memberId === me.me.id ? { ...r, seed: s.id } : r)) });
    try { await jfetch('/api/jar/seed', { method: 'PUT', body: JSON.stringify({ seed: s.id }) }); load(); } catch (e) {
      setJ((x) => x && { ...x, mine: was, seeds: x.seeds.map((r) => (r.memberId === me.me.id ? { ...r, seed: was } : r)) });
      toast((e as Error).message);
    }
  }

  async function finish(m: Week['missions'][number]) {
    if (doing) return;
    setDoing(m.key); tap(); buzz(30);
    // Đánh dấu xong ngay, máy chủ trả lời sau; lỗi thì bỏ dấu và báo (không báo "+1 sao" khi chưa nhận).
    const was = m;
    const put = (y: typeof m) => setW((x) => x && { ...x, missions: x.missions.map((z) => (z.key === m.key ? y : z)) });
    put({ ...m, done: true, doneBy: m.doneBy.includes(me.me.id) ? m.doneBy : [...m.doneBy, me.me.id] });
    // Sao của mình rơi vào lọ ngay (cuộn lên cho thấy lọ trước); lọ sắp đầy thì để máy chủ đổ lọ rồi mới vẽ.
    const box = art.current?.querySelector('.jar-art')?.getBoundingClientRect();
    if (!box || box.top < 40 || box.bottom > window.innerHeight) {
      art.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await new Promise((ok) => window.setTimeout(ok, 420));
    }
    if (j!.level + 1 < j!.capacity) setJ((x) => x && { ...x, level: x.level + 1, seeds: x.seeds.map((r) => (r.memberId === me.me.id ? { ...r, count: r.count + 1 } : r)) });
    try { await api.mission(m.key); sfx('sparkle'); toast(t('jar.added')); load(); } catch (e) { put(was); toast((e as Error).message); load(); } finally { setDoing(null); }
  }

  return (
    <Shell onClose={onClose}>
      <div ref={art} className="jr-stage">
        <JarArt rows={j.seeds} gifts={j.gifts} family={me.family.id} width={250} tappable />
      </div>
      <div className="jr-count">
        <b>{j.level}<small> / {j.capacity}</small></b>
        <p>{t('jar.sub')}</p>
      </div>

      <div className="jr-legend">
        {j.seeds.map((s) => {
          const m = me.members.find((x) => x.id === s.memberId);
          return <span key={s.memberId}><PaperStar seed={s.seed} size={22} />{m ? given(m.name) : ''} {s.count}</span>;
        })}
      </div>

      <h2 className="jr-h">{t('jar.missions')}</h2>
      <div className="jr-list">
        {w.missions.map((m) => (
          <button key={m.key} className={`jr-task${m.done ? ' done' : ''}`} disabled={m.done || doing === m.key} onClick={() => void finish(m)}>
            <Doodle name={m.done ? 'check' : 'box'} size={26} />
            <span className="jr-task-text">
              <span>{m.text}</span>
              {!!m.doneBy.length && <small>{t('jar.doneBy', { n: m.doneBy.length })}</small>}
            </span>
            <em className="hand">{t('jar.plusOne')}</em>
          </button>
        ))}
      </div>

      <h2 className="jr-h">{t('jar.mySeeds')}</h2>
      <div className="jr-papers">
        {CATALOG.map((s) => {
          const locked = s.price > 0 && !j.owned.includes(s.id);
          const on = j.mine === s.id;
          return (
            <button key={s.id} className={`jr-paper${on ? ' on' : ''}${locked ? ' locked' : ''}`} onClick={() => pick(s)}>
              <PaperStar seed={s.id} size={40} />
              <b>{seedName(s)}</b>
              <i className={on ? 'hand' : undefined}>{locked ? money(s.price) : on ? t('jar.using') : t('jar.use')}</i>
            </button>
          );
        })}
      </div>

      <h2 className="jr-h">{t('jar.gifts')}</h2>
      <div className="jr-list">
        {GIFTS.map((g, i) => (
          <div key={g} className={`jr-gift${i < j.gifts ? ' open' : ''}`}>
            <Doodle name="star" size={22} />
            <span>{t(`jar.gift.${g}`)}</span>
            <em className={i < j.gifts ? 'hand' : undefined}>{i < j.gifts ? t('jar.opened') : t('jar.fullN', { n: i + 1 })}</em>
          </div>
        ))}
      </div>

      {soon && (
        <div className="jar-modal" onClick={() => setSoon(null)}>
          <div className="jar-modal-box jr-soon" onClick={(e) => e.stopPropagation()}>
            <PaperStar seed={soon.id} size={72} />
            <h3 className="display">{t('jar.soon.title')}</h3>
            <p>{t('jar.soon.body', { name: seedName(soon), price: money(soon.price) })}</p>
            <button className="btn" onClick={() => setSoon(null)}>{t('jar.soon.ok')}</button>
          </div>
        </div>
      )}
    </Shell>
  );
}
