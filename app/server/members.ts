// Xoá một người khỏi nhà cùng mọi thứ của người đó: DELETE /api/members/:id (gắn sau auth).
// Ai trong nhà cũng xoá được người khác cùng nhà (người tạo nhà cũng có thể là tài khoản thử), không tự xoá mình được ở đường này.
// Mã không thuộc nhà mình (kể cả người ở nhà khác) luôn trả 404, không lộ là có hay không.
// Tự rời nhà: DELETE /api/me, xoá chính mình theo cùng PLAN. Người cuối cùng rời thì xoá luôn nhà theo FAMILY_PLAN
// (lời xin vào nhà, video tuần, podcast chủ đề, lịch...), không để lại nhà trống. Người duyệt rời thì join.ts tự lấy người vào sớm kế tiếp.
//
// Làm trong một giao dịch, theo bảng PLAN bên dưới (thứ tự đã tính cho khoá ngoại, không tắt kiểm tra khoá ngoại).
// Đồ chung giữ lại: ảnh chụp chung người khác tạo (chỉ bỏ phần ảnh của người này), bài người khác đăng từ ảnh chụp chung
// người này tạo (thành ảnh thường), video tuần, tập podcast theo chủ đề, ngày trong lịch người khác thêm.
// Tệp media chỉ xoá sau khi giao dịch xong, và chỉ tệp không còn hàng nào nhắc tới (ví dụ ảnh ghép người khác đã đăng thì giữ).
// Thêm bảng hay cột trỏ tới thành viên thì phải thêm vào PLAN: server/members.test.ts đọc mọi create table / add column và báo thiếu.
import express from 'express';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db.ts';
import { errorBody } from './i18n.ts';
import { closeChatStreams } from './chat.ts';
import { closeLive } from './facetime.ts';
import { THUMB_SIZES } from './thumb.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');

export type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
export type Client = Db & { release: () => void };

/** Các tập mã dùng làm điều kiện: thu thập trong giao dịch trước khi xoá (xoá rồi thì không tra lại được). */
export type SetName =
  | 'member' | 'posts' | 'postMedia' | 'calls' | 'shots' | 'messages' | 'answers'
  | 'podKeys' | 'storyKeys' | 'wordKeys' | 'pushKeys'
  | 'family' | 'famKeys';
type Sets = Record<SetName, string[]>;

/** Một điều kiện: cột nằm trong tập (=), hoặc khớp một mẫu trong tập (like). Các điều kiện của một bước nối bằng "or". */
export type Cond = { col: string; in: SetName; like?: true };
/** Một bước: xoá hàng, hoặc đặt một cột về null (giữ hàng của người khác, bỏ trỏ tới thứ đã xoá). family: chỉ trong nhà này. */
export type Step = { table: string; op: 'delete' | 'null'; set?: string; any: Cond[]; family?: true; why: string };

/** Thu thập mã trước khi xoá. Thứ tự có nghĩa: answers cần calls. */
export const PICKS: Array<{ name: SetName; table: string; col: string; any: Cond[] }> = [
  { name: 'posts', table: 'posts', col: 'id', any: [{ col: 'author_id', in: 'member' }] },
  { name: 'postMedia', table: 'posts', col: 'media', any: [{ col: 'author_id', in: 'member' }] },
  { name: 'calls', table: 'calls', col: 'id', any: [{ col: 'member_id', in: 'member' }] },
  { name: 'shots', table: 'shots', col: 'id', any: [{ col: 'by_id', in: 'member' }] },
  { name: 'messages', table: 'messages', col: 'id', any: [{ col: 'author_id', in: 'member' }] },
  { name: 'answers', table: 'call_answers', col: 'id', any: [{ col: 'member_id', in: 'member' }, { col: 'call_id', in: 'calls' }] },
];

/** Kế hoạch xoá, chạy đúng thứ tự này. Con trước cha: reactions, replies trước posts; shot_parts trước shots;
 *  relays, call_answers trước calls; mọi bảng trỏ tới members trước members. Không dựa vào on delete cascade
 *  (hàng xoá theo cascade không trả về nên không gom được tệp media). */
// i18n-ok-begin: why là ghi chú nội bộ cho người đọc mã và kiểm thử, không hiện cho người dùng.
export const PLAN: Step[] = [
  { table: 'reactions', op: 'delete', any: [{ col: 'member_id', in: 'member' }, { col: 'post_id', in: 'posts' }],
    why: 'cảm xúc người này thả ở mọi bài, và cảm xúc mọi người thả trên bài của người này' },
  { table: 'replies', op: 'delete', any: [{ col: 'author_id', in: 'member' }, { col: 'post_id', in: 'posts' }],
    why: 'trả lời của người này ở mọi bài, và mọi trả lời trên bài của người này (gom cả tệp ghi âm)' },
  { table: 'shots', op: 'null', set: 'post_id', any: [{ col: 'post_id', in: 'posts' }], family: true,
    why: 'ảnh chụp chung người khác tạo mà người này đã đăng: bài mất, lượt chụp còn, bỏ trỏ tới bài' },
  { table: 'posts', op: 'null', set: 'shot_id', any: [{ col: 'shot_id', in: 'shots' }], family: true,
    why: 'bài người khác đăng từ ảnh chụp chung người này tạo: giữ bài thành ảnh thường' },
  { table: 'shot_parts', op: 'delete', any: [{ col: 'member_id', in: 'member' }, { col: 'shot_id', in: 'shots' }],
    why: 'phần ảnh của người này trong mọi lượt chụp chung, và mọi phần ảnh của lượt người này tạo' },
  { table: 'shots', op: 'delete', any: [{ col: 'by_id', in: 'member' }],
    why: 'lượt chụp chung người này tạo' },
  { table: 'posts', op: 'delete', any: [{ col: 'author_id', in: 'member' }],
    why: 'bài người này đăng (cả lời thương đầu tiên, ảnh ghép người này đăng)' },
  { table: 'relays', op: 'delete',
    any: [{ col: 'from_id', in: 'member' }, { col: 'to_id', in: 'member' }, { col: 'call_id', in: 'calls' }, { col: 'delivered_call_id', in: 'calls' }],
    why: 'lời nhắn người này gửi hoặc nhận qua Mây, và lời nhắn gắn với cuộc gọi của người này' },
  { table: 'podcast_words', op: 'delete', any: [{ col: 'key', in: 'wordKeys' }],
    why: 'mốc từng từ (lời người này nói) của câu trả lời và tin giọng nói sắp xoá' },
  { table: 'call_answers', op: 'delete', any: [{ col: 'member_id', in: 'member' }, { col: 'call_id', in: 'calls' }],
    why: 'câu trả lời cuộc gọi của người này' },
  { table: 'vault', op: 'delete', any: [{ col: 'member_id', in: 'member' }, { col: 'call_id', in: 'calls' }],
    why: 'ảnh người này gửi, và ảnh mọi người thêm vào câu chuyện trong cuộc gọi của người này' },
  { table: 'podcast_plans', op: 'delete', any: [{ col: 'call_id', in: 'calls' }],
    why: 'kế hoạch chia tập của cuộc gọi người này' },
  { table: 'podcasts', op: 'delete', family: true,
    any: [{ col: 'member_id', in: 'member' }, { col: 'key', in: 'podKeys' }, { col: 'key', in: 'storyKeys', like: true }],
    why: 'album podcast của người này (first:, call:, story: của cuộc gọi người này); tập theo chủ đề (member_id null) giữ' },
  { table: 'calls', op: 'delete', any: [{ col: 'member_id', in: 'member' }],
    why: 'cuộc gọi tuần của người này' },
  { table: 'messages', op: 'null', set: 'reply_to', any: [{ col: 'reply_to', in: 'messages' }], family: true,
    why: 'tin người khác trả lời tin của người này: giữ tin, bỏ trỏ tới tin đã xoá' },
  { table: 'messages', op: 'delete', any: [{ col: 'author_id', in: 'member' }],
    why: 'tin nhắn người này gửi trong chat nhà' },
  // Tin riêng (server/chat.ts, messages.to_id): luồng riêng có người này ở bên nào cũng xoá hết.
  { table: 'messages', op: 'delete', any: [{ col: 'to_id', in: 'member' }],
    why: 'tin riêng người khác gửi cho người này (tin riêng người này gửi đã xoá ở bước trên)' },
  { table: 'message_reads', op: 'delete', any: [{ col: 'member_id', in: 'member' }],
    why: 'mốc đã đọc chat của người này' },
  { table: 'letters', op: 'delete', any: [{ col: 'from_id', in: 'member' }, { col: 'to_id', in: 'member' }],
    why: 'thư người này gửi hoặc nhận' },
  { table: 'events', op: 'delete', any: [{ col: 'created_by', in: 'member' }],
    why: 'ngày trong lịch người này thêm (cả ngày rút từ cuộc gọi của người này)' },
  { table: 'events', op: 'null', set: 'member_id', any: [{ col: 'member_id', in: 'member' }], family: true,
    why: 'ngày của người này do người khác thêm: giữ, thành ngày chung như khi người được chọn không ở trong nhà' },
  { table: 'missions_done', op: 'delete', any: [{ col: 'member_id', in: 'member' }],
    why: 'nhiệm vụ tuần người này làm' },
  { table: 'seen', op: 'delete', any: [{ col: 'member_id', in: 'member' }],
    why: 'mốc đã xem tin nhà của người này' },
  { table: 'push_subs', op: 'delete', any: [{ col: 'member_id', in: 'member' }],
    why: 'máy nhận thông báo của người này' },
  { table: 'push_prefs', op: 'delete', any: [{ col: 'member_id', in: 'member' }],
    why: 'cài đặt thông báo của người này' },
  { table: 'push_sent', op: 'delete', any: [{ col: 'key', in: 'pushKeys', like: true }],
    why: 'dấu đã nhắc riêng người này (weekly:<id>:, sinh nhật dob-<id>)' },
  { table: 'google_auth', op: 'delete', any: [{ col: 'member_id', in: 'member' }],
    why: 'lượt liên kết Google đang dở của người này' },
  { table: 'member_seed', op: 'delete', any: [{ col: 'member_id', in: 'member' }],
    why: 'loại giấy người này chọn cho hũ' },
  { table: 'owned_seeds', op: 'delete', any: [{ col: 'member_id', in: 'member' }],
    why: 'loại giấy người này có' },
  { table: 'members', op: 'delete', any: [{ col: 'id', in: 'member' }], family: true,
    why: 'chính người này (mã máy mất theo, máy đó nhận 401)' },
];

/** Người cuối cùng rời nhà: sau PLAN của người đó, xoá mọi thứ còn gắn với nhà rồi xoá chính nhà. Chạy đúng thứ tự này.
 *  Phủ mọi bảng có cột family_id (server/members.test.ts đọc lược đồ và báo thiếu). Phần lớn bảng lúc này đã trống
 *  (hàng nào cũng có người tạo, PLAN đã xoá); vẫn xoá theo family_id cho chắc, con trước cha như PLAN. */
export const FAMILY_PLAN: Step[] = [
  { table: 'podcasts', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'tập podcast theo chủ đề (không thuộc riêng ai)' },
  { table: 'recaps', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'video tuần của nhà' },
  { table: 'events', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'ngày trong lịch còn lại (hàng cũ không có created_by)' },
  { table: 'shot_runs', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'sổ đếm hạn mức ghép ảnh của nhà' },
  { table: 'message_translations', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'bản dịch tin nhắn của nhà' },
  { table: 'join_requests', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'lời xin vào nhà còn chờ: nhà không còn ai duyệt' },
  { table: 'push_sent', op: 'delete', any: [{ col: 'key', in: 'famKeys', like: true }], why: 'dấu đã nhắc lịch của nhà (cal:<nhà>:)' },
  { table: 'relays', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'lời nhắn qua Mây còn sót' },
  { table: 'call_answers', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'câu trả lời cuộc gọi còn sót' },
  { table: 'vault', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'ảnh câu chuyện còn sót' },
  { table: 'missions_done', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'nhiệm vụ tuần còn sót' },
  { table: 'letters', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'thư còn sót' },
  { table: 'push_subs', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'máy nhận thông báo còn sót' },
  { table: 'shots', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'lượt chụp chung còn sót (phần ảnh xoá theo cascade)' },
  { table: 'posts', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'bài còn sót (cảm xúc, trả lời xoá theo cascade)' },
  { table: 'messages', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'tin nhắn còn sót' },
  { table: 'calls', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'cuộc gọi tuần còn sót' },
  { table: 'members', op: 'delete', any: [{ col: 'family_id', in: 'family' }], why: 'không còn ai (vừa kiểm trong cùng giao dịch)' },
  { table: 'families', op: 'delete', any: [{ col: 'id', in: 'family' }], why: 'chính ngôi nhà (mã nhà mất theo, gõ lại thì không thấy nhà)' },
];
// i18n-ok-end

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
/** Thoát ký tự đặc biệt của like (mã là uuid nên thường không có, vẫn thoát cho chắc). */
const likeEsc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function where(any: Cond[], sets: Sets, args: unknown[]) {
  return any.map((c) => { args.push(sets[c.in]); return `${q(c.col)} ${c.like ? 'like' : '='} any($${args.length}::text[])`; }).join(' or ');
}

/** Câu SQL của một bước. Xoá thì trả về cả hàng để gom đường dẫn tệp media. */
export function stepSql(s: Step, sets: Sets, familyId: string) {
  const args: unknown[] = [];
  const cond = where(s.any, sets, args);
  const fam = s.family ? (args.push(familyId), ` and "family_id" = $${args.length}`) : '';
  const sql = s.op === 'delete'
    ? `delete from ${q(s.table)} where (${cond})${fam} returning *`
    : `update ${q(s.table)} set ${q(s.set!)} = null where (${cond})${fam}`;
  return { sql, args };
}

export const LOCK_SQL = 'select id from members where id = any($1::text[]) and family_id = $2 order by id for update';
/** Khoá nhà khi có người tự rời: hai người cuối cùng rời cùng lúc thì một người chờ, xong thấy mình là người cuối và xoá luôn nhà.
 *  no key update: người khác trong nhà vẫn đăng bài, nhắn tin bình thường (khoá ngoại tới families chỉ cần key share). */
export const FAMILY_LOCK_SQL = 'select id from families where id = $1 for no key update';
/** Nhà còn ai không (chạy sau khi đã xoá người rời, trong cùng giao dịch). */
export const ANYONE_SQL = 'select id from members where family_id = $1 limit 1';

/** Đường dẫn /media/... trong một hàng (mọi cột, kể cả jsonb như letters.items): tên tệp tương đối trong MEDIA_DIR, bỏ ?v=. */
export function mediaPaths(row: unknown): string[] {
  const out = new Set<string>();
  for (const m of JSON.stringify(row ?? null).matchAll(/\/media\/((?:[\w-]+\/)?[\w-][\w.-]*\.[A-Za-z0-9]+)/g)) out.add(m[1]);
  return [...out];
}

export type Removed =
  | { status: 'ok'; files: string[]; counts: Record<string, number> }
  | { status: 'self' | 'not_found' | 'gone' };

/** Chạy từng bước của một kế hoạch, gom đường dẫn tệp media từ hàng đã xoá và đếm số hàng. */
async function runPlan(c: Db, plan: Step[], sets: Sets, familyId: string, files: Set<string>, counts: Record<string, number>) {
  for (const s of plan) {
    const { sql, args } = stepSql(s, sets, familyId);
    const r = await c.query(sql, args);
    const k = `${s.table}${s.op === 'null' ? `.${s.set}=null` : ''}`;
    if (r.rowCount) counts[k] = (counts[k] ?? 0) + r.rowCount;
    if (s.op === 'delete') for (const row of r.rows) for (const f of mediaPaths(row)) files.add(f);
  }
}

/** Xoá người targetId theo PLAN, trong giao dịch đang mở (hàng của người đó đã khoá). Chưa đụng tệp media. */
async function wipeMember(c: Db, familyId: string, targetId: string) {
  const sets = { member: [targetId] } as Sets;
  for (const p of PICKS) {
    const args: unknown[] = [];
    const { rows: got } = await c.query(`select ${q(p.col)} from ${q(p.table)} where (${where(p.any, sets, args)})`, args);
    sets[p.name] = got.map((r) => r[p.col]).filter((v): v is string => typeof v === 'string');
  }
  sets.podKeys = [`first:${targetId}`, ...sets.calls.map((id) => `call:${id}`)];
  sets.storyKeys = sets.calls.map((id) => `story:${likeEsc(id)}:%`);
  // Khoá mốc từ ở voiceedit.ts: ans:<mã câu trả lời>, post:<tên tệp> (tin giọng nói lời thương đầu tiên).
  sets.wordKeys = [...sets.answers.map((id) => `ans:${id}`), ...sets.postMedia.map((m) => `post:${path.basename(m.split('?')[0])}`)];
  sets.pushKeys = [`weekly:${likeEsc(targetId)}:%`, `cal:${likeEsc(familyId)}:dob-${likeEsc(targetId)}:%`];

  const files = new Set<string>();
  const counts: Record<string, number> = {};
  await runPlan(c, PLAN, sets, familyId, files, counts);
  return { files, counts };
}

/** Xoá người targetId khỏi nhà familyId theo PLAN, một giao dịch. callerId là người bấm. Chưa đụng tệp media. */
export async function removeMember(connect: () => Promise<Client>, familyId: string, callerId: string, targetId: string): Promise<Removed> {
  if (targetId === callerId) return { status: 'self' };
  const c = await connect();
  try {
    await c.query('begin');
    // Khoá cả hai hàng theo thứ tự mã: hai người xoá nhau cùng lúc thì một người chờ, xong thấy mình đã bị xoá (gone).
    // Máy của người bị xoá đang gửi gì (auth ghi last_seen, khoá ngoại) cũng phải chờ tới khi xong, rồi nhận 401.
    const { rows } = await c.query(LOCK_SQL, [[callerId, targetId], familyId]);
    const found = new Set(rows.map((r) => r.id as string));
    if (!found.has(callerId) || !found.has(targetId)) {
      await c.query('rollback');
      return { status: found.has(callerId) ? 'not_found' : 'gone' };
    }
    const { files, counts } = await wipeMember(c, familyId, targetId);
    await c.query('commit');
    return { status: 'ok', files: [...files], counts };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export type Left =
  | { status: 'ok'; files: string[]; counts: Record<string, number>; last: boolean }
  | { status: 'gone' };

/** memberId tự rời nhà familyId: xoá chính mình theo PLAN; là người cuối thì xoá luôn nhà theo FAMILY_PLAN. Một giao dịch.
 *  Đã không còn trong nhà (bị người khác xoá trước) thì gone. Chưa đụng tệp media. */
export async function leaveFamily(connect: () => Promise<Client>, familyId: string, memberId: string): Promise<Left> {
  const c = await connect();
  try {
    await c.query('begin');
    // Khoá nhà trước rồi mới khoá người, luôn theo thứ tự này.
    await c.query(FAMILY_LOCK_SQL, [familyId]);
    const { rows } = await c.query(LOCK_SQL, [[memberId], familyId]);
    if (!rows.length) {
      await c.query('rollback');
      return { status: 'gone' };
    }
    const { files, counts } = await wipeMember(c, familyId, memberId);
    const { rows: left } = await c.query(ANYONE_SQL, [familyId]);
    const last = !left.length;
    if (last) {
      const sets = { family: [familyId], famKeys: [`cal:${likeEsc(familyId)}:%`] } as Sets;
      await runPlan(c, FAMILY_PLAN, sets, familyId, files, counts);
    }
    await c.query('commit');
    return { status: 'ok', files: [...files], counts, last };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Trong danh sách tệp, tệp nào còn hàng nào đó (bất kỳ bảng nào, bất kỳ cột nào) nhắc tới. */
async function stillUsed(db: Db, files: string[]): Promise<Set<string>> {
  const { rows: tables } = await db.query(
    `select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE'`);
  const used = new Set<string>();
  const needles = files.map((f) => `/media/${f}`);
  for (const t of tables) {
    const { rows } = await db.query(
      `select distinct u.needle from ${q(t.table_name)} as whole, unnest($1::text[]) as u(needle) where strpos(row_to_json(whole.*)::text, u.needle) > 0`, [needles]);
    for (const r of rows) used.add(String(r.needle).slice('/media/'.length));
  }
  return used;
}

/** Sau khi giao dịch xong: xoá tệp không còn ai dùng, kèm ảnh thu nhỏ (thumb.ts: media/w<cỡ>/<tên>.jpg).
 *  Không bao giờ ra ngoài mediaDir. Trả về các tệp đã xét là xoá. */
export async function sweepMedia(db: Db, mediaDir: string, files: string[]): Promise<string[]> {
  const base = path.resolve(mediaDir);
  const inside = (rel: string) => { const p = path.resolve(base, rel); return p.startsWith(base + path.sep) ? p : null; };
  const want = [...new Set(files)].filter((f) => inside(f));
  if (!want.length) return [];
  const used = await stillUsed(db, want);
  const gone: string[] = [];
  for (const rel of want) {
    if (used.has(rel)) continue;
    await unlink(inside(rel)!).catch(() => {});
    gone.push(rel);
    if (rel.includes('/')) continue;
    for (const s of THUMB_SIZES) {
      const th = inside(`w${s}/${rel.replace(/\.\w+$/, '.jpg')}`);
      if (th) await unlink(th).catch(() => {});
    }
  }
  return gone;
}

const h = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json(errorBody('server'));
  });

export type Deps = { connect: () => Promise<Client>; db: Db; mediaDir: string };
const defaults: Deps = { connect: () => pool.connect(), db: pool, mediaDir: MEDIA_DIR };

export function membersRouter(deps: Deps = defaults) {
  const r = express.Router();
  r.delete('/members/:id', h(async (req, res) => {
    const me = req.member as { id: string; family_id: string };
    const id = String(req.params.id);
    const out = await removeMember(deps.connect, me.family_id, me.id, id);
    if (out.status !== 'ok') {
      if (out.status === 'self') return res.status(400).json(errorBody('member_self'));
      if (out.status === 'not_found') return res.status(404).json(errorBody('member_not_found'));
      return res.status(401).json(errorBody('not_signed_in'));
    }
    console.log(`[members] ${me.id.slice(0, 8)} xoá ${id.slice(0, 8)} khỏi nhà ${me.family_id.slice(0, 8)}:`, out.counts);
    closeChatStreams(me.family_id, id);
    closeLive(me.family_id, id);
    res.json({ ok: true });
    void sweepMedia(deps.db, deps.mediaDir, out.files)
      .then((gone) => { if (gone.length) console.log(`[members] đã xoá ${gone.length}/${out.files.length} tệp media của ${id.slice(0, 8)}`); })
      .catch((e) => console.error('[members] dọn tệp media lỗi:', e));
  }));
  // Tự rời nhà (nút "rời nhà" ở Cài đặt). Xong thì mã của máy này mất theo, máy bỏ mã và về màn đầu.
  // Đã bị người khác xoá trước thì 401 như mọi đường khác khi mã không còn.
  r.delete('/me', h(async (req, res) => {
    const me = req.member as { id: string; family_id: string };
    const out = await leaveFamily(deps.connect, me.family_id, me.id);
    if (out.status !== 'ok') return res.status(401).json(errorBody('not_signed_in'));
    console.log(`[members] ${me.id.slice(0, 8)} tự rời nhà ${me.family_id.slice(0, 8)}${out.last ? ' (người cuối, xoá luôn nhà)' : ''}:`, out.counts);
    closeChatStreams(me.family_id, me.id);
    closeLive(me.family_id, me.id);
    res.json({ ok: true });
    void sweepMedia(deps.db, deps.mediaDir, out.files)
      .then((gone) => { if (gone.length) console.log(`[members] đã xoá ${gone.length}/${out.files.length} tệp media của ${me.id.slice(0, 8)}`); })
      .catch((e) => console.error('[members] dọn tệp media lỗi:', e));
  }));
  return r;
}
