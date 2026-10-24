// Thông báo đẩy (Web Push): báo cho người trong nhà khi app đang đóng.
// Khoá VAPID tự sinh lần đầu và lưu trong app_settings; có VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY thì dùng chúng.
// Gửi không bao giờ làm hỏng yêu cầu chính: mọi lời gọi đều chạy nền, lỗi chỉ ghi log.
import express from 'express';
import type pg from 'pg';
import webpush from 'web-push';
import { pool } from './db.ts';
import { errorBody, tVi } from './i18n.ts';
import { upcoming } from './calendar.ts';
import { weekKey } from './recap.ts';

export type PushKind = 'call' | 'chat' | 'post' | 'calendar' | 'weekly';
export type PushPayload = {
  kind: PushKind;
  title: string;
  body?: string;
  tag?: string;
  /** Màn cần mở khi chạm: call, chat, post, calendar, weekly. */
  open?: string;
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
};

const KINDS: PushKind[] = ['call', 'chat', 'post', 'calendar', 'weekly'];
type Prefs = Record<PushKind, boolean>;
const DEFAULT_PREFS: Prefs = { call: true, chat: true, post: true, calendar: true, weekly: true };

export async function migratePush(p: pg.Pool) {
  await p.query(`
    create table if not exists app_settings (key text primary key, value text not null);
    create table if not exists push_subs (
      endpoint text primary key, member_id text not null references members(id) on delete cascade, family_id text not null,
      p256dh text not null, auth text not null, ua text, created_at timestamptz not null default now()
    );
    create index if not exists push_subs_family on push_subs (family_id);
    create table if not exists push_prefs (member_id text primary key references members(id) on delete cascade, prefs text not null);
    create table if not exists push_sent (key text primary key, at timestamptz not null default now());
  `);
  await setupVapid(p);
}

let publicKey = '';

async function setupVapid(p: pg.Pool) {
  let keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : null;
  if (!keys) {
    const fresh = webpush.generateVAPIDKeys();
    await p.query(`insert into app_settings (key, value) values ('vapid', $1) on conflict (key) do nothing`, [JSON.stringify(fresh)]);
    const { rows } = await p.query(`select value from app_settings where key = 'vapid'`);
    keys = JSON.parse(rows[0].value);
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@homeletter.app', keys!.publicKey, keys!.privateKey);
  publicKey = keys!.publicKey;
}

async function prefsOf(memberId: string): Promise<Prefs> {
  const { rows } = await pool.query('select prefs from push_prefs where member_id = $1', [memberId]);
  let saved: Partial<Prefs> = {};
  try { if (rows[0]) saved = JSON.parse(rows[0].prefs); } catch {}
  return { ...DEFAULT_PREFS, ...saved };
}

type SubRow = { endpoint: string; member_id: string; p256dh: string; auth: string; prefs: string | null };

async function deliver(subs: SubRow[], payload: PushPayload) {
  const body = JSON.stringify(payload);
  const opts = { TTL: payload.ttl ?? 6 * 3600, urgency: payload.urgency ?? 'normal' } as const;
  await Promise.all(subs.map(async (s) => {
    let prefs: Partial<Prefs> = {};
    try { if (s.prefs) prefs = JSON.parse(s.prefs); } catch {}
    if (prefs[payload.kind] === false) return;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, opts);
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await pool.query('delete from push_subs where endpoint = $1', [s.endpoint]).catch(() => {});
      } else console.error('[push] gửi lỗi:', e?.statusCode ?? '', e?.body || e?.message || e);
    }
  }));
}

const SUB_COLS = 's.endpoint, s.member_id, s.p256dh, s.auth, p.prefs';

/** Gửi cho mọi người trong nhà trừ người gây ra sự kiện. Chạy nền, không bao giờ ném lỗi. */
export function notifyFamily(familyId: string, exceptMemberId: string | null, payload: PushPayload) {
  return (async () => {
    const { rows } = await pool.query(
      `select ${SUB_COLS} from push_subs s left join push_prefs p on p.member_id = s.member_id
       where s.family_id = $1 and s.member_id is distinct from $2`, [familyId, exceptMemberId]);
    await deliver(rows, payload);
  })().catch((e) => console.error('[push]', e));
}

export function notifyMembers(memberIds: string[], payload: PushPayload) {
  return (async () => {
    if (!memberIds.length) return;
    const { rows } = await pool.query(
      `select ${SUB_COLS} from push_subs s left join push_prefs p on p.member_id = s.member_id where s.member_id = any($1)`, [memberIds]);
    await deliver(rows, payload);
  })().catch((e) => console.error('[push]', e));
}

async function nameOf(memberId: string) {
  const { rows } = await pool.query('select name from members where id = $1', [memberId]);
  return (rows[0]?.name as string) || tVi('push.someone');
}

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// ---- Các sự kiện ----

/** Có người mở cuộc gọi video cả nhà. */
export function notifyCall(familyId: string, memberId: string) {
  void nameOf(memberId).then((name) => notifyFamily(familyId, memberId, {
    kind: 'call', title: tVi('push.call.title', { name }), body: tVi('push.call.body'), tag: 'call', open: 'call', ttl: 45, urgency: 'high',
  })).catch((e) => console.error('[push]', e));
}

const POST_KINDS = ['photo', 'video', 'voice', 'hug'];

/** Bài mới trong Tin nhà (ảnh, video, giọng nói, cái ôm). */
export function notifyPost(familyId: string, memberId: string, kind: string, caption?: string | null) {
  void nameOf(memberId).then((name) => notifyFamily(familyId, memberId, {
    kind: 'post', title: tVi(`push.post.${POST_KINDS.includes(kind) ? kind : 'photo'}`, { name }), body: caption ? short(caption) : undefined,
    tag: kind === 'hug' ? 'hug' : `post-${memberId}`, open: 'post',
  })).catch((e) => console.error('[push]', e));
}

/** Có người trả lời hoặc thả cảm xúc vào tin của mình: chỉ báo cho người đăng. */
export function notifyReply(postId: string, memberId: string, what: { text?: string | null; emoji?: string }) {
  void (async () => {
    const { rows } = await pool.query('select author_id from posts where id = $1', [postId]);
    const author = rows[0]?.author_id;
    if (!author || author === memberId) return;
    const name = await nameOf(memberId);
    const title = what.emoji ? tVi('push.reply.emoji', { name, emoji: what.emoji }) : tVi('push.reply.text', { name });
    await notifyMembers([author], { kind: 'post', title, body: what.text ? short(what.text) : undefined, tag: `reply-${postId}`, open: 'post' });
  })().catch((e) => console.error('[push]', e));
}

// Tin nhắn: gộp các tin liên tiếp của một người, chờ yên 4 giây (tối đa 12 giây) rồi mới gửi.
const CHAT_QUIET = 4000, CHAT_MAX = 12000;
const pending = new Map<string, { fid: string; mid: string; n: number; last: string; first: number; timer: ReturnType<typeof setTimeout> }>();

function chatLine(m: { kind: string; text?: string | null }) {
  if (m.kind === 'sticker') return tVi('push.chat.sticker');
  if (m.kind === 'photo') return tVi('push.chat.photo');
  if (m.kind === 'voice') return tVi('push.chat.voice');
  return short(String(m.text || ''), 120);
}

export function notifyChat(familyId: string, memberId: string, m: { kind: string; text?: string | null }) {
  const key = `${familyId}:${memberId}`;
  const now = Date.now();
  const p = pending.get(key);
  const fire = () => {
    const q = pending.get(key);
    if (!q) return;
    pending.delete(key);
    void nameOf(q.mid).then((name) => notifyFamily(q.fid, q.mid, {
      kind: 'chat', title: q.n > 1 ? tVi('push.chat.many', { name, n: q.n }) : name, body: q.last, tag: `chat-${q.mid}`, open: 'chat', ttl: 24 * 3600,
    })).catch((e) => console.error('[push]', e));
  };
  if (p) {
    clearTimeout(p.timer);
    p.n++;
    p.last = chatLine(m);
    p.timer = setTimeout(fire, Math.max(0, Math.min(CHAT_QUIET, p.first + CHAT_MAX - now)));
  } else {
    pending.set(key, { fid: familyId, mid: memberId, n: 1, last: chatLine(m), first: now, timer: setTimeout(fire, CHAT_QUIET) });
  }
}

// ---- Bộ hẹn giờ: nhắc lịch và cuộc gọi tuần ----

/** Ghi dấu đã gửi; trả về true nếu là lần đầu. */
async function once(key: string) {
  const { rowCount } = await pool.query('insert into push_sent (key) values ($1) on conflict do nothing', [key]);
  return !!rowCount;
}

const vnNow = () => new Date(Date.now() + 7 * 3600e3);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

async function calendarTick() {
  const vn = vnNow();
  const h = vn.getUTCHours();
  if (h < 8 || h >= 21) return;
  const { rows: fams } = await pool.query('select distinct family_id from push_subs');
  for (const { family_id: fid } of fams) {
    for (const e of await upcoming(pool, fid, 1)) {
      if (e.inDays > 1) continue;
      if (!(await once(`cal:${fid}:${e.id}:${e.date}:${e.inDays}`))) continue;
      // Tên sinh nhật có dạng "Sinh nhật <tên>" (calendarGen.dobTitle): tách lấy tên.
      const pre = tVi('calendarGen.dobTitle', { name: '' });
      const birthday = e.kind === 'birthday' && e.title.startsWith(pre);
      const who = birthday ? e.title.slice(pre.length) : '';
      const when = tVi(e.inDays === 0 ? 'push.cal.today' : 'push.cal.tomorrow');
      const title = tVi('push.cal.title', { when, what: lower(e.title) });
      const body = birthday
        ? (e.inDays === 0 ? tVi('push.cal.wishToday', { who }) : tVi('push.cal.wishTomorrow'))
        : e.years ? tVi('push.cal.years', { n: e.years }) : undefined;
      // Sinh nhật của ai thì không báo cho chính người đó.
      const except = e.id.startsWith('dob-') ? e.id.slice(4) : null;
      await notifyFamily(fid, except, { kind: 'calendar', title, body, tag: `cal-${e.id}`, open: 'calendar', ttl: 12 * 3600 });
    }
  }
}

// Cùng công thức với server/call.ts: từ 9 giờ sáng thứ Bảy đến hết Chủ nhật (giờ Việt Nam).
const CALL_FROM = { weekday: 5, hour: 9 }; // 0 = thứ Hai

async function weeklyTick() {
  const vn = vnNow();
  const day = (vn.getUTCDay() + 6) % 7;
  const h = vn.getUTCHours();
  const due = day > CALL_FROM.weekday || (day === CALL_FROM.weekday && h >= CALL_FROM.hour);
  if (!due || h < CALL_FROM.hour || h >= 21) return;
  const week = weekKey();
  const { rows } = await pool.query(
    `select distinct s.member_id from push_subs s
     join members m on m.id = s.member_id and m.created_at < now() - interval '24 hours'
     where not exists (select 1 from calls c where c.member_id = s.member_id and c.week = $1 and c.status = 'done')`, [week]);
  for (const { member_id: mid } of rows) {
    if (!(await once(`weekly:${mid}:${week}`))) continue;
    await notifyMembers([mid], {
      kind: 'weekly', title: tVi('push.weekly.title'), body: tVi('push.weekly.body'), tag: 'weekly', open: 'weekly', ttl: 6 * 3600,
    });
  }
}

/** Một lượt kiểm tra nhắc lịch và cuộc gọi tuần. Nhiều máy chủ chạy cùng lúc vẫn chỉ gửi một lần nhờ push_sent. */
export function pushTick() {
  return Promise.all([
    calendarTick().catch((e) => console.error('[push] nhắc lịch:', e)),
    weeklyTick().catch((e) => console.error('[push] nhắc gọi tuần:', e)),
  ]);
}

let started = false;
export function startPushScheduler() {
  if (started) return;
  started = true;
  setTimeout(() => void pushTick(), 15000);
  setInterval(() => void pushTick(), 60000);
}

// ---- Đường API (gắn sau auth) ----

const hh = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || tVi('error.server') });
  });

export const pushRouter = express.Router();

pushRouter.get('/push/key', (_req, res) => { res.json({ key: publicKey }); });

pushRouter.post('/push/subscribe', hh(async (req, res) => {
  const s = req.body?.subscription ?? req.body;
  const endpoint = String(s?.endpoint || '');
  const p256dh = String(s?.keys?.p256dh || ''), authKey = String(s?.keys?.auth || '');
  if (!/^https:\/\//.test(endpoint) || !p256dh || !authKey) return res.status(400).json(errorBody('push_bad_subscription'));
  await pool.query(
    `insert into push_subs (endpoint, member_id, family_id, p256dh, auth, ua) values ($1,$2,$3,$4,$5,$6)
     on conflict (endpoint) do update set member_id = excluded.member_id, family_id = excluded.family_id,
       p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua`,
    [endpoint.slice(0, 1000), req.member.id, req.member.family_id, p256dh.slice(0, 200), authKey.slice(0, 100),
      String(req.headers['user-agent'] || '').slice(0, 300)],
  );
  res.json({ ok: true });
}));

pushRouter.post('/push/unsubscribe', hh(async (req, res) => {
  await pool.query('delete from push_subs where endpoint = $1 and member_id = $2', [String(req.body?.endpoint || ''), req.member.id]);
  res.json({ ok: true });
}));

pushRouter.get('/push/prefs', hh(async (req, res) => { res.json(await prefsOf(req.member.id)); }));

pushRouter.put('/push/prefs', hh(async (req, res) => {
  const next = await prefsOf(req.member.id);
  for (const k of KINDS) if (typeof req.body?.[k] === 'boolean') next[k] = req.body[k];
  await pool.query(
    'insert into push_prefs (member_id, prefs) values ($1,$2) on conflict (member_id) do update set prefs = excluded.prefs',
    [req.member.id, JSON.stringify(next)],
  );
  res.json(next);
}));
