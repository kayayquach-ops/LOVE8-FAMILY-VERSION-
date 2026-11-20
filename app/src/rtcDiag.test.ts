// Kiểm phần thuần của chẩn đoán gọi video (src/rtcDiag.ts). Chạy: node --import tsx --test src/rtcDiag.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { failReason, fixDelay, fixKind, FIX_DELAYS, hasTurn, iceCount, mark, MAX_FIXES, newPeerDiag, pairOf, peerSummary } from './rtcDiag.ts';

test('hasTurn, iceCount: nhận ra TURN trong cấu hình Cloudflare, STUN dự phòng thì không', () => {
  const cf = [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
  ];
  assert.equal(hasTurn(cf), true);
  assert.equal(iceCount(cf), 3);
  assert.equal(hasTurn([{ urls: 'stun:stun.l.google.com:19302' }]), false);
  assert.equal(iceCount([{ urls: 'stun:stun.l.google.com:19302' }]), 1);
});

test('pairOf: đọc đường nối đang chọn qua transport.selectedCandidatePairId, TURN ghi giao thức tới máy chủ TURN', () => {
  const stats = [
    { id: 'T', type: 'transport', selectedCandidatePairId: 'P2' },
    { id: 'P1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1', nominated: true, state: 'failed' },
    { id: 'P2', type: 'candidate-pair', localCandidateId: 'L2', remoteCandidateId: 'R2', currentRoundTripTime: 0.183 },
    { id: 'L1', type: 'local-candidate', candidateType: 'host', protocol: 'udp' },
    { id: 'L2', type: 'local-candidate', candidateType: 'relay', protocol: 'udp', relayProtocol: 'tls' },
    { id: 'R2', type: 'remote-candidate', candidateType: 'srflx', protocol: 'udp' },
  ];
  assert.deepEqual(pairOf(stats), { pair: 'relay/tls~srflx/udp', rtt: 183 });
});

test('pairOf: không có transport (Safari cũ) thì lấy cặp nominated + succeeded; chưa có cặp nào thì null', () => {
  const stats = [
    { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', nominated: true, state: 'succeeded' },
    { id: 'L', type: 'local-candidate', candidateType: 'host', protocol: 'udp' },
    { id: 'R', type: 'remote-candidate', candidateType: 'prflx', protocol: 'udp' },
  ];
  assert.deepEqual(pairOf(stats), { pair: 'host/udp~prflx/udp', rtt: -1 });
  assert.equal(pairOf([{ id: 'X', type: 'inbound-rtp' }]), null);
});

test('lịch sửa: hai lần đầu khởi động lại ICE, sau đó dựng lại hẳn; có giới hạn', () => {
  assert.equal(fixDelay(0), 0);
  assert.deepEqual([0, 1, 2, 3].map(fixKind), ['ice', 'ice', 'new', 'new']);
  assert.equal(MAX_FIXES, FIX_DELAYS.length - 1);
  assert.equal(fixDelay(99), FIX_DELAYS[FIX_DELAYS.length - 1]);
  // Từ lần sửa đầu tới lúc thôi: dưới một phút, để người dùng không nhìn "đang nối" mãi.
  assert.ok(FIX_DELAYS.reduce((a, b) => a + b, 0) < 60_000);
});

test('mark: dòng thời gian tính giây từ lúc mở màn gọi, dài quá thì giữ đầu và cuối', () => {
  const d = newPeerDiag('bbbb2222', 'o', 1000);
  assert.equal(d.p, 'bbbb22');
  mark(d, 'off', 1200, 1000);
  mark(d, 'ok', 3450, 1000);
  assert.deepEqual(d.ev, ['off@0.2', 'ok@2.5']);
  for (let i = 0; i < 40; i++) mark(d, 'dis', 4000 + i * 1000, 1000);
  const s = peerSummary(d);
  assert.equal(d.ev.length, 30);
  assert.match(s.tl, /^off@0\.2 ok@2\.5 .* \+12 .*dis@42\.0$/);
});

test('failReason: phân biệt không có trả lời, ICE không thông, rớt giữa chừng, đã thôi sửa, người kia gác máy', () => {
  const d = newPeerDiag('x', 'o', 0);
  assert.equal(failReason(d), 'no-answer');
  assert.equal(failReason({ ...d, role: 'a' }), 'no-offer');
  assert.equal(failReason({ ...d, remote: true }), 'ice');
  assert.equal(failReason({ ...d, remote: true, ok: true }), 'dropped');
  assert.equal(failReason({ ...d, remote: true, ok: true, bye: true }), '-');
  assert.equal(failReason({ ...d, remote: true, ok: true, up: true }), '-');
  assert.equal(failReason({ ...d, remote: true, gaveUp: true }), 'gave-up');
});
