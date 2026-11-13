// Xác minh ID token của Google (JWT ký RS256) bằng node:crypto, không cần thư viện ngoài.
// Kiểm: chữ ký theo khoá công khai trong JWKS của Google, alg, iss, aud, exp, iat, nonce. Thuần, không đụng DB; test ở googleVerify.test.ts.
// Lý do lỗi viết tiếng Anh, chỉ để ghi log máy chủ.
import { createPublicKey, verify, type webcrypto } from 'node:crypto';

export type Jwk = webcrypto.JsonWebKey & { kid?: string };

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
// Lệch đồng hồ cho phép giữa máy chủ mình và Google (giây).
const SKEW = 60;

export type GoogleIdentity = { sub: string; email: string | null; name: string | null; givenName: string | null };
/** Tìm khoá công khai theo kid; không có thì trả null. */
export type KeySource = (kid: string) => Promise<Jwk | null>;

export class GoogleTokenError extends Error {}

const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/** Xác minh token; hỏng bất kỳ điều kiện nào thì ném GoogleTokenError. Email chỉ trả khi Google đã xác minh (email_verified). */
export async function verifyIdToken(token: string, opts: { clientId: string; nonce?: string; keys: KeySource; now?: number }): Promise<GoogleIdentity> {
  const fail = (why: string): never => { throw new GoogleTokenError(why); };
  if (!opts.clientId) fail('missing client id');
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[\w-]+$/.test(p))) fail('malformed token');
  let header: Record<string, unknown> = {}, claims: Record<string, unknown> = {};
  try { header = b64json(parts[0]); claims = b64json(parts[1]); } catch { fail('malformed token'); }
  if (header.alg !== 'RS256') fail(`alg ${String(header.alg)} not accepted`);
  if (typeof header.kid !== 'string' || !header.kid) fail('missing kid');
  const jwk = await opts.keys(header.kid as string);
  if (!jwk || jwk.kty !== 'RSA') fail('no key for kid');
  let ok = false;
  try {
    ok = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk!, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  } catch { ok = false; }
  if (!ok) fail('bad signature');

  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!ISSUERS.has(String(claims.iss))) fail('bad iss');
  const aud = claims.aud;
  if (Array.isArray(aud) ? !aud.includes(opts.clientId) || claims.azp !== opts.clientId : aud !== opts.clientId) fail('bad aud');
  if (typeof claims.exp !== 'number' || now > claims.exp + SKEW) fail('expired');
  if (typeof claims.iat === 'number' && claims.iat > now + SKEW) fail('iat in the future');
  if (opts.nonce !== undefined && claims.nonce !== opts.nonce) fail('bad nonce');
  if (typeof claims.sub !== 'string' || !claims.sub) fail('missing sub');

  const verified = claims.email_verified === true || claims.email_verified === 'true';
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { sub: claims.sub as string, email: verified ? str(claims.email) : null, name: str(claims.name), givenName: str(claims.given_name) };
}

/** Bộ khoá JWKS có nhớ đệm theo Cache-Control max-age; gặp kid lạ (Google xoay khoá) thì tải lại, tối đa một lần mỗi phút. */
export function jwksSource(url = GOOGLE_JWKS_URL, fetchFn: typeof fetch = fetch, clock: () => number = Date.now): KeySource {
  let keys = new Map<string, Jwk>();
  let until = 0;
  let lastFetch = -Infinity;
  let inflight: Promise<void> | null = null;
  const load = () => (inflight ??= (async () => {
    try {
      lastFetch = clock();
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`JWKS ${res.status}`);
      const body = (await res.json()) as { keys?: Jwk[] };
      keys = new Map((body.keys ?? []).filter((k) => k.kid).map((k) => [k.kid as string, k]));
      const age = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
      until = clock() + Math.max(60, age) * 1000;
    } finally { inflight = null; }
  })());
  return async (kid) => {
    // Tải lại hỏng mà khoá cũ còn đúng kid thì dùng tạm khoá cũ.
    const refresh = () => load().catch((e) => { if (!keys.has(kid)) throw e; });
    if (clock() >= until) await refresh();
    else if (!keys.has(kid) && clock() - lastFetch > 60_000) await refresh();
    return keys.get(kid) ?? null;
  };
}
