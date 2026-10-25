import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pool } from './db.ts';
import { warmThumbs } from './thumb.ts';
import { notifyMembers } from './push.ts';
import { errorBody, tReq, tServer } from './i18n.ts';

// Thư gửi riêng một người trong nhà. Kiểu giấy, khung, chữ, màu chữ, nền lưu dưới dạng mã ngắn; máy khách tự dựng lại giao diện,
// mã lạ thì máy khách dùng kiểu mặc định nên máy chủ chỉ cần kiểm dạng mã, không giữ danh sách.
const STYLE_KEYS = ['paper', 'frame', 'font', 'ink', 'bg'] as const;
const MAX_BODY = 1500;
const MAX_ITEMS = 12;
const MAX_PHOTOS = 3;

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
mkdirSync(MEDIA_DIR, { recursive: true });
const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({ destination: MEDIA_DIR, filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXT[file.mimetype] ?? '.jpg'}`) }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in EXT),
});

export async function migrateLetters(db: { query: (q: string, v?: any[]) => Promise<any> } = pool) {
  await db.query(`
    create table if not exists letters (
      id text primary key, family_id text not null references families(id),
      from_id text not null references members(id), to_id text not null references members(id),
      body text not null, style jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(), read_at timestamptz
    );
    alter table letters add column if not exists items jsonb not null default '[]'::jsonb;
    create index if not exists letters_to on letters (to_id, created_at desc);
    create index if not exists letters_from on letters (from_id, created_at desc);
  `);
}

const h = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || tReq('error.server') });
  });

const COLS = 'id, from_id, to_id, body, style, items, created_at, read_at';
const view = (r: any) => ({ id: r.id, fromId: r.from_id, toId: r.to_id, body: r.body, style: r.style ?? {}, items: r.items ?? [], createdAt: r.created_at, readAt: r.read_at });

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

/** Hình dán và ảnh trên thư: vị trí tính theo phần trăm tờ giấy để mọi màn hình thấy giống nhau. Chỉ nhận ảnh trong kho media của app. */
function cleanItems(raw: unknown) {
  const out: Array<Record<string, unknown>> = [];
  if (!Array.isArray(raw)) return out;
  let photos = 0;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  for (const it of raw.slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const pos = { x: num(o.x, -5, 105, 50), y: num(o.y, -5, 105, 50), w: num(o.w, 8, 80, 30), rot: num(o.rot, -180, 180, 0) };
    if (o.type === 'photo' && typeof o.media === 'string' && /^\/media\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(o.media) && photos < MAX_PHOTOS) {
      photos++;
      out.push({ type: 'photo', media: o.media, ...pos });
    } else if (o.type === 'sticker' && typeof o.sticker === 'string' && /^[a-z0-9-]{1,24}$/.test(o.sticker)) {
      out.push({ type: 'sticker', sticker: o.sticker, ...pos });
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

/** Ảnh gắn vào thư (chụp hoặc chọn): trả về đường dẫn để đưa vào items khi gửi. */
lettersRouter.post('/letters/photo', upload.single('file'), h(async (req, res) => {
  if (!req.file) return res.status(400).json(errorBody('missing_media'));
  const media = `/media/${req.file.filename}`;
  warmThumbs(MEDIA_DIR, media, [360, 1080]);
  res.json({ media });
}));

lettersRouter.post('/letters', h(async (req, res) => {
  const body = String(req.body?.body ?? '').trim().slice(0, MAX_BODY);
  const items = cleanItems(req.body?.items);
  if (!body && !items.length) return res.status(400).json(errorBody('letter_empty'));
  const to = String(req.body?.to ?? '');
  const { rows: t } = await pool.query('select id from members where id = $1 and family_id = $2 and id <> $3', [to, req.member.family_id, req.member.id]);
  if (!t[0]) return res.status(400).json(errorBody('letter_to'));
  const id = randomUUID();
  const { rows } = await pool.query(
    `insert into letters (id, family_id, from_id, to_id, body, style, items) values ($1,$2,$3,$4,$5,$6,$7) returning ${COLS}`,
    [id, req.member.family_id, req.member.id, to, body, JSON.stringify(cleanStyle(req.body?.style)), JSON.stringify(items)]);
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
