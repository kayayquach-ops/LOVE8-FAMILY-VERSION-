import { useEffect, useState } from 'react';
import { cityOf } from './shared';
import { tap } from './sound';
import { locale, shownLang, t, useLang } from './i18n';

type Hit = { name: string; lat: number; lon: number; tz: string; where: string; en?: string; wen?: string };

// i18n-ok-begin: địa danh có tên Việt và tên Anh (places.json phần tử thứ 7, trường `ce`); tiếng Hàn đợt 3.
// Chọn nhanh khi ô còn trống. Cả bộ địa danh tĩnh (places.json) tải lười khi mở bước này.
const VN = 'Asia/Ho_Chi_Minh';
const QUICK: Hit[] = [
  { name: 'Hà Nội', en: 'Hanoi', lat: 21.0245, lon: 105.8412, tz: VN, where: 'Việt Nam', wen: 'Vietnam' },
  { name: 'TP. Hồ Chí Minh', en: 'Ho Chi Minh City', lat: 10.823, lon: 106.6296, tz: VN, where: 'Việt Nam', wen: 'Vietnam' },
  { name: 'Seoul', lat: 37.566, lon: 126.9784, tz: 'Asia/Seoul', where: 'Hàn Quốc', wen: 'South Korea' },
  { name: 'Busan', lat: 35.1017, lon: 129.03, tz: 'Asia/Seoul', where: 'Hàn Quốc', wen: 'South Korea' },
  { name: 'Tokyo', lat: 35.6895, lon: 139.6917, tz: 'Asia/Tokyo', where: 'Nhật Bản', wen: 'Japan' },
];
// i18n-ok-end
const BY_COUNTRY = ['VN', 'KR', 'JP', 'US', 'AU', 'DE', 'CA'];

type Place = Hit & { cc: string; n: string; k: string; w: string };
type Data = { c: Record<string, string>; ce: Record<string, string>; z: string[]; p: [string, string, number, number, number, string, string?][] };
type Loaded = { list: Place[]; countries: Record<string, string>; countriesEn: Record<string, string> };
let placesCache: Promise<Loaded> | undefined;
/** Tên hiển thị theo ngôn ngữ: tiếng Anh dùng tên Anh nếu có, còn lại tên Việt (tên đã sẵn là chữ Latin như Seoul thì giống nhau). */
const english = () => shownLang() === 'en';
const nameOf = (h: Hit) => (english() && h.en) || h.name;
const whereOf = (h: Hit) => (english() && h.wen) || h.where;

// i18n-ok: bỏ dấu tiếng Việt để gõ không dấu vẫn tìm được.
const norm = (x: string) => x.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function loadPlaces() {
  placesCache ??= import('./places.json').then((m) => {
    const d = m.default as unknown as Data;
    const list = d.p.map(([name, cc, lat, lon, z, k, en]) => ({ name, en, cc, lat, lon, tz: d.z[z], where: d.c[cc], wen: d.ce[cc], n: norm(name), k, w: norm(`${d.c[cc]} ${d.ce[cc]}`) }));
    return { list, countries: d.c, countriesEn: d.ce };
  });
  return placesCache;
}

const wordStart = (s: string, t: string) => s.startsWith(t) || s.includes(` ${t}`);
/** Khớp tên, từ khoá, tên nước; khớp đầu chuỗi lên trước. */
function search(list: Place[], term: string): Place[] {
  const t = norm(term);
  if (t.length < 2) return [];
  const scored: [number, Place][] = [];
  for (const p of list) {
    const s = p.n.startsWith(t) ? 0 : wordStart(p.n, t) ? 1 : wordStart(p.k, t) ? 2 : p.n.includes(t) ? 3 : p.k.includes(t) ? 4 : t.length >= 3 && p.w.includes(t) ? 5 : -1;
    if (s >= 0) scored.push([s, p]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]).slice(0, 8);
}

/** Gõ tên nơi đang ở, hiện danh sách gợi ý để chọn. Giá trị trả về là JSON của thành phố. */
export function CityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(cityOf(value)?.name ?? '');
  const [net, setNet] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  useLang();
  const [data, setData] = useState<Loaded>();
  const [by, setBy] = useState<string | null>(null);
  useEffect(() => { loadPlaces().then(setData).catch(() => {}); }, []);
  const local = data ? search(data.list, q) : [];
  const dup = (h: Hit) => local.some((l) => norm(l.name) === norm(h.name) || (Math.abs(l.lat - h.lat) < 0.3 && Math.abs(l.lon - h.lon) < 0.3));
  const hits: Hit[] = [...local, ...net.filter((h) => !dup(h))].slice(0, 8);
  const short = q.trim().length < 2;

  useEffect(() => {
    const term = q.trim();
    // Bộ tĩnh có kết quả thì khỏi hỏi mạng, nhiễu từ mạng chỉ làm rối.
    if (term.length < 2 || !open || !data || local.length > 0) { setNet([]); setAsked(false); return; }
    setAsked(false);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=7&language=${shownLang() === 'vi' ? 'vi' : 'en'}&format=json`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) => { setNet((d.results ?? []).map((r: any) => ({
          name: r.name, lat: r.latitude, lon: r.longitude, tz: r.timezone,
          where: [r.admin1, r.country].filter(Boolean).join(', '),
        }))); setAsked(true); })
        .catch(() => setAsked(true));
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, data, local.length]);

  function pick(h: Hit) {
    tap();
    setQ(nameOf(h));
    setOpen(false);
    setBy(null);
    onChange(JSON.stringify({ name: nameOf(h), lat: h.lat, lon: h.lon, tz: h.tz }));
  }

  const inCountry = by && by !== 'other' && data ? data.list.filter((p) => p.cc === by).sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale())) : [];
  const country = (c: string) => (data ? (english() ? data.countriesEn[c] : data.countries[c]) : c);
  const others = data ? Object.keys(data.countries).filter((c) => !BY_COUNTRY.includes(c)).sort((a, b) => country(a).localeCompare(country(b), locale())) : [];

  return (
    <div style={{ width: '86%', maxWidth: 380, alignSelf: 'center', position: 'relative' }}>
      <input className="field" style={{ width: '100%' }} value={q} placeholder={t('city.placeholder')}
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setBy(null); onChange(''); }} />
      {open && (short || (hits.length === 0 && asked)) && (
        <>
          {!short && <p className="sub" style={{ marginTop: 14 }}>{t('city.notFound')}</p>}
          <div className="chips" style={{ marginTop: 14 }}>
            {QUICK.map((c) => <button key={c.name} className="chip" onClick={() => pick(c)}>{nameOf(c)}</button>)}
          </div>
          {data && (
            <>
              <p className="sub" style={{ marginTop: 18, marginBottom: 0 }}>{t('city.byCountry')}</p>
              <div className="chips" style={{ marginTop: 10 }}>
                {BY_COUNTRY.map((c) => <button key={c} className={`chip ${by === c ? 'on' : ''}`} onClick={() => setBy(by === c ? null : c)}>{country(c)}</button>)}
                <button className={`chip ${by === 'other' ? 'on' : ''}`} onClick={() => setBy(by === 'other' ? null : 'other')}>{t('city.other')}</button>
              </div>
              {by === 'other' && (
                <div className="chips" style={{ marginTop: 10 }}>
                  {others.map((c) => <button key={c} className="chip" onClick={() => setBy(c)}>{country(c)}</button>)}
                </div>
              )}
              {inCountry.length > 0 && (
                <div className="city-list fade" style={{ maxHeight: '34vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
                  {inCountry.map((h) => (
                    <button key={`${h.lat},${h.lon},${h.name}`} className="city-item" onClick={() => pick(h)}><b>{nameOf(h)}</b></button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      {open && !short && hits.length > 0 && (
        <div className="city-list fade">
          {hits.map((h) => (
            <button key={`${h.lat},${h.lon},${h.name}`} className="city-item" onClick={() => pick(h)}>
              <b>{nameOf(h)}</b><span>{whereOf(h)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
