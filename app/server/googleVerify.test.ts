// Kiểm phần xác minh ID token Google bằng khoá RSA tự sinh và JWKS giả: node --import tsx --test server/googleVerify.test.ts
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { GoogleTokenError, jwksSource, verifyIdToken, type Jwk, type KeySource } from './googleVerify.ts';

const CLIENT = 'test-client.apps.googleusercontent.com';
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const sec = Math.floor(NOW / 1000);

const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, jwk: publicKey.export({ format: 'jwk' }) as Jwk };
};
const A = pair();
const B = pair();
const keysOf = (map: Record<string, Jwk>): KeySource => async (kid) => map[kid] ?? null;
const keys = keysOf({ a: { ...A.jwk, kid: 'a', alg: 'RS256', use: 'sig' } });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims: Record<string, unknown>, opt: { kid?: string; alg?: string; key?: typeof A.privateKey } = {}) {
  const head = b64({ alg: opt.alg ?? 'RS256', kid: opt.kid ?? 'a', typ: 'JWT' });
  const body = b64(claims);
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), opt.key ?? A.privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const good = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com', aud: CLIENT, azp: CLIENT, sub: '1234567890', email: 'lan@gmail.com', email_verified: true,
  name: 'Lan Nguyen', given_name: 'Lan', iat: sec - 10, exp: sec + 3600, nonce: 'n1', ...over,
});
const check = (token: string, extra: Partial<Parameters<typeof verifyIdToken>[1]> = {}) =>
  verifyIdToken(token, { clientId: CLIENT, nonce: 'n1', keys, now: NOW, ...extra });
const rejects = (p: Promise<unknown>, why: RegExp) => assert.rejects(p, (e: Error) => e instanceof GoogleTokenError && why.test(e.message));

test('token đúng: trả sub, email đã xác minh, tên', async () => {
  const id = await check(jwt(good()));
  assert.deepEqual(id, { sub: '1234567890', email: 'lan@gmail.com', name: 'Lan Nguyen', givenName: 'Lan' });
});

test('iss không có https cũng nhận', async () => {
  assert.equal((await check(jwt(good({ iss: 'accounts.google.com' })))).sub, '1234567890');
});

test('email chưa xác minh thì không trả email', async () => {
  assert.equal((await check(jwt(good({ email_verified: false })))).email, null);
  assert.equal((await check(jwt(good({ email_verified: undefined })))).email, null);
});

test('sửa nội dung sau khi ký: chữ ký sai', async () => {
  const [h, , s] = jwt(good()).split('.');
  await rejects(check(`${h}.${b64(good({ sub: 'attacker' }))}.${s}`), /signature/);
});

test('ký bằng khoá khác cùng kid: chữ ký sai', async () => {
  await rejects(check(jwt(good(), { key: B.privateKey })), /signature/);
});

test('kid lạ: không có khoá', async () => {
  await rejects(check(jwt(good(), { kid: 'zzz' })), /no key/);
});

test('alg none hoặc HS256: không nhận', async () => {
  const head = b64({ alg: 'none', kid: 'a' });
  await rejects(check(`${head}.${b64(good())}.x`), /alg/);
  await rejects(check(jwt(good(), { alg: 'HS256' })), /alg/);
});

test('aud của app khác: không nhận', async () => {
  await rejects(check(jwt(good({ aud: 'other.apps.googleusercontent.com' }))), /aud/);
  await rejects(check(jwt(good({ aud: ['other', CLIENT], azp: 'other' }))), /aud/);
});

test('iss lạ: không nhận', async () => {
  await rejects(check(jwt(good({ iss: 'https://evil.example.com' }))), /iss/);
});

test('hết hạn (quá 60 giây lệch đồng hồ): không nhận', async () => {
  await rejects(check(jwt(good({ exp: sec - 61 }))), /expired/);
  assert.ok(await check(jwt(good({ exp: sec - 30 }))));
  await rejects(check(jwt(good({ exp: undefined }))), /expired/);
});

test('iat ở tương lai: không nhận', async () => {
  await rejects(check(jwt(good({ iat: sec + 600 }))), /iat/);
});

test('nonce khác: không nhận', async () => {
  await rejects(check(jwt(good({ nonce: 'n2' }))), /nonce/);
  await rejects(check(jwt(good({ nonce: undefined }))), /nonce/);
});

test('thiếu sub hoặc token sai dạng: không nhận', async () => {
  await rejects(check(jwt(good({ sub: '' }))), /sub/);
  await rejects(check('abc'), /malformed/);
  await rejects(check('a.b.c'), /malformed/);
});

test('JWKS: nhớ đệm theo max-age, kid lạ thì tải lại (tối đa 1 lần/phút)', async () => {
  let clock = NOW;
  let calls = 0;
  let served: Jwk[] = [{ ...A.jwk, kid: 'a' }];
  const fakeFetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ keys: served }), { headers: { 'cache-control': 'public, max-age=600' } });
  }) as typeof fetch;
  const src = jwksSource('https://example.test/certs', fakeFetch, () => clock);
  assert.ok(await src('a'));
  assert.ok(await src('a'));
  assert.equal(calls, 1, 'còn hạn thì không tải lại');
  // Google xoay khoá: kid mới chưa có, quá 1 phút thì tải lại.
  served = [{ ...A.jwk, kid: 'a' }, { ...B.jwk, kid: 'b' }];
  assert.equal(await src('b'), null, 'vừa tải xong chưa tới 1 phút thì không tải lại');
  clock += 61_000;
  assert.ok(await src('b'));
  assert.equal(calls, 2);
  // Hết max-age thì tải lại.
  clock += 600_000;
  await src('a');
  assert.equal(calls, 3);
  // Token ký bằng khoá b xác minh được qua JWKS mới.
  const id = await verifyIdToken(jwt(good(), { kid: 'b', key: B.privateKey }), { clientId: CLIENT, nonce: 'n1', keys: src, now: NOW });
  assert.equal(id.sub, '1234567890');
});

test('JWKS: tải lại hỏng mà còn khoá cũ thì dùng khoá cũ', async () => {
  let clock = NOW;
  let fail = false;
  const fakeFetch = (async () => {
    if (fail) throw new Error('offline');
    return new Response(JSON.stringify({ keys: [{ ...A.jwk, kid: 'a' }] }), { headers: { 'cache-control': 'max-age=60' } });
  }) as typeof fetch;
  const src = jwksSource('https://example.test/certs', fakeFetch, () => clock);
  assert.ok(await src('a'));
  fail = true;
  clock += 120_000;
  assert.ok(await src('a'));
  await assert.rejects(src('b'));
});
