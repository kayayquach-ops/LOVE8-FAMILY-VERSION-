import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { errorText, token } from './api';
import { fmtDate, getLang, t, type Key } from './i18n';
import { BGS, DEFAULT_STYLE, FONTS, FRAMES, INKS, PAPERS, loadLetterFonts, resolveStyle, type LetterStyle } from './letterStyle';
import type { Me, Member } from './shared';
import { Avatar, Icon, toast } from './ui';
import { tap } from './sound';
import './letters.css';

type Letter = { id: string; fromId: string; toId: string; body: string; style: LetterStyle; createdAt: string; readAt: string | null };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { ...init, headers: { ...(tk ? { authorization: `Bearer ${tk}` } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

const changed = () => window.dispatchEvent(new Event('hl-letters'));
const MAX = 1500;

/** Tờ giấy: dùng chung cho bản xem trước khi viết, khi đọc và ô nhỏ trong danh sách. */
function Paper({ style, children, className = '' }: { style: LetterStyle; children: React.ReactNode; className?: string }) {
  const s = resolveStyle(style);
  const vars = { '--lp-paper': s.paper.c, '--lp-ink': s.ink.c, '--lp-font': s.font.css, '--lp-size': `${s.font.size}px` } as CSSProperties;
  return <div className={`lp lp-f-${s.frame} ${className}`} style={vars}>{children}</div>;
}

export function Letters({ me, start, onClose }: { me: Me; start?: string | null; onClose: () => void }) {
  const [view, setView] = useState<{ type: 'box' } | { type: 'write'; to?: string } | { type: 'read'; letter: Letter }>({ type: 'box' });
  const [box, setBox] = useState<'in' | 'out'>('in');
  const [lists, setLists] = useState<Record<'in' | 'out', Letter[] | null>>({ in: null, out: null });
  const others = me.members.filter((m) => m.id !== me.me.id);
  const byId = (id: string): Member | undefined => me.members.find((m) => m.id === id);

  useEffect(() => { void loadLetterFonts(getLang() === 'ko'); }, []);

  const reload = (which: 'in' | 'out') => call<Letter[]>(`/api/letters?box=${which}`).then((r) => setLists((p) => ({ ...p, [which]: r }))).catch((e) => toast(e.message));
  useEffect(() => { void reload('in'); void reload('out'); }, []);
  useEffect(() => { if (start === 'write') setView({ type: 'write' }); }, [start]);

  function open(l: Letter) {
    tap();
    setView({ type: 'read', letter: l });
    if (l.toId === me.me.id && !l.readAt) {
      const at = new Date().toISOString();
      setLists((p) => ({ ...p, in: p.in?.map((x) => (x.id === l.id ? { ...x, readAt: at } : x)) ?? null }));
      call(`/api/letters/${l.id}/read`, { method: 'POST' }).then(changed).catch(() => {});
    }
  }

  if (view.type === 'write') {
    return <Write me={me} others={others} to={view.to} onBack={() => setView({ type: 'box' })} onSent={(l) => {
      setLists((p) => ({ ...p, out: [l, ...(p.out ?? [])] }));
      setBox('out');
      setView({ type: 'box' });
      changed();
      toast(t('letters.sent'));
    }} />;
  }

  if (view.type === 'read') {
    const l = view.letter;
    const from = byId(l.fromId), to = byId(l.toId);
    const mine = l.fromId === me.me.id;
    const s = resolveStyle(l.style);
    return (
      <div className="sheet letters" data-view="read">
        <header className="chat-top">
          <button className="icon-btn" onClick={() => setView({ type: 'box' })} aria-label={t('common.back')}><Icon name="back" /></button>
          <div className="chat-title"><b>{mine ? t('letters.toName', { name: to?.name ?? t('common.someone') }) : t('letters.fromName', { name: from?.name ?? t('common.someone') })}</b></div>
        </header>
        <div className="lt-stage" style={{ background: s.bg.css }}>
          <Paper style={l.style} className="lt-read">
            <div className="lp-to">{t('letters.dear', { name: (mine ? to : me.me)?.name ?? '' })}</div>
            <div className="lp-text">{l.body}</div>
            <div className="lp-sign"><span>{from?.name ?? ''}</span><small>{fmtDate(new Date(l.createdAt), { day: 'numeric', month: 'long', year: 'numeric' })}</small></div>
          </Paper>
        </div>
        {!mine && from && (
          <div className="lt-foot">
            <button className="btn" onClick={() => setView({ type: 'write', to: from.id })}>{t('letters.reply')}</button>
          </div>
        )}
      </div>
    );
  }

  const list = lists[box];
  return (
    <div className="sheet letters" data-view="box">
      <header className="chat-top">
        <button className="icon-btn" onClick={onClose} aria-label={t('common.back')}><Icon name="back" /></button>
        <div className="chat-title"><b>{t('letters.title')}</b></div>
      </header>
      <div className="lt-tabs" role="tablist">
        {(['in', 'out'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={box === k} className={box === k ? 'on' : ''} onClick={() => setBox(k)}>
            {t(k === 'in' ? 'letters.in' : 'letters.out')}
            {k === 'in' && !!lists.in?.some((x) => !x.readAt) && <i className="lt-dot" aria-hidden />}
          </button>
        ))}
      </div>
      <div className="lt-list">
        {list === null && <div className="chat-empty">{t('common.loading')}</div>}
        {list?.length === 0 && <div className="chat-empty">{t(box === 'in' ? 'letters.empty.in' : 'letters.empty.out')}</div>}
        {list?.map((l) => {
          const other = byId(box === 'in' ? l.fromId : l.toId);
          const s = resolveStyle(l.style);
          const unread = box === 'in' && !l.readAt;
          return (
            <button key={l.id} className={`lt-row${unread ? ' unread' : ''}`} onClick={() => open(l)}>
              <span className="lt-mini" style={{ background: s.bg.css }}><i style={{ background: s.paper.c, borderColor: s.ink.c }} /></span>
              <span className="lt-meta">
                <b>{other?.name ?? t('common.someone')}</b>
                <span className="lt-prev">{l.body.replace(/\s+/g, ' ').slice(0, 70)}</span>
              </span>
              <span className="lt-when">{fmtDate(new Date(l.createdAt), { day: 'numeric', month: 'short' })}</span>
              {unread && <i className="lt-dot" aria-label={t('letters.unread')} />}
            </button>
          );
        })}
      </div>
      <div className="lt-foot">
        {others.length ? <button className="btn" onClick={() => { tap(); setView({ type: 'write' }); }}>{t('letters.write')}</button>
          : <div className="muted lt-alone">{t('letters.alone')}</div>}
      </div>
    </div>
  );
}

type Tab = 'paper' | 'frame' | 'font' | 'ink' | 'bg';

function Write({ me, others, to: first, onBack, onSent }: { me: Me; others: Member[]; to?: string; onBack: () => void; onSent: (l: Letter) => void }) {
  const [to, setTo] = useState<string | null>(first ?? (others.length === 1 ? others[0].id : null));
  const [text, setText] = useState('');
  const [style, setStyle] = useState<Required<LetterStyle>>(() => {
    try { return { ...DEFAULT_STYLE, ...JSON.parse(localStorage.getItem('hl-letter-style') || '{}') }; } catch { return DEFAULT_STYLE; }
  });
  const [tab, setTab] = useState<Tab>('paper');
  const [busy, setBusy] = useState(false);
  const [vh, setVh] = useState<number | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const target = others.find((m) => m.id === to);
  const s = resolveStyle(style);

  // Bàn phím bật lên thì khung co lại theo vùng nhìn thấy, như ở Chat.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => { setVh(vv.height); window.scrollTo(0, 0); };
    f();
    vv.addEventListener('resize', f);
    vv.addEventListener('scroll', f);
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); };
  }, []);

  const set = (k: Tab, id: string) => {
    tap();
    setStyle((p) => {
      const n = { ...p, [k]: id };
      try { localStorage.setItem('hl-letter-style', JSON.stringify(n)); } catch {}
      return n;
    });
  };

  async function send() {
    if (busy || !to || !text.trim()) return;
    setBusy(true);
    try {
      const l = await call<Letter>('/api/letters', { method: 'POST', body: JSON.stringify({ to, body: text, style }) });
      onSent(l);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  const options: Array<{ id: string; node: React.ReactNode; label: string }> =
    tab === 'paper' ? PAPERS.map((p) => ({ id: p.id, label: t(`letters.paper.${p.id}` as Key), node: <i className="lt-sw" style={{ background: p.c }} /> }))
    : tab === 'ink' ? INKS.map((p) => ({ id: p.id, label: t(`letters.ink.${p.id}` as Key), node: <i className="lt-sw" style={{ background: p.c }} /> }))
    : tab === 'frame' ? FRAMES.map((f) => ({ id: f, label: t(`letters.frame.${f}` as Key), node: <Paper style={{ ...style, frame: f }} className="lt-chip"><span /></Paper> }))
    : tab === 'font' ? FONTS.map((f) => ({ id: f.id, label: t(`letters.font.${f.id}` as Key), node: <b className="lt-font" style={{ fontFamily: f.css }}>Aa</b> }))
    : BGS.map((b) => ({ id: b.id, label: t(`letters.bg.${b.id}` as Key), node: <i className="lt-sw" style={{ background: b.css }} /> }));

  return (
    <div className="sheet letters" data-view="write" style={vh ? { height: vh } : undefined}>
      <header className="chat-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}><Icon name="back" /></button>
        <div className="chat-title"><b>{t('letters.new')}</b></div>
        <button className="chip lt-send" disabled={busy || !to || !text.trim()} onClick={send}>{t('letters.send')}</button>
      </header>
      <div className="lt-to" role="radiogroup" aria-label={t('letters.pickTo')}>
        {others.map((m) => (
          <button key={m.id} role="radio" aria-checked={to === m.id} className={to === m.id ? 'on' : ''} onClick={() => { tap(); setTo(m.id); }}>
            <Avatar m={m} size={26} /><span>{m.name}</span>
          </button>
        ))}
      </div>
      <div className="lt-stage" style={{ background: s.bg.css }} onClick={() => area.current?.focus()}>
        <Paper style={style} className="lt-write">
          <div className="lp-to">{target ? t('letters.dear', { name: target.name }) : ' '}</div>
          <textarea ref={area} className="lp-text" value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)}
            placeholder={t('letters.placeholder', { name: target?.name ?? '' })} aria-label={t('letters.new')} />
          <div className="lp-sign"><span>{me.me.name}</span><small>{fmtDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' })}</small></div>
        </Paper>
      </div>
      <div className="lt-tray">
        <div className="lt-tabs sm" role="tablist">
          {(['paper', 'frame', 'font', 'ink', 'bg'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(`letters.tab.${k}` as Key)}</button>
          ))}
        </div>
        <div className="lt-opts" role="radiogroup">
          {options.map((o) => (
            <button key={o.id} role="radio" aria-checked={style[tab] === o.id} aria-label={o.label} className={style[tab] === o.id ? 'on' : ''} onClick={() => set(tab, o.id)}>
              {o.node}<small>{o.label}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
