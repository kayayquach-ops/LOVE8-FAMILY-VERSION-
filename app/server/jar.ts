import express from 'express';
import { pool } from './db.ts';

export const JAR_CAPACITY = 40;

export type SeedShape = 'heart' | 'round' | 'star' | 'petal' | 'drop' | 'leaf';
export type SeedDef = { id: string; name: string; colors: [string, string]; shape: SeedShape; price: number };

export const CATALOG: SeedDef[] = [
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

const FREE = CATALOG.filter((s) => s.price === 0).map((s) => s.id);

export async function migrateJar(p: { query: (sql: string) => Promise<unknown> }) {
  await p.query(`
    create table if not exists member_seed (member_id text primary key, seed text not null default 'heart_red');
    create table if not exists owned_seeds (member_id text not null, seed text not null, primary key (member_id, seed));
  `);
}

export const jarRouter = express.Router();

const wrap = (fn: (req: any, res: any) => Promise<unknown>) => (req: any, res: any) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Lỗi máy chủ' });
  });

jarRouter.get('/jar', wrap(async (req, res) => {
  const { id: me, family_id: fid } = req.member;
  const [ms, sel, own, ev] = await Promise.all([
    pool.query('select id from members where family_id = $1 order by created_at', [fid]),
    pool.query('select member_id, seed from member_seed where member_id in (select id from members where family_id = $1)', [fid]),
    pool.query('select seed from owned_seeds where member_id = $1', [me]),
    pool.query(
      `select who, at from (
         select author_id who, created_at at from posts where family_id = $1
         union all select r.author_id, r.created_at from replies r join posts p on p.id = r.post_id where p.family_id = $1
         union all select member_id, created_at from missions_done where family_id = $1
       ) e order by at`, [fid]),
  ]);
  const total = ev.rows.length;
  const level = total % JAR_CAPACITY;
  const cycle = level ? ev.rows.slice(-level) : [];
  const picked = new Map<string, string>(sel.rows.map((r: any) => [r.member_id, r.seed]));
  const seeds = ms.rows.map((m: any, i: number) => ({
    memberId: m.id,
    seed: picked.get(m.id) ?? FREE[i % FREE.length],
    count: cycle.filter((e: any) => e.who === m.id).length,
  }));
  res.json({
    capacity: JAR_CAPACITY, level, gifts: Math.floor(total / JAR_CAPACITY), seeds, catalog: CATALOG,
    owned: own.rows.map((r: any) => r.seed), mine: seeds.find((s: any) => s.memberId === me)?.seed ?? FREE[0],
  });
}));

jarRouter.put('/jar/seed', wrap(async (req, res) => {
  const seed = String(req.body?.seed || '');
  const def = CATALOG.find((s) => s.id === seed);
  if (!def) return res.status(400).json({ error: 'Không có hạt này' });
  if (def.price > 0) {
    const { rowCount } = await pool.query('select 1 from owned_seeds where member_id = $1 and seed = $2', [req.member.id, seed]);
    if (!rowCount) return res.status(403).json({ error: 'Hạt này chưa mở bán' });
  }
  await pool.query(
    'insert into member_seed (member_id, seed) values ($1,$2) on conflict (member_id) do update set seed = excluded.seed',
    [req.member.id, seed],
  );
  res.json({ ok: true });
}));
