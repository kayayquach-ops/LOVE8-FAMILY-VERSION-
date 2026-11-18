// Xin vào nhà (docs/audit-2026-11.md, C1): mã nhà chỉ 6-7 số nên gõ mã hay bấm link mời không còn vào thẳng nhà,
// mà tạo một lời xin trong bảng join_requests. Người duyệt ("người lập") là người vào nhà sớm nhất còn ở trong nhà
// (members.created_at); người đó bị xoá khỏi nhà thì người kế tiếp tự thành người duyệt. Tạo nhà mới thì mình là người duyệt.
//
// Lời xin nằm riêng, không ở bảng members: mọi chỗ chọn thành viên theo family_id (thông báo đẩy, cuộc gọi tuần, video tuần,
// chụp chung, lịch) không bao giờ đụng tới người chưa được duyệt. Mã của lời xin không gọi được đường nào sau auth (403 join_pending),
// chỉ biết tên nhà và tên gọi của người duyệt.
// Duyệt: thêm hàng members giữ nguyên mã của lời xin (máy không phải lấy mã mới) rồi xoá lời xin, một giao dịch. Không cho vào: xoá lời xin.
// Lời xin quá 7 ngày coi như không còn.
// Kiểm thử: server/join.test.ts (DB giả chạy đúng các câu trong SQL bên dưới, không cần Postgres).
import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { adoptLang, errorBody, isLang, tReq } from './i18n.ts';
import { ipOf, Limit, limitBy } from './limit.ts';

export type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
export type Client = Db & { release: () => void };

export const EXPIRE_DAYS = 7;
/** Số lời xin còn chờ tối đa của một nhà: người biết mã cũng không dồn được cả trăm lời xin cho người duyệt. */
export const MAX_OPEN = 10;

const live = (p = '') => `${p}created_at > now() - make_interval(days => ${EXPIRE_DAYS})`;

/** Mọi câu SQL của phần xin vào nhà. Kiểm thử dựng DB giả theo đúng các câu này. */
export const SQL = {
  family: 'select id, name from families where code = $1',
  approver: 'select id, name from members where family_id = $1 order by created_at, id limit 1',
  member: 'select id from members where token = $1',
  touch: 'update members set last_seen = now() where token = $1 returning id, family_id, lang',
  open: `select count(*)::int n from join_requests where family_id = $1 and ${live()}`,
  insert: 'insert into join_requests (id, family_id, token, name, role, city, intro, lang, google_sub, google_email) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
  byToken: `select r.family_id, f.name family_name from join_requests r join families f on f.id = r.family_id where r.token = $1 and ${live('r.')}`,
  byGoogle: `select token from join_requests where google_sub = $1 and ${live()} order by created_at desc limit 1`,
  list: `select id, name, role, city, created_at from join_requests where family_id = $1 and ${live()} order by created_at, id`,
  lock: `select * from join_requests where id = $1 and family_id = $2 and ${live()} for update`,
  addMember: 'insert into members (id, family_id, name, role, token, city, intro, lang) values ($1,$2,$3,$4,$5,$6,$7,$8)',
  drop: 'delete from join_requests where id = $1',
  cancel: 'delete from join_requests where token = $1',
  sweep: `delete from join_requests where not (${live()})`,
  linkGoogle: 'update members set google_sub = $2, google_email = $3 where id = $1 and not exists (select 1 from members where google_sub = $2)',
};

export async function migrateJoin(db: Db) {
  await db.query(`
    create table if not exists join_requests (
      id text primary key, family_id text not null references families(id), token text not null unique,
      name text not null, role text not null, city text, intro text, lang text, google_sub text, google_email text,
      created_at timestamptz not null default now()
    );
    create index if not exists join_requests_family on join_requests (family_id, created_at);
  `);
}

/** Tên, vai, nơi ở, khảo sát, ngôn ngữ của người mới: dùng chung cho tạo nhà và xin vào nhà. */
export function memberFields(b: any) {
  // Khảo sát lúc mới vào: wantHug (muốn ôm) và loveVoice (có thu câu thương đầu tiên) chỉ nhận true/false, bản cũ không có các trường này.
  for (const k of ['wantHug', 'loveVoice']) {
    if (!b.intro || typeof b.intro !== 'object' || !(k in b.intro)) continue;
    const w = b.intro[k];
    if (w === true || w === 'true') b.intro[k] = true;
    else if (w === false || w === 'false') b.intro[k] = false;
    else delete b.intro[k];
  }
  return {
    name: String(b.name || '').slice(0, 30) || tReq('member.defaultName'),
    role: ['bo', 'me', 'con'].includes(b.role) ? b.role as string : 'con',
    city: b.city ? String(b.city).slice(0, 300) : null,
    intro: b.intro ? JSON.stringify(b.intro).slice(0, 4000) : null,
    lang: isLang(b.lang) ? b.lang as string : null,
  };
}

/** Tên gọi (chữ cuối của tên, như Trang chủ hiện): lời xin chỉ được biết chừng này về người duyệt. */
export const given = (name: unknown) => String(name ?? '').trim().split(/\s+/).pop() ?? '';

const bearer = (req: express.Request) => String(req.headers.authorization ?? '').replace(/^Bearer /, '');

/** Người duyệt của nhà: người vào nhà sớm nhất còn ở trong nhà. */
export async function approverOf(db: Db, familyId: string): Promise<{ id: string; name: string } | null> {
  const { rows } = await db.query(SQL.approver, [familyId]);
  return rows[0] ?? null;
}

/** Mã của một lời xin còn hạn: tên nhà và tên gọi người duyệt, không gì hơn. Không phải lời xin thì null. */
export async function pendingOf(db: Db, token: string): Promise<{ familyName: string; approverName: string } | null> {
  if (!token) return null;
  const { rows: [r] } = await db.query(SQL.byToken, [token]);
  if (!r) return null;
  const ap = await approverOf(db, r.family_id);
  return { familyName: r.family_name, approverName: given(ap?.name) };
}

type AuthReq = express.Request & { member?: { id: string; family_id: string; lang?: string | null } };

/** Không mật khẩu: mỗi máy giữ một mã riêng, gửi kèm mọi lần gọi. Mỗi lần gọi cũng là một lần "còn hoạt động".
 *  Mã của lời xin chưa duyệt nhận 403 join_pending (máy không bỏ mã, hiện màn chờ); mã không còn gì thì 401. */
export function memberAuth(db: Db) {
  return async (req: AuthReq, res: express.Response, next: express.NextFunction) => {
    const token = bearer(req);
    if (!token) return res.status(401).json(errorBody('not_signed_in'));
    const { rows } = await db.query(SQL.touch, [token]);
    if (rows[0]) {
      adoptLang(rows[0].lang);
      req.member = rows[0];
      return next();
    }
    const p = await pendingOf(db, token);
    if (p) return res.status(403).json({ ...errorBody('join_pending'), ...p });
    res.status(401).json(errorBody('not_signed_in'));
  };
}

export type JoinRequestRow = { id: string; name: string; role: string; city: string | null; createdAt: string };

/** Phần của /api/me về lời xin: người duyệt thấy tên, vai, nơi ở từng người; người khác chỉ biết có bao nhiêu người đang chờ. */
export async function joinView(db: Db, familyId: string, memberId: string):
  Promise<{ approverId: string | null; requests: JoinRequestRow[] } | { approverId: string | null; waiting: number }> {
  const [ap, list] = await Promise.all([approverOf(db, familyId), db.query(SQL.list, [familyId])]);
  const approverId = ap?.id ?? null;
  if (approverId !== memberId) return { approverId, waiting: list.rows.length };
  return {
    approverId,
    requests: list.rows.map((r) => ({ id: r.id, name: r.name, role: r.role, city: r.city ?? null, createdAt: new Date(r.created_at).toISOString() })),
  };
}

export type Decided =
  | { status: 'ok'; memberId: string | null; name: string; google: { sub: string; email: string | null } | null }
  | { status: 'not_approver' | 'not_found' };

/** Cho vào (yes) hoặc không. Chỉ người duyệt của nhà làm được; lời xin phải thuộc nhà đó và còn hạn. Một giao dịch. */
export async function decide(connect: () => Promise<Client>, familyId: string, callerId: string, requestId: string, yes: boolean): Promise<Decided> {
  const c = await connect();
  try {
    await c.query('begin');
    const ap = await approverOf(c, familyId);
    if (!ap || ap.id !== callerId) {
      await c.query('rollback');
      return { status: 'not_approver' };
    }
    // Khoá lời xin: hai lần bấm cùng lúc thì lần sau chờ, xong thấy lời xin đã hết (không thành hai thành viên).
    const { rows: [r] } = await c.query(SQL.lock, [requestId, familyId]);
    if (!r) {
      await c.query('rollback');
      return { status: 'not_found' };
    }
    let memberId: string | null = null;
    if (yes) {
      memberId = randomUUID();
      await c.query(SQL.addMember, [memberId, familyId, r.name, r.role, r.token, r.city, r.intro, r.lang]);
    }
    await c.query(SQL.drop, [requestId]);
    await c.query('commit');
    return { status: 'ok', memberId, name: r.name, google: yes && r.google_sub ? { sub: r.google_sub, email: r.google_email ?? null } : null };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const h = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error('[join]', err);
    if (!res.headersSent) res.status(500).json(errorBody('server'));
  });

export type Deps = {
  db: Db;
  connect: () => Promise<Client>;
  /** Báo người duyệt có người xin vào (server/push.ts notifyJoin). */
  notify: (approverId: string, requestId: string, name: string) => void;
  /** Danh tính Google đã xác minh của phiên đang dở (server/google.ts takePendingGoogle): không xin nối thì undefined, không lấy được thì null. */
  google: (g: unknown) => Promise<{ sub: string; email: string | null } | null | undefined>;
};

/** Các đường không cần là thành viên (gắn TRƯỚC auth): tra mã nhà, xin vào nhà, máy đang chờ hỏi kết quả, huỷ lời xin. */
export function joinPublicRouter(deps: Deps) {
  const r = express.Router();
  // Mã nhà chỉ 6 hoặc 7 chữ số: mỗi IP sai 10 lần mỗi 10 phút, cả máy chủ 100 lần sai mỗi giờ (đổi IP liên tục cũng không quét nổi).
  // Tra mã và xin vào nhà dùng chung lượt. Nhập đúng không tốn lượt.
  const codeTries = limitBy({ name: 'family-code', per: new Limit(10, 10 * 60e3), total: new Limit(100, 3600e3), onlyFailed: true, code: 'too_many_tries' });
  // Lời xin gửi được (mã đúng): mỗi IP 10 lời mỗi giờ, để người biết mã cũng không đẩy thông báo liên tục cho người duyệt.
  const asks = new Limit(10, 3600e3);

  r.get('/family/:code', codeTries, h(async (req, res) => {
    const { rows } = await deps.db.query(SQL.family, [String(req.params.code)]);
    if (!rows[0]) return res.status(404).json(errorBody('family_not_found'));
    res.json({ name: rows[0].name });
  }));

  r.post('/join', codeTries, h(async (req, res) => {
    const b = req.body ?? {};
    const ip = ipOf(req);
    const wait = asks.wait(ip);
    if (wait) {
      res.set('Retry-After', String(wait));
      return res.status(429).json(errorBody('too_many_tries'));
    }
    const { rows: [fam] } = await deps.db.query(SQL.family, [String(b.code || '').trim()]);
    if (!fam) return res.status(404).json(errorBody('family_code_not_found'));
    await deps.db.query(SQL.sweep);
    const { rows: [open] } = await deps.db.query(SQL.open, [fam.id]);
    if (Number(open?.n) >= MAX_OPEN) return res.status(429).json(errorBody('join_busy'));
    const f = memberFields(b);
    // Vào bằng Google: lời xin giữ danh tính đã xác minh (phiên Google chỉ sống một giờ), được duyệt mới nối vào thành viên.
    const g = await deps.google(b.google);
    const id = randomUUID();
    const token = randomBytes(24).toString('base64url');
    await deps.db.query(SQL.insert, [id, fam.id, token, f.name, f.role, f.city, f.intro, f.lang, g?.sub ?? null, g?.email ?? null]);
    asks.hit(ip);
    const ap = await approverOf(deps.db, fam.id);
    if (ap) deps.notify(ap.id, id, f.name);
    console.log(`[join] lời xin ${id.slice(0, 8)} vào nhà ${String(fam.id).slice(0, 8)}`);
    res.json({ token, pending: true, familyName: fam.name, approverName: given(ap?.name), ...(g === undefined ? {} : { google: !!g }) });
  }));

  // Máy đang chờ hỏi định kỳ: còn chờ, đã vào (mã giờ là mã thành viên), hay không còn gì (không được cho vào, hết hạn, đã huỷ: 401).
  r.get('/join/status', h(async (req, res) => {
    const token = bearer(req);
    if (token && (await deps.db.query(SQL.member, [token])).rows[0]) return res.json({ status: 'in' });
    const p = await pendingOf(deps.db, token);
    if (!p) return res.status(401).json(errorBody('not_signed_in'));
    res.json({ status: 'pending', ...p });
  }));

  // Người chờ tự huỷ (gõ nhầm mã nhà khác): xoá lời xin để người duyệt không còn thấy.
  r.delete('/join', h(async (req, res) => {
    const token = bearer(req);
    if (token) await deps.db.query(SQL.cancel, [token]);
    res.json({ ok: true });
  }));

  return r;
}

/** Đường của người duyệt (gắn SAU auth): cho vào, hoặc không. */
export function joinRouter(deps: Pick<Deps, 'db' | 'connect'>) {
  const r = express.Router();
  const act = (yes: boolean) => h(async (req: AuthReq, res) => {
    const me = req.member!;
    const out = await decide(deps.connect, me.family_id, me.id, String(req.params.id), yes);
    if (out.status === 'not_approver') return res.status(403).json(errorBody('join_not_approver'));
    if (out.status !== 'ok') return res.status(404).json(errorBody('join_not_found'));
    // Nối Google sau khi giao dịch xong: tài khoản vừa bị nối ở chỗ khác thì thôi, người mới vẫn vào nhà.
    if (out.memberId && out.google) await deps.db.query(SQL.linkGoogle, [out.memberId, out.google.sub, out.google.email]).catch(() => {});
    console.log(`[join] ${me.id.slice(0, 8)} ${yes ? 'cho vào' : 'không cho vào'} lời xin ${String(req.params.id).slice(0, 8)}`);
    res.json({ ok: true });
  });
  r.post('/join/requests/:id/approve', act(true));
  r.post('/join/requests/:id/deny', act(false));
  return r;
}
