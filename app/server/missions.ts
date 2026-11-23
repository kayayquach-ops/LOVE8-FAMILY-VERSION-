// Nhiệm vụ tuần ở lọ sao: không còn tự tích tay. App nhìn việc từng người đã làm trong tuần rồi tự đánh dấu (app/docs/nhiem-vu-tuan.md).
// Phần lớn đọc từ dữ liệu sẵn có lúc mở lọ, tuần hoặc trang chủ (syncMissions), không cài thêm móc vào route khác:
// - video:  một bài kind 'video' của người đó.
// - meal:   một bài ảnh có meal = true (nút "bữa cơm" ở màn gửi ảnh, src/SendTo.tsx).
// - love:   bấm "ôm cả nhà" (bài kind 'hug'); hoặc tin nhắn, trả lời bài, thư, lời kèm bài có chữ thương (LOVE),
//           hoặc nhãn dán thương (LOVE_STICKERS) trong tin nhắn hay trong thư.
// - memory: một câu hỏi (có dấu ?) nhắc chuyện cũ (MEMORY) trong tin nhắn, trả lời bài, thư, lời kèm bài.
//           Gửi riêng một người (thư, tin nhắn riêng có to_id) thì người nhận phải khác thế hệ: bố/mẹ hỏi con, con hỏi bố/mẹ.
//           Gửi cả nhà (nhóm chat, trả lời bài, lời kèm bài) thì tính luôn.
// - call:   phòng gọi video chỉ nằm trong bộ nhớ nên cần sự kiện: facetime.ts gọi markCall/markMission khi cuộc gọi nối được.
// Nhận ra rồi thì ghi vào missions_done (khoá chính member_id, mission, week): mỗi người mỗi tuần mỗi nhiệm vụ chỉ một dòng, một sao.
// Dòng tích tay cũ đã có trong missions_done vẫn giữ và vẫn tính.
import express from 'express';
import { pool } from './db.ts';
import { errorBody } from './i18n.ts';

type Db = { query: (q: string, v?: any[]) => Promise<any> };

// Điểm của từng nhiệm vụ (cộng vào điểm tuần ở /api/week). Chữ hiện ra nằm ở bảng chữ máy chủ, khoá week.mission.<key>.
// Danh sách cố định, không đổi theo tuần.
export const MISSIONS = [
  { key: 'call', points: 2 },
  { key: 'video', points: 2 },
  { key: 'love', points: 3 },
  { key: 'meal', points: 1 },
  { key: 'memory', points: 2 },
] as const;
export type MissionKey = (typeof MISSIONS)[number]['key'];
export const isMission = (k: unknown): k is MissionKey => MISSIONS.some((m) => m.key === k);

// ---------- Tuần ----------

/** Tuần tính từ thứ Hai, theo giờ Việt Nam: lọ sao, câu hỏi tuần và nhiệm vụ cùng dùng một mốc. */
export function weekKey(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const day = (t.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}
/** 0 giờ sáng thứ Hai của tuần, giờ Việt Nam. */
export const weekStart = (week: string) => new Date(`${week}T00:00:00+07:00`);

// ---------- Chữ ----------

/** whole: khớp trọn chữ (trước sau không dính chữ cái, số); part: khớp cả khi dính chữ khác (tiếng Hàn dính đuôi câu);
 *  not: cụm bỏ qua trước khi khớp (yêu cầu không phải yêu). */
export type Words = { whole: string[]; part?: string[]; not?: string[] };

// i18n-ok-begin: từ khoá nhận ra nhiệm vụ, không phải chữ hiện cho người dùng.
/** Nói thương: tiếng Việt, tiếng Anh, tiếng Hàn. Gõ không dấu (thuong, yeu) không tính vì dễ lẫn (bình thường, yếu). */
export const LOVE: Words = {
  whole: ['thương', 'yêu', 'nhớ', 'love', 'luv', 'miss'],
  part: ['사랑', '보고 싶', '보고싶', '그리워', '그립'],
  not: ['yêu cầu', 'bị thương', 'tổn thương', 'thương mại', 'thương lượng', 'ghi nhớ'],
};
/** Hỏi chuyện cũ: câu phải có dấu hỏi và một trong các từ này. "nhớ" nằm ở cả hai danh sách: "mẹ còn nhớ không?" tính cả hai. */
export const MEMORY: Words = {
  whole: ['nhớ', 'kỷ niệm', 'kỉ niệm', 'ngày xưa', 'ngày trước', 'hồi xưa', 'hồi trước', 'hồi nhỏ', 'hồi bé', 'hồi đó', 'hồi ấy',
    'remember', 'memory', 'memories', 'back then'],
  part: ['기억', '옛날', '추억', '어릴 때', '어렸을 때'],
  not: ['ghi nhớ'],
};
// i18n-ok-end
/** Nhãn dán mang nghĩa thương (src/stickers.tsx): ôm, thương con, tim, nhớ nhà. */
export const LOVE_STICKERS = ['hug', 'love', 'heart', 'home'];

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
const esc = (s: string) => norm(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function matcher(w: Words) {
  const whole = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${w.whole.map(esc).join('|')})(?![\\p{L}\\p{M}\\p{N}])`, 'u');
  const part = w.part?.length ? new RegExp(w.part.map(esc).join('|'), 'u') : null;
  const not = w.not?.length ? new RegExp(w.not.map(esc).join('|'), 'gu') : null;
  return (text?: string | null) => {
    if (!text) return false;
    const s = not ? norm(text).replace(not, ' ') : norm(text);
    return whole.test(s) || !!part?.test(s);
  };
}
export const saysLove = matcher(LOVE);
const mentionsMemory = matcher(MEMORY);
export const asksMemory = (text?: string | null) => !!text && /[?？]/.test(text) && mentionsMemory(text);
/** Khác thế hệ: một bên là con, bên kia là bố hoặc mẹ. */
export const otherGeneration = (a?: string | null, b?: string | null) =>
  ['bo', 'me', 'con'].includes(a ?? '') && ['bo', 'me', 'con'].includes(b ?? '') && (a === 'con') !== (b === 'con');

// ---------- Nhận ra ----------

/** Một việc của một người, gom từ các bảng. to: gửi riêng cho một người (thư, tin nhắn riêng); không có là gửi cả nhà. */
export type Act = { by: string; at: Date; post?: string; meal?: boolean; text?: string | null; stickers?: string[]; to?: string | null };
export type Done = { memberId: string; mission: MissionKey; week: string; at: Date };

/** Nhiệm vụ mà một việc làm xong (không tính call: cần sự kiện cuộc gọi). */
export function missionsOf(a: Act, roles: Map<string, string>): MissionKey[] {
  const out: MissionKey[] = [];
  if (a.post === 'video') out.push('video');
  if (a.post === 'photo' && a.meal) out.push('meal');
  if (a.post === 'hug' || saysLove(a.text) || a.stickers?.some((s) => LOVE_STICKERS.includes(s))) out.push('love');
  if (asksMemory(a.text) && (!a.to || otherGeneration(roles.get(a.by), roles.get(a.to)))) out.push('memory');
  return out;
}

/** Mỗi người, mỗi nhiệm vụ, mỗi tuần một dòng, lấy lần làm sớm nhất. Chỉ tính người đang ở nhà (có trong roles). */
export function detect(acts: Act[], roles: Map<string, string>): Done[] {
  const best = new Map<string, Done>();
  for (const a of acts) {
    if (!roles.has(a.by)) continue;
    const week = weekKey(a.at);
    for (const mission of missionsOf(a, roles)) {
      const k = `${a.by}|${mission}|${week}`;
      const was = best.get(k);
      if (!was || a.at < was.at) best.set(k, { memberId: a.by, mission, week, at: a.at });
    }
  }
  return [...best.values()];
}

const letterStickers = (items: unknown) =>
  Array.isArray(items) ? items.filter((i) => i?.type === 'sticker').map((i) => String(i.sticker)) : [];

/** Đọc việc của cả nhà từ tuần trước tới giờ, nhận ra nhiệm vụ, ghi dòng mới vào missions_done. Trả số dòng mới.
 *  Quét cả tuần trước: việc làm tối Chủ nhật mà chưa ai mở app trước thứ Hai vẫn được tính đúng tuần đó. */
export async function syncMissions(familyId: string, db: Db = pool, now = new Date()): Promise<number> {
  const week = weekKey(now);
  const from = new Date(weekStart(week).getTime() - 7 * 86400e3);
  const prev = weekKey(from);
  const [ms, posts, replies, msgs, letters, done] = await Promise.all([
    db.query('select id, role from members where family_id = $1', [familyId]),
    db.query('select author_id, kind, caption, meal, created_at from posts where family_id = $1 and created_at >= $2', [familyId, from]),
    db.query(
      `select r.author_id, r.text, r.created_at from replies r join posts p on p.id = r.post_id
       where p.family_id = $1 and r.created_at >= $2 and r.text is not null`, [familyId, from]),
    // select *: tin nhắn riêng có thêm cột to_id (đang làm ở nhánh khác); chưa có cột thì coi như gửi cả nhà.
    db.query('select * from messages where family_id = $1 and created_at >= $2 and (text is not null or sticker is not null)', [familyId, from]),
    db.query('select from_id, to_id, body, title, footer, items, created_at from letters where family_id = $1 and created_at >= $2', [familyId, from]),
    db.query('select member_id, mission, week from missions_done where family_id = $1 and week >= $2', [familyId, prev]),
  ]);
  const roles = new Map<string, string>(ms.rows.map((r: any) => [r.id, r.role]));
  const acts: Act[] = [
    ...posts.rows.map((r: any) => ({ by: r.author_id, at: new Date(r.created_at), post: r.kind, meal: !!r.meal, text: r.caption })),
    ...replies.rows.map((r: any) => ({ by: r.author_id, at: new Date(r.created_at), text: r.text })),
    ...msgs.rows.map((r: any) => ({ by: r.author_id, at: new Date(r.created_at), text: r.text, stickers: r.sticker ? [r.sticker] : [], to: r.to_id ?? null })),
    ...letters.rows.map((r: any) => ({
      by: r.from_id, at: new Date(r.created_at), to: r.to_id,
      text: [r.title, r.body, r.footer].filter(Boolean).join('\n'), stickers: letterStickers(r.items),
    })),
  ];
  const have = new Set(done.rows.map((r: any) => `${r.member_id}|${r.mission}|${r.week}`));
  const fresh = detect(acts, roles).filter((d) => !have.has(`${d.memberId}|${d.mission}|${d.week}`));
  const res = await Promise.all(fresh.map((d) => db.query(
    `insert into missions_done (family_id, member_id, mission, week, created_at) values ($1,$2,$3,$4,$5) on conflict do nothing`,
    [familyId, d.memberId, d.mission, d.week, d.at])));
  return res.filter((r: any) => r?.rowCount === 1).length;
}

/** Tổng sao của cả nhà từ đầu tới giờ, đúng số lọ đang hiện (server/jar.ts đếm cùng ba nguồn): mỗi bài, mỗi trả lời bài, mỗi nhiệm vụ xong là một sao.
 *  Trang chủ (home.ts) và ưu đãi theo mốc (coupons.ts) dùng câu này. Tham số $1: mã nhà. */
export const STARS_SQL = `select (
    (select count(*) from posts where family_id = $1)
    + (select count(*) from replies r join posts p on p.id = r.post_id where p.family_id = $1)
    + (select count(*) from missions_done where family_id = $1)
  )::int n`;
export async function familyStars(familyId: string, db: Db = pool): Promise<number> {
  const { rows } = await db.query(STARS_SQL, [familyId]);
  return Number(rows[0]?.n) || 0;
}

/** Đánh dấu một nhiệm vụ cho một người, tuần chứa lúc `at` (mặc định bây giờ). Người phải thuộc nhà đó.
 *  Gọi bao nhiêu lần cũng chỉ một dòng, một sao. Trả true nếu vừa ghi dòng mới. */
export async function markMission(familyId: string, memberId: string, key: string, db: Db = pool, at = new Date()): Promise<boolean> {
  if (!isMission(key)) return false;
  const r = await db.query(
    `insert into missions_done (family_id, member_id, mission, week, created_at)
     select $1, id, $3, $4, $5 from members where id = $2 and family_id = $1 on conflict do nothing`,
    [familyId, memberId, key, weekKey(at), at]);
  return r?.rowCount === 1;
}

/** Hợp với móc onCallConnected(familyId, memberIds) ở facetime.ts: mọi người trong cuộc gọi vừa nối được tính "gọi điện". */
export function markCall(familyId: string, memberIds: string[]) {
  for (const id of memberIds) markMission(familyId, id, 'call').catch((e) => console.error(e));
}

// Không còn tự tích tay: nhiệm vụ chỉ xong khi app thấy người đó làm thật. Bản app cũ còn gọi thì nhận 410 kèm câu báo.
export const missionsRouter = express.Router();
missionsRouter.post('/missions/:key', (_req, res) => { res.status(410).json(errorBody('mission_auto')); });
