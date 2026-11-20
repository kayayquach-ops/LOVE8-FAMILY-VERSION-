// Hàng chờ tín hiệu và lời nhắc của Mây (20/11/2026): Mây thấy ai đó nhớ ai đó thì xếp một tín hiệu, tới hạn mới gửi lời nhắc.
// Task 2: tìm người nhận từ lời kể, xếp tín hiệu với hạn đúng loại (planSignals, queueSignals). Phần gửi thêm ở task sau.
// Chỉ import kiểu từ memory.ts (memory.ts import file này lúc chạy). Chi tiết: docs/may-moi.md. Kiểm bằng server/may.test.ts.
import { randomUUID } from 'node:crypto';
import { pool } from './db.ts';
import type { SignalDraft } from './memory.ts';
import { localParts, tzOfMember, zonedTime, type PlaceRow } from './place.ts';

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
