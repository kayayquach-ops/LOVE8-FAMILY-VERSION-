// Kiểm thử phần tính thuần của vị trí cả nhà (src/geo.ts): nhịp gửi vị trí, khoảng cách, link bản đồ, sửa vị trí một người.
// Chạy: node --import tsx --test src/geo.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, locCity, mapUrl, patchLoc, SEND_EVERY_MS, SEND_GAP_MS, SEND_MOVE_M, shouldSend } from './geo.ts';
import { cityOf, type Me, type MemberLoc } from './shared.ts';

const HANOI = { lat: 21.0285, lon: 105.8542 };
/** Điểm cách HANOI khoảng m mét về phía bắc (1 độ vĩ khoảng 111 195 m). */
const north = (m: number) => ({ lat: HANOI.lat + m / 111_195, lon: HANOI.lon });

test('khoảng cách: đúng cỡ', () => {
  assert.equal(distanceM(HANOI, HANOI), 0);
  assert.ok(Math.abs(distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111_195) < 5);
  assert.ok(Math.abs(distanceM(HANOI, north(300)) - 300) < 1);
  const hcm = distanceM(HANOI, { lat: 10.823, lon: 106.6296 });
  assert.ok(hcm > 1_130_000 && hcm < 1_150_000, `Hà Nội - TP.HCM ${hcm}`);
});

test('nhịp gửi: lần đầu gửi ngay; đứng yên thì 60 giây một lần; đi xa hơn 300 m thì sớm hơn nhưng không dày hơn 15 giây', () => {
  assert.equal(SEND_EVERY_MS, 60_000);
  assert.equal(SEND_MOVE_M, 300);
  assert.equal(SEND_GAP_MS, 15_000);
  const t0 = 1_000_000;
  const last = { ...HANOI, at: t0 };
  assert.equal(shouldSend(null, HANOI, t0), true, 'chưa gửi lần nào');
  assert.equal(shouldSend(last, HANOI, t0 + 30_000), false, 'đứng yên, mới 30 giây');
  assert.equal(shouldSend(last, HANOI, t0 + 59_999), false);
  assert.equal(shouldSend(last, HANOI, t0 + 60_000), true, 'đủ 60 giây thì gửi lại dù đứng yên');
  assert.equal(shouldSend(last, north(200), t0 + 40_000), false, 'đi 200 m chưa đủ');
  assert.equal(shouldSend(last, north(299), t0 + 40_000), false);
  assert.equal(shouldSend(last, north(500), t0 + 20_000), true, 'đi 500 m sau 20 giây thì gửi sớm');
  assert.equal(shouldSend(last, north(500), t0 + 14_999), false, 'đi xa nhưng mới 15 giây thì chờ');
  assert.equal(shouldSend(last, north(5_000), t0 + 1_000), false, 'vị trí nhảy xa liên tục cũng không gửi dồn');
  assert.equal(shouldSend(last, north(500), t0 + 15_000), true);
});

test('link bản đồ: iPhone, iPad mở Apple Maps đúng điểm; máy khác mở Google Maps', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const ipadDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
  assert.equal(mapUrl(21.0285, 105.8542, iphone), 'https://maps.apple.com/?ll=21.0285,105.8542&q=21.0285,105.8542');
  assert.equal(mapUrl(21.0285, 105.8542, ipadDesktop, 5), 'https://maps.apple.com/?ll=21.0285,105.8542&q=21.0285,105.8542', 'iPad báo là Mac có màn cảm ứng');
  assert.equal(mapUrl(21.0285, 105.8542, ipadDesktop, 0), 'https://www.google.com/maps?q=21.0285,105.8542', 'máy Mac thật');
  assert.equal(mapUrl(-33.8687, 151.2093, android), 'https://www.google.com/maps?q=-33.8687,151.2093');
});

test('thành phố giả theo vị trí: giờ theo múi nơi đó, thời tiết theo toạ độ làm tròn 1 số lẻ', () => {
  const loc: MemberLoc = { lat: 37.5665, lon: 126.978, at: '2026-11-20T00:00:00.000Z', tz: 'Asia/Seoul', place: { vi: 'Seoul', en: 'Seoul', ko: '서울', near: false } };
  const c = cityOf(locCity(loc))!;
  assert.deepEqual({ lat: c.lat, lon: c.lon, tz: c.tz }, { lat: 37.6, lon: 127, tz: 'Asia/Seoul' });
  // Đi loanh quanh vài trăm mét: vẫn là một chỗ, không hỏi lại thời tiết.
  assert.equal(locCity({ ...loc, lat: 37.5701, lon: 126.9812 }), locCity(loc));
});

test('sửa vị trí một người: đúng người, không đổi thì giữ đối tượng cũ, null là bỏ hẳn', () => {
  const loc: MemberLoc = { lat: 21.0285, lon: 105.8542, at: '2026-11-20T00:00:00.000Z', tz: 'Asia/Ho_Chi_Minh', place: { vi: 'Hà Nội', en: 'Hanoi', ko: '하노이', near: false } };
  const a = { id: 'a', name: 'A', role: 'me' as const, lastSeen: '' };
  const b = { id: 'b', name: 'B', role: 'con' as const, lastSeen: '' };
  const me: Me = { family: { id: 'f', name: 'F', code: '1' }, me: a, members: [a, b], unseen: 0 };

  const m1 = patchLoc(me, 'b', loc);
  assert.notEqual(m1, me);
  assert.deepEqual(m1.members[1].loc, loc);
  assert.equal(m1.members[0], a, 'người khác giữ nguyên');
  assert.equal(m1.me, a);
  assert.equal(me.members[1].loc, undefined, 'không sửa đối tượng cũ');

  assert.equal(patchLoc(m1, 'b', { ...loc }), m1, 'cùng vị trí: không vẽ lại');
  assert.equal(patchLoc(me, 'b', null), me, 'chưa có vị trí mà bỏ: không đổi');
  assert.equal(patchLoc(me, 'x', loc), me, 'người lạ: không đổi');

  const m2 = patchLoc(m1, 'b', null);
  assert.ok(!('loc' in m2.members[1]), 'tắt chia sẻ: bỏ hẳn trường loc');

  const m3 = patchLoc(me, 'a', loc);
  assert.deepEqual(m3.me.loc, loc, 'vị trí của chính mình sửa cả me.me');
  assert.equal(m3.me, m3.members[0]);
});
