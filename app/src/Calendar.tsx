import { useEffect, useMemo, useRef, useState } from 'react';
import { token } from './api';
import type { Me } from './shared';
import { tap } from './sound';
import { Icon, toast } from './ui';
import { lunarEventInSolarYear, nextOccurrence, solarToLunar } from './lunar';

export type CalEvent = {
  id: string; kind: string; title: string; day: number; month: number; year: number | null;
  lunar: boolean; leap?: boolean; note: string | null; memberId: string | null; createdBy: string | null; virtual?: boolean;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi, thử lại nhé');
  return data as T;
}

const KINDS: Array<[string, string]> = [['birthday', 'Sinh nhật'], ['wedding', 'Ngày cưới'], ['anniversary', 'Kỷ niệm'], ['other', 'Khác']];
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DAY = 86400000;

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>{title}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>{children}</div>
    </div>
  );
}

export function Calendar({ me, onClose, onWish }: { me: Me; onClose: () => void; onWish?: (e: CalEvent) => void }) {
  const now = new Date();
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState('birthday');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [lunar, setLunar] = useState(false);
  const [leap, setLeap] = useState(false);
  const [saving, setSaving] = useState(false);
  const touchX = useRef<number | null>(null);

  const load = () => call<CalEvent[]>('/api/calendar').then(setEvents).catch((e) => toast(e.message));
  useEffect(() => { void load(); }, []);

  const move = (d: number) => setYm(({ y, m }) => { const t = new Date(y, m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });

  const byDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of events ?? []) {
      if (e.lunar) {
        for (const s of lunarEventInSolarYear(e.day, e.month, !!e.leap, ym.y)) {
          if (s.month === ym.m + 1) map.set(s.day, (map.get(s.day) ?? 0) + 1);
        }
      } else if (e.month === ym.m + 1) map.set(e.day, (map.get(e.day) ?? 0) + 1);
    }
    return map;
  }, [events, ym]);

  // Ngày âm của từng ô trong tháng đang xem.
  const lunarOf = useMemo(
    () => Array.from({ length: new Date(ym.y, ym.m + 1, 0).getDate() }, (_, i) => solarToLunar(i + 1, ym.m + 1, ym.y)),
    [ym],
  );

  const first = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7;
  const total = new Date(ym.y, ym.m + 1, 0).getDate();
  const isThisMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();

  const next = useMemo(() => {
    const todayParts = { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() };
    const today = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
    return (events ?? []).flatMap((e) => {
      const occ = nextOccurrence(e, todayParts);
      if (!occ) return [];
      const inDays = Math.round((Date.UTC(occ.year, occ.month - 1, occ.day) - today) / DAY);
      return [{ e, inDays, occ, years: e.year ? (occ.lunarYear ?? occ.year) - e.year : null }];
    }).sort((a, b) => a.inDays - b.inDays).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const add = async () => {
    const t = title.trim() || (kind === 'birthday' ? 'Sinh nhật' : '');
    if (!t) return toast('Đặt tên cho ngày này nhé');
    if (saving) return;
    setSaving(true);
    try {
      await call('/api/calendar', { method: 'POST', body: JSON.stringify({ kind, title: t, day: Number(day), month: Number(month), year: year ? Number(year) : undefined, lunar, leap: lunar && leap }) });
      setTitle(''); setDay(''); setMonth(''); setYear(''); setLunar(false); setLeap(false); setAdding(false);
      toast('Đã thêm vào lịch');
      void load();
    } catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };

  const preview = useMemo(() => {
    const d = Number(day), m = Number(month);
    if (!lunar || !d || !m || d > 30 || m > 12) return '';
    const o = nextOccurrence({ day: d, month: m, lunar: true, leap }, { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() });
    return o ? `Lần tới rơi vào ${o.day}/${o.month}/${o.year} dương lịch` : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lunar, leap, day, month]);

  const del = async (id: string) => {
    if (!confirm('Xoá ngày này khỏi lịch nhà mình?')) return;
    try { await call(`/api/calendar/${id}`, { method: 'DELETE' }); void load(); } catch (e) { toast((e as Error).message); }
  };

  const sub = (e: CalEvent, years: number | null) => {
    if (years === null) return '';
    if (e.kind === 'birthday') return `${years} tuổi`;
    if (e.kind === 'wedding') return `${years} năm`;
    return `${years} năm`;
  };

  return (
    <Sheet title="Lịch nhà mình" onClose={onClose}>
      <div
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) { tap(); move(dx < 0 ? 1 : -1); }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 10px' }}>
          <button className="icon-btn" onClick={() => { tap(); move(-1); }} aria-label="Tháng trước"><Icon name="back" /></button>
          <div className="h1" style={{ flex: 1, textAlign: 'center', margin: 0 }}>Tháng {ym.m + 1}, {ym.y}</div>
          <button className="icon-btn" onClick={() => { tap(); move(1); }} aria-label="Tháng sau" style={{ transform: 'scaleX(-1)' }}><Icon name="back" /></button>
        </div>
        <div className="panel" style={{ padding: '12px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
            {DOW.map((d) => <div key={d} className="muted" style={{ fontSize: 12, paddingBottom: 6 }}>{d}</div>)}
            {Array.from({ length: first }, (_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: total }, (_, i) => {
              const d = i + 1;
              const today = isThisMonth && d === now.getDate();
              const n = byDay.get(d) ?? 0;
              const l = lunarOf[i];
              const mark = l.day === 1 || l.day === 15;
              return (
                <div key={d} style={{ height: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 16, display: 'grid', placeItems: 'center', fontSize: 15,
                    background: today ? 'var(--accent)' : 'transparent', color: today ? '#fff' : 'var(--ink)', fontWeight: today ? 600 : 400,
                  }}>{d}</div>
                  <div style={{ fontSize: 10, lineHeight: '11px', height: 11, color: 'var(--muted)', fontWeight: mark ? 700 : 400, opacity: mark ? 1 : 0.7 }}>
                    {mark ? `${l.day}/${l.month}${l.leap ? 'n' : ''}` : l.day}
                  </div>
                  <div style={{ height: 5, display: 'flex', gap: 3 }}>
                    {Array.from({ length: Math.min(n, 3) }, (_, k) => <span key={k} style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--accent)' }} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h2">Sắp tới</div>
      {events === null && <div className="muted">Đang mở...</div>}
      {events && !next.length && <div className="muted">Chưa có ngày nào. Thêm sinh nhật hay ngày cưới của nhà mình nhé.</div>}
      {next.length > 0 && (
        <div className="panel" style={{ padding: '4px 18px' }}>
          {next.map(({ e, inDays, occ, years }) => {
            const mine = !e.virtual && e.createdBy === me.me.id;
            const other = e.memberId !== me.me.id;
            const wish = onWish && other && (e.kind === 'birthday' || e.kind === 'wedding');
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--line)', minHeight: 44 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{e.title}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {e.lunar ? `${e.day}/${e.month}${e.leap ? ' nhuận' : ''} âm lịch · ${occ.day}/${occ.month}/${occ.year}` : `${e.day}/${e.month}`} · {inDays === 0 ? 'hôm nay' : `còn ${inDays} ngày`}{years !== null ? ` · ${sub(e, years)}` : ''}
                  </div>
                </div>
                {wish && <button className="chip" style={{ minHeight: 44 }} onClick={() => { tap(); onWish!(e); }}>Gửi lời chúc</button>}
                {mine && <button className="icon-btn" onClick={() => { tap(); void del(e.id); }} aria-label="Xoá"><Icon name="trash" /></button>}
              </div>
            );
          })}
        </div>
      )}

      {!adding ? (
        <button className="btn" style={{ width: '100%', marginTop: 22, minHeight: 48 }} onClick={() => { tap(); setAdding(true); }}>Thêm ngày</button>
      ) : (
        <div className="panel" style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {KINDS.map(([k, label]) => (
              <button key={k} className={`chip ${kind === k ? 'on' : ''}`} style={{ minHeight: 44 }} onClick={() => { tap(); setKind(k); }}>{label}</button>
            ))}
          </div>
          <input className="field cal-title" placeholder={kind === 'birthday' ? 'Sinh nhật ai?' : 'Tên ngày này'} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field cal-field" inputMode="numeric" placeholder="Ngày" aria-label={lunar ? 'Ngày âm' : 'Ngày'} value={day} maxLength={2} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} />
            <input className="field cal-field" inputMode="numeric" placeholder="Tháng" aria-label={lunar ? 'Tháng âm' : 'Tháng'} value={month} maxLength={2} onChange={(e) => setMonth(e.target.value.replace(/\D/g, ''))} />
            <input className="field cal-field" inputMode="numeric" placeholder="Năm" aria-label="Năm, không bắt buộc" value={year} maxLength={4} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} style={{ flex: 1.3 }} />
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: -4 }}>{lunar ? 'Ngày tháng âm lịch. ' : ''}Năm không bắt buộc, có thì biết bao nhiêu tuổi, bao nhiêu năm.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className={`chip ${lunar ? 'on' : ''}`} style={{ minHeight: 44 }} onClick={() => { tap(); setLunar(!lunar); if (lunar) setLeap(false); }}>Âm lịch</button>
            {lunar && <button className={`chip ${leap ? 'on' : ''}`} style={{ minHeight: 44 }} onClick={() => { tap(); setLeap(!leap); }}>Tháng nhuận</button>}
          </div>
          {lunar && preview && <div className="muted" style={{ fontSize: 13 }}>{preview}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" style={{ flex: 1, minHeight: 48 }} onClick={() => setAdding(false)}>Thôi</button>
            <button className="btn" style={{ flex: 1, minHeight: 48 }} disabled={!day || !month || saving} onClick={() => { tap(); void add(); }}>Lưu</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
