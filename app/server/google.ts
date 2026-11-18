// Đăng nhập bằng Google: OpenID Connect chuyển cả trang, Google gửi id_token về máy chủ bằng form POST (response_mode=form_post).
// Không dùng popup hay nút của Google Identity Services vì app hay được mở từ Màn hình chính iPhone (standalone): xem docs/google-login.md.
//
// 1. POST /api/google/start {intent}: máy chủ tạo state, nonce và bind (bí mật của máy, không bao giờ lên URL), trả link Google.
//    Máy khách giữ {state, bind} trong localStorage rồi chuyển cả trang sang Google.
// 2. Google POST id_token + state về /api/google/callback: xác minh token (chữ ký JWKS, aud, iss, exp, nonce), ghi danh tính vào hàng
//    của state đó, rồi chuyển về /?google=1. Trên URL không có gì bí mật.
// 3. POST /api/google/finish {state, bind}: đúng bind mới nhận kết quả: vào nhà (đã liên kết), liên kết (từ Cài đặt), hoặc người mới.
//    iPhone lỡ mở Google ở cửa sổ khác thì app trên Màn hình chính vẫn tự hỏi được bằng state và bind của mình khi quay lại.
// Người mới: tạo nhà kèm {google: {state, bind}} thì linkPendingGoogle() nối luôn; xin vào nhà thì takePendingGoogle() giữ danh tính
// trong lời xin, người duyệt cho vào mới nối (server/join.ts). Chưa đặt GOOGLE_CLIENT_ID thì tắt hẳn.
import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool } from './db.ts';
import { errorBody, reqLang } from './i18n.ts';
import { jwksSource, verifyIdToken, type KeySource } from './googleVerify.ts';
import { SQL as JOIN_SQL } from './join.ts';

// Bộ giả chỉ để chạy thử trên máy (GOOGLE_FAKE=1); trên Railway luôn tắt.
const FAKE = process.env.GOOGLE_FAKE === '1' && process.env.NODE_ENV !== 'production' && !Object.keys(process.env).some((k) => k.startsWith('RAILWAY_'));
const fake = FAKE ? await import('./googleFake.ts') : null;
const clientId = () => process.env.GOOGLE_CLIENT_ID?.trim() || (fake ? 'fake-client.apps.googleusercontent.com' : '');
const enabled = () => !!clientId();
const keys: KeySource = fake ? fake.fakeKeys : jwksSource();

const PENDING_MIN = 15; // chờ người dùng chọn tài khoản ở Google
const VERIFIED_MIN = 60; // người mới: đủ thời gian đi hết phần làm quen rồi tạo nhà
const MAX_TRIES = 5; // gửi sai bind quá số lần này thì xoá hẳn hàng

type Row = { state: string; bind_hash: string; nonce: string; intent: 'signin' | 'link'; member_id: string | null; sub: string | null; email: string | null; name: string | null; error: string | null; tries: number; expires_at: Date };

const rand = (n: number) => randomBytes(n).toString('base64url');
const sha = (s: string) => createHash('sha256').update(s).digest();

// Giới hạn tần suất theo IP, giữ trong bộ nhớ (Railway chạy một instance).
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs = 10 * 60_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 20_000) for (const [k, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(k);
  return list.length > max;
}

type Handler = (req: express.Request, res: express.Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: express.Request, res: express.Response) =>
  fn(req, res).catch((err: Error) => { console.error('[google]', err); if (!res.headersSent) res.status(500).json(errorBody('server')); });

async function memberByToken(req: express.Request): Promise<string | null> {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return null;
  const { rows } = await pool.query('select id from members where token = $1', [token]);
  return rows[0]?.id ?? null;
}

const drop = (state: string) => pool.query('delete from google_auth where state = $1', [state]);

/** Hàng của state nếu bind đúng và còn hạn. Sai bind thì đếm, sai nhiều thì xoá để khỏi dò. */
async function claim(state: unknown, bind: unknown): Promise<Row | null> {
  if (typeof state !== 'string' || typeof bind !== 'string' || !state || !bind || state.length > 100 || bind.length > 100) return null;
  const { rows: [row] } = await pool.query<Row>('select * from google_auth where state = $1', [state]);
  if (!row) return null;
  if (!timingSafeEqual(sha(bind), Buffer.from(row.bind_hash, 'hex'))) {
    if (row.tries + 1 >= MAX_TRIES) await drop(state);
    else await pool.query('update google_auth set tries = tries + 1 where state = $1', [state]);
    return null;
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) { await drop(state); return null; }
  return row;
}

/** Địa chỉ Google gửi kết quả về; phải trùng một Authorized redirect URI trong Google Cloud Console.
 *  Lấy theo Origin của trang đã bấm (proxy của Vite lúc dev đổi Host); địa chỉ lạ thì Google tự từ chối vì chưa đăng ký. */
function redirectUri(req: express.Request) {
  const origin = req.get('origin') ?? '';
  const base = /^https?:\/\/[\w.-]+(:\d+)?$/.test(origin) ? origin : `${req.protocol}://${req.get('host')}`;
  return process.env.GOOGLE_REDIRECT_URI?.trim() || `${base}/api/google/callback`;
}

export const googlePublicRouter = express.Router();
if (fake) googlePublicRouter.use(fake.fakeRouter(clientId));

// Máy khách chỉ cần biết có bật hay không; link Google do máy chủ dựng nên không cần gửi client id xuống.
googlePublicRouter.get('/google', (_req, res) => { res.json({ enabled: enabled() }); });

googlePublicRouter.post('/google/start', wrap(async (req, res) => {
  if (!enabled()) return res.status(404).json(errorBody('google_off'));
  if (limited(`start:${req.ip}`, 20)) return res.status(429).json(errorBody('too_many'));
  const intent = req.body?.intent === 'link' ? 'link' : 'signin';
  const memberId = intent === 'link' ? await memberByToken(req) : null;
  if (intent === 'link' && !memberId) return res.status(401).json(errorBody('not_signed_in'));
  const state = rand(24), bind = rand(24), nonce = rand(16);
  await pool.query('delete from google_auth where expires_at < now()');
  await pool.query(
    `insert into google_auth (state, bind_hash, nonce, intent, member_id, expires_at) values ($1,$2,$3,$4,$5, now() + make_interval(mins => $6))`,
    [state, sha(bind).toString('hex'), nonce, intent, memberId, PENDING_MIN],
  );
  const q = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(req), response_type: 'id_token', response_mode: 'form_post',
    scope: 'openid email profile', state, nonce, prompt: 'select_account', hl: reqLang(),
  });
  res.json({ url: `${fake ? '/api/google/fake' : 'https://accounts.google.com/o/oauth2/v2/auth'}?${q}`, state, bind });
}));

// Google gửi về bằng form POST. Mọi trường hợp đều chuyển về app; kết quả chỉ lấy được qua /google/finish với đúng bind.
const form = express.urlencoded({ extended: false, limit: '16kb' });
googlePublicRouter.post('/google/callback', form, wrap(async (req, res) => {
  const back = () => res.redirect(303, '/?google=1');
  if (limited(`cb:${req.ip}`, 30)) return back();
  const state = String(req.body?.state ?? '');
  const { rows: [row] } = await pool.query<Row>('select * from google_auth where state = $1 and expires_at > now()', [state]);
  // State lạ, hết hạn, hoặc Google gửi lần hai (iPhone có lúc mở lại cùng địa chỉ trong app): không làm gì thêm.
  if (!row || row.sub || row.error) return back();
  const token = req.body?.id_token;
  if (typeof token !== 'string' || !token) {
    await pool.query('update google_auth set error = $2 where state = $1', [state, req.body?.error === 'access_denied' ? 'cancel' : 'failed']);
    return back();
  }
  try {
    const id = await verifyIdToken(token, { clientId: clientId(), nonce: row.nonce, keys });
    await pool.query(
      `update google_auth set sub = $2, email = $3, name = $4, expires_at = now() + make_interval(mins => $5) where state = $1`,
      [state, id.sub, id.email, (id.givenName || id.name || '').slice(0, 30) || null, VERIFIED_MIN],
    );
  } catch (e) {
    console.error('[google] id_token không qua:', (e as Error).message);
    await pool.query('update google_auth set error = $2 where state = $1', [state, 'failed']);
  }
  back();
}));
// iPhone chuyển từ trình duyệt trong app về app chính có thể mở lại địa chỉ này bằng GET.
googlePublicRouter.get('/google/callback', (_req, res) => res.redirect(303, '/?google=1'));

googlePublicRouter.post('/google/finish', wrap(async (req, res) => {
  if (limited(`finish:${req.ip}`, 60)) return res.status(429).json(errorBody('too_many'));
  const row = await claim(req.body?.state, req.body?.bind);
  if (!row) return res.status(410).json(errorBody('google_expired'));
  if (row.error) {
    await drop(row.state);
    return row.error === 'cancel' ? res.json({ status: 'cancel' }) : res.status(400).json(errorBody('google_failed'));
  }
  if (!row.sub) return res.json({ status: 'pending' });

  if (row.intent === 'link') {
    // Liên kết từ Cài đặt: đúng người đã bấm (mã của máy) mới được nối.
    const me = await memberByToken(req);
    if (!me || me !== row.member_id) return res.status(401).json(errorBody('not_signed_in'));
    await drop(row.state);
    try {
      const r = await pool.query('update members set google_sub = $2, google_email = $3 where id = $1 and not exists (select 1 from members where google_sub = $2 and id <> $1)', [me, row.sub, row.email]);
      if (!r.rowCount) return res.status(409).json(errorBody('google_taken'));
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return res.status(409).json(errorBody('google_taken'));
      throw e;
    }
    return res.json({ status: 'linked', email: row.email });
  }

  const { rows: [m] } = await pool.query('update members set last_seen = now() where google_sub = $1 returning token', [row.sub]);
  if (m) { await drop(row.state); return res.json({ status: 'signin', token: m.token }); }
  // Đã xin vào nhà bằng tài khoản này, chưa được duyệt: trả mã của lời xin, máy hiện màn chờ (server/join.ts).
  const { rows: [jr] } = await pool.query(JOIN_SQL.byGoogle, [row.sub]);
  if (jr) { await drop(row.state); return res.json({ status: 'signin', token: jr.token }); }
  // Chưa có nhà: giữ hàng này để tạo nhà hoặc vào nhà xong thì nối.
  res.json({ status: 'new', name: row.name, email: row.email });
}));

/** Xin vào nhà bằng Google: lấy danh tính đã xác minh của phiên đang dở rồi bỏ phiên. Lời xin giữ danh tính này, được duyệt mới nối.
 *  undefined: không xin nối; null: phiên hỏng, hết hạn, hay tài khoản đã thuộc một thành viên khác. */
export async function takePendingGoogle(g: unknown): Promise<{ sub: string; email: string | null } | null | undefined> {
  if (!g || typeof g !== 'object') return undefined;
  const { state, bind } = g as { state?: unknown; bind?: unknown };
  const row = await claim(state, bind);
  if (!row || row.intent !== 'signin' || !row.sub || row.error) return null;
  await drop(row.state);
  const { rowCount } = await pool.query('select 1 from members where google_sub = $1', [row.sub]);
  return rowCount ? null : { sub: row.sub, email: row.email };
}

/** Gọi ngay sau khi tạo thành viên mới (tạo nhà). Trả undefined nếu không xin nối, true/false là nối được hay không. */
export async function linkPendingGoogle(memberId: string, g: unknown): Promise<boolean | undefined> {
  if (!g || typeof g !== 'object') return undefined;
  const { state, bind } = g as { state?: unknown; bind?: unknown };
  const row = await claim(state, bind);
  if (!row || row.intent !== 'signin' || !row.sub || row.error) return false;
  await drop(row.state);
  try {
    const r = await pool.query('update members set google_sub = $2, google_email = $3 where id = $1 and not exists (select 1 from members where google_sub = $2)', [memberId, row.sub, row.email]);
    return r.rowCount === 1;
  } catch {
    return false;
  }
}

// Sau lớp auth: trạng thái liên kết của chính mình, và huỷ liên kết.
export const googleRouter = express.Router();
type AuthReq = express.Request & { member?: { id: string } };

googleRouter.get('/google/me', wrap(async (req: AuthReq, res) => {
  const { rows: [m] } = await pool.query('select google_sub, google_email from members where id = $1', [req.member!.id]);
  res.json({ enabled: enabled(), linked: !!m?.google_sub, email: m?.google_email ?? null });
}));

googleRouter.delete('/google/link', wrap(async (req: AuthReq, res) => {
  await pool.query('update members set google_sub = null, google_email = null where id = $1', [req.member!.id]);
  res.json({ ok: true });
}));
