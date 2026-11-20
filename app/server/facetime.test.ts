// Kiểm phần chẩn đoán và móc "cuộc gọi đã nối" của gọi video (server/facetime.ts). Không cần Postgres: pool.query trả rỗng.
// Chạy: node --import tsx --test server/facetime.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

delete process.env.CF_TURN_KEY_ID;
delete process.env.CF_TURN_API_TOKEN;
const { pool } = await import('./db.ts');
(pool as unknown as { query: () => Promise<{ rows: unknown[] }> }).query = async () => ({ rows: [] });
const F = await import('./facetime.ts');
const express = (await import('express')).default;

const app = express();
app.use(express.json());
// Thành viên lấy từ header x-m (thay cho auth thật).
app.use((req: any, _res, next) => { req.member = { id: String(req.headers['x-m']), family_id: String(req.headers['x-f'] || 'fam') }; next(); });
app.use(F.liveRouter);
const server = app.listen(0);
await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
test.after(() => server.close());

const post = async (path: string, member: string, body: unknown, fam = 'fam') => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-m': member, 'x-f': fam }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

test('diagLine: một dòng, chỉ 6 ký tự đầu mã thành viên, lọc sạch ký tự lạ máy gửi lên', () => {
  const line = F.diagLine('memberAbcdef123', {
    room: 'room-1234-5678-xyz', audio: true, turn: true, ice: 8, cfg: 210, media: 'cam', dur: 95_400, wait: 2300, end: 'hangup', sse: 1, drop: 2,
    peers: [{ p: 'otherXYZ999', role: 'o', ok: true, ttc: 2300, pair: 'relay/udp~srflx/udp', rtt: 183, rs: 1, fail: '-', tl: 'off@0.2 chk@0.6 ok@2.3 up@2.3' }],
  });
  assert.equal(line, '[facetime] diag me=member room=room1234 audio=1 turn=1 ice=8 cfg=210ms media=cam dur=95.4s wait=2.3s end=hangup sse=1 drop=2 peers=1'
    + ' | otherX o ok=1 ttc=2.3s pair=relay/udp~srflx/udp rtt=183ms rs=1 fail=- tl="off@0.2 chk@0.6 ok@2.3 up@2.3"');
  const bad = F.diagLine('m1', { end: 'x\n[facetime] fake "quoted"', media: '<script>', ice: -5, dur: 'abc', peers: [{ p: 'a"b\nc', tl: 'ok@1"\n x=1', pair: 'a b' }] });
  assert.ok(!bad.includes('\n'));
  assert.equal(bad.split('"').length - 1, 2, 'chỉ hai dấu ngoặc kép bao tl');
  assert.match(bad, /end=xfacetimefak /);
  assert.match(bad, /ice=0 /);
  assert.match(bad, /dur=- /);
  assert.match(bad, / \| abc a ok=0 /);
});

test('join: gọi thoại giữ cờ audio cho cả phòng, người vào sau không đổi được', async () => {
  const a = await post('/live/join', 'A1', { audio: true }, 'famV');
  assert.equal(a.body.room.audio, true);
  const b = await post('/live/join', 'B1', {}, 'famV');
  assert.equal(b.body.room.audio, true);
  assert.deepEqual(b.body.room.members, ['A1', 'B1']);
  const v = await post('/live/join', 'C1', {}, 'famW');
  assert.equal(v.body.room.audio, false);
});

test('onCallConnected: chạy một lần mỗi người mỗi cuộc gọi, chỉ với người trong phòng', async () => {
  const calls: Array<{ fid: string; ids: string[] }> = [];
  F.onCallConnected.push((fid, ids) => calls.push({ fid, ids }));
  const { body } = await post('/live/join', 'A2', {}, 'famH');
  await post('/live/join', 'B2', {}, 'famH');
  // Người ngoài phòng, phòng sai mã: không tính.
  await post('/live/diag', 'A2', { up: 'Z9', room: body.room.id }, 'famH');
  await post('/live/diag', 'A2', { up: 'B2', room: 'wrong' }, 'famH');
  assert.equal(calls.length, 0);
  await post('/live/diag', 'A2', { up: 'B2', room: body.room.id }, 'famH');
  await post('/live/diag', 'B2', { up: 'A2', room: body.room.id }, 'famH');
  assert.deepEqual(calls, [{ fid: 'famH', ids: ['A2', 'B2'] }]);
  // Gọi nhóm: người thứ ba nối được thì chỉ tính người mới.
  await post('/live/join', 'C2', {}, 'famH');
  await post('/live/diag', 'C2', { up: 'A2' }, 'famH');
  assert.deepEqual(calls[1], { fid: 'famH', ids: ['C2'] });
  F.onCallConnected.length = 0;
});

test('diag: mỗi người tối đa 30 lần mỗi giờ', async () => {
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await post('/live/diag', 'R1', { v: 1, peers: [] }, 'famR')).status;
  assert.equal(last, 429);
  assert.equal((await post('/live/diag', 'R2', { v: 1, peers: [] }, 'famR')).status, 200);
});
