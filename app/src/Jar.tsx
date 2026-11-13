import { useEffect, useRef, useState } from 'react';
import { api, errorText, token } from './api';
import { locale, t, type Key } from './i18n';
import type { Me, Week } from './shared';
import { cached, remember } from './cache';
import { buzz, sfx, tap } from './sound';
import { Avatar, Icon, toast } from './ui';
import { JarArt, SeedImg } from './JarArt';

type SeedDef = { id: string; price: number };
type JarData = {
  capacity: number; level: number; gifts: number; seeds: Array<{ memberId: string; seed: string; count: number }>;
  catalog: SeedDef[]; owned: string[]; mine: string;
};

// Hình hạt là sprite charm trong public/jar (JarArt.tsx); máy chủ giữ danh sách và giá tương ứng (server/jar.ts).
const CATALOG: SeedDef[] = [
  { id: 'heart_red', price: 0 }, { id: 'lotus', price: 0 }, { id: 'sun', price: 0 }, { id: 'leaf', price: 0 },
  { id: 'pearl', price: 19000 }, { id: 'sakura', price: 19000 }, { id: 'gold', price: 29000 },
  { id: 'crystal', price: 29000 }, { id: 'rainbow', price: 39000 }, { id: 'dew', price: 19000 },
];
const seedOf = (id: string) => CATALOG.find((s) => s.id === id) ?? CATALOG[0];
const seedName = (s: SeedDef) => t(`jar.seed.${s.id}` as Key);
const money = (n: number) => `${n.toLocaleString(locale())}₫`;

async function jfetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(tk ? { authorization: `Bearer ${tk}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>{title}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>{children}</div>
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

  if (!w || !j) return <Sheet title={t('jar.title')} onClose={onClose}><div className="muted">{t('common.loading')}</div></Sheet>;

  async function pick(s: SeedDef) {
    tap();
    if (s.price > 0 && !j!.owned.includes(s.id)) { setSoon(s); return; }
    // Đổi hạt hiện ngay; máy chủ từ chối thì trả lại hạt cũ.
    const was = j!.mine;
    setJ((x) => x && { ...x, mine: s.id, seeds: x.seeds.map((r) => (r.memberId === me.me.id ? { ...r, seed: s.id } : r)) });
    try { await jfetch('/api/jar/seed', { method: 'PUT', body: JSON.stringify({ seed: s.id }) }); load(); } catch (e) {
      setJ((x) => x && { ...x, mine: was, seeds: x.seeds.map((r) => (r.memberId === me.me.id ? { ...r, seed: was } : r)) });
      toast((e as Error).message);
    }
  }

  return (
    <Sheet title={t('jar.title')} onClose={onClose}>
      <div ref={art} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 6 }}>
        <JarArt rows={j.seeds} gifts={j.gifts} family={me.family.id} width={250} />
        <div className="h1">{t('jar.count', { level: j.level, capacity: j.capacity })}</div>
        <div className="muted" style={{ textAlign: 'center' }}>{t('jar.sub')}</div>
      </div>

      <div className="jar-legend">
        {j.seeds.map((s) => {
          const m = me.members.find((x) => x.id === s.memberId);
          return (
            <div key={s.memberId} className="jar-who">
              <Avatar m={m} size={34} />
              <SeedImg id={seedOf(s.seed).id} size={30} />
              <span>{m?.name ?? ''}</span>
              <b>{s.count}</b>
            </div>
          );
        })}
      </div>

      <div className="h2">{t('jar.mySeeds')}</div>
      <div className="jar-grid">
        {CATALOG.map((s) => {
          const locked = s.price > 0 && !j.owned.includes(s.id);
          return (
            <button key={s.id} className={`jar-seed ${j.mine === s.id ? 'on' : ''}`} onClick={() => pick(s)}>
              <SeedImg id={s.id} size={48} />
              <span>{seedName(s)}</span>
              <i>{locked ? money(s.price) : j.mine === s.id ? t('jar.using') : t('jar.use')}</i>
            </button>
          );
        })}
      </div>

      <div className="h2">{t('jar.missions')}</div>
      <div className="panel" style={{ padding: '4px 18px' }}>
        {w.missions.map((m) => (
          <div key={m.key} className="mission">
            <div>
              <div>{m.text}</div>
              <div className="pts">{t('jar.plusOne')}{m.doneBy.length ? t('jar.doneBy', { n: m.doneBy.length }) : ''}</div>
            </div>
            <button className={`done-btn ${m.done ? 'done' : ''}`} disabled={m.done || doing === m.key}
              onClick={async () => {
                if (doing) return;
                setDoing(m.key); tap(); buzz(30);
                // Đánh dấu xong ngay, máy chủ trả lời sau; lỗi thì bỏ dấu và báo (không báo "+1 hạt" khi chưa nhận).
                const was = m;
                const put = (y: typeof m) => setW((x) => x && { ...x, missions: x.missions.map((z) => (z.key === m.key ? y : z)) });
                put({ ...m, done: true, doneBy: m.doneBy.includes(me.me.id) ? m.doneBy : [...m.doneBy, me.me.id] });
                // Hạt của mình rơi vào lọ ngay (cuộn lên cho thấy lọ trước); lọ sắp đầy thì để máy chủ đổ lọ rồi mới vẽ.
                const box = art.current?.querySelector('.jar-art')?.getBoundingClientRect();
                if (!box || box.top < 40 || box.bottom > window.innerHeight) {
                  art.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  await new Promise((ok) => window.setTimeout(ok, 420));
                }
                if (j.level + 1 < j.capacity) setJ((x) => x && { ...x, level: x.level + 1, seeds: x.seeds.map((r) => (r.memberId === me.me.id ? { ...r, count: r.count + 1 } : r)) });
                try { await api.mission(m.key); sfx('sparkle'); toast(t('jar.added')); load(); } catch (e) { put(was); toast((e as Error).message); load(); } finally { setDoing(null); }
              }}>
              {m.done ? t('jar.done') : t('common.done')}
            </button>
          </div>
        ))}
      </div>

      <div className="h2">{t('jar.gifts')}</div>
      <div className="panel" style={{ padding: '4px 18px' }}>
        {GIFTS.map((g, i) => (
          <div key={g} className="mission" style={{ opacity: i < j.gifts ? 1 : 0.5 }}>
            <div>{t(`jar.gift.${g}`)}</div>
            <div className="pts" style={{ marginLeft: 'auto' }}>{i < j.gifts ? t('jar.opened') : t('jar.fullN', { n: i + 1 })}</div>
          </div>
        ))}
      </div>

      {soon && (
        <div className="jar-modal" onClick={() => setSoon(null)}>
          <div className="jar-modal-box" onClick={(e) => e.stopPropagation()}>
            <SeedImg id={soon.id} size={88} />
            <div className="h1" style={{ marginTop: 10 }}>{t('jar.soon.title')}</div>
            <div className="muted" style={{ textAlign: 'center' }}>{t('jar.soon.body', { name: seedName(soon), price: money(soon.price) })}</div>
            <button className="btn" style={{ marginTop: 18 }} onClick={() => setSoon(null)}>{t('jar.soon.ok')}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
