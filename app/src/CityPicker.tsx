import { useEffect, useState } from 'react';
import { cityOf } from './shared';
import { tap } from './sound';

type Hit = { name: string; lat: number; lon: number; tz: string; where: string };

const QUICK = ['Hà Nội', 'TP. Hồ Chí Minh', 'Seoul', 'Busan', 'Tokyo'];

/** Gõ tên nơi đang ở, hiện danh sách gợi ý để chọn. Giá trị trả về là JSON của thành phố. */
export function CityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(cityOf(value)?.name ?? '');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || !open) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=7&language=vi&format=json`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) => setHits((d.results ?? []).map((r: any) => ({
          name: r.name, lat: r.latitude, lon: r.longitude, tz: r.timezone,
          where: [r.admin1, r.country].filter(Boolean).join(', '),
        }))))
        .catch(() => {});
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
      {open && q.trim().length < 2 && (
        <div className="chips" style={{ marginTop: 14 }}>
          {QUICK.map((n) => <button key={n} className="chip" onClick={() => setQ(n)}>{n}</button>)}
        </div>
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
