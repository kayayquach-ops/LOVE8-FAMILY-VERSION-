import { useLayoutEffect, useMemo, useRef } from 'react';
import data from './jarData.json';
import { addRest, drop, makeWorld, prng, type Circle, type Drop, type JarGeo, type Placed } from './jarSim';
import { buzz, sfx } from './sound';

// Lọ yêu thương: hai lớp ảnh lọ dựng bằng Blender (thân sau dưới hạt, kính trước + nút bần + dây + thẻ trên hạt),
// hạt là sprite charm xếp bằng mô phỏng vật lý (jarSim). Hạt mới rơi từ miệng lọ, chỉ animate transform/opacity bằng
// Web Animations, không vẽ lại React mỗi khung. Asset và số liệu sinh từ branding/jar (đọc đầu run.py).

const GEO = data.jar as JarGeo;
const SHAPES: Record<string, Circle[]> = Object.fromEntries(Object.entries(data.charms).map(([k, v]) => [k, v.c as Circle[]]));
const shapeOf = (t: string) => SHAPES[t] ?? SHAPES.heart_red;
const MAX_DROPS = 5;

export const seedSrc = (id: string, small = false) => `/jar/charm-${SHAPES[id] ? id : 'heart_red'}${small ? '-s' : ''}.webp`;

/** Một hạt charm (lưới chọn hạt, danh sách từng người, hộp thoại). Sprite có sẵn bóng mềm và lề, nên đặt cỡ lớn hơn hình chút. */
export function SeedImg({ id, size }: { id: string; size: number }) {
  return <img className="seed-img" src={seedSrc(id, size <= 30)} width={size} height={size} alt="" decoding="async" draggable={false} />;
}

type Row = { memberId: string; seed: string; count: number };
/** Bản lưu theo nhà: lần đổ lọ (g), thứ tự người của từng hạt (m), loại hạt (t), vị trí x,y,góc liền nhau (p). */
type Saved = { g: number; m: string[]; t: string[]; p: number[] };

const mem = new Map<string, Saved | null>();
const keyOf = (fam: string) => `hl-jar:${fam}`;
function loadSaved(fam: string): Saved | null {
  if (mem.has(fam)) return mem.get(fam) ?? null;
  let v: Saved | null = null;
  try { v = JSON.parse(localStorage.getItem(keyOf(fam)) || 'null'); } catch {}
  if (v && !(Array.isArray(v.m) && Array.isArray(v.t) && Array.isArray(v.p))) v = null;
  mem.set(fam, v);
  return v;
}
function save(fam: string, v: Saved) {
  mem.set(fam, v);
  try { localStorage.setItem(keyOf(fam), JSON.stringify(v)); } catch {}
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
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

/** Thứ tự hạt trong lọ (theo người): giữ thứ tự đã thấy trên máy này, hạt mới nối vào cuối (đó là các hạt sẽ rơi). */
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
    // lọ vừa đầy, đổ ra mở quà: lọ mới, mọi hạt hiện có là hạt mới
    const added = interleave(rows, left);
    return { m: added, fresh: added.length };
  }
  // máy này chưa thấy lọ bao giờ: trộn cố định theo nhà, không rơi
  const all = rows.flatMap((r) => Array<string>(r.count).fill(r.memberId));
  const r = prng(hash(fam));
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return { m: all, fresh: 0 };
}

type Layout = { placed: Placed[]; drops: Map<number, Drop> };
const layouts = new Map<string, Layout>();

/** Vị trí từng hạt: lấy lại chỗ đã lưu cho đoạn đầu giống hệt, phần còn lại thả bằng mô phỏng (hạt sẽ rơi thì giữ quỹ đạo). */
function layout(m: string[], types: string[], prev: Saved | null, animateFrom: number): Layout {
  const key = `${m.join(',')}|${types.join(',')}|${animateFrom}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const w = makeWorld(GEO);
  const placed: Placed[] = [];
  const drops = new Map<number, Drop>();
  let k = 0;
  if (prev) {
    const max = Math.min(m.length, prev.m.length, Math.floor(prev.p.length / 3), animateFrom);
    while (k < max && prev.m[k] === m[k] && prev.t[k] === types[k]) k++;
  }
  for (let i = 0; i < m.length; i++) {
    if (i < k) {
      const p = { type: types[i], x: prev!.p[i * 3], y: prev!.p[i * 3 + 1], a: prev!.p[i * 3 + 2] };
      addRest(w, shapeOf(types[i]), p);
      placed.push(p);
    } else {
      const d = drop(w, types[i], shapeOf(types[i]), i, i >= animateFrom);
      placed.push({ type: d.type, x: d.x, y: d.y, a: d.a });
      if (i >= animateFrom) drops.set(i, d);
    }
  }
  const out = { placed, drops };
  if (layouts.size > 12) layouts.delete(layouts.keys().next().value!);
  layouts.set(key, out);
  return out;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const GLINT = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-10 -10 20 20'%3E%3Cpath d='M0-10C.8-2.6 2.6-.8 10 0 2.6.8.8 2.6 0 10-.8 2.6-2.6.8-10 0-2.6-.8-.8-2.6 0-10Z' fill='%23FFF7E0'/%3E%3C/svg%3E\")";

/** Lọ với các hạt. rows: số hạt và loại hạt từng người (từ /api/jar), gifts: số lần lọ đã đầy (đổi thì là lọ mới).
 * ready=false khi chưa có số liệu lọ: vẽ lọ trống, không ghi nhớ "đã thấy" để lúc số liệu về không rơi nhầm cả lọ. */
export function JarArt({ rows, gifts = 0, family, width = 250, ready = true }: { rows: Row[]; gifts?: number; family: string; width?: number; ready?: boolean }) {
  const small = width < 200;
  const scale = width / GEO.w;
  const size = GEO.seed * width;
  const shake = useRef<HTMLDivElement>(null);
  const seedsEl = useRef<HTMLDivElement>(null);
  const glints = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const rowsKey = rows.map((r) => `${r.memberId}:${r.seed}:${r.count}`).join('|');
  const prev = loadSaved(family);
  const prevKey = prev ? `${prev.g}:${prev.m.length}:${prev.t.join(',')}` : '';

  const { m, types, fresh, lay } = useMemo(() => {
    const seq = sequence(rows, prev, gifts, family);
    const typeOf = new Map(rows.map((r) => [r.memberId, r.seed]));
    const ty = seq.m.map((id) => typeOf.get(id) ?? 'heart_red');
    const from = seq.m.length - Math.min(seq.fresh, MAX_DROPS);
    return { m: seq.m, types: ty, fresh: seq.fresh, lay: layout(seq.m, ty, prev, seq.fresh ? from : seq.m.length) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey, gifts, family, prevKey]);

  useLayoutEffect(() => {
    if (!ready) return;
    const now = loadSaved(family);
    // máy này đã thấy lọ đúng như thế này (ví dụ lọ khác trên trang vừa thả) thì không rơi lại
    const same = now && now.g === gifts && now.m.length === m.length && now.m.every((x, i) => x === m[i]) && now.t.every((x, i) => x === types[i]);
    if (same) return;
    save(family, { g: gifts, m, t: types, p: lay.placed.flatMap((p) => [r1(p.x), r1(p.y), Math.round(p.a * 1000) / 1000]) });
    if (!fresh || document.hidden) return;
    const els = seedsEl.current?.children;
    if (!els) return;
    const calm = reduced();
    let delay = 120;
    for (let i = m.length - Math.min(fresh, MAX_DROPS); i < m.length; i++) {
      const el = els[i] as HTMLElement | undefined;
      const d = lay.drops.get(i);
      if (!el) continue;
      if (calm || !d) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay, fill: 'backwards', easing: 'ease-out' });
        delay += 260;
        continue;
      }
      const frames: Keyframe[] = [];
      const n = d.path.length / 3;
      for (let j = 0; j < n; j++) {
        const t = j / 60;
        const s = 0.72 + 0.28 * Math.min(1, t / 0.2);
        frames.push({
          transform: `translate(${d.path[j * 3] * scale}px,${d.path[j * 3 + 1] * scale}px) rotate(${d.path[j * 3 + 2]}rad) scale(${s})`,
          opacity: Math.min(1, t / 0.12),
        });
      }
      const dur = ((n - 1) / 60) * 1000;
      el.animate(frames, { duration: dur, delay, fill: 'backwards', easing: 'linear' });
      d.hits.forEach(([t, k], h) => {
        timers.current.push(window.setTimeout(() => {
          shake.current?.animate(
            [{ transform: 'rotate(0)' }, { transform: `rotate(${-1.1 * k}deg)` }, { transform: `rotate(${0.7 * k}deg)` }, { transform: `rotate(${-0.3 * k}deg)` }, { transform: 'rotate(0)' }],
            { duration: 460, easing: 'ease-out' },
          );
          if (h !== 0) return;
          sfx('pop', true);
          // rung chỉ khi vừa có chạm (bấm Xong); hạt rơi lúc mở app thì không rung
          if ((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive) buzz(Math.round(6 + 10 * k));
        }, delay + t * 1000));
      });
      const at = delay + Math.max(0, dur - 260);
      timers.current.push(window.setTimeout(() => glint(d.x * scale, d.y * scale), at));
      delay += Math.min(dur, 1000) * 0.5 + 160;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lay, family, gifts, ready]);

  useLayoutEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  /** Lấp lánh nhỏ quanh chỗ hạt vừa nằm. */
  function glint(x: number, y: number) {
    const box = glints.current;
    if (!box) return;
    const g = size * 0.42;
    [[-0.55, -0.45, 0.9], [0.5, -0.3, 0.65], [0.1, 0.5, 0.5]].forEach(([dx, dy, k], i) => {
      const s = document.createElement('i');
      s.style.width = s.style.height = `${g * k}px`;
      s.style.backgroundImage = GLINT;
      const tx = x + dx * size - (g * k) / 2, ty = y + dy * size - (g * k) / 2;
      const a = s.animate(
        [
          { transform: `translate(${tx}px,${ty}px) scale(0) rotate(0deg)`, opacity: 0 },
          { transform: `translate(${tx}px,${ty}px) scale(1) rotate(40deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${tx}px,${ty}px) scale(0.2) rotate(90deg)`, opacity: 0 },
        ],
        { duration: 720, delay: i * 90, easing: 'ease-out', fill: 'both' },
      );
      box.appendChild(s);
      a.onfinish = () => s.remove();
    });
  }

  const suf = small ? '-s' : '';
  return (
    <div className="jar-art" style={{ width, height: Math.round((width * GEO.h) / GEO.w) }} aria-hidden>
      <div className="jar-shake" ref={shake}>
        <img className="jar-layer" src={`/jar/jar-back${suf}.webp`} alt="" draggable={false} />
        <div className="jar-seeds" ref={seedsEl}>
          {lay.placed.map((p, i) => (
            <img key={i} src={seedSrc(p.type, small)} alt="" draggable={false} decoding="async"
              style={{ width: size, height: size, margin: `${-size / 2}px 0 0 ${-size / 2}px`, transform: `translate(${p.x * scale}px,${p.y * scale}px) rotate(${p.a}rad)` }} />
          ))}
        </div>
        <img className="jar-layer" src={`/jar/jar-front${suf}.webp`} alt="" draggable={false} />
        <div className="jar-glints" ref={glints} />
      </div>
    </div>
  );
}
