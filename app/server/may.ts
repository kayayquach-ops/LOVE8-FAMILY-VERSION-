// Hàng chờ tín hiệu và lời nhắc của Mây (20/11/2026): Mây thấy ai đó nhớ ai đó thì xếp một tín hiệu, tới hạn mới gửi lời nhắc.
// Xếp hàng: tìm người nhận từ lời kể, hạn đúng loại (planSignals, queueSignals). Gửi (mayTick mỗi phút): đúng người, trong khung giờ của
// người nhận, có trần ngày và tuần; bấm thông báo là gọi thoại ngay cho người kể; đo lời nhắc dẫn tới liên lạc (markContact, tin nhắn riêng).
// Chữ lời nhắc chỉ là câu mẫu i18n điền tên, vai, tên linh vật: không bao giờ trích câu gốc (evidence) hay lời trong cuộc gọi.
// Chỉ import kiểu từ memory.ts (memory.ts import file này lúc chạy). Chi tiết: docs/may-moi.md. Kiểm bằng server/may.test.ts.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { DEFAULT_MASCOT_NAME } from '../src/shared.ts';
import { pool } from './db.ts';
import { connectedIn } from './facetime.ts';
import { errorBody, tServer, type Lang } from './i18n.ts';
import type { SignalDraft } from './memory.ts';
import { localParts, tzOfMember, zonedTime, type PlaceRow } from './place.ts';
import { notifyMembers, type PushPayload } from './push.ts';

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// Mỗi câu một dòng: server/members.test.ts đọc các câu create table, add column để dựng lược đồ.
export async function migrateMay(db: Db = pool) {
  await db.query(`
    create table if not exists may_signals (
      id text primary key, family_id text not null references families(id),
      from_id text not null references members(id), to_id text not null references members(id),
      kind text not null, evidence text not null default '', call_id text references calls(id) on delete cascade, ref text,
      due_at timestamptz not null default now(), expires_at timestamptz not null,
      created_at timestamptz not null default now(), sent_at timestamptz, dropped text
    );
    create unique index if not exists may_signals_once on may_signals (call_id, to_id, kind);
    create index if not exists may_signals_pending on may_signals (to_id) where sent_at is null and dropped is null;
    create table if not exists may_nudges (
      id text primary key, family_id text not null references families(id), signal_id text,
      from_id text not null references members(id), to_id text not null references members(id),
      kind text not null, sent_at timestamptz not null default now(), opened_at timestamptz, contact_at timestamptz
    );
    create index if not exists may_nudges_to on may_nudges (to_id, sent_at desc);
    alter table members add column if not exists may_nudge boolean not null default true;
  `);
}

export const SIGNAL_KINDS = ['miss', 'want_contact', 'good_news', 'worry', 'low', 'upcoming'] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];
/** Hạn của tín hiệu tính bằng giờ. upcoming hết hạn cuối ngày trước sự việc; worry không thành lời nhắc (chỉ ở sổ nhớ). */
export const SIGNAL_TTL_H = { miss: 24, want_contact: 24, low: 48, good_news: 48 } as const;

export type Kin = { id: string; name: string; role: string };
export type SignalMember = Kin & PlaceRow & { may_nudge: boolean };
export type SignalRow = { id: string; family_id: string; from_id: string; to_id: string; kind: SignalKind; evidence: string; call_id: string | null; ref: string | null; due_at: Date; expires_at: Date };

export const MAY_SQL = {
  insert: `insert into may_signals (id, family_id, from_id, to_id, kind, evidence, call_id, ref, due_at, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (call_id, to_id, kind) do nothing`,
  // Khép vòng bằng tin nhắn riêng: lời nhắc chưa có liên lạc gửi sau $1, và tin riêng của các nhà đó từ $2.
  openNudges: 'select id, family_id, from_id, to_id, sent_at from may_nudges where contact_at is null and sent_at > $1',
  dms: 'select author_id, to_id, created_at from messages where family_id = any($1) and to_id is not null and created_at >= $2',
  contact: 'update may_nudges set contact_at = $2 where id = $1 and contact_at is null',
  // Tín hiệu chờ gửi, kèm người nhận (nơi ở để biết múi giờ), người kể, tên linh vật. Cả hai phải còn trong nhà (join bỏ hàng mồ côi).
  pending: `select s.id, s.family_id, s.kind, s.from_id, s.to_id, s.due_at, s.expires_at, s.created_at,
       t.name to_name, t.role to_role, t.city, t.loc_share, t.loc_lat, t.loc_lon, t.loc_at, t.may_nudge to_on,
       f.name from_name, f.role from_role, f.may_nudge from_on, fam.mascot_name
     from may_signals s
     join members t on t.id = s.to_id and t.family_id = s.family_id
     join members f on f.id = s.from_id and f.family_id = s.family_id
     join families fam on fam.id = s.family_id
     where s.sent_at is null and s.dropped is null`,
  history: 'select to_id, sent_at from may_nudges where to_id = any($1) and sent_at > $2',
  drop: 'update may_signals set dropped = $2 where id = $1 and sent_at is null and dropped is null',
  // Giành tín hiệu: chỉ lượt nhận lại được hàng mới gửi, nên hai lượt chạy cùng lúc vẫn chỉ gửi một lần.
  claim: 'update may_signals set sent_at = $2 where id = $1 and sent_at is null and dropped is null returning id',
  insertNudge: 'insert into may_nudges (id, family_id, signal_id, from_id, to_id, kind, sent_at) values ($1,$2,$3,$4,$5,$6,$7)',
  // $1 nhà, $2 lúc liên lạc, $3 = $2 - 48 giờ, $4 mọi người trong cuộc gọi, $5 người vừa nối.
  markContact: `update may_nudges set contact_at = $2 where family_id = $1 and contact_at is null and sent_at > $3
     and from_id = any($4) and to_id = any($4) and (from_id = any($5) or to_id = any($5))`,
  // Bấm lời nhắc: chỉ người nhận, khi người nhận và người kể còn trong nhà. opened_at ghi một lần.
  open: `update may_nudges n set opened_at = coalesce(n.opened_at, now())
     where n.id = $1 and n.to_id = $2 and n.family_id = $3
       and exists (select 1 from members m where m.id = n.to_id and m.family_id = $3)
       and exists (select 1 from members m where m.id = n.from_id and m.family_id = $3)
     returning n.from_id`,
};

/** Gấp chữ để so: NFC, chữ thường, mọi thứ không phải chữ, dấu, số thành khoảng trắng, gộp khoảng trắng. memory.ts xuất lại hàm này. */
export function foldText(s: string): string {
  return String(s ?? '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Cụm phrase (gấp sẵn hay chưa) nằm trọn trong chữ đã gấp, đúng ranh giới từ ("an" không khớp "anh"). */
const hasWords = (folded: string, phrase: string) => {
  const w = foldText(phrase);
  return !!w && ` ${folded} `.includes(` ${w} `);
};

// i18n-ok-begin: từ chỉ vai trong lời kể (vi, en, ko), không phải chữ hiện cho người dùng.
const DAD = ['bố', 'ba', 'cha', 'dad', 'daddy', 'father', '아빠', '아버지'];
const MOM = ['mẹ', 'má', 'mom', 'mum', 'mother', '엄마', '어머니'];
const KIDS = ['các con', 'tụi nhỏ', 'bọn trẻ', 'kids', 'children', '애들', '자녀들'];
const KID = ['con', 'con trai', 'con gái', 'son', 'daughter', '아들', '딸'];
// i18n-ok-end

/** Người nhận từ chữ người kể dùng (spec "Chốt thêm" 5): tên khớp đúng một người; không thì theo vai; mơ hồ hay lạ thì không ai. Không bao giờ là người kể. */
export function resolveTargets(target: string, speaker: Kin, family: Kin[]): string[] {
  const t = foldText(target);
  if (!t) return [];
  const named = family.filter((m) => {
    if (m.id === speaker.id) return false;
    const full = foldText(m.name);
    return hasWords(t, full) || hasWords(t, full.split(' ').at(-1) ?? '');
  });
  if (named.length) return named.length === 1 ? [named[0].id] : [];
  const said = (words: string[]) => words.some((w) => hasWords(t, w));
  const withRole = (role: string) => family.filter((m) => m.role === role).map((m) => m.id);
  const out = new Set<string>();
  if (said(DAD)) withRole('bo').forEach((id) => out.add(id));
  if (said(MOM)) withRole('me').forEach((id) => out.add(id));
  if (said(KIDS)) withRole('con').forEach((id) => out.add(id));
  if (said(KID) && withRole('con').length === 1) out.add(withRole('con')[0]);
  out.delete(speaker.id);
  return [...out];
}

const HOUR_MS = 3600e3;
const pad = (n: number) => String(n).padStart(2, '0');

/** upcoming: nhắc cả ngày hôm trước sự việc theo giờ người nhận, từ 9:00 (đã qua 9:00 thì ngay). Ngày không có thật hay hôm trước đã qua thì null. */
function upcomingWindow(m: PlaceRow, date: SignalDraft['date'], now: Date): { due: Date; expires: Date } | null {
  if (!date) return null;
  const tz = tzOfMember(m);
  const today = localParts(tz, now).date;
  // Lần tới của ngày tháng đó, tính cả hôm nay.
  const year = Number(today.slice(0, 4)) + (`${pad(date.month)}-${pad(date.day)}` < today.slice(5) ? 1 : 0);
  const event = new Date(Date.UTC(year, date.month - 1, date.day));
  if (event.getUTCMonth() !== date.month - 1) return null;
  const before = new Date(event.getTime() - 24 * HOUR_MS).toISOString().slice(0, 10);
  const expires = zonedTime(tz, before, 24 * 60);
  if (expires <= now) return null;
  const start = zonedTime(tz, before, 9 * 60);
  return { due: start > now ? start : now, expires };
}

/** Tín hiệu rút từ một cuộc gọi thành các hàng chờ gửi: đúng người nhận, mỗi (người nhận, loại) một hàng, ai tắt "Mây nhắc mình liên lạc" thì bỏ. */
export function planSignals(p: { familyId: string; callId: string; speaker: SignalMember; family: SignalMember[]; signals: SignalDraft[]; now: Date }): SignalRow[] {
  if (!p.speaker.may_nudge) return [];
  const rows: SignalRow[] = [];
  const seen = new Set<string>();
  for (const s of p.signals) {
    const kind = s.kind;
    if (kind === 'worry') continue;
    const to = kind === 'miss' || kind === 'want_contact' ? resolveTargets(s.target, p.speaker, p.family)
      : p.family.filter((m) => m.id !== p.speaker.id).map((m) => m.id);
    for (const id of to) {
      const m = p.family.find((x) => x.id === id);
      if (!m?.may_nudge || seen.has(`${id}|${kind}`)) continue;
      const when = kind === 'upcoming' ? upcomingWindow(m, s.date, p.now)
        : { due: p.now, expires: new Date(p.now.getTime() + SIGNAL_TTL_H[kind] * HOUR_MS) };
      if (!when) continue;
      seen.add(`${id}|${kind}`);
      rows.push({ id: randomUUID(), family_id: p.familyId, from_id: p.speaker.id, to_id: id, kind, evidence: s.evidence, call_id: p.callId, ref: null, due_at: when.due, expires_at: when.expires });
    }
  }
  return rows;
}

/** Ghi hàng chờ; cùng (cuộc gọi, người nhận, loại) đã có thì bỏ qua. Trả số hàng mới. */
export async function queueSignals(db: Db, rows: SignalRow[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const res = await db.query(MAY_SQL.insert, [r.id, r.family_id, r.from_id, r.to_id, r.kind, r.evidence, r.call_id, r.ref, r.due_at, r.expires_at]);
    n += res.rowCount ?? 0;
  }
  return n;
}

// ---------- Gửi lời nhắc ----------

/** Khung được gửi, phút trong ngày theo giờ người nhận, [from, to): 9:00 tới trước 21:30. Ngoài khung thì chờ, không bỏ. */
export const QUIET = { from: 9 * 60, to: 21 * 60 + 30 } as const;
/** Trần mọi lời nhắc của Mây cộng chung: 1 mỗi ngày theo giờ người nhận, 3 trong 7 ngày gần nhất. */
export const CAP = { day: 1, week: 3 } as const;
/** Trong chừng này giờ sau lời nhắc mà hai người gọi được cho nhau hay nhắn riêng thì tính là lời nhắc dẫn tới liên lạc. */
export const CONTACT_H = 48;
/** Thứ tự ưu tiên khi nhiều tín hiệu tranh một lượt (worry không bao giờ vào hàng chờ). */
export const SIGNAL_PRIORITY: SignalKind[] = ['want_contact', 'miss', 'low', 'good_news', 'upcoming'];
const WEEK_MS = 7 * 24 * HOUR_MS;
/** Chỉ soát tin nhắn riêng cho lời nhắc gửi trong chừng này giờ qua (dư hơn CONTACT_H cho chắc, máy chủ có thể nghỉ một lúc). */
const DM_SCAN_H = 72;

/** Giờ người nhận đang trong khung gửi không. Múi giờ hỏng thì theo giờ Việt Nam (localParts lo). */
export function inWindow(tz: string, now: Date): boolean {
  const m = localParts(tz, now).minutes;
  return m >= QUIET.from && m < QUIET.to;
}

export type Pending = { id: string; kind: SignalKind; toId: string; fromId: string; toTz: string; dueAt: Date; expiresAt: Date; createdAt: Date; toOn: boolean; fromOn: boolean };

/** Còn dưới trần không: đếm lời nhắc cùng ngày (theo giờ người nhận) và trong 7 ngày gần nhất. */
function underCap(tz: string, sent: Date[], now: Date) {
  const today = localParts(tz, now).date;
  const day = sent.filter((d) => localParts(tz, d).date === today).length;
  const week = sent.filter((d) => now.getTime() - d.getTime() < WEEK_MS).length;
  return day < CAP.day && week < CAP.week;
}

/** history: per recipient, sent_at of their nudges in the last 7 days. One send per recipient per tick. */
export function pickSends(pending: Pending[], history: Map<string, Date[]>, now: Date): { send: Pending[]; drop: Array<{ id: string; why: 'expired' | 'off' }> } {
  const drop: Array<{ id: string; why: 'expired' | 'off' }> = [];
  const best = new Map<string, Pending>();
  const rank = (k: SignalKind) => SIGNAL_PRIORITY.indexOf(k);
  for (const p of pending) {
    if (p.expiresAt.getTime() <= now.getTime()) { drop.push({ id: p.id, why: 'expired' }); continue; }
    if (!p.toOn || !p.fromOn) { drop.push({ id: p.id, why: 'off' }); continue; }
    if (p.dueAt.getTime() > now.getTime() || !inWindow(p.toTz, now) || !underCap(p.toTz, history.get(p.toId) ?? [], now)) continue;
    const cur = best.get(p.toId);
    if (!cur || rank(p.kind) < rank(cur.kind) || (rank(p.kind) === rank(cur.kind) && p.createdAt.getTime() < cur.createdAt.getTime())) best.set(p.toId, p);
  }
  return { send: [...best.values()], drop };
}

/** Chữ lời nhắc: tiêu đề là tên linh vật, thân là câu mẫu nudge.<loại> điền tên. Bố mẹ nhắc con thì gọi người kể theo vai (mẹ, bố),
 *  còn lại theo tên (tiếng Hàn kèm 님 qua khoá nudge.by_name). Không bao giờ có câu gốc của tín hiệu. Viết hoa chữ đầu. */
export function nudgeText(kind: SignalKind, lang: Lang, from: Kin, to: Kin, mascot: string): { title: string; body: string } {
  const byRole = (from.role === 'bo' || from.role === 'me') && to.role === 'con';
  const who = byRole ? tServer(lang, `nudge.call.${from.role}`) : tServer(lang, 'nudge.by_name', { name: from.name });
  const body = tServer(lang, `nudge.${kind}`, { from: who, to: to.name, mascot });
  return { title: tServer(lang, 'nudge.title', { mascot }), body: body.charAt(0).toUpperCase() + body.slice(1) };
}

/** Lời nhắc nào có tin nhắn riêng giữa hai người (chiều nào cũng được) trong CONTACT_H giờ sau lúc gửi: lúc của tin sớm nhất. */
export function contactFromMessages(nudges: Array<{ id: string; from_id: string; to_id: string; sent_at: Date }>,
  messages: Array<{ author_id: string; to_id: string; created_at: Date }>): Array<{ id: string; at: Date }> {
  const out: Array<{ id: string; at: Date }> = [];
  for (const n of nudges) {
    const sent = new Date(n.sent_at).getTime();
    const times = messages
      .filter((m) => (m.author_id === n.from_id && m.to_id === n.to_id) || (m.author_id === n.to_id && m.to_id === n.from_id))
      .map((m) => new Date(m.created_at).getTime())
      .filter((t) => t >= sent && t < sent + CONTACT_H * HOUR_MS);
    if (times.length) out.push({ id: n.id, at: new Date(Math.min(...times)) });
  }
  return out;
}

/** Cuộc gọi nối thông (fresh: người vừa nối, all: mọi người đã nối trong cuộc gọi): lời nhắc giữa hai người trong cuộc gọi, có ít nhất
 *  một người vừa nối, gửi trong CONTACT_H giờ trước at, chưa có liên lạc thì ghi contact_at. Trả số lời nhắc vừa ghi. */
export async function markContact(db: Db, familyId: string, fresh: string[], all: string[], at: Date): Promise<number> {
  const r = await db.query(MAY_SQL.markContact, [familyId, at, new Date(at.getTime() - CONTACT_H * HOUR_MS), all, fresh]);
  return r.rowCount ?? 0;
}

/** Móc onCallConnected (server/index.ts): chạy nền, lỗi chỉ ghi log. */
export function markCallContact(familyId: string, fresh: string[]): void {
  const all = [...new Set([...connectedIn(familyId), ...fresh])];
  void markContact(pool, familyId, fresh, all, new Date()).catch((e) => console.error('[may] ghi liên lạc sau cuộc gọi lỗi:', e));
}

export type MayDeps = { db: Db; notify: (memberIds: string[], payload: (l: Lang) => PushPayload) => unknown; now: () => Date };
const DEPS: MayDeps = { db: pool, notify: notifyMembers, now: () => new Date() };

/** Khép vòng bằng tin nhắn riêng: lời nhắc chưa có liên lạc trong DM_SCAN_H giờ qua, so với tin riêng của các nhà đó. */
async function closeByMessages(db: Db, now: Date) {
  const { rows: open } = await db.query(MAY_SQL.openNudges, [new Date(now.getTime() - DM_SCAN_H * HOUR_MS)]);
  if (!open.length) return;
  const oldest = new Date(Math.min(...open.map((n) => new Date(n.sent_at).getTime())));
  const { rows: dms } = await db.query(MAY_SQL.dms, [[...new Set(open.map((n) => n.family_id))], oldest]);
  for (const c of contactFromMessages(open, dms)) await db.query(MAY_SQL.contact, [c.id, c.at]);
}

/** Một lượt: khép vòng tin nhắn riêng, rồi bỏ tín hiệu hết hạn hay đã tắt công tắc, gửi lời nhắc tới hạn (mỗi người nhận tối đa một).
 *  Mỗi tín hiệu phải giành được (MAY_SQL.claim) mới ghi may_nudges và gửi thông báo. */
export async function mayTick(deps: MayDeps = DEPS): Promise<{ sent: number; dropped: number }> {
  const { db } = deps;
  const now = deps.now();
  await closeByMessages(db, now);
  const { rows } = await db.query(MAY_SQL.pending);
  if (!rows.length) return { sent: 0, dropped: 0 };
  const pending: Pending[] = rows.map((r) => ({
    id: r.id, kind: r.kind, toId: r.to_id, fromId: r.from_id, toTz: tzOfMember(r),
    dueAt: new Date(r.due_at), expiresAt: new Date(r.expires_at), createdAt: new Date(r.created_at), toOn: !!r.to_on, fromOn: !!r.from_on,
  }));
  const { rows: past } = await db.query(MAY_SQL.history, [[...new Set(pending.map((p) => p.toId))], new Date(now.getTime() - WEEK_MS)]);
  const history = new Map<string, Date[]>();
  for (const h of past) history.set(h.to_id, [...(history.get(h.to_id) ?? []), new Date(h.sent_at)]);
  const { send, drop } = pickSends(pending, history, now);
  let dropped = 0, sent = 0;
  for (const d of drop) dropped += (await db.query(MAY_SQL.drop, [d.id, d.why])).rowCount ?? 0;
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const p of send) {
    const { rows: won } = await db.query(MAY_SQL.claim, [p.id, now]);
    if (!won.length) continue;
    const r = byId.get(p.id)!;
    const id = randomUUID();
    await db.query(MAY_SQL.insertNudge, [id, r.family_id, p.id, p.fromId, p.toId, p.kind, now]);
    const from: Kin = { id: p.fromId, name: r.from_name, role: r.from_role }, to: Kin = { id: p.toId, name: r.to_name, role: r.to_role };
    const mascot = r.mascot_name || DEFAULT_MASCOT_NAME;
    deps.notify([p.toId], (l) => ({ kind: 'may', ...nudgeText(p.kind, l, from, to, mascot), tag: `may-${id}`, open: `may:${id}`, ttl: 12 * 3600 }));
    sent++;
  }
  return { sent, dropped };
}

let started = false;
/** Lượt đầu 30 giây sau khởi động, rồi mỗi 60 giây. Lỗi chỉ ghi log, không làm sập máy chủ. */
export function startMayScheduler() {
  if (started) return;
  started = true;
  const run = () => void mayTick()
    .then((r) => { if (r.sent || r.dropped) console.log(`[may] gửi ${r.sent} lời nhắc, bỏ ${r.dropped} tín hiệu`); })
    .catch((e) => console.error('[may] lượt gửi lời nhắc lỗi:', e));
  setTimeout(() => { run(); setInterval(run, 60e3); }, 30e3);
}

const h = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json(errorBody('server'));
  });

/** Gắn sau auth. POST /may/nudges/:id/open: người nhận bấm thông báo, trả { peerId } là người kể để máy gọi thoại ngay. */
export function makeMayRouter(deps: MayDeps = DEPS) {
  const r = express.Router();
  r.post('/may/nudges/:id/open', h(async (req, res) => {
    const me = req.member as { id: string; family_id: string };
    const { rows } = await deps.db.query(MAY_SQL.open, [String(req.params.id), me.id, me.family_id]);
    if (!rows[0]) return res.status(404).json(errorBody('nudge_not_found'));
    res.json({ peerId: rows[0].from_id });
  }));
  return r;
}
