import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { nextOccurrence } from '../src/lunar.ts';
import { errorBody, tVi } from './i18n.ts';

const KINDS = ['birthday', 'wedding', 'anniversary', 'memory', 'other'];

export async function migrateCalendar(pool: Pool) {
  await pool.query(`
    alter table members add column if not exists dob date;
    create table if not exists events (
      id text primary key,
      family_id text not null,
      member_id text,
      kind text not null check (kind in ('birthday','wedding','anniversary','memory','other')),
      title text not null,
      day int not null,
      month int not null,
      year int,
      lunar boolean not null default false,
      note text,
      photo text,
      created_by text,
      created_at timestamptz not null default now()
    );
    alter table events add column if not exists leap boolean not null default false;
    create index if not exists events_family_idx on events (family_id);
  `);
}

export type CalEvent = {
  id: string; kind: string; title: string; day: number; month: number; year: number | null;
  lunar: boolean; leap: boolean; note: string | null; photo: string | null; memberId: string | null; createdBy: string | null; virtual?: boolean;
};

async function listEvents(pool: Pool, familyId: string): Promise<CalEvent[]> {
  const [ev, ms] = await Promise.all([
    pool.query('select * from events where family_id = $1 order by month, day', [familyId]),
    pool.query(`select id, name, extract(day from dob)::int d, extract(month from dob)::int m, extract(year from dob)::int y
                from members where family_id = $1 and dob is not null`, [familyId]),
  ]);
  const real: CalEvent[] = ev.rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title, day: r.day, month: r.month, year: r.year, lunar: r.lunar, leap: r.leap,
    note: r.note, photo: r.photo, memberId: r.member_id, createdBy: r.created_by,
  }));
  const dobs: CalEvent[] = ms.rows.map((r) => ({
    id: `dob-${r.id}`, kind: 'birthday', title: tVi('calendarGen.dobTitle', { name: r.name }), day: r.d, month: r.m, year: r.y, lunar: false, leap: false,
    note: null, photo: null, memberId: r.id, createdBy: null, virtual: true,
  }));
  return [...dobs, ...real];
}

// Sự kiện âm lịch (lunar=true) được quy đổi ra ngày dương của lần tới; `year` của sự kiện âm là năm âm.
export async function upcoming(pool: Pool, familyId: string, days: number) {
  const now = new Date(Date.now() + 7 * 3600000); // giờ Việt Nam
  const todayParts = { day: now.getUTCDate(), month: now.getUTCMonth() + 1, year: now.getUTCFullYear() };
  const today = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const out: Array<{ id: string; title: string; kind: string; date: string; inDays: number; years: number | null; lunar: boolean }> = [];
  for (const e of await listEvents(pool, familyId)) {
    const occ = nextOccurrence(e, todayParts);
    if (!occ) continue;
    const t = Date.UTC(occ.year, occ.month - 1, occ.day);
    const inDays = Math.round((t - today) / 86400000);
    if (inDays > days) continue;
    out.push({
      id: e.id, title: e.title, kind: e.kind, date: new Date(t).toISOString().slice(0, 10), inDays,
      years: e.year ? (occ.lunarYear ?? occ.year) - e.year : null, lunar: e.lunar,
    });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

type Fn = (req: any, res: express.Response) => Promise<unknown>;
const h = (fn: Fn) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || tVi('error.server') });
  });

import { pool } from './db.ts';

export const calendarRouter = express.Router();

calendarRouter.get('/calendar', h(async (req, res) => {
  res.json(await listEvents(pool, req.member.family_id));
}));

calendarRouter.post('/calendar', h(async (req, res) => {
  const b = req.body ?? {};
  const day = Number(b.day), month = Number(b.month);
  const year = b.year ? Number(b.year) : null;
  const title = String(b.title || '').trim().slice(0, 80);
  if (!KINDS.includes(b.kind)) return res.status(400).json(errorBody('calendar_kind'));
  if (!title) return res.status(400).json(errorBody('calendar_title'));
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1 || day > 31) {
    return res.status(400).json(errorBody('calendar_date'));
  }
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) return res.status(400).json(errorBody('calendar_year'));
  const eid = randomUUID();
  await pool.query(
    `insert into events (id, family_id, member_id, kind, title, day, month, year, lunar, leap, note, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [eid, req.member.family_id, b.memberId ? String(b.memberId) : null, b.kind, title, day, month, year, !!b.lunar, !!b.lunar && !!b.leap,
      b.note ? String(b.note).slice(0, 500) : null, req.member.id],
  );
  res.json({ id: eid });
}));

calendarRouter.delete('/calendar/:id', h(async (req, res) => {
  await pool.query('delete from events where id = $1 and family_id = $2', [req.params.id, req.member.family_id]);
  res.json({ ok: true });
}));

calendarRouter.put('/me/dob', h(async (req, res) => {
  const dob = String(req.body?.dob ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) return res.status(400).json(errorBody('dob_invalid'));
  await pool.query('update members set dob = $2 where id = $1', [req.member.id, dob]);
  res.json({ ok: true });
}));
