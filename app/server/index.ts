import './env.ts';
import express from 'express';
import compression from 'compression';
import multer from 'multer';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Member, Post, Reply, Week } from '../src/shared.ts';
import { migrate, pool } from './db.ts';
import { errorBody, isLang, tVi } from './i18n.ts';
import { calendarRouter, migrateCalendar } from './calendar.ts';
import { jarRouter, migrateJar } from './jar.ts';
import { homeRouter } from './home.ts';
import { chatRouter, chatStreamRouter, migrateChat } from './chat.ts';
import { migrateRecap, recapRouter, startRecapScheduler } from './recap.ts';
import { callRouter, migrateCall } from './call.ts';
import { buildFirstVoicePodcast, migratePodcast, podcastRouter } from './podcast.ts';
import { liveRouter, liveStreamRouter } from './facetime.ts';
import { migratePush, notifyPost, notifyReply, pushRouter, startPushScheduler } from './push.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
mkdirSync(MEDIA_DIR, { recursive: true });

const app = express();
app.set('trust proxy', 1);
// Nén chữ (JS, CSS, JSON) trước khi gửi: bản JS 400 kB còn khoảng 130 kB trên mạng 4G. Kênh SSE không nén để tin đến ngay.
app.use(compression({ filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res) }));
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
    res.status(500).json({ error: err.message || tVi('error.server') });
  });

// Không mật khẩu: mỗi máy giữ một mã riêng, gửi kèm mọi lần gọi. Mỗi lần gọi cũng là một lần "còn hoạt động".
async function auth(req: Req, res: express.Response, next: express.NextFunction) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json(errorBody('not_signed_in'));
  const { rows } = await pool.query('update members set last_seen = now() where token = $1 returning id, family_id', [token]);
  if (!rows[0]) return res.status(401).json(errorBody('not_signed_in'));
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
  // Khảo sát lúc mới vào: wantHug (muốn ôm) và loveVoice (có thu câu thương đầu tiên) chỉ nhận true/false, bản cũ không có các trường này.
  for (const k of ['wantHug', 'loveVoice']) {
    if (!b.intro || typeof b.intro !== 'object' || !(k in b.intro)) continue;
    const w = b.intro[k];
    if (w === true || w === 'true') b.intro[k] = true;
    else if (w === false || w === 'false') b.intro[k] = false;
    else delete b.intro[k];
  }
  await pool.query('insert into members (id, family_id, name, role, token, city, intro, lang) values ($1,$2,$3,$4,$5,$6,$7,$8)', [
    id(), familyId, String(b.name || '').slice(0, 30) || tVi('member.defaultName'), ['bo', 'me', 'con'].includes(b.role) ? b.role : 'con', token,
    b.city ? String(b.city).slice(0, 300) : null, b.intro ? JSON.stringify(b.intro).slice(0, 4000) : null, isLang(b.lang) ? b.lang : null,
  ]);
  return token;
}

app.post('/api/families', h(async (req, res) => {
  const fid = id();
  await pool.query('insert into families (id, name, code) values ($1,$2,$3)', [fid, String(req.body.family || tVi('family.defaultName')).slice(0, 40), await newCode()]);
  res.json({ token: await addMember(fid, req.body) });
}));

app.post('/api/join', h(async (req, res) => {
  const { rows } = await pool.query('select id from families where code = $1', [String(req.body.code || '').trim()]);
  if (!rows[0]) return res.status(404).json(errorBody('family_code_not_found'));
  res.json({ token: await addMember(rows[0].id, req.body) });
}));

app.get('/api/family/:code', h(async (req, res) => {
  const { rows } = await pool.query('select name from families where code = $1', [req.params.code]);
  if (!rows[0]) return res.status(404).json(errorBody('family_not_found'));
  res.json({ name: rows[0].name });
}));

// Số liệu gộp câu hỏi "có muốn ôm ngay không" lúc mới vào. Chỉ đếm, không lộ ai trả lời gì.
app.get('/api/survey/hug', h(async (_req, res) => {
  const { rows } = await pool.query(`select role, intro from members where intro like '%"wantHug"%'`);
  const out = { yes: 0, no: 0, total: 0, parent: { yes: 0, no: 0 }, child: { yes: 0, no: 0 } };
  for (const r of rows) {
    let w: unknown;
    try { w = JSON.parse(r.intro).wantHug; } catch { continue; }
    if (typeof w !== 'boolean') continue;
    const k = w ? 'yes' : 'no';
    out[k]++;
    out.total++;
    out[r.role === 'bo' || r.role === 'me' ? 'parent' : 'child'][k]++;
  }
  res.json({ ...out, rate: out.total ? Math.round((out.yes / out.total) * 100) / 100 : null });
}));

// Số liệu gộp: bao nhiêu người thu câu "thương" đầu tiên bằng giọng mình, bao nhiêu người để sau. Chỉ đếm.
app.get('/api/survey/voice', h(async (_req, res) => {
  const { rows } = await pool.query(`select role, intro from members where intro like '%"loveVoice"%'`);
  const out = { yes: 0, no: 0, total: 0, parent: { yes: 0, no: 0 }, child: { yes: 0, no: 0 } };
  for (const r of rows) {
    let w: unknown;
    try { w = JSON.parse(r.intro).loveVoice; } catch { continue; }
    if (typeof w !== 'boolean') continue;
    const k = w ? 'yes' : 'no';
    out[k]++;
    out.total++;
    out[r.role === 'bo' || r.role === 'me' ? 'parent' : 'child'][k]++;
  }
  res.json({ ...out, rate: out.total ? Math.round((out.yes / out.total) * 100) / 100 : null });
}));

app.use('/api', chatStreamRouter);
app.use('/api', liveStreamRouter);
app.use('/api', auth as express.RequestHandler);
app.use('/api', calendarRouter);
app.use('/api', jarRouter);
app.use('/api', homeRouter);
app.use('/api', chatRouter);
app.use('/api', recapRouter);
app.use('/api', callRouter(upload));
app.use('/api', podcastRouter);
app.use('/api', liveRouter);
app.use('/api', pushRouter);

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

// Ngôn ngữ máy đang dùng; lưu để sau này thông báo đẩy và lời AI nói đúng thứ tiếng.
app.put('/api/me/lang', h(async (req, res) => {
  const lang = req.body?.lang;
  if (!isLang(lang)) return res.status(400).json(errorBody('lang_invalid'));
  await pool.query('update members set lang = $2 where id = $1', [req.member!.id, lang]);
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
  if (kind !== 'hug' && !req.file) return res.status(400).json(errorBody('missing_media'));
  await pool.query(
    'insert into posts (id, family_id, author_id, kind, media, caption, meal, seconds, question_week) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id(), req.member!.family_id, req.member!.id, kind, media(req.file), String(b.caption || '').slice(0, 120) || null,
      b.meal === 'true', Number(b.seconds) || null, b.questionWeek || null],
  );
  notifyPost(req.member!.family_id, req.member!.id, kind, b.caption);
  res.json({ ok: true });
}));

// Câu "thương" đầu tiên thu lúc mới vào, gửi ngay sau khi tạo hoặc vào nhà: thành một tin giọng nói trong nhà
// và tập mở đầu trong album podcast của người đó. Mỗi người chỉ một lần.
app.post('/api/me/first-voice', upload.single('file'), h(async (req, res) => {
  const m = req.member!;
  if (!req.file || !req.file.mimetype.startsWith('audio/')) return res.status(400).json(errorBody('missing_audio'));
  const { rows: [me] } = await pool.query('select name from members where id = $1', [m.id]);
  // Chú thích này cũng là dấu để không tạo trùng, nên luôn là chữ tiếng Việt như bản cũ.
  const caption = tVi('post.firstVoice', { name: me.name });
  const { rowCount } = await pool.query(`select 1 from posts where author_id = $1 and kind = 'voice' and caption = $2`, [m.id, caption]);
  if (rowCount) return res.json({ ok: true });
  const url = media(req.file)!;
  await pool.query('insert into posts (id, family_id, author_id, kind, media, caption, seconds) values ($1,$2,$3,$4,$5,$6,$7)',
    [id(), m.family_id, m.id, 'voice', url, caption, Math.min(20, Number(req.body.seconds) || 0) || null]);
  notifyPost(m.family_id, m.id, 'voice', caption);
  void buildFirstVoicePodcast(m.family_id, m.id, me.name, url).catch((e) => console.error('[podcast] lời đầu tiên:', e));
  res.json({ ok: true });
}));

app.post('/api/posts/:id/react', h(async (req, res) => {
  const emoji = String(req.body.emoji || '');
  if (!emoji) await pool.query('delete from reactions where post_id = $1 and member_id = $2', [req.params.id, req.member!.id]);
  else await pool.query(
    'insert into reactions (post_id, member_id, emoji) values ($1,$2,$3) on conflict (post_id, member_id) do update set emoji = excluded.emoji',
    [req.params.id, req.member!.id, emoji],
  );
  if (emoji) notifyReply(req.params.id as string, req.member!.id, { emoji });
  res.json({ ok: true });
}));

app.post('/api/posts/:id/replies', upload.single('file'), h(async (req, res) => {
  await pool.query('insert into replies (id, post_id, author_id, kind, media, text, seconds) values ($1,$2,$3,$4,$5,$6,$7)', [
    id(), req.params.id, req.member!.id, req.file ? 'voice' : 'text', media(req.file), String(req.body.text || '').slice(0, 300) || null,
    Number(req.body.seconds) || null,
  ]);
  notifyReply(req.params.id as string, req.member!.id, { text: req.file ? tVi('post.voiceReply') : String(req.body.text || '') });
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

// Câu hỏi tuần (khoá week.q.1 đến week.q.10) và nhiệm vụ (khoá week.mission.<key>) nằm trong bảng chữ máy chủ.
const QUESTIONS = Array.from({ length: 10 }, (_, i) => `week.q.${i + 1}`);

const MISSIONS = [
  { key: 'call', points: 2 },
  { key: 'video', points: 2 },
  { key: 'love', points: 3 },
  { key: 'meal', points: 1 },
  { key: 'memory', points: 2 },
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
    question: tVi(QUESTIONS[idx]),
    missions: MISSIONS.map((m) => {
      const by = done.rows.filter((d) => d.mission === m.key).map((d) => d.member_id);
      return { key: m.key, text: tVi(`week.mission.${m.key}`), points: m.points, done: by.includes(req.member!.id), doneBy: by };
    }),
    jar: { points, level: points % JAR, capacity: JAR, gifts: Math.floor(points / JAR) },
    recap: { photos: n('photo'), videos: n('video'), voices: n('voice'), hugs: n('hug'), meals: meals.rows.map(lite), top: top.rows[0] ? lite(top.rows[0]) : null },
  };
  res.json(body);
}));

app.post('/api/missions/:key', h(async (req, res) => {
  if (!MISSIONS.some((m) => m.key === req.params.key)) return res.status(404).json(errorBody('mission_not_found'));
  await pool.query('insert into missions_done (family_id, member_id, mission, week) values ($1,$2,$3,$4) on conflict do nothing', [
    req.member!.family_id, req.member!.id, req.params.key, weekKey(),
  ]);
  res.json({ ok: true });
}));

app.use('/media', express.static(MEDIA_DIR, { maxAge: '30d', immutable: true }));

// Bản build của giao diện; mọi đường dẫn khác trả về index.html để app tự mở đúng màn.
const dist = path.resolve('dist');
if (existsSync(dist)) {
  // File trong assets có mã băm trong tên, giữ lâu được; các file khác giữ 1 giờ.
  app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api|\/media).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT || 3010);
await migrate();
await migrateCalendar(pool);
await migrateJar(pool);
await migrateChat(pool);
await migrateRecap(pool);
await migrateCall(pool);
await migratePodcast(pool);
await migratePush(pool);
startRecapScheduler(pool);
startPushScheduler();
app.listen(port, () => console.log(`Homeletter chạy ở cổng ${port}`));
