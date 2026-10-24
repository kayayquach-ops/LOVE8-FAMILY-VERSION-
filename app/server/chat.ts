import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pool } from './db.ts';
import { notifyChat } from './push.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
mkdirSync(MEDIA_DIR, { recursive: true });

function extOf(mime: string) {
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime')) return '.mov';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('aac') || mime.includes('m4a')) return '.m4a';
  return '';
}

const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extOf(file.mimetype)}`),
  }),
  limits: { fileSize: 60 * 1024 * 1024 },
});

export async function migrateChat(db: { query: (q: string, v?: any[]) => Promise<any> } = pool) {
  await db.query(`
    create table if not exists messages (
      id text primary key, family_id text not null references families(id), author_id text not null references members(id),
      kind text not null, text text, media text, sticker text, seconds real, reply_to text,
      created_at timestamptz not null default now()
    );
    create index if not exists messages_family on messages (family_id, created_at desc);
    create table if not exists message_reads (member_id text primary key references members(id), at timestamptz not null default now());
  `);
}

const clients = new Map<string, Set<express.Response>>();

function broadcast(familyId: string, msg: unknown) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients.get(familyId) ?? []) res.write(data);
}

const h = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Lỗi máy chủ' });
  });

const COLS = 'id, author_id, kind, text, media, sticker, seconds, reply_to, created_at';

/** Luồng tin mới (SSE). Gắn TRƯỚC auth, tự kiểm tra ?token= vì EventSource không gửi được header. */
export const chatStreamRouter = express.Router();
chatStreamRouter.get('/chat/stream', h(async (req, res) => {
  const token = String(req.query.token || String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
  if (!token) return res.status(401).json({ error: 'Chưa vào nhà' });
  const { rows } = await pool.query('select id, family_id from members where token = $1', [token]);
  if (!rows[0]) return res.status(401).json({ error: 'Chưa vào nhà' });
  const fid: string = rows[0].family_id;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  let set = clients.get(fid);
  if (!set) clients.set(fid, (set = new Set()));
  set.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    set!.delete(res);
    if (!set!.size) clients.delete(fid);
  });
}));

export const chatRouter = express.Router();

chatRouter.get('/chat', h(async (req, res) => {
  const fid = req.member.family_id;
  const after = req.query.after ? new Date(String(req.query.after)) : null;
  if (after && !isNaN(after.getTime())) {
    const { rows } = await pool.query(`select ${COLS} from messages where family_id = $1 and created_at > $2 order by created_at limit 200`, [fid, after]);
    return res.json(rows);
  }
  const { rows } = await pool.query(`select * from (select ${COLS} from messages where family_id = $1 order by created_at desc limit 100) t order by created_at`, [fid]);
  res.json(rows);
}));

chatRouter.post('/chat', upload.single('file'), h(async (req, res) => {
  const b = req.body;
  const kind = ['text', 'sticker', 'photo', 'voice'].includes(b.kind) ? b.kind : 'text';
  const text = String(b.text || '').trim().slice(0, 2000) || null;
  const sticker = String(b.sticker || '').slice(0, 40) || null;
  if (kind === 'text' && !text) return res.status(400).json({ error: 'Chưa có chữ' });
  if (kind === 'sticker' && !sticker) return res.status(400).json({ error: 'Chưa chọn hình' });
  if ((kind === 'photo' || kind === 'voice') && !req.file) return res.status(400).json({ error: 'Thiếu ảnh hoặc ghi âm' });
  const { rows } = await pool.query(
    `insert into messages (id, family_id, author_id, kind, text, media, sticker, seconds, reply_to) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${COLS}`,
    [randomUUID(), req.member.family_id, req.member.id, kind, text, req.file ? `/media/${req.file.filename}` : null, sticker,
      Number(b.seconds) || null, b.reply_to ? String(b.reply_to) : null],
  );
  await pool.query('insert into message_reads (member_id, at) values ($1, now()) on conflict (member_id) do update set at = now()', [req.member.id]);
  broadcast(req.member.family_id, rows[0]);
  notifyChat(req.member.family_id, req.member.id, rows[0]);
  res.json(rows[0]);
}));

chatRouter.post('/chat/read', h(async (req, res) => {
  await pool.query('insert into message_reads (member_id, at) values ($1, now()) on conflict (member_id) do update set at = now()', [req.member.id]);
  res.json({ ok: true });
}));

chatRouter.get('/chat/unread', h(async (req, res) => {
  const { rows } = await pool.query(
    `select count(*)::int n from messages where family_id = $1 and author_id <> $2
     and created_at > coalesce((select at from message_reads where member_id = $2), 'epoch')`,
    [req.member.family_id, req.member.id],
  );
  res.json({ n: rows[0].n });
}));
