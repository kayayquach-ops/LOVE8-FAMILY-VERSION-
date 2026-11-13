// Chạy thử trọn luồng đăng nhập Google với bộ giả, trên máy (KHÔNG chạy vào máy chủ thật).
// 1. GOOGLE_FAKE=1 PORT=3086 npx tsx server/index.ts   2. node scripts/google-flow.mjs http://localhost:3086
// Tạo vài nhà thử trên DB máy (DATABASE_URL trong .env) rồi xoá lại khi xong.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const BASE = process.argv[2] || 'http://localhost:3086';
process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const run = Math.random().toString(36).slice(2, 8);
const made = { families: new Set(), members: new Set(), states: new Set() };
let pass = 0;
const ok = (name) => { pass++; console.log('  ok', name); };

async function api(p, { method = 'GET', body, token } = {}) {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', 'x-lang': 'vi', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const formPost = (url, fields) => fetch(url.startsWith('http') ? url : BASE + url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields), redirect: 'manual' });
const unesc = (s) => s.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c));
const hidden = (html) => Object.fromEntries([...html.matchAll(/<input type="hidden" name="(\w+)" value="([^"]*)">/g)].map((m) => [m[1], unesc(m[2])]));

/** start → trang Google giả → id_token. Trả { state, bind, cb: {action, fields} }, chưa gửi callback. who = null là bấm Huỷ. */
async function begin(intent, token, who) {
  const s = await api('/api/google/start', { method: 'POST', body: { intent }, token });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const { url, state, bind } = s.data;
  made.states.add(state);
  assert.ok(url.startsWith('/api/google/fake?'), 'server chưa chạy GOOGLE_FAKE=1');
  const q = new URL(url, BASE).searchParams;
  assert.equal(q.get('response_type'), 'id_token');
  assert.equal(q.get('response_mode'), 'form_post');
  assert.equal(q.get('state'), state);
  assert.ok(!url.includes(bind), 'bind không được lên URL');
  const f = hidden(await (await fetch(BASE + url)).text());
  const signed = await (await formPost('/api/google/fake', who ? { ...f, ...who } : { ...f, cancel: '1' })).text();
  return { state, bind, cb: { action: unesc(/action="([^"]+)"/.exec(signed)[1]), fields: hidden(signed) } };
}
async function callback(cb) {
  const r = await formPost(cb.action, cb.fields);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/?google=1');
}
const finish = (f, token) => api('/api/google/finish', { method: 'POST', body: { state: f.state, bind: f.bind }, token });
const userA = { sub: `t-${run}-a`, email: `a-${run}@example.com`, name: 'Lan Nguyen' };
const userB = { sub: `t-${run}-b`, email: `b-${run}@example.com`, name: 'Minh Tran' };
async function track(token) {
  const { rows: [m] } = await db.query('select id, family_id from members where token = $1', [token]);
  made.members.add(m.id); made.families.add(m.family_id);
}

try {
  console.log('Luồng Google (bộ giả), lượt', run);
  assert.deepEqual((await api('/api/google')).data, { enabled: true }); ok('GET /api/google: bật');

  // 1. Người mới: chưa liên kết → làm quen → tạo nhà → tự liên kết.
  let f = await begin('signin', null, userA);
  assert.equal(f.cb.action, `${BASE}/api/google/callback`);
  assert.equal((await finish(f)).data.status, 'pending'); ok('chưa qua Google: pending');
  await callback(f.cb); ok('callback: 303 về /?google=1');
  assert.equal((await api('/api/google/finish', { method: 'POST', body: { state: f.state, bind: 'sai' } })).status, 410); ok('sai bind: 410');
  let r = await finish(f);
  assert.equal(r.data.status, 'new'); assert.equal(r.data.name, 'Lan'); assert.equal(r.data.email, userA.email); ok('chưa liên kết: new, có tên điền sẵn');
  const created = await api('/api/families', { method: 'POST', body: { family: `Test ${run}`, name: 'Lan', role: 'con', city: '', google: { state: f.state, bind: f.bind } } });
  assert.equal(created.status, 200); assert.equal(created.data.google, true); await track(created.data.token); ok('tạo nhà kèm google: nối luôn');
  const tokenA = created.data.token;
  const again = await api('/api/families', { method: 'POST', body: { family: `x-${run}`, name: 'x', role: 'con', city: '', google: { state: f.state, bind: f.bind } } });
  assert.equal(again.data.google, false); await track(again.data.token); ok('dùng lại phiên đã nối: google false');

  // 2. Máy mới: đã liên kết → vào thẳng nhà.
  f = await begin('signin', null, userA);
  await callback(f.cb);
  r = await finish(f);
  assert.equal(r.data.status, 'signin'); assert.equal(r.data.token, tokenA); ok('đã liên kết: signin trả đúng mã người đó');
  assert.equal((await finish(f)).status, 410); ok('finish lần hai: 410 (dùng một lần)');
  await callback(f.cb); ok('Google gửi lại lần hai: vẫn 303');
  assert.equal((await fetch(`${BASE}/api/google/callback`, { redirect: 'manual' })).headers.get('location'), '/?google=1'); ok('GET callback (iPhone mở lại): về /?google=1');

  // 3. Người đang dùng liên kết từ Cài đặt.
  const code = (await db.query('select code from families f join members m on m.family_id = f.id where m.token = $1', [tokenA])).rows[0].code;
  const plain = await api('/api/join', { method: 'POST', body: { code, name: 'Minh', role: 'bo', city: '' } });
  assert.equal(plain.status, 200); assert.equal(plain.data.google, undefined); await track(plain.data.token); ok('vào nhà bằng mã như cũ');
  const tokenB = plain.data.token;
  assert.equal((await api('/api/google/start', { method: 'POST', body: { intent: 'link' } })).status, 401); ok('link không có mã máy: 401');
  assert.deepEqual((await api('/api/google/me', { token: tokenB })).data, { enabled: true, linked: false, email: null }); ok('/google/me: chưa liên kết');
  f = await begin('link', tokenB, userB);
  await callback(f.cb);
  assert.equal((await finish(f)).status, 401); ok('finish link thiếu mã máy: 401');
  assert.equal((await finish(f, tokenA)).status, 401); ok('finish link bằng mã người khác: 401');
  r = await finish(f, tokenB);
  assert.equal(r.data.status, 'linked'); assert.equal(r.data.email, userB.email); ok('liên kết từ Cài đặt');
  assert.deepEqual((await api('/api/google/me', { token: tokenB })).data, { enabled: true, linked: true, email: userB.email }); ok('/google/me: đã liên kết');
  f = await begin('signin', null, userB); await callback(f.cb);
  assert.equal((await finish(f)).data.token, tokenB); ok('đăng nhập Google vào đúng người vừa liên kết');

  // 4. Tài khoản đã nối với người khác.
  f = await begin('link', tokenB, userA); await callback(f.cb);
  r = await finish(f, tokenB);
  assert.equal(r.status, 409); assert.equal(r.data.code, 'google_taken'); ok('tài khoản đã nối người khác: 409 google_taken');

  // 5. Huỷ liên kết.
  assert.equal((await api('/api/google/link', { method: 'DELETE', token: tokenB })).status, 200);
  assert.equal((await api('/api/google/me', { token: tokenB })).data.linked, false);
  f = await begin('signin', null, userB); await callback(f.cb);
  assert.equal((await finish(f)).data.status, 'new'); ok('huỷ liên kết xong: đăng nhập lại là người mới');

  // 6. Bấm Huỷ ở Google.
  f = await begin('signin', null, null); await callback(f.cb);
  assert.equal((await finish(f)).data.status, 'cancel'); ok('huỷ ở Google: cancel');

  // 7. Token sửa sau khi ký, và token của phiên khác (nonce sai).
  f = await begin('signin', null, userA);
  const [h, , s] = f.cb.fields.id_token.split('.');
  const forged = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'fake-client.apps.googleusercontent.com', sub: userA.sub, nonce: 'x', exp: 9e9 })).toString('base64url');
  await callback({ ...f.cb, fields: { ...f.cb.fields, id_token: `${h}.${forged}.${s}` } });
  r = await finish(f); assert.equal(r.status, 400); assert.equal(r.data.code, 'google_failed'); ok('token sửa sau khi ký: google_failed');
  const f1 = await begin('signin', null, userA);
  const f2 = await begin('signin', null, userA);
  await callback({ ...f2.cb, fields: { ...f2.cb.fields, id_token: f1.cb.fields.id_token } });
  assert.equal((await finish(f2)).data.code, 'google_failed'); ok('id_token của phiên khác (nonce sai): google_failed');

  // 8. Sai bind 5 lần thì phiên bị xoá.
  f = await begin('signin', null, userA); await callback(f.cb);
  for (let i = 0; i < 5; i++) await api('/api/google/finish', { method: 'POST', body: { state: f.state, bind: `sai${i}` } });
  assert.equal((await finish(f)).status, 410); ok('sai bind 5 lần: phiên bị xoá');

  // 9. Giới hạn tần suất start (20 lần/10 phút mỗi IP). Chạy cuối vì khoá start của IP này 10 phút.
  let limited = false;
  for (let i = 0; i < 25 && !limited; i++) limited = (await api('/api/google/start', { method: 'POST', body: { intent: 'signin' } })).status === 429;
  assert.ok(limited); ok('start quá nhiều: 429');

  console.log(`Xong: ${pass} kiểm qua.`);
} catch (e) {
  console.error(`Hỏng sau ${pass} kiểm:`, e);
  process.exitCode = 1;
} finally {
  // Dọn nhà thử.
  await db.query('delete from members where id = any($1)', [[...made.members]]);
  await db.query('delete from families where id = any($1) and not exists (select 1 from members where family_id = families.id)', [[...made.families]]);
  await db.query('delete from google_auth where state = any($1)', [[...made.states]]);
  await db.end();
}
