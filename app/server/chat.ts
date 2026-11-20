// Chat trong nhà: một luồng "cả nhà" và mỗi cặp hai người một luồng tin riêng.
// Tin riêng có to_id (người nhận); to_id null là tin cả nhà (mọi tin cũ nằm ở đây). Mọi đường đều nhận ?with=<mã người kia>,
// không có là luồng cả nhà. Tin riêng chỉ hai người thấy: danh sách, kênh tức thời, thông báo, dịch đều kiểm điều đó.
// Kiểm bằng server/chat.test.ts (DB giả theo từng câu lệnh trong SQL bên dưới, không cần Postgres).
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pool } from './db.ts';
import { notifyChat, notifyChatTo } from './push.ts';
import { errorBody, tReq } from './i18n.ts';
import { warmThumbs } from './thumb.ts';
import { migrateTranslate, purgeOrphanTranslations, translateRouter } from './translate.ts';

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

export type Db = { query: (q: string, v?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export async function migrateChat(db: Db = pool) {
  await db.query(`
    create table if not exists messages (
      id text primary key, family_id text not null references families(id), author_id text not null references members(id),
      kind text not null, text text, media text, sticker text, seconds real, reply_to text,
      created_at timestamptz not null default now()
    );
    create index if not exists messages_family on messages (family_id, created_at desc);
    create table if not exists message_reads (member_id text primary key references members(id), at timestamptz not null default now());
  `);
  // Tin riêng: to_id là người nhận (null là tin cả nhà). read_at: lúc người nhận mở luồng tin riêng, dùng đếm tin chưa đọc.
  // Mốc đã đọc của luồng cả nhà vẫn ở message_reads như cũ. Chạy lại mỗi lần khởi động không sao.
  await db.query(`
    alter table messages add column if not exists to_id text references members(id);
    alter table messages add column if not exists read_at timestamptz;
    create index if not exists messages_dm on messages (to_id, author_id, created_at desc) where to_id is not null;
  `);
  await migrateTranslate(db);
  await purgeOrphanTranslations(db);
}

// ---------- Kênh tức thời (SSE) ----------

const clients = new Map<string, Set<express.Response>>();

/** Gửi một tin cho các máy đang mở kênh của nhà. only: chỉ những người này (tin riêng chỉ tới hai người trong cuộc). */
export function broadcast(familyId: string, msg: unknown, only?: string[]) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients.get(familyId) ?? []) {
    if (only && !only.includes(res.locals.memberId)) continue;
    res.write(data);
  }
}

/** Tin này tới máy của ai: tin cả nhà thì mọi người trong nhà, tin riêng thì chỉ người gửi và người nhận. */
export const audience = (m: { author_id: string; to_id?: string | null }) => (m.to_id ? [m.author_id, m.to_id] : undefined);

const h = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || tReq('error.server') });
  });

/** Luồng tin mới (SSE). Gắn TRƯỚC auth, tự kiểm tra ?token= vì EventSource không gửi được header. */
export function makeChatStreamRouter(db: Db = pool) {
  const r = express.Router();
  r.get('/chat/stream', h(async (req, res) => {
    const token = String(req.query.token || String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
    if (!token) return res.status(401).json(errorBody('not_signed_in'));
    const { rows } = await db.query('select id, family_id from members where token = $1', [token]);
    if (!rows[0]) return res.status(401).json(errorBody('not_signed_in'));
    const fid: string = rows[0].family_id;
    res.locals.memberId = rows[0].id;
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
  return r;
}
export const chatStreamRouter = makeChatStreamRouter();

/** Người vừa bị xoá khỏi nhà (members.ts): cắt luồng tin đang mở của người đó như khi máy tự rớt mạng (dọn ở req 'close').
 *  Máy nối lại sẽ nhận 401, không nghe được tin nhà nữa. */
export function closeChatStreams(familyId: string, memberId: string) {
  for (const res of [...(clients.get(familyId) ?? [])]) if (res.locals.memberId === memberId) res.destroy();
}

// ---------- Câu lệnh ----------

const COLS = 'id, author_id, to_id, kind, text, media, sticker, seconds, reply_to, created_at';
// Thêm thứ tiếng của người viết để máy khách biết tin nào cần nút dịch.
const COLS_LANG = `${COLS}, (select lang from members where id = author_id) as author_lang`;
/** Tin riêng giữa $2 (mình) và $3 (người kia), cả hai chiều. */
const PAIR = '((author_id = $2 and to_id = $3) or (author_id = $3 and to_id = $2))';
/** Người kia trong một tin riêng của $2. */
const PEER = 'case when author_id = $2 then to_id else author_id end';

/** Mọi câu SQL của chat ở một chỗ, để kiểm thử dựng DB giả đúng từng câu. */
export const SQL = {
  peer: 'select id from members where id = $1 and family_id = $2',
  familyAfter: `select ${COLS_LANG} from messages where family_id = $1 and to_id is null and created_at > $2 order by created_at limit 200`,
  familyRecent: `select * from (select ${COLS_LANG} from messages where family_id = $1 and to_id is null order by created_at desc limit 100) t order by created_at`,
  dmAfter: `select ${COLS_LANG} from messages where family_id = $1 and ${PAIR} and created_at > $4 order by created_at limit 200`,
  dmRecent: `select * from (select ${COLS_LANG} from messages where family_id = $1 and ${PAIR} order by created_at desc limit 100) t order by created_at`,
  insert: `insert into messages (id, family_id, author_id, to_id, kind, text, media, sticker, seconds, reply_to) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning ${COLS_LANG}`,
  readFamily: 'insert into message_reads (member_id, at) values ($1, now()) on conflict (member_id) do update set at = now()',
  readDm: 'update messages set read_at = now() where family_id = $1 and to_id = $2 and author_id = $3 and read_at is null',
  unreadFamily: `select count(*)::int n from messages where family_id = $1 and to_id is null and author_id <> $2
     and created_at > coalesce((select at from message_reads where member_id = $2), 'epoch')`,
  unreadDm: 'select author_id, count(*)::int n from messages where family_id = $1 and to_id = $2 and read_at is null group by author_id',
  lastFamily: `select ${COLS_LANG} from messages where family_id = $1 and to_id is null order by created_at desc limit 1`,
  lastDm: `select distinct on (${PEER}) ${COLS_LANG}, ${PEER} as peer from messages
     where family_id = $1 and to_id is not null and (author_id = $2 or to_id = $2) order by ${PEER}, created_at desc`,
};

type Me = { id: string; family_id: string };

/** Đọc ?with=: không có là luồng cả nhà (null). Có thì người kia phải ở cùng nhà và không phải chính mình, không thì undefined (404). */
async function threadOf(db: Db, me: Me, raw: unknown): Promise<string | null | undefined> {
  const w = typeof raw === 'string' ? raw.trim() : '';
  if (!w) return null;
  if (w === me.id) return undefined;
  const { rows } = await db.query(SQL.peer, [w, me.family_id]);
  return rows[0] ? w : undefined;
}

/** Số tin chưa đọc: luồng cả nhà, từng luồng riêng (theo mã người gửi), và tổng. */
export async function unreadOf(db: Db, me: Me) {
  const [{ rows: [f] }, { rows: dm }] = await Promise.all([
    db.query(SQL.unreadFamily, [me.family_id, me.id]),
    db.query(SQL.unreadDm, [me.family_id, me.id]),
  ]);
  const people: Record<string, number> = {};
  for (const r of dm) people[r.author_id] = Number(r.n) || 0;
  const family = Number(f?.n ?? 0);
  return { n: family + Object.values(people).reduce((a, b) => a + b, 0), family, people };
}

export type ChatDeps = {
  db: Db;
  /** Thông báo tin cả nhà (mọi người trừ người gửi). */
  notifyFamily: (familyId: string, authorId: string, m: { kind: string; text?: string | null }) => void;
  /** Thông báo tin riêng: chỉ người nhận. */
  notifyTo: (familyId: string, authorId: string, toId: string, m: { kind: string; text?: string | null }) => void;
};
const defaults: ChatDeps = { db: pool, notifyFamily: notifyChat, notifyTo: notifyChatTo };

export function makeChatRouter(deps: ChatDeps = defaults) {
  const { db } = deps;
  const r = express.Router();
  r.use(translateRouter);

  r.get('/chat', h(async (req, res) => {
    const me: Me = req.member;
    const peer = await threadOf(db, me, req.query.with);
    if (peer === undefined) return res.status(404).json(errorBody('member_not_found'));
    const after = req.query.after ? new Date(String(req.query.after)) : null;
    const since = after && !isNaN(after.getTime()) ? after : null;
    const { rows } = peer
      ? await db.query(since ? SQL.dmAfter : SQL.dmRecent, since ? [me.family_id, me.id, peer, since] : [me.family_id, me.id, peer])
      : await db.query(since ? SQL.familyAfter : SQL.familyRecent, since ? [me.family_id, since] : [me.family_id]);
    res.json(rows);
  }));

  r.post('/chat', upload.single('file'), h(async (req, res) => {
    const me: Me = req.member;
    const peer = await threadOf(db, me, req.query.with);
    if (peer === undefined) return res.status(404).json(errorBody('member_not_found'));
    const b = req.body ?? {};
    const kind = ['text', 'sticker', 'photo', 'voice'].includes(b.kind) ? b.kind : 'text';
    const text = String(b.text || '').trim().slice(0, 2000) || null;
    const sticker = String(b.sticker || '').slice(0, 40) || null;
    if (kind === 'text' && !text) return res.status(400).json(errorBody('chat_no_text'));
    if (kind === 'sticker' && !sticker) return res.status(400).json(errorBody('chat_no_sticker'));
    if ((kind === 'photo' || kind === 'voice') && !req.file) return res.status(400).json(errorBody('missing_media'));
    const { rows } = await db.query(SQL.insert, [randomUUID(), me.family_id, me.id, peer, kind, text, req.file ? `/media/${req.file.filename}` : null, sticker,
      Number(b.seconds) || null, b.reply_to ? String(b.reply_to) : null]);
    const m = rows[0];
    // Mình vừa nhắn vào luồng nào thì coi như đã đọc luồng đó.
    if (peer) await db.query(SQL.readDm, [me.family_id, me.id, peer]);
    else await db.query(SQL.readFamily, [me.id]);
    if (kind === 'photo') warmThumbs(MEDIA_DIR, m.media, [1080]);
    broadcast(me.family_id, m, audience(m));
    if (peer) deps.notifyTo(me.family_id, me.id, peer, m);
    else deps.notifyFamily(me.family_id, me.id, m);
    res.json(m);
  }));

  r.post('/chat/read', h(async (req, res) => {
    const me: Me = req.member;
    const peer = await threadOf(db, me, req.query.with);
    if (peer === undefined) return res.status(404).json(errorBody('member_not_found'));
    if (peer) await db.query(SQL.readDm, [me.family_id, me.id, peer]);
    else await db.query(SQL.readFamily, [me.id]);
    res.json({ ok: true });
  }));

  // n: tổng tin chưa đọc (cả nhà và tin riêng gửi cho mình), cho số trên thanh dưới.
  r.get('/chat/unread', h(async (req, res) => {
    res.json(await unreadOf(db, req.member));
  }));

  // Danh sách luồng: tin cuối và số chưa đọc của luồng cả nhà và từng luồng riêng của mình.
  r.get('/chat/threads', h(async (req, res) => {
    const me: Me = req.member;
    const [unread, { rows: [lastF] }, { rows: lastD }] = await Promise.all([
      unreadOf(db, me),
      db.query(SQL.lastFamily, [me.family_id]),
      db.query(SQL.lastDm, [me.family_id, me.id]),
    ]);
    const people: Record<string, { last: unknown; unread: number }> = {};
    for (const { peer, ...m } of lastD) people[peer] = { last: m, unread: unread.people[peer] ?? 0 };
    for (const [id, n] of Object.entries(unread.people)) people[id] ??= { last: null, unread: n };
    res.json({ family: { last: lastF ?? null, unread: unread.family }, people });
  }));

  return r;
}
export const chatRouter = makeChatRouter();
