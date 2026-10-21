// Chạy bằng: node src/lib/lunar.test.ts (Node 22.18+ tự bỏ kiểu TypeScript)
import assert from 'node:assert/strict';
import {
  canChiYear,
  lunarToSolar,
  nextSolarForLunar,
  solarToLunar,
  VN_TIME_ZONE,
} from './lunar.ts';

const tet: Array<[number, number, number, string]> = [
  [10, 2, 2024, 'Giáp Thìn'],
  [29, 1, 2025, 'Ất Tỵ'],
  [17, 2, 2026, 'Bính Ngọ'],
  [6, 2, 2027, 'Đinh Mùi'],
];

for (const [day, month, year, name] of tet) {
  const l = solarToLunar({ day, month, year });
  assert.deepEqual(l, { day: 1, month: 1, year, leap: false }, `Tết ${year}`);
  assert.equal(canChiYear(year), name);
  assert.deepEqual(lunarToSolar({ day: 1, month: 1, year, leap: false }), { day, month, year });
}

// Tết 1985: Việt Nam ăn Tết 21/1, Trung Quốc 20/2, vì lệch múi giờ.
assert.deepEqual(solarToLunar({ day: 21, month: 1, year: 1985 }, VN_TIME_ZONE), {
  day: 1, month: 1, year: 1985, leap: false,
});
assert.deepEqual(solarToLunar({ day: 20, month: 2, year: 1985 }, 8), {
  day: 1, month: 1, year: 1985, leap: false,
});

// Năm 2025 có tháng 6 nhuận.
const leapSolar = lunarToSolar({ day: 1, month: 6, year: 2025, leap: true });
assert.ok(leapSolar, 'tháng 6 nhuận 2025 phải tồn tại');
assert.deepEqual(solarToLunar(leapSolar), { day: 1, month: 6, year: 2025, leap: true });
assert.equal(lunarToSolar({ day: 1, month: 6, year: 2026, leap: true }), null);

// Vòng ngược cho cả năm 2026.
for (let t = new Date(2026, 0, 1); t.getFullYear() === 2026; t.setDate(t.getDate() + 1)) {
  const s = { day: t.getDate(), month: t.getMonth() + 1, year: 2026 };
  assert.deepEqual(lunarToSolar(solarToLunar(s)), s);
}

// Ngày giỗ 1/1 âm, tính từ 21/10/2026, phải là Tết 2027.
const next = nextSolarForLunar(1, 1, new Date(2026, 9, 21));
assert.equal(next.toDateString(), new Date(2027, 1, 6).toDateString());

console.log('lunar: all tests passed');
