import express from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from './db.ts';
import { notifyMembers } from './push.ts';
import { errorBody, tReq, tServer } from './i18n.ts';

// Thư gửi riêng một người trong nhà. Kiểu giấy, khung, chữ, màu chữ, nền lưu dưới dạng mã ngắn; máy khách tự dựng lại giao diện,
// mã lạ thì máy khách dùng kiểu mặc định nên máy chủ chỉ cần kiểm dạng mã, không giữ danh sách.
const STYLE_KEYS = ['paper', 'frame', 'font', 'ink', 'bg'] as const;
const MAX_BODY = 1500;

export async function migrateLetters(db: { query: (q: string, v?: any[]) => Promise<any> } = pool) {
  await db.query(`
    create table if not exists letters (
      id text primary key, family_id text not null references families(id),
      from_id text not null references members(id), to_id text not null references members(id),
      body text not null, style jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(), read_at timestamptz
    );
    create index if not exists letters_to on letters (to_id, created_at desc);
    create index if not exists letters_from on letters (from_id, created_at desc);
  `);
}

const h = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || tReq('error.server') });
  });

const COLS = 'id, from_id, to_id, body, style, created_at, read_at';
const view = (r: any) => ({ id: r.id, fromId: r.from_id, toId: r.to_id, body: r.body, style: r.style ?? {}, createdAt: r.created_at, readAt: r.read_at });

function cleanStyle(raw: unknown) {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const k of STYLE_KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'string' && /^[a-z0-9-]{1,16}$/.test(v)) out[k] = v;
    }
  }
  return out;
}

export async function unreadLetters(memberId: string): Promise<number> {
  const { rows } = await pool.query('select count(*)::int n from letters where to_id = $1 and read_at is null', [memberId]);
  return rows[0].n;
}

export const lettersRouter = express.Router();

lettersRouter.get('/letters', h(async (req, res) => {
  const out = req.query.box === 'out';
  const { rows } = await pool.query(
    `select ${COLS} from letters where family_id = $1 and ${out ? 'from_id' : 'to_id'} = $2 order by created_at desc limit 100`,
    [req.member.family_id, req.member.id]);
  res.json(rows.map(view));
}));

lettersRouter.post('/letters', h(async (req, res) => {
  const body = String(req.body?.body ?? '').trim().slice(0, MAX_BODY);
  if (!body) return res.status(400).json(errorBody('letter_empty'));
  const to = String(req.body?.to ?? '');
  const { rows: t } = await pool.query('select id from members where id = $1 and family_id = $2 and id <> $3', [to, req.member.family_id, req.member.id]);
  if (!t[0]) return res.status(400).json(errorBody('letter_to'));
  const id = randomUUID();
  const { rows } = await pool.query(
    `insert into letters (id, family_id, from_id, to_id, body, style) values ($1,$2,$3,$4,$5,$6) returning ${COLS}`,
    [id, req.member.family_id, req.member.id, to, body, JSON.stringify(cleanStyle(req.body?.style))]);
  const { rows: me } = await pool.query('select name from members where id = $1', [req.member.id]);
  const name = String(me[0]?.name || '');
  // Chạy nền; nội dung thư không nằm trong thông báo.
  void notifyMembers([to], (l) => ({
    kind: 'chat', title: tServer(l, 'push.letter.title', { name: name || tServer(l, 'push.someone') }), body: tServer(l, 'push.letter.body'),
    tag: `letter-${id}`, open: 'letter', ttl: 7 * 24 * 3600,
  }));
  res.json(view(rows[0]));
}));

lettersRouter.post('/letters/:id/read', h(async (req, res) => {
  const { rowCount } = await pool.query(
    'update letters set read_at = now() where id = $1 and to_id = $2 and read_at is null', [req.params.id, req.member.id]);
  res.json({ ok: true, changed: !!rowCount });
}));
