import { useEffect, useMemo, useState } from 'react';
import { api, token } from './api';
import type { Me, Week } from './shared';
import { buzz, sfx, tap } from './sound';
import { Avatar, Icon, toast } from './ui';

type Shape = 'heart' | 'round' | 'star' | 'petal' | 'drop' | 'leaf';
type SeedDef = { id: string; name: string; colors: [string, string]; shape: Shape; price: number };
type JarData = {
  capacity: number; level: number; gifts: number; seeds: Array<{ memberId: string; seed: string; count: number }>;
  catalog: SeedDef[]; owned: string[]; mine: string;
};

const CATALOG: SeedDef[] = [
  { id: 'heart_red', name: 'Hạt đỏ tim', colors: ['#D9534F', '#A23430'], shape: 'heart', price: 0 },
  { id: 'lotus', name: 'Hạt sen', colors: ['#F2B5C4', '#C9798F'], shape: 'round', price: 0 },
  { id: 'sun', name: 'Hạt nắng', colors: ['#F6C453', '#C98E1B'], shape: 'star', price: 0 },
  { id: 'leaf', name: 'Hạt lá', colors: ['#8DB580', '#4F7A47'], shape: 'leaf', price: 0 },
  { id: 'pearl', name: 'Hạt ngọc trai', colors: ['#F4EFE8', '#B9AEA0'], shape: 'round', price: 19000 },
  { id: 'sakura', name: 'Hạt hoa anh đào', colors: ['#F9C9D6', '#E58CA5'], shape: 'petal', price: 19000 },
  { id: 'gold', name: 'Hạt vàng', colors: ['#E8B93C', '#9C6F0C'], shape: 'heart', price: 29000 },
  { id: 'crystal', name: 'Hạt pha lê', colors: ['#BFE3F2', '#6FA8C4'], shape: 'drop', price: 29000 },
  { id: 'rainbow', name: 'Hạt cầu vồng', colors: ['#B48AE0', '#F08A7A'], shape: 'star', price: 39000 },
  { id: 'dew', name: 'Hạt sương mai', colors: ['#9FD8CF', '#4E9E94'], shape: 'drop', price: 19000 },
];
const seedOf = (id: string) => CATALOG.find((s) => s.id === id) ?? CATALOG[0];
const money = (n: number) => `${n.toLocaleString('vi-VN')}₫`;

async function jfetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi, thử lại nhé');
  return data as T;
}

const PATH: Record<Shape, string> = {
  heart: 'M0 8C-9 2-9-6-4.5-6C-2-6 0-4 0-2.5C0-4 2-6 4.5-6C9-6 9 2 0 8Z',
  round: 'M0-7A7 7 0 110 7A7 7 0 110-7Z',
  star: 'M0-9L2.6-3 9-2.4 4.2 1.8 5.6 8 0 4.8-5.6 8-4.2 1.8-9-2.4-2.6-3Z',
  petal: 'M0 9C-9 3-8-7-3-8L0-5L3-8C8-7 9 3 0 9Z',
  drop: 'M0-9C5-2 8 2 8 4A8 8 0 01-8 4C-8 2-5-2 0-9Z',
  leaf: 'M-7 7C-8-3 0-9 8-8C8 0 3 8-7 7Z',
};

function SeedShape({ def, size = 20 }: { def: SeedDef; size?: number }) {
  return (
    <svg viewBox="-11 -11 22 22" width={size} height={size} aria-hidden>
      <path d={PATH[def.shape]} fill={def.colors[0]} stroke={def.colors[1]} strokeWidth="1.2" strokeLinejoin="round" />
      <ellipse cx="-2.5" cy="-2.5" rx="2" ry="1.2" fill="#fff" opacity=".55" transform="rotate(-30 -2.5 -2.5)" />
    </svg>
  );
}

function prng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const JAR_PATH = 'M50 30h60v18c22 10 32 30 32 54v60a26 26 0 01-26 26H44a26 26 0 01-26-26v-60c0-24 10-44 32-54z';

function JarArt({ list }: { list: string[] }) {
  const placed = useMemo(() => {
    const r = prng(list.length * 7919 + 13);
    const order = list.map((s) => ({ s, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.s);
    const COLS = 7;
    return order.map((s, i) => {
      const row = Math.floor(i / COLS), col = i % COLS;
      const x = 29 + col * 17 + (row % 2 ? 8 : 0) + (r() - 0.5) * 3;
      const y = 168 - row * 14 + (r() - 0.5) * 3;
      return { s, x: Math.min(x, 133), y, rot: (r() - 0.5) * 70 };
    });
  }, [list]);
  return (
    <svg viewBox="0 0 160 200" width="230" height="288" aria-hidden className="jar-svg">
      <defs>
        <clipPath id="jarclip"><path d={JAR_PATH} /></clipPath>
        <linearGradient id="jarglass" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".7" /><stop offset=".5" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#fff" stopOpacity=".5" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="192" rx="56" ry="5" fill="#2B2723" opacity=".08" />
      <path d={JAR_PATH} fill="url(#jarglass)" />
      <g clipPath="url(#jarclip)">
        {placed.map((p, i) => {
          const d = seedOf(p.s);
          return (
            <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(.78)`}>
              <path d={PATH[d.shape]} fill={d.colors[0]} stroke={d.colors[1]} strokeWidth="1.4" strokeLinejoin="round" />
              <ellipse cx="-2.5" cy="-2.5" rx="2" ry="1.2" fill="#fff" opacity=".55" />
            </g>
          );
        })}
      </g>
      <path d={JAR_PATH} fill="none" stroke="#2B2723" strokeWidth="2" opacity=".85" />
      <path d="M30 100c0-14 4-26 12-34" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".7" />
      <rect x="44" y="18" width="72" height="14" rx="5" fill="#E9DCCB" stroke="#2B2723" strokeWidth="2" />
    </svg>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>{title}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>{children}</div>
    </div>
  );
}

const GIFTS = ['Sổ giọng nói của nhà mình', 'Tập podcast "Chuyện nhà mình"', 'Cuốn sách ảnh một năm', 'Thư tay in gửi về nhà'];

export function Jar({ me, onClose }: { me: Me; onClose: () => void }) {
  const [w, setW] = useState<Week | null>(null);
  const [j, setJ] = useState<JarData | null>(null);
  const [soon, setSoon] = useState<SeedDef | null>(null);
  const load = () => {
    api.week().then(setW).catch((e) => toast(e.message));
    jfetch<JarData>('/api/jar').then(setJ).catch((e) => toast(e.message));
  };
  useEffect(load, []);

  const list = useMemo(() => (j ? j.seeds.flatMap((s) => Array<string>(s.count).fill(s.seed)) : []), [j]);

  if (!w || !j) return <Sheet title="Lọ yêu thương" onClose={onClose}><div className="muted">Đang mở...</div></Sheet>;

  async function pick(s: SeedDef) {
    tap();
    if (s.price > 0 && !j!.owned.includes(s.id)) { setSoon(s); return; }
    try { await jfetch('/api/jar/seed', { method: 'PUT', body: JSON.stringify({ seed: s.id }) }); load(); } catch (e) { toast((e as Error).message); }
  }

  return (
    <Sheet title="Lọ yêu thương" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 6 }}>
        <JarArt list={list} />
        <div className="h1">{j.level} / {j.capacity} hạt thương</div>
        <div className="muted" style={{ textAlign: 'center' }}>Mỗi lần thương là một hạt. Đầy lọ thì mở một món quà.</div>
      </div>

      <div className="jar-legend">
        {j.seeds.map((s) => {
          const m = me.members.find((x) => x.id === s.memberId);
          return (
            <div key={s.memberId} className="jar-who">
              <Avatar m={m} size={34} />
              <SeedShape def={seedOf(s.seed)} size={22} />
              <span>{m?.name ?? ''}</span>
              <b>{s.count}</b>
            </div>
          );
        })}
      </div>

      <div className="h2">Hạt của bạn</div>
      <div className="jar-grid">
        {CATALOG.map((s) => {
          const locked = s.price > 0 && !j.owned.includes(s.id);
          return (
            <button key={s.id} className={`jar-seed ${j.mine === s.id ? 'on' : ''}`} onClick={() => pick(s)}>
              <SeedShape def={s} size={32} />
              <span>{s.name}</span>
              <i>{locked ? money(s.price) : j.mine === s.id ? 'Đang dùng' : 'Dùng'}</i>
            </button>
          );
        })}
      </div>

      <div className="h2">Nhiệm vụ tuần này</div>
      <div className="panel" style={{ padding: '4px 18px' }}>
        {w.missions.map((m) => (
          <div key={m.key} className="mission">
            <div>
              <div>{m.text}</div>
              <div className="pts">+1 hạt{m.doneBy.length ? ` · ${m.doneBy.length} người đã làm` : ''}</div>
            </div>
            <button className={`done-btn ${m.done ? 'done' : ''}`} disabled={m.done}
              onClick={async () => { tap(); buzz(30); await api.mission(m.key).catch((e) => toast(e.message)); sfx('sparkle'); toast('+1 hạt vào lọ'); load(); }}>
              {m.done ? 'Đã làm' : 'Xong'}
            </button>
          </div>
        ))}
      </div>

      <div className="h2">Quà của nhà mình</div>
      <div className="panel" style={{ padding: '4px 18px' }}>
        {GIFTS.map((g, i) => (
          <div key={g} className="mission" style={{ opacity: i < j.gifts ? 1 : 0.5 }}>
            <div>{g}</div>
            <div className="pts" style={{ marginLeft: 'auto' }}>{i < j.gifts ? 'Đã mở' : `Đầy lọ lần ${i + 1}`}</div>
          </div>
        ))}
      </div>

      {soon && (
        <div className="jar-modal" onClick={() => setSoon(null)}>
          <div className="jar-modal-box" onClick={(e) => e.stopPropagation()}>
            <SeedShape def={soon} size={56} />
            <div className="h1" style={{ marginTop: 10 }}>Sắp mở bán</div>
            <div className="muted" style={{ textAlign: 'center' }}>{soon.name} ({money(soon.price)}) sẽ có sớm thôi. Chưa tính tiền gì cả.</div>
            <button className="btn" style={{ marginTop: 18 }} onClick={() => setSoon(null)}>Ừ, mình chờ</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
