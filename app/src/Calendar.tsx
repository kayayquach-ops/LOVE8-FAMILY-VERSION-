import { useEffect, useMemo, useRef, useState } from 'react';
import { errorText, token } from './api';
import { fmtDate, fmtDayMonth, monthLabel, t } from './i18n';
import type { Me } from './shared';
import { tap } from './sound';
import { Icon, toast } from './ui';
import { lunarEventInSolarYear, nextOccurrence, solarToLunar } from './lunar';

export type CalEvent = {
  id: string; kind: string; title: string; day: number; month: number; year: number | null;
  lunar: boolean; leap?: boolean; note: string | null; memberId: string | null; createdBy: string | null; virtual?: boolean;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(tk ? { authorization: `Bearer ${tk}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

const KINDS = ['birthday', 'wedding', 'anniversary', 'other'] as const;
const DOW = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY = 86400000;

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
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
    const name = title.trim() || (kind === 'birthday' ? t('calendar.kind.birthday') : '');
    if (!name) return toast(t('calendar.needName'));
    if (saving) return;
    setSaving(true);
    try {
      await call('/api/calendar', { method: 'POST', body: JSON.stringify({ kind, title: name, day: Number(day), month: Number(month), year: year ? Number(year) : undefined, lunar, leap: lunar && leap }) });
      setTitle(''); setDay(''); setMonth(''); setYear(''); setLunar(false); setLeap(false); setAdding(false);
      toast(t('calendar.added'));
      void load();
    } catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };

  const preview = useMemo(() => {
    const d = Number(day), m = Number(month);
    if (!lunar || !d || !m || d > 30 || m > 12) return '';
    const o = nextOccurrence({ day: d, month: m, lunar: true, leap }, { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() });
    return o ? t('calendar.preview', { date: fmtDate(new Date(o.year, o.month - 1, o.day)) }) : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lunar, leap, day, month]);

  const del = async (id: string) => {
    if (!confirm(t('calendar.confirmDelete'))) return;
    try { await call(`/api/calendar/${id}`, { method: 'DELETE' }); void load(); } catch (e) { toast((e as Error).message); }
  };

  const sub = (e: CalEvent, years: number | null) => {
    if (years === null) return '';
    if (e.kind === 'birthday') return t('common.age', { n: years });
    if (e.kind === 'wedding') return t('common.years', { n: years });
    return t('common.years', { n: years });
  };

  return (
    <Sheet title={t('calendar.title')} onClose={onClose}>
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
          <button className="icon-btn" onClick={() => { tap(); move(-1); }} aria-label={t('calendar.prev')}><Icon name="back" /></button>
          <div className="h1" style={{ flex: 1, textAlign: 'center', margin: 0 }}>{t('calendar.month', { m: monthLabel(ym.m), y: ym.y })}</div>
          <button className="icon-btn" onClick={() => { tap(); move(1); }} aria-label={t('calendar.next')} style={{ transform: 'scaleX(-1)' }}><Icon name="back" /></button>
        </div>
        <div className="panel" style={{ padding: '12px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
            {DOW.map((d) => <div key={d} className="muted" style={{ fontSize: 12, paddingBottom: 6 }}>{t(`calendar.dow.${d}`)}</div>)}
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
                    {mark ? `${l.day}/${l.month}${l.leap ? t('calendar.leapMark') : ''}` : l.day}
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

      <div className="h2">{t('common.upcoming')}</div>
      {events === null && <div className="muted">{t('common.loading')}</div>}
      {events && !next.length && <div className="muted">{t('calendar.empty')}</div>}
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
                    {e.lunar ? t('calendar.row.lunar', { d: e.day, m: e.month, leap: e.leap ? t('calendar.row.leap') : '', date: fmtDate(new Date(occ.year, occ.month - 1, occ.day)) }) : fmtDayMonth(e.day, e.month)} · {inDays === 0 ? t('calendar.row.today') : t('calendar.row.inDays', { n: inDays })}{years !== null ? ` · ${sub(e, years)}` : ''}
                  </div>
                </div>
                {wish && <button className="chip" style={{ minHeight: 44 }} onClick={() => { tap(); onWish!(e); }}>{t('calendar.wish')}</button>}
                {mine && <button className="icon-btn" onClick={() => { tap(); void del(e.id); }} aria-label={t('common.delete')}><Icon name="trash" /></button>}
              </div>
            );
          })}
        </div>
      )}

      {!adding ? (
        <button className="btn" style={{ width: '100%', marginTop: 22, minHeight: 48 }} onClick={() => { tap(); setAdding(true); }}>{t('calendar.add')}</button>
      ) : (
        <div className="panel" style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {KINDS.map((k) => (
              <button key={k} className={`chip ${kind === k ? 'on' : ''}`} style={{ minHeight: 44 }} onClick={() => { tap(); setKind(k); }}>{t(`calendar.kind.${k}`)}</button>
            ))}
          </div>
          <input className="field cal-title" placeholder={kind === 'birthday' ? t('calendar.whoBirthday') : t('calendar.name')} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field cal-field" inputMode="numeric" placeholder={t('common.day')} aria-label={lunar ? t('calendar.lunarDay') : t('common.day')} value={day} maxLength={2} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} />
            <input className="field cal-field" inputMode="numeric" placeholder={t('common.month')} aria-label={lunar ? t('calendar.lunarMonth') : t('common.month')} value={month} maxLength={2} onChange={(e) => setMonth(e.target.value.replace(/\D/g, ''))} />
            <input className="field cal-field" inputMode="numeric" placeholder={t('common.year')} aria-label={t('calendar.yearOptional')} value={year} maxLength={4} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} style={{ flex: 1.3 }} />
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: -4 }}>{lunar ? t('calendar.lunarNote') : ''}{t('calendar.yearNote')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className={`chip ${lunar ? 'on' : ''}`} style={{ minHeight: 44 }} onClick={() => { tap(); setLunar(!lunar); if (lunar) setLeap(false); }}>{t('calendar.lunar')}</button>
            {lunar && <button className={`chip ${leap ? 'on' : ''}`} style={{ minHeight: 44 }} onClick={() => { tap(); setLeap(!leap); }}>{t('calendar.leap')}</button>}
          </div>
          {lunar && preview && <div className="muted" style={{ fontSize: 13 }}>{preview}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" style={{ flex: 1, minHeight: 48 }} onClick={() => setAdding(false)}>{t('common.cancel')}</button>
            <button className="btn" style={{ flex: 1, minHeight: 48 }} disabled={!day || !month || saving} onClick={() => { tap(); void add(); }}>{t('common.save')}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
