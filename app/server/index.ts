import './env.ts';
import express from 'express';
import multer from 'multer';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Member, Post, Reply, Week } from '../src/shared.ts';
import { migrate, pool } from './db.ts';
import { calendarRouter, migrateCalendar } from './calendar.ts';
import { jarRouter, migrateJar } from './jar.ts';
import { homeRouter } from './home.ts';
import { chatRouter, chatStreamRouter, migrateChat } from './chat.ts';
import { migrateRecap, recapRouter, startRecapScheduler } from './recap.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
mkdirSync(MEDIA_DIR, { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extOf(file.mimetype)}`),
  }),
  limits: { fileSize: 60 * 1024 * 1024 },
});

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

const id = () => randomUUID();
const media = (file?: Express.Multer.File) => (file ? `/media/${file.filename}` : null);

type Req = express.Request & { member?: { id: string; family_id: string } };
const h = (fn: (req: Req, res: express.Response) => Promise<unknown>) => (req: Req, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Lỗi máy chủ' });
  });

// Không mật khẩu: mỗi máy giữ một mã riêng, gửi kèm mọi lần gọi. Mỗi lần gọi cũng là một lần "còn hoạt động".
async function auth(req: Req, res: express.Response, next: express.NextFunction) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Chưa vào nhà' });
  const { rows } = await pool.query('update members set last_seen = now() where token = $1 returning id, family_id', [token]);
  if (!rows[0]) return res.status(401).json({ error: 'Chưa vào nhà' });
  req.member = rows[0];
  next();
}

function memberRow(r: any): Member {
  return { id: r.id, name: r.name, role: r.role, avatar: r.avatar, city: r.city, phone: r.phone, lastSeen: r.last_seen };
}

async function newCode() {
  for (;;) {
    const code = String(randomInt(100000, 1000000));
    const { rowCount } = await pool.query('select 1 from families where code = $1', [code]);
    if (!rowCount) return code;
  }
}

async function addMember(familyId: string, b: any) {
  const token = randomBytes(24).toString('base64url');
  await pool.query('insert into members (id, family_id, name, role, token, city, intro) values ($1,$2,$3,$4,$5,$6,$7)', [
    id(), familyId, String(b.name || '').slice(0, 30) || 'Mình', ['bo', 'me', 'con'].includes(b.role) ? b.role : 'con', token,
    b.city ? String(b.city).slice(0, 300) : null, b.intro ? JSON.stringify(b.intro).slice(0, 4000) : null,
  ]);
  return token;
}

app.post('/api/families', h(async (req, res) => {
  const fid = id();
  await pool.query('insert into families (id, name, code) values ($1,$2,$3)', [fid, String(req.body.family || 'Nhà mình').slice(0, 40), await newCode()]);
  res.json({ token: await addMember(fid, req.body) });
}));

app.post('/api/join', h(async (req, res) => {
  const { rows } = await pool.query('select id from families where code = $1', [String(req.body.code || '').trim()]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy nhà với mã này' });
  res.json({ token: await addMember(rows[0].id, req.body) });
}));

app.get('/api/family/:code', h(async (req, res) => {
  const { rows } = await pool.query('select name from families where code = $1', [req.params.code]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy nhà' });
  res.json({ name: rows[0].name });
}));

app.use('/api', chatStreamRouter);
app.use('/api', auth as express.RequestHandler);
app.use('/api', calendarRouter);
app.use('/api', jarRouter);
app.use('/api', homeRouter);
app.use('/api', chatRouter);
app.use('/api', recapRouter);

app.get('/api/me', h(async (req, res) => {
  const m = req.member!;
  const [f, ms, unseen] = await Promise.all([
    pool.query('select id, name, code from families where id = $1', [m.family_id]),
    pool.query('select * from members where family_id = $1 order by created_at', [m.family_id]),
    pool.query(
      `select count(*)::int n from posts p where p.family_id = $1 and p.author_id <> $2
       and p.created_at > coalesce((select at from seen where member_id = $2), 'epoch')`, [m.family_id, m.id]),
  ]);
  const members = ms.rows.map(memberRow);
  res.json({ family: f.rows[0], me: members.find((x) => x.id === m.id), members, unseen: unseen.rows[0].n });
}));

app.patch('/api/me', upload.single('avatar'), h(async (req, res) => {
  const b = req.body;
  await pool.query(
    `update members set name = coalesce($2, name), role = coalesce($3, role), city = coalesce($4, city),
     phone = coalesce($5, phone), avatar = coalesce($6, avatar) where id = $1`,
    [req.member!.id, b.name || null, ['bo', 'me', 'con'].includes(b.role) ? b.role : null, b.city || null, b.phone ?? null, media(req.file)],
  );
  res.json({ ok: true });
}));

app.get('/api/feed', h(async (req, res) => {
  const fid = req.member!.family_id;
  const { rows } = await pool.query('select * from posts where family_id = $1 order by created_at desc limit 80', [fid]);
  const ids = rows.map((r) => r.id);
  const [rx, rp] = await Promise.all([
    pool.query('select * from reactions where post_id = any($1)', [ids]),
    pool.query('select * from replies where post_id = any($1) order by created_at', [ids]),
  ]);
  const posts: Post[] = rows.map((r) => ({
    id: r.id, authorId: r.author_id, kind: r.kind, media: r.media, caption: r.caption, meal: r.meal, seconds: r.seconds,
    questionWeek: r.question_week, createdAt: r.created_at,
    reactions: Object.fromEntries(rx.rows.filter((x) => x.post_id === r.id).map((x) => [x.member_id, x.emoji])),
    replies: rp.rows.filter((x) => x.post_id === r.id).map((x): Reply => ({
      id: x.id, authorId: x.author_id, kind: x.kind, media: x.media, text: x.text, seconds: x.seconds, createdAt: x.created_at,
    })),
  }));
  await pool.query('insert into seen (member_id, at) values ($1, now()) on conflict (member_id) do update set at = now()', [req.member!.id]);
  res.json(posts);
}));

app.post('/api/posts', upload.single('file'), h(async (req, res) => {
  const b = req.body;
  const kind = ['photo', 'video', 'voice', 'hug'].includes(b.kind) ? b.kind : 'photo';
  if (kind !== 'hug' && !req.file) return res.status(400).json({ error: 'Thiếu ảnh hoặc ghi âm' });
  await pool.query(
    'insert into posts (id, family_id, author_id, kind, media, caption, meal, seconds, question_week) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id(), req.member!.family_id, req.member!.id, kind, media(req.file), String(b.caption || '').slice(0, 120) || null,
      b.meal === 'true', Number(b.seconds) || null, b.questionWeek || null],
  );
  res.json({ ok: true });
}));

app.post('/api/posts/:id/react', h(async (req, res) => {
  const emoji = String(req.body.emoji || '');
  if (!emoji) await pool.query('delete from reactions where post_id = $1 and member_id = $2', [req.params.id, req.member!.id]);
  else await pool.query(
    'insert into reactions (post_id, member_id, emoji) values ($1,$2,$3) on conflict (post_id, member_id) do update set emoji = excluded.emoji',
    [req.params.id, req.member!.id, emoji],
  );
  res.json({ ok: true });
}));

app.post('/api/posts/:id/replies', upload.single('file'), h(async (req, res) => {
  await pool.query('insert into replies (id, post_id, author_id, kind, media, text, seconds) values ($1,$2,$3,$4,$5,$6,$7)', [
    id(), req.params.id, req.member!.id, req.file ? 'voice' : 'text', media(req.file), String(req.body.text || '').slice(0, 300) || null,
    Number(req.body.seconds) || null,
  ]);
  res.json({ ok: true });
}));

app.delete('/api/posts/:id', h(async (req, res) => {
  await pool.query('delete from posts where id = $1 and author_id = $2', [req.params.id, req.member!.id]);
  res.json({ ok: true });
}));

// Tuần tính từ thứ Hai, theo giờ Việt Nam.
function weekKey(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const day = (t.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

const QUESTIONS = [
  'Món ăn nào làm bạn nhớ nhà nhất?',
  'Kỷ niệm vui nhất của cả nhà mà bạn còn nhớ?',
  'Hồi nhỏ, ước mơ của bạn là gì?',
  'Có câu nào bố mẹ hay nói mà bạn nhớ mãi?',
  'Lần gần nhất cả nhà ăn cơm đủ mặt là khi nào?',
  'Bạn muốn cả nhà cùng đi đâu nhất?',
  'Ngày nào trong năm với bạn là đặc biệt nhất?',
  'Điều gì làm bạn tự hào về gia đình mình?',
  'Bài hát nào làm bạn nghĩ tới nhà?',
  'Hôm nay có chuyện gì nhỏ mà vui không?',
];

const MISSIONS = [
  { key: 'call', text: 'Gọi điện cho một người trong nhà', points: 2 },
  { key: 'video', text: 'Gửi một video ngắn', points: 2 },
  { key: 'love', text: 'Nói "thương" với một người trong nhà', points: 3 },
  { key: 'meal', text: 'Chụp bữa cơm gửi cả nhà', points: 1 },
  { key: 'memory', text: 'Hỏi bố mẹ hoặc con một kỷ niệm', points: 2 },
];

const JAR = 40;

app.get('/api/week', h(async (req, res) => {
  const fid = req.member!.family_id;
  const week = weekKey();
  const start = new Date(`${week}T00:00:00+07:00`);
  const [counts, done, total, meals, top] = await Promise.all([
    pool.query('select kind, count(*)::int n from posts where family_id = $1 and created_at >= $2 group by kind', [fid, start]),
    pool.query('select mission, member_id from missions_done where family_id = $1 and week = $2', [fid, week]),
    pool.query(
      `select (select count(*) from posts where family_id = $1)
            + (select count(*) from replies r join posts p on p.id = r.post_id where p.family_id = $1)
            + (select coalesce(sum(case mission ${MISSIONS.map((m) => `when '${m.key}' then ${m.points}`).join(' ')} else 1 end), 0) from missions_done where family_id = $1)
       as points`, [fid]),
    pool.query('select * from posts where family_id = $1 and meal and created_at >= $2 order by created_at desc limit 9', [fid, start]),
    pool.query(
      `select p.*, (select count(*) from reactions r where r.post_id = p.id) n from posts p
       where family_id = $1 and created_at >= $2 and kind in ('photo','video') order by n desc, created_at desc limit 1`, [fid, start]),
  ]);
  const n = (k: string) => counts.rows.find((r) => r.kind === k)?.n ?? 0;
  const points = Number(total.rows[0].points);
  const lite = (r: any): Post => ({ id: r.id, authorId: r.author_id, kind: r.kind, media: r.media, caption: r.caption, meal: r.meal, createdAt: r.created_at, reactions: {}, replies: [] });
  const idx = Math.floor(start.getTime() / (7 * 86400e3)) % QUESTIONS.length;
  const body: Week = {
    week,
    question: QUESTIONS[idx],
    missions: MISSIONS.map((m) => {
      const by = done.rows.filter((d) => d.mission === m.key).map((d) => d.member_id);
      return { ...m, done: by.includes(req.member!.id), doneBy: by };
    }),
    jar: { points, level: points % JAR, capacity: JAR, gifts: Math.floor(points / JAR) },
    recap: { photos: n('photo'), videos: n('video'), voices: n('voice'), hugs: n('hug'), meals: meals.rows.map(lite), top: top.rows[0] ? lite(top.rows[0]) : null },
  };
  res.json(body);
}));

app.post('/api/missions/:key', h(async (req, res) => {
  if (!MISSIONS.some((m) => m.key === req.params.key)) return res.status(404).json({ error: 'Không có nhiệm vụ này' });
  await pool.query('insert into missions_done (family_id, member_id, mission, week) values ($1,$2,$3,$4) on conflict do nothing', [
    req.member!.family_id, req.member!.id, req.params.key, weekKey(),
  ]);
  res.json({ ok: true });
}));

app.use('/media', express.static(MEDIA_DIR, { maxAge: '30d', immutable: true }));

// Bản build của giao diện; mọi đường dẫn khác trả về index.html để app tự mở đúng màn.
const dist = path.resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api|\/media).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT || 3010);
await migrate();
await migrateCalendar(pool);
await migrateJar(pool);
await migrateChat(pool);
await migrateRecap(pool);
startRecapScheduler(pool);
app.listen(port, () => console.log(`Homeletter chạy ở cổng ${port}`));
