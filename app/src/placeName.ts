import { useEffect, useState } from 'react';
import { cityOf } from './shared';
import { shownLang } from './i18n';

// Thành phố lưu bằng tên theo thứ tiếng lúc người đó chọn ("하노이", "Ho Chi Minh City").
// Lúc hiện thì tra lại places.json để ra đúng tên theo thứ tiếng của người đang xem.
type Row = { lat: number; lon: number; names: string[]; vi: string; en?: string; ko?: string };
let rows: Row[] | null = null;
let loading: Promise<void> | undefined;

const key = (s: string) => s.normalize('NFC').trim().toLowerCase();

function load() {
  loading ??= import('./places.json').then((m) => {
    const d = m.default as unknown as { p: [string, string, number, number, number, string, string?, string?][] };
    rows = d.p.map(([vi, , lat, lon, , , en, ko]) => ({ lat, lon, vi, en: en || undefined, ko: ko || undefined, names: [vi, en, ko].filter(Boolean).map((x) => key(x!)) }));
  }).catch(() => {});
  return loading;
}

/** Tên thành phố theo thứ tiếng đang xem. Chỉ đổi khi khớp tên và gần đúng chỗ, không thì giữ tên đã lưu. */
export function cityName(v?: string | null): string | undefined {
  const c = cityOf(v);
  if (!c || !rows) return c?.name;
  const k = key(c.name);
  const r = rows.find((x) => x.names.includes(k) && Math.abs(x.lat - c.lat) < 0.5 && Math.abs(x.lon - c.lon) < 0.5);
  if (!r) return c.name;
  const lang = shownLang();
  return (lang === 'ko' && r.ko) || (lang === 'en' && r.en) || (lang === 'vi' ? r.vi : r.en || r.vi);
}

/** Gọi trong màn có hiện tên thành phố: tải bảng tên một lần rồi vẽ lại. */
export function usePlaceNames() {
  const [, set] = useState(0);
  useEffect(() => { if (!rows) void load().then(() => set((n) => n + 1)); }, []);
}
