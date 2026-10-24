// Chạy: npx tsx src/lunar.test.ts
import { solarToLunar, lunarToSolar } from './lunar.ts';

let bad = 0;
const ck = (name: string, ok: boolean, got: unknown) => { if (!ok) bad++; console.log(ok ? 'OK  ' : 'FAIL', name, JSON.stringify(got)); };
const eqL = (a: ReturnType<typeof solarToLunar>, d: number, m: number, y: number, leap = false) =>
  a.day === d && a.month === m && a.year === y && a.leap === leap;
const eqS = (a: { day: number; month: number; year: number }, d: number, m: number, y: number) =>
  a.day === d && a.month === m && a.year === y;

ck('29/1/2025 = 1/1 Ất Tỵ', eqL(solarToLunar(29, 1, 2025), 1, 1, 2025), solarToLunar(29, 1, 2025));
ck('17/2/2026 = 1/1 Bính Ngọ', eqL(solarToLunar(17, 2, 2026), 1, 1, 2026), solarToLunar(17, 2, 2026));
ck('10/2/2024 = 1/1 Giáp Thìn', eqL(solarToLunar(10, 2, 2024), 1, 1, 2024), solarToLunar(10, 2, 2024));
ck('22/1/2023 = 1/1 Quý Mão', eqL(solarToLunar(22, 1, 2023), 1, 1, 2023), solarToLunar(22, 1, 2023));
ck('20/2/2023 = 1/2 thường', eqL(solarToLunar(20, 2, 2023), 1, 2, 2023), solarToLunar(20, 2, 2023));
ck('22/3/2023 = 1/2 nhuận', eqL(solarToLunar(22, 3, 2023), 1, 2, 2023, true), solarToLunar(22, 3, 2023));
ck('20/4/2023 = 1/3', eqL(solarToLunar(20, 4, 2023), 1, 3, 2023), solarToLunar(20, 4, 2023));
ck('6/10/2025 = 15/8', eqL(solarToLunar(6, 10, 2025), 15, 8, 2025), solarToLunar(6, 10, 2025));
ck('âm 15/8/2025 -> 6/10/2025', eqS(lunarToSolar(15, 8, 2025), 6, 10, 2025), lunarToSolar(15, 8, 2025));
ck('âm 1/1/2026 -> 17/2/2026', eqS(lunarToSolar(1, 1, 2026), 17, 2, 2026), lunarToSolar(1, 1, 2026));
ck('âm 1/2 nhuận 2023 -> 22/3/2023', eqS(lunarToSolar(1, 2, 2023, true), 22, 3, 2023), lunarToSolar(1, 2, 2023, true));
ck('âm 1/2 thường 2023 -> 20/2/2023', eqS(lunarToSolar(1, 2, 2023), 20, 2, 2023), lunarToSolar(1, 2, 2023));
ck('nhuận không có (2025) dùng tháng thường', eqS(lunarToSolar(15, 8, 2025, true), 6, 10, 2025), lunarToSolar(15, 8, 2025, true));

let rt = 0, tot = 0;
for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2031, 0, 1); t += 86400000) {
  const d = new Date(t);
  const l = solarToLunar(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear());
  const b = lunarToSolar(l.day, l.month, l.year, l.leap);
  tot++;
  if (eqS(b, d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear())) rt++;
}
ck(`khứ hồi 2020-2030 ${rt}/${tot}`, rt === tot, rt);

const n = lunarToSolar(30, 8, 2025);
ck('30/8 âm 2025 không tràn sang tháng 9', solarToLunar(n.day, n.month, n.year).month === 8, n);
process.exit(bad ? 1 : 0);
