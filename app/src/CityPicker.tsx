import { useEffect, useState } from 'react';
import { cityOf } from './shared';
import { tap } from './sound';

type Hit = { name: string; lat: number; lon: number; tz: string; where: string };

// Thành phố hay gặp, có sẵn toạ độ: chọn được ngay, gõ tắt như "hcm" hay "sài gòn" cũng ra, không phụ thuộc mạng.
const VN = 'Asia/Ho_Chi_Minh';
const LOCAL: (Hit & { alias?: string })[] = [
  { name: 'Hà Nội', lat: 21.0285, lon: 105.8542, tz: VN, where: 'Việt Nam', alias: 'ha noi hn' },
  { name: 'TP. Hồ Chí Minh', lat: 10.8231, lon: 106.6297, tz: VN, where: 'Việt Nam', alias: 'tp hcm hcm hcmc sai gon saigon ho chi minh tphcm' },
  { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022, tz: VN, where: 'Việt Nam', alias: 'da nang' },
  { name: 'Hải Phòng', lat: 20.8449, lon: 106.6881, tz: VN, where: 'Việt Nam', alias: 'hai phong' },
  { name: 'Cần Thơ', lat: 10.0452, lon: 105.7469, tz: VN, where: 'Việt Nam', alias: 'can tho' },
  { name: 'Huế', lat: 16.4637, lon: 107.5909, tz: VN, where: 'Việt Nam', alias: 'hue' },
  { name: 'Seoul', lat: 37.5665, lon: 126.978, tz: 'Asia/Seoul', where: 'Hàn Quốc', alias: 'soul han quoc' },
  { name: 'Busan', lat: 35.1796, lon: 129.0756, tz: 'Asia/Seoul', where: 'Hàn Quốc', alias: 'pusan han quoc' },
  { name: 'Incheon', lat: 37.4563, lon: 126.7052, tz: 'Asia/Seoul', where: 'Hàn Quốc', alias: 'han quoc' },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo', where: 'Nhật Bản', alias: 'dong kinh nhat ban' },
  { name: 'Osaka', lat: 34.6937, lon: 135.5023, tz: 'Asia/Tokyo', where: 'Nhật Bản', alias: 'nhat ban' },
  { name: 'Đài Bắc', lat: 25.033, lon: 121.5654, tz: 'Asia/Taipei', where: 'Đài Loan', alias: 'taipei dai bac dai loan' },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore', where: 'Singapore', alias: 'sg' },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney', where: 'Úc', alias: 'uc australia' },
  { name: 'London', lat: 51.5072, lon: -0.1276, tz: 'Europe/London', where: 'Anh', alias: 'luan don anh' },
  { name: 'Paris', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris', where: 'Pháp', alias: 'phap' },
  { name: 'Berlin', lat: 52.52, lon: 13.405, tz: 'Europe/Berlin', where: 'Đức', alias: 'duc' },
  { name: 'New York', lat: 40.7128, lon: -74.006, tz: 'America/New_York', where: 'Mỹ', alias: 'ny nyc my usa' },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles', where: 'Mỹ', alias: 'la my usa' },
  { name: 'Toronto', lat: 43.6532, lon: -79.3832, tz: 'America/Toronto', where: 'Canada', alias: 'canada' },
];
const QUICK = ['Hà Nội', 'TP. Hồ Chí Minh', 'Seoul', 'Busan', 'Tokyo'].map((n) => LOCAL.find((c) => c.name === n)!);

const norm = (x: string) => x.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function localHits(term: string): Hit[] {
  const t = norm(term);
  if (t.length < 2) return [];
  return LOCAL.filter((c) => norm(`${c.name} ${c.alias ?? ''}`).includes(t)).slice(0, 5);
}

/** Gõ tên nơi đang ở, hiện danh sách gợi ý để chọn. Giá trị trả về là JSON của thành phố. */
export function CityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(cityOf(value)?.name ?? '');
  const [net, setNet] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  const hits = [...localHits(q), ...net.filter((h) => !localHits(q).some((l) => l.name === h.name))].slice(0, 7);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || !open) { setNet([]); setAsked(false); return; }
    setAsked(false);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=7&language=vi&format=json`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) => { setNet((d.results ?? []).map((r: any) => ({
          name: r.name, lat: r.latitude, lon: r.longitude, tz: r.timezone,
          where: [r.admin1, r.country].filter(Boolean).join(', '),
        }))); setAsked(true); })
        .catch(() => setAsked(true));
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);

  function pick(h: Hit) {
    tap();
    setQ(h.name);
    setOpen(false);
    onChange(JSON.stringify({ name: h.name, lat: h.lat, lon: h.lon, tz: h.tz }));
  }

  return (
    <div style={{ width: '86%', maxWidth: 380, alignSelf: 'center', position: 'relative' }}>
      <input className="field" style={{ width: '100%' }} value={q} placeholder="Gõ tên thành phố, ví dụ: Busan"
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); onChange(''); }} />
      {open && (q.trim().length < 2 || (hits.length === 0 && asked)) && (
        <>
          {q.trim().length >= 2 && <p className="sub" style={{ marginTop: 14 }}>Chưa thấy nơi này. Thử gõ tên khác, hoặc chọn nhanh:</p>}
          <div className="chips" style={{ marginTop: 14 }}>
            {QUICK.map((c) => <button key={c.name} className="chip" onClick={() => pick(c)}>{c.name}</button>)}
          </div>
        </>
      )}
      {open && hits.length > 0 && (
        <div className="city-list fade">
          {hits.map((h) => (
            <button key={`${h.lat},${h.lon}`} className="city-item" onClick={() => pick(h)}>
              <b>{h.name}</b><span>{h.where}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
