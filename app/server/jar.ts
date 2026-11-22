import express from 'express';
import { pool } from './db.ts';
import { errorBody, tReq, tVi } from './i18n.ts';
import { syncMissions } from './missions.ts';

export type SeedShape = 'heart' | 'round' | 'star' | 'petal' | 'drop' | 'leaf';
export type SeedDef = { id: string; name: string; colors: [string, string]; shape: SeedShape };

// Mọi loại giấy đều dùng được, không bán lẻ từng giấy: sau này cả gói gia đình trả theo tháng/kỳ lo hết.
export const CATALOG: SeedDef[] = [
  { id: 'heart_red', name: tVi('jar.seed.heart_red'), colors: ['#D9534F', '#A23430'], shape: 'heart' },
  { id: 'lotus', name: tVi('jar.seed.lotus'), colors: ['#F2B5C4', '#C9798F'], shape: 'round' },
  { id: 'sun', name: tVi('jar.seed.sun'), colors: ['#F6C453', '#C98E1B'], shape: 'star' },
  { id: 'leaf', name: tVi('jar.seed.leaf'), colors: ['#8DB580', '#4F7A47'], shape: 'leaf' },
  { id: 'pearl', name: tVi('jar.seed.pearl'), colors: ['#F4EFE8', '#B9AEA0'], shape: 'round' },
  { id: 'sakura', name: tVi('jar.seed.sakura'), colors: ['#F9C9D6', '#E58CA5'], shape: 'petal' },
  { id: 'gold', name: tVi('jar.seed.gold'), colors: ['#E8B93C', '#9C6F0C'], shape: 'heart' },
  { id: 'crystal', name: tVi('jar.seed.crystal'), colors: ['#BFE3F2', '#6FA8C4'], shape: 'drop' },
  { id: 'rainbow', name: tVi('jar.seed.rainbow'), colors: ['#B48AE0', '#F08A7A'], shape: 'star' },
  { id: 'dew', name: tVi('jar.seed.dew'), colors: ['#9FD8CF', '#4E9E94'], shape: 'drop' },
];

// Người chưa chọn giấy thì lần lượt nhận một trong bốn giấy đầu (như trước khi bỏ giá, để lọ cũ không đổi màu).
const DEFAULTS = CATALOG.slice(0, 4).map((s) => s.id);

// owned_seeds: giấy đã mua thời còn bán lẻ. Không dùng nữa nhưng giữ nguyên bảng và dữ liệu (members.ts PLAN vẫn xoá theo người).
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
    res.status(500).json({ error: err.message || tReq('error.server') });
  });

jarRouter.get('/jar', wrap(async (req, res) => {
  const { id: me, family_id: fid } = req.member;
  // Nhiệm vụ tự đánh dấu trước khi đếm sao (server/missions.ts). Lỗi thì vẫn trả lọ như cũ.
  await syncMissions(fid).catch((e) => console.error(e));
  const [ms, sel, ev] = await Promise.all([
    pool.query('select id from members where family_id = $1 order by created_at', [fid]),
    pool.query('select member_id, seed from member_seed where member_id in (select id from members where family_id = $1)', [fid]),
    pool.query(
      `select who, at from (
         select author_id who, created_at at from posts where family_id = $1
         union all select r.author_id, r.created_at from replies r join posts p on p.id = r.post_id where p.family_id = $1
         union all select member_id, created_at from missions_done where family_id = $1
       ) e order by at`, [fid]),
  ]);
  // Lọ không có trần: mỗi việc làm là một sao, đếm từ đầu tới giờ (không còn chu kỳ 40 sao, không còn quà mở theo lọ đầy).
  const total = ev.rows.length;
  const picked = new Map<string, string>(sel.rows.map((r: any) => [r.member_id, r.seed]));
  const seeds = ms.rows.map((m: any, i: number) => ({
    memberId: m.id,
    seed: picked.get(m.id) ?? DEFAULTS[i % DEFAULTS.length],
    count: ev.rows.filter((e: any) => e.who === m.id).length,
  }));
  res.json({
    total, seeds, catalog: CATALOG.map((s) => ({ ...s, name: tReq(`jar.seed.${s.id}`) })),
    mine: seeds.find((s: any) => s.memberId === me)?.seed ?? DEFAULTS[0],
  });
}));

jarRouter.put('/jar/seed', wrap(async (req, res) => {
  const seed = String(req.body?.seed || '');
  const def = CATALOG.find((s) => s.id === seed);
  if (!def) return res.status(400).json(errorBody('seed_not_found'));
  // Chỗ kiểm gói gia đình sau này: khi có gói trả theo tháng/kỳ, nhà chưa có gói thì chặn ở đây (chưa làm, hiện ai cũng dùng được mọi giấy).
  await pool.query(
    'insert into member_seed (member_id, seed) values ($1,$2) on conflict (member_id) do update set seed = excluded.seed',
    [req.member.id, seed],
  );
  res.json({ ok: true });
}));
