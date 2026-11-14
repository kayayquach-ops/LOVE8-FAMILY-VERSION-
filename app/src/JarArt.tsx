import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import './jar.css';
import { LUCKY_STAR_PATH } from './ui';
import { buzz, sfx, tap } from './sound';
import { t } from './i18n';

// Lọ sao giấy (bộ giao diện 14/11, bản mẫu app/docs/ui-moi/ban-mau.html): lọ vẽ tay nét mực, trong là sao giấy gấp
// xếp từ đáy lên thành hàng so le 6 rồi 5 sao, mỗi người một màu giấy. Chỗ và góc của từng sao chỉ phụ thuộc số thứ tự
// và mã nhà, nên lọ lần nào vẽ cũng y hệt. Hai lớp SVG: lớp sao (cắt theo thân lọ) và lớp nét mực có bộ lọc #hl-wob
// (Mesh định nghĩa) ở trên, để sao rơi hay rung thì lớp nét mực không phải vẽ lại. Chỉ animate transform và opacity.

const P = LUCKY_STAR_PATH;
const FOLDS = 'M12 12.6 12 5.4M12 12.6 18.6 10M12 12.6 16.4 19.4M12 12.6 7.6 19.4M12 12.6 5.4 10';
const STAR = 26;
const BODY = 'M58 66C44 74 32 90 32 112L32 196C32 214 46 224 64 224L136 224C154 224 168 214 168 196L168 112C168 90 156 74 142 66';
// Vùng cắt của lớp sao: thân lọ, kéo lên thẳng qua cổ lọ để sao mới rơi từ trên nắp vẫn thấy được (đi sau nắp).
const CLIP = 'M58 0L58 66C44 74 32 90 32 112L32 196C32 214 46 224 64 224L136 224C154 224 168 214 168 196L168 112C168 90 156 74 142 66L142 0Z';
const LID = 'M56 44C56 36 60 33 68 33L132 33C140 33 144 36 144 44L144 54C144 61 140 64 132 64L68 64C60 64 56 61 56 54Z';
const MAX_DROPS = 5;

// Mỗi loại "hạt" cũ (mã giữ nguyên trong dữ liệu và API) giờ là một loại giấy gấp sao. Giấy đặc biệt vẽ phẳng, không bóng.
type Paper = { fill: string; kind?: 'gold' | 'crystal' | 'rainbow' };
const PAPERS: Record<string, Paper> = {
  heart_red: { fill: 'var(--s-do)' },
  lotus: { fill: 'var(--s-hong)' },
  sun: { fill: 'var(--s-vang)' },
  leaf: { fill: 'var(--s-la)' },
  sakura: { fill: '#F6CADA' },
  dew: { fill: '#AFCFEF' },
  pearl: { fill: '#F2E9D6' },
  gold: { fill: '#DDAA3E', kind: 'gold' },
  crystal: { fill: '#DCD3F6', kind: 'crystal' },
  rainbow: { fill: 'var(--s-vang)', kind: 'rainbow' },
};
const RAINBOW: Array<[string, number, number]> = [['var(--s-do)', -4, 10.6], ['var(--s-vang)', 6.5, 5.1], ['var(--s-la)', 11.5, 5.1], ['var(--s-bien)', 16.5, 10]];
export const paperOf = (id: string) => PAPERS[id] ?? PAPERS.heart_red;

/** Thân một ngôi sao trong hệ toạ độ 24x24: giấy màu lệch nhẹ khỏi viền mực như tô tay, nếp gấp mờ. clip: id vùng cắt hình sao (giấy cầu vồng). */
function StarBody({ seed, clip }: { seed: string; clip: string }) {
  const p = paperOf(seed);
  return (
    <>
      {p.kind === 'rainbow'
        ? <g transform="translate(.9 .9)"><g clipPath={`url(#${clip})`}><g transform="rotate(-16 12 12)">
            {RAINBOW.map(([c, y, h]) => <rect key={y} x={-8} y={y} width={40} height={h} style={{ fill: c }} />)}
          </g></g></g>
        : <path d={P} transform="translate(.9 .9)" style={{ fill: p.fill }} />}
      <path d={P} className="ps-ink" />
      <path d={FOLDS} className={p.kind === 'crystal' ? 'ps-fold white' : 'ps-fold'} />
      {p.kind === 'gold' && <path d="M11 8.8 12.2 6.4" className="ps-shine" />}
    </>
  );
}

/** Một ngôi sao giấy đứng riêng (chú thích từng người, cửa hàng giấy, hộp thoại). */
export function PaperStar({ seed, size = 24, className }: { seed: string; size?: number; className?: string }) {
  const clip = `ps${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`paper-star${className ? ` ${className}` : ''}`} aria-hidden>
      {paperOf(seed).kind === 'rainbow' && <defs><clipPath id={clip}><path d={P} /></clipPath></defs>}
      <StarBody seed={seed} clip={clip} />
    </svg>
  );
}

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Chỗ từng sao (toạ độ lọ 200x240): hàng từ đáy, so le 6 rồi 5 sao, lệch và xoay ngẫu nhiên cố định theo nhà; sx: chỗ bắt đầu rơi. */
type Spot = { x: number; y: number; r: number; sx: number };
const spotCache = new Map<string, Spot[]>();
const r1 = (v: number) => Math.round(v * 10) / 10;
function spotsFor(fam: string): Spot[] {
  const hit = spotCache.get(fam);
  if (hit) return hit;
  const r = prng(hash(fam));
  const out: Spot[] = [];
  for (let i = 0; i < 48; i++) {
    const pair = Math.floor(i / 11), k = i % 11, row = pair * 2 + (k < 6 ? 0 : 1), col = k < 6 ? k : k - 6;
    out.push({
      x: r1((row % 2 ? 58 : 47.5) + col * 21 + (r() - 0.5) * 4),
      y: r1(206 - row * 16.5 + (r() - 0.5) * 4),
      r: r1((r() - 0.5) * 70),
      sx: r1(100 + (r() - 0.5) * 30),
    });
  }
  spotCache.set(fam, out);
  return out;
}

type Row = { memberId: string; seed: string; count: number };
/** Bản lưu theo nhà ở localStorage['hl-jar:<nhà>']: lần đổ lọ (g), thứ tự người của từng sao (m), loại giấy (t). Bản cũ có thêm p (vị trí), bỏ qua. */
type Saved = { g: number; m: string[]; t: string[] };

const mem = new Map<string, Saved | null>();
const keyOf = (fam: string) => `hl-jar:${fam}`;
function loadSaved(fam: string): Saved | null {
  if (mem.has(fam)) return mem.get(fam) ?? null;
  let v: Saved | null = null;
  try { v = JSON.parse(localStorage.getItem(keyOf(fam)) || 'null'); } catch {}
  if (v && !(Array.isArray(v.m) && Array.isArray(v.t))) v = null;
  mem.set(fam, v);
  return v;
}
function save(fam: string, v: Saved) {
  mem.set(fam, v);
  try { localStorage.setItem(keyOf(fam), JSON.stringify(v)); } catch {}
}

function interleave(rows: Row[], left: Map<string, number>) {
  const out: string[] = [];
  for (let more = true; more;) {
    more = false;
    for (const r of rows) {
      const n = left.get(r.memberId) ?? 0;
      if (n > 0) { out.push(r.memberId); left.set(r.memberId, n - 1); more = true; }
    }
  }
  return out;
}

/** Thứ tự sao trong lọ (theo người): giữ thứ tự đã thấy trên máy này, sao mới nối vào cuối (đó là các sao sẽ rơi). */
function sequence(rows: Row[], prev: Saved | null, gifts: number, fam: string): { m: string[]; fresh: number } {
  const left = new Map(rows.map((r) => [r.memberId, r.count]));
  if (prev && prev.g === gifts) {
    const kept: string[] = [];
    for (const id of prev.m) {
      const n = left.get(id) ?? 0;
      if (n > 0) { kept.push(id); left.set(id, n - 1); }
    }
    const added = interleave(rows, left);
    return { m: [...kept, ...added], fresh: added.length };
  }
  if (prev && gifts > prev.g) {
    // lọ vừa đầy, đổ ra mở quà: lọ mới, mọi sao hiện có là sao mới
    const added = interleave(rows, left);
    return { m: added, fresh: added.length };
  }
  // máy này chưa thấy lọ bao giờ: trộn cố định theo nhà, không rơi
  const all = rows.flatMap((r) => Array<string>(r.count).fill(r.memberId));
  const r = prng(hash(fam));
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return { m: all, fresh: 0 };
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const place = (s: Spot, dy = 0, dr = 0) => `translate(${s.x}px,${r1(s.y + dy)}px) rotate(${r1(s.r + dr)}deg)`;

/** Lọ với các sao. rows: số sao và loại giấy từng người (từ /api/jar), gifts: số lần lọ đã đầy (đổi thì là lọ mới).
 * ready=false khi chưa có số liệu lọ: vẽ lọ trống, không ghi nhớ "đã thấy" để lúc số liệu về không rơi nhầm cả lọ.
 * tappable: chạm vào lọ thì sao rung nhẹ (màn lọ). */
export function JarArt({ rows, gifts = 0, family, width = 250, ready = true, tappable = false }: { rows: Row[]; gifts?: number; family: string; width?: number; ready?: boolean; tappable?: boolean }) {
  const uid = `jr${useId().replace(/[^\w-]/g, '')}`;
  const starsEl = useRef<SVGGElement>(null);
  const timers = useRef<number[]>([]);
  const rowsKey = rows.map((r) => `${r.memberId}:${r.seed}:${r.count}`).join('|');
  const prev = loadSaved(family);
  const prevKey = prev ? `${prev.g}:${prev.m.join(',')}:${prev.t.join(',')}` : '';
  const spots = spotsFor(family);

  const { m, types, fresh } = useMemo(() => {
    const seq = sequence(rows, prev, gifts, family);
    const typeOf = new Map(rows.map((r) => [r.memberId, r.seed]));
    return { m: seq.m.slice(0, spots.length), types: seq.m.slice(0, spots.length).map((id) => typeOf.get(id) ?? 'heart_red'), fresh: seq.fresh };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey, gifts, family, prevKey]);
  const seqKey = `${gifts}|${m.join(',')}|${types.join(',')}`;

  useLayoutEffect(() => {
    if (!ready) return;
    const now = loadSaved(family);
    // máy này đã thấy lọ đúng như thế này (ví dụ lọ khác trên trang vừa thả) thì không rơi lại
    const same = now && now.g === gifts && now.m.length === m.length && now.m.every((x, i) => x === m[i]) && now.t.every((x, i) => x === types[i]);
    if (same) return;
    save(family, { g: gifts, m, t: types });
    if (!fresh || document.hidden) return;
    const els = starsEl.current?.children;
    if (!els) return;
    const calm = reduced();
    let delay = 160;
    for (let i = m.length - Math.min(fresh, MAX_DROPS); i < m.length; i++) {
      const el = els[i] as SVGGElement | undefined;
      if (!el) continue;
      if (calm) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay, fill: 'backwards', easing: 'ease-out' });
        delay += 260;
        continue;
      }
      const s = spots[i];
      // rơi từ trên nắp (nhanh dần, xoay), chạm đáy hơi lún rồi nằm yên
      el.animate([
        { transform: `translate(${s.sx}px,6px) rotate(${r1(s.r - 160)}deg)`, opacity: 0, easing: 'cubic-bezier(.5,0,.85,.4)' },
        { opacity: 1, offset: 0.14 },
        { transform: place(s, 3.5, 9), offset: 0.8, easing: 'ease-out' },
        { transform: place(s), opacity: 1 },
      ], { duration: 950, delay, fill: 'backwards' });
      timers.current.push(window.setTimeout(() => {
        sfx('pop', true);
        // rung chỉ khi vừa có chạm (bấm xong nhiệm vụ); sao rơi lúc mở app thì không rung
        if ((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive) buzz(12);
      }, delay + 760));
      delay += 420;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seqKey, family, ready]);

  useLayoutEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  /** Chạm lọ: sao rung nhẹ tại chỗ. */
  function jiggle() {
    const els = starsEl.current?.children;
    if (!els || reduced()) return;
    tap();
    for (let i = 0; i < els.length; i++) {
      const s = spots[i];
      const k = (i % 2 ? 1 : -1) * (4 + ((i * 37) % 5));
      (els[i] as SVGGElement).animate([
        { transform: place(s) },
        { transform: place(s, -2.4, k), offset: 0.3 },
        { transform: place(s, 0.6, -k * 0.5), offset: 0.65 },
        { transform: place(s) },
      ], { duration: 520, delay: (i % 7) * 18, easing: 'ease-out' });
    }
  }

  return (
    <div className={`jar-art${tappable ? ' tappable' : ''}`} style={{ width, height: Math.round(width * 1.2) }} aria-hidden onClick={tappable ? jiggle : undefined}>
      <svg className="jar-stars" viewBox="0 0 200 240">
        <defs>
          <clipPath id={`${uid}b`}><path d={CLIP} /></clipPath>
          <clipPath id={`${uid}s`}><path d={P} /></clipPath>
        </defs>
        <g clipPath={`url(#${uid}b)`} ref={starsEl}>
          {m.map((_, i) => (
            <g key={i} transform={`translate(${spots[i].x} ${spots[i].y}) rotate(${spots[i].r})`}>
              <g transform={`translate(${-STAR / 2} ${-STAR / 2}) scale(${STAR / 24})`}><StarBody seed={types[i]} clip={`${uid}s`} /></g>
            </g>
          ))}
        </g>
      </svg>
      <svg className="jar-ink" viewBox="0 0 200 240">
        <g filter="url(#hl-wob)">
          <path d={BODY} />
          <path d={LID} className="jar-paper" />
          <path d="M64 43H136M64 51H134" className="jar-thin" />
          <path d="M44 120C41 142 41 162 43 178M48 188C48 194 50 198 53 200" className="jar-glass" />
          <path d="M60 68C80 74 120 74 140 68M100 72C94 80 86 86 80 84M100 72C108 80 116 86 122 82" className="jar-string" />
          <path d="M100 72L118 104 110 112 96 108Z" className="jar-paper jar-string" />
        </g>
        <text x="106" y="109" transform="rotate(-28 106 109)" className="jar-tag">{t('jar.tag')}</text>
      </svg>
    </div>
  );
}
