import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { errorText, token } from './api';
import { fmtDate, getLang, t, type Key } from './i18n';
import { BGS, DEFAULT_STYLE, FONTS, FRAMES, INKS, PAPERS, loadLetterFonts, resolveStyle, type LetterStyle } from './letterStyle';
import { fileName, shrinkImage } from './media';
import { thumb, type Me, type Member } from './shared';
import { STICKER_LIST, Sticker } from './stickers';
import { Avatar, Icon, toast } from './ui';
import { tap } from './sound';
import './letters.css';

// Hình dán và ảnh trên thư: x, y là tâm (phần trăm tờ giấy), w là bề rộng (phần trăm bề rộng giấy), rot là độ.
type Pos = { x: number; y: number; w: number; rot: number };
type Item = Pos & ({ type: 'photo'; media: string } | { type: 'sticker'; sticker: string });
type Letter = { id: string; fromId: string; toId: string; body: string; style: LetterStyle; items: Item[]; createdAt: string; readAt: string | null };
/** Món đang soạn: ảnh chưa tải lên thì chưa có `media`, tạm hiện bằng `preview`. */
type Draft = Pos & { key: string; type: 'photo' | 'sticker'; media?: string; preview?: string; sticker?: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const isJson = typeof init.body === 'string';
  const res = await fetch(path, { ...init, headers: { ...(tk ? { authorization: `Bearer ${tk}` } : {}), ...(isJson ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

const changed = () => window.dispatchEvent(new Event('hl-letters'));
const MAX = 1500;
const MAX_PHOTOS = 3;
const MAX_ITEMS = 12;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Một món dán lên giấy. Sửa được thì kéo để di chuyển, hai ngón để phóng to và xoay. */
function ItemView({ it, edit, selected, onSelect, onMove }: { it: { type: string; media?: string; preview?: string; sticker?: string } & Pos; edit?: boolean; selected?: boolean; onSelect?: () => void; onMove?: (p: Partial<Pos>) => void }) {
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ it: Pos; d: number; a: number; c: { x: number; y: number }; box: DOMRect } | null>(null);

  const snapshot = (el: HTMLElement) => {
    const pts = [...ptrs.current.values()];
    const paper = el.closest('.lp')!.getBoundingClientRect();
    const c = pts.reduce((s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }), { x: 0, y: 0 });
    const d = pts.length > 1 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 0;
    const a = pts.length > 1 ? Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) : 0;
    start.current = { it: { x: it.x, y: it.y, w: it.w, rot: it.rot }, d, a, c, box: paper };
  };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!edit) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    onSelect?.();
    snapshot(e.currentTarget);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!edit || !ptrs.current.has(e.pointerId) || !start.current) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ptrs.current.values()];
    const s = start.current;
    const c = pts.reduce((m, p) => ({ x: m.x + p.x / pts.length, y: m.y + p.y / pts.length }), { x: 0, y: 0 });
    const patch: Partial<Pos> = {
      x: clamp(s.it.x + ((c.x - s.c.x) / s.box.width) * 100, 0, 100),
      y: clamp(s.it.y + ((c.y - s.c.y) / s.box.height) * 100, 0, 100),
    };
    if (pts.length > 1 && s.d > 0) {
      const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const a = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      patch.w = clamp(s.it.w * (d / s.d), 8, 80);
      patch.rot = ((s.it.rot + ((a - s.a) * 180) / Math.PI + 540) % 360) - 180;
    }
    onMove?.(patch);
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size) snapshot(e.currentTarget);
    else start.current = null;
  };

  const src = it.media ? thumb(it.media, 1080) : it.preview;
  return (
    <div className={`lp-item${edit ? ' edit' : ''}${selected ? ' sel' : ''}`} style={{ left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%`, transform: `translate(-50%, -50%) rotate(${it.rot}deg)` }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {it.type === 'photo'
        ? <div className="lp-photo"><img src={src} alt="" draggable={false} decoding="async" /></div>
        : <Sticker id={it.sticker ?? 'heart'} size={100} />}
    </div>
  );
}

/** Tờ giấy: dùng chung cho bản xem trước khi viết, khi đọc và ô nhỏ trong danh sách. Tỉ lệ cố định để vị trí món dán giống nhau trên mọi máy. */
function Paper({ style, children, className = '', paperRef }: { style: LetterStyle; children: React.ReactNode; className?: string; paperRef?: React.Ref<HTMLDivElement> }) {
  const s = resolveStyle(style);
  const vars = { '--lp-paper': s.paper.c, '--lp-ink': s.ink.c, '--lp-font': s.font.css, '--lp-n': s.font.size } as CSSProperties;
  return <div ref={paperRef} className={`lp lp-f-${s.frame} ${className}`} style={vars}>{children}</div>;
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
            <div className="lp-in">
              <div className="lp-to">{t('letters.dear', { name: (mine ? to : me.me)?.name ?? '' })}</div>
              <div className="lp-text">{l.body}</div>
              <div className="lp-sign"><span>{from?.name ?? ''}</span><small>{fmtDate(new Date(l.createdAt), { day: 'numeric', month: 'long', year: 'numeric' })}</small></div>
            </div>
            <div className="lp-items">{l.items?.map((it, i) => <ItemView key={i} it={it} />)}</div>
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
                <span className="lt-prev">{l.body.replace(/\s+/g, ' ').slice(0, 70) || t('letters.photoOnly')}</span>
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

type Tab = 'paper' | 'frame' | 'font' | 'ink' | 'bg' | 'scrap';
const uid = () => Math.random().toString(36).slice(2, 9);

function Write({ me, others, to: first, onBack, onSent }: { me: Me; others: Member[]; to?: string; onBack: () => void; onSent: (l: Letter) => void }) {
  const [to, setTo] = useState<string | null>(first ?? (others.length === 1 ? others[0].id : null));
  const [text, setText] = useState('');
  const [style, setStyle] = useState<Required<LetterStyle>>(() => {
    try { return { ...DEFAULT_STYLE, ...JSON.parse(localStorage.getItem('hl-letter-style') || '{}') }; } catch { return DEFAULT_STYLE; }
  });
  const [tab, setTab] = useState<Tab>('paper');
  const [items, setItems] = useState<Draft[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [vh, setVh] = useState<number | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const target = others.find((m) => m.id === to);
  const s = resolveStyle(style);
  const photos = items.filter((i) => i.type === 'photo').length;
  const canSend = !busy && !uploading && !!to && (!!text.trim() || items.length > 0);

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

  const set = (k: Exclude<Tab, 'scrap'>, id: string) => {
    tap();
    setStyle((p) => {
      const n = { ...p, [k]: id };
      try { localStorage.setItem('hl-letter-style', JSON.stringify(n)); } catch {}
      return n;
    });
  };

  const patch = (key: string, p: Partial<Pos>) => setItems((a) => a.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const drop = (d: Omit<Draft, 'key' | 'x' | 'y' | 'rot'> & Partial<Pos>) => {
    const key = uid();
    // Món mới rơi gần giữa giấy, lệch nhẹ và nghiêng nhẹ để trông như dán tay.
    setItems((a) => [...a, { x: 50 + (Math.random() - 0.5) * 24, y: 55 + (Math.random() - 0.5) * 24, rot: Math.round((Math.random() - 0.5) * 16), ...d, key } as Draft]);
    setSel(key);
    return key;
  };
  const addSticker = (id: string) => {
    if (items.length >= MAX_ITEMS) return toast(t('letters.scrap.full'));
    tap();
    drop({ type: 'sticker', sticker: id, w: 24 });
  };
  async function addPhoto(file?: File) {
    if (!file) return;
    if (photos >= MAX_PHOTOS || items.length >= MAX_ITEMS) return toast(t('letters.scrap.full'));
    const preview = URL.createObjectURL(file);
    const key = drop({ type: 'photo', preview, w: 46 });
    setUploading((n) => n + 1);
    try {
      const blob = await shrinkImage(file, 1600);
      const f = new FormData();
      f.set('file', blob, fileName(blob, 'letter-photo'));
      const r = await call<{ media: string }>('/api/letters/photo', { method: 'POST', body: f });
      setItems((a) => a.map((x) => (x.key === key ? { ...x, media: r.media } : x)));
    } catch (e) {
      toast((e as Error).message);
      setItems((a) => a.filter((x) => x.key !== key));
    } finally { setUploading((n) => n - 1); }
  }

  async function send() {
    if (!canSend) return;
    setBusy(true);
    try {
      const out = items.map(({ type, media, sticker, x, y, w, rot }) => ({ type, media, sticker, x, y, w, rot }));
      const l = await call<Letter>('/api/letters', { method: 'POST', body: JSON.stringify({ to, body: text, style, items: out }) });
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
    : tab === 'bg' ? BGS.map((b) => ({ id: b.id, label: t(`letters.bg.${b.id}` as Key), node: <i className="lt-sw" style={{ background: b.css }} /> }))
    : [];

  const cur = items.find((i) => i.key === sel);
  const nudge = (p: Partial<Pos>) => cur && patch(cur.key, p);

  return (
    <div className="sheet letters" data-view="write" style={vh ? { height: vh } : undefined}>
      <header className="chat-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}><Icon name="back" /></button>
        <div className="chat-title"><b>{t('letters.new')}</b></div>
        <button className="chip lt-send" disabled={!canSend} onClick={send}>{t('letters.send')}</button>
      </header>
      <div className="lt-to" role="radiogroup" aria-label={t('letters.pickTo')}>
        {others.map((m) => (
          <button key={m.id} role="radio" aria-checked={to === m.id} className={to === m.id ? 'on' : ''} onClick={() => { tap(); setTo(m.id); }}>
            <Avatar m={m} size={26} /><span>{m.name}</span>
          </button>
        ))}
      </div>
      <div className="lt-stage" style={{ background: s.bg.css }} onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
        <Paper style={style} className="lt-write">
          <div className="lp-in" onClick={() => { setSel(null); area.current?.focus(); }}>
            <div className="lp-to">{target ? t('letters.dear', { name: target.name }) : ' '}</div>
            <textarea ref={area} className="lp-text" value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)}
              placeholder={t('letters.placeholder', { name: target?.name ?? '' })} aria-label={t('letters.new')} />
            <div className="lp-sign"><span>{me.me.name}</span><small>{fmtDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' })}</small></div>
          </div>
          <div className="lp-items">
            {items.map((it) => <ItemView key={it.key} it={it} edit selected={sel === it.key} onSelect={() => setSel(it.key)} onMove={(p) => patch(it.key, p)} />)}
          </div>
        </Paper>
      </div>
      <div className="lt-tray">
        {cur && (
          <div className="lt-sel" role="toolbar" aria-label={t('letters.scrap.edit')}>
            <button onClick={() => nudge({ w: clamp(cur.w * 0.88, 8, 80) })} aria-label={t('letters.scrap.smaller')}>−</button>
            <button onClick={() => nudge({ w: clamp(cur.w * 1.14, 8, 80) })} aria-label={t('letters.scrap.bigger')}>+</button>
            <button onClick={() => nudge({ rot: ((cur.rot - 12 + 540) % 360) - 180 })} aria-label={t('letters.scrap.rotL')}>↶</button>
            <button onClick={() => nudge({ rot: ((cur.rot + 12 + 540) % 360) - 180 })} aria-label={t('letters.scrap.rotR')}>↷</button>
            <button className="del" onClick={() => { setItems((a) => a.filter((x) => x.key !== cur.key)); setSel(null); }} aria-label={t('letters.scrap.delete')}><Icon name="trash" size={18} /></button>
          </div>
        )}
        <div className="lt-tabs sm" role="tablist">
          {(['scrap', 'paper', 'frame', 'font', 'ink', 'bg'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(`letters.tab.${k}` as Key)}</button>
          ))}
        </div>
        {tab === 'scrap' ? (
          <div className="lt-opts scrap">
            <label className="lt-photo-btn">
              <Icon name="image" size={22} /><small>{t('letters.photo.take')}</small>
              <input type="file" accept="image/*" capture="user" hidden onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <label className="lt-photo-btn">
              <Icon name="booth" size={22} /><small>{t('letters.photo.pick')}</small>
              <input type="file" accept="image/*" hidden onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {STICKER_LIST.map((st) => (
              <button key={st.id} className="lt-stk" onClick={() => addSticker(st.id)} aria-label={t(`sticker.${st.id}` as Key)}><Sticker id={st.id} size={44} /></button>
            ))}
          </div>
        ) : (
          <div className="lt-opts" role="radiogroup">
            {options.map((o) => (
              <button key={o.id} role="radio" aria-checked={style[tab as Exclude<Tab, 'scrap'>] === o.id} aria-label={o.label} className={style[tab as Exclude<Tab, 'scrap'>] === o.id ? 'on' : ''} onClick={() => set(tab as Exclude<Tab, 'scrap'>, o.id)}>
                {o.node}<small>{o.label}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
