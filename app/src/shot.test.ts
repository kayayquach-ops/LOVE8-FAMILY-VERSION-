// Chạy: node --import tsx --test src/shot.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACE, isInviteFor, isPendingFor, seatFont, seatLayout, shotIdFrom, shoulders, upcomingOccasion } from './shot.ts';
import type { Shot } from './shared.ts';

test('ghế: đủ số người, nằm trong khung, không đè khung mặt và không đè nhau', () => {
  for (let n = 1; n <= 3; n++) {
    const seats = seatLayout(n);
    assert.equal(seats.length, n);
    for (const s of seats) {
      const sh = shoulders(s);
      assert.ok(sh.left >= 0 && sh.right <= 330, `vai lọt khung ngang (${n})`);
      assert.ok(s.cy - s.r >= 76, `đầu thấp hơn hàng nút trên cùng (${n})`);
      assert.ok(sh.bottom <= 370, `vai không chạm cảnh dưới đáy (${n})`);
      // Đầu và hai góc vai nằm ngoài khung mặt.
      for (const [x, y] of [[s.cx + s.r, s.cy], [s.cx - s.r, s.cy], [sh.left, sh.bottom], [sh.right, sh.bottom]]) {
        assert.ok(((x - FACE.cx) / FACE.rx) ** 2 + ((y - FACE.cy) / FACE.ry) ** 2 > 1, `ghế đè khung mặt (${n})`);
      }
    }
    for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) {
      const a = seats[i], b = seats[j], sa = shoulders(a), sb = shoulders(b);
      const apart = sa.right < sb.left || sb.right < sa.left || sa.bottom < b.cy - b.r || sb.bottom < a.cy - a.r;
      assert.ok(apart, `ghế ${i} và ${j} đè nhau (${n})`);
    }
  }
  assert.deepEqual(seatLayout(0), []);
  assert.equal(seatLayout(5).length, 3);
});

test('cỡ chữ tên: tên ngắn giữ cỡ, tên dài nhỏ lại nhưng không dưới 12', () => {
  assert.equal(seatFont('mẹ', 28), 21);
  assert.ok(seatFont('Ngọc Anh', 28) < 21);
  assert.equal(seatFont('Một cái tên rất là dài', 20), 12);
});

test('dịp sắp tới: Tết 2027 còn 81 ngày tính từ 17/11/2026', () => {
  assert.deepEqual(upcomingOccasion({ day: 17, month: 11, year: 2026 }), { occasion: 'tet', days: 81 });
  // Đúng ngày Tết vẫn gợi ý (còn 0 ngày).
  assert.deepEqual(upcomingOccasion({ day: 6, month: 2, year: 2027 }), { occasion: 'tet', days: 0 });
  // Rằm tháng 8 năm 2027 là 15/9/2027: còn 45 ngày từ 1/8/2027; ở Hàn thì là Chuseok.
  assert.deepEqual(upcomingOccasion({ day: 1, month: 8, year: 2027 }), { occasion: 'trung-thu', days: 45 });
  assert.deepEqual(upcomingOccasion({ day: 1, month: 8, year: 2027 }, true), { occasion: 'chuseok', days: 45 });
  // Qua Tết rồi, rằm tháng 8 còn xa: không gợi ý.
  assert.equal(upcomingOccasion({ day: 1, month: 3, year: 2027 }), null);
  // Đúng 90 ngày thì chưa hiện, 89 ngày thì hiện.
  assert.equal(upcomingOccasion({ day: 8, month: 11, year: 2026 }), null);
  assert.equal(upcomingOccasion({ day: 9, month: 11, year: 2026 })?.days, 89);
});

test('id lượt chụp trong thông báo', () => {
  assert.equal(shotIdFrom('shot:abc123'), 'abc123');
  assert.equal(shotIdFrom('shot=ab-c'), 'ab-c');
  assert.equal(shotIdFrom('/?shot=xyz'), 'xyz');
  assert.equal(shotIdFrom('/?a=1&shot=xyz'), 'xyz');
  assert.equal(shotIdFrom('shot'), null);
  assert.equal(shotIdFrom('post'), null);
});

test('lời rủ và lượt còn dở', () => {
  const base: Shot = {
    id: 's1', byId: 'a', occasion: 'mam-com', custom: null, status: 'waiting', result: null, error: null,
    parts: [{ memberId: 'a', media: '/media/a.jpg', at: '2026-11-17T11:00:00Z' }, { memberId: 'b', media: null, at: null }],
    createdAt: '2026-11-17T11:00:00Z', doneAt: null, postId: null,
  };
  assert.equal(isInviteFor(base, 'b'), true);
  assert.equal(isInviteFor(base, 'a'), false);
  assert.equal(isInviteFor(base, 'c'), false);
  assert.equal(isInviteFor({ ...base, status: 'developing' }, 'b'), false);
  assert.equal(isPendingFor(base, 'a'), true);
  assert.equal(isPendingFor(base, 'b'), false);
  assert.equal(isPendingFor({ ...base, status: 'done', postId: 'p1' }, 'a'), false);
  assert.equal(isPendingFor({ ...base, status: 'done' }, 'a'), true);
  assert.equal(isPendingFor({ ...base, status: 'failed' }, 'a'), false);
});
