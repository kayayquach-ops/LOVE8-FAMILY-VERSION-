// Kiểm thử múi giờ và giờ địa phương trên máy chủ (server/place.ts). Không cần DB, không gọi mạng.
// Chạy: node --import tsx --test server/place.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

const P = await import('./place.ts');

test('múi giờ: vị trí thật trước, rồi thành phố, rồi nơi gần nhất; sai hay thiếu thì giờ Việt Nam', () => {
  assert.equal(P.tzOfMember({ city: 'busan' }), 'Asia/Seoul');
  assert.equal(P.tzOfMember({ city: JSON.stringify({ name: 'Osaka', lat: 34.69, lon: 135.5, tz: 'Asia/Tokyo' }) }), 'Asia/Tokyo');
  assert.equal(P.tzOfMember({ city: JSON.stringify({ name: 'Busan', lat: 35.18, lon: 129.08 }) }), 'Asia/Seoul');
  assert.equal(P.tzOfMember({ city: JSON.stringify({ name: 'X', lat: 1, lon: 1, tz: 'Mars/Base' }) }), P.DEFAULT_TZ);
  assert.equal(P.tzOfMember({}), P.DEFAULT_TZ);
  assert.equal(P.tzOfMember({ city: 'khong-co-ma-nay' }), P.DEFAULT_TZ);
  const seoul = { loc_share: true, loc_lat: 37.57, loc_lon: 126.98, loc_at: new Date() };
  assert.equal(P.tzOfMember({ ...seoul, city: 'hanoi' }), 'Asia/Seoul');
  assert.equal(P.tzOfMember({ ...seoul, loc_share: false, city: 'hanoi' }), 'Asia/Ho_Chi_Minh');
});

test('giờ địa phương và đổi giờ địa phương ra mốc thật', () => {
  assert.deepEqual(P.localParts('Asia/Seoul', new Date('2026-11-20T14:59:00Z')), { date: '2026-11-20', minutes: 23 * 60 + 59 });
  assert.equal(P.zonedTime('Asia/Seoul', '2026-11-24', 540).toISOString(), '2026-11-24T00:00:00.000Z');
  assert.equal(P.zonedTime('America/Los_Angeles', '2026-03-08', 540).toISOString(), '2026-03-08T16:00:00.000Z');
});

/** Chạy fn với console.warn bị chặn (giữ đầu ra test sạch), trả về các lần ghi log. */
async function quiet(fn: () => Promise<void>) {
  const warns: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => { warns.push(a); };
  try { await fn(); } finally { console.warn = warn; }
  return warns;
}

test('thời tiết trên máy chủ: đọc open-meteo, nhớ 1 giờ, lỗi thì không có', async () => {
  let n = 0;
  const ok = (async () => { n++; return new Response(JSON.stringify({ current: { temperature_2m: 4.6, weather_code: 3 } })); }) as typeof fetch;
  assert.equal(await P.weatherAt(35.18, 129.08, ok), '5°C, cloudy');
  assert.equal(await P.weatherAt(35.18, 129.08, ok), '5°C, cloudy');
  assert.equal(n, 1);
  await quiet(async () => { assert.equal(await P.weatherAt(10, 10, (async () => { throw new Error('mạng'); }) as typeof fetch), null); });
});
test('thời tiết lỗi thì nhớ 10 phút: gọi lại trong lúc đó không hỏi mạng, chỉ ghi log một lần; quá 10 phút thì hỏi lại', async () => {
  let n = 0;
  const down = (async () => { n++; return new Response('{}', { status: 503 }); }) as typeof fetch;
  const warns = await quiet(async () => {
    assert.equal(await P.weatherAt(20, 20, down), null);
    assert.equal(await P.weatherAt(20, 20, down), null);
  });
  assert.equal(n, 1);
  assert.equal(warns.length, 1);
  const now = Date.now;
  Date.now = () => now() + 11 * 60e3;
  try { await quiet(async () => { await P.weatherAt(20, 20, down); }); } finally { Date.now = now; }
  assert.equal(n, 2);
});
test('giờ chênh giữa hai nơi', () => {
  assert.equal(P.hoursApart('Asia/Seoul', 'Asia/Ho_Chi_Minh', new Date('2026-11-20T00:00:00Z')), 2);
});
