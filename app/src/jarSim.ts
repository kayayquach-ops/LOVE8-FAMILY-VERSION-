// Xếp hạt trong lọ bằng mô phỏng vật lý 2D: thả từng hạt từ miệng lọ, va vào thành lọ và các hạt đã nằm yên.
// Hạt đã nằm thì đứng im mãi, nên thêm hạt mới không làm hạt cũ nhảy chỗ; vị trí chỉ phụ thuộc thứ tự hạt và số thứ tự.
// Toạ độ: px của ảnh lọ lớn (geo.w x geo.h, y hướng xuống). Hình va chạm của hạt là vài vòng tròn (theo cạnh sprite).
// Dữ liệu lọ và hạt (jarData.json) do branding/jar/export.py sinh ra từ bản dựng Blender.

export type Circle = [number, number, number];
export type JarGeo = { w: number; h: number; seed: number; floor: number; inner: number[][] };
export type Placed = { type: string; x: number; y: number; a: number };
/** Hạt vừa thả: quỹ đạo từng khung 1/60 s (x, y, góc nối tiếp) và các lúc chạm mạnh (giây, độ mạnh 0..1). */
export type Drop = Placed & { path: number[]; hits: Array<[number, number]> };

type Wall = { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number; floor: boolean; minx: number; maxx: number; miny: number; maxy: number };
type Body = { x: number; y: number; R: number; world: Circle[] };
export type World = { walls: Wall[]; rest: Body[]; inset: number; floorInset: number; mouth: { x: number; y: number; w: number }; size: number };

const G = 2600; // px/s² trên ảnh rộng 840
const DT = 1 / 240;
const SEED = 7;

export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Đường bao lòng lọ (0..1) thành các bức tường; hai thành bên kéo dài lên trên cho hạt rơi từ miệng lọ. */
export function makeWorld(geo: JarGeo): World {
  const P = geo.inner.map(([x, y]) => [x * geo.w, y * geo.h]);
  const top = Math.min(...P.map((p) => p[1]));
  const pts = [[P[0][0], top - geo.h], ...P, [P[P.length - 1][0], top - geo.h]];
  const walls: Wall[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const ex = x1 - x0, ey = y1 - y0, L = Math.hypot(ex, ey);
    if (L < 1e-6) continue;
    // đường bao đi: thành trái xuống, đáy, thành phải lên; lòng lọ ở bên trái hướng đi (y hướng xuống)
    const nx = ey / L, ny = -ex / L;
    walls.push({ x0, y0, x1, y1, nx, ny, floor: ny < -0.6, minx: Math.min(x0, x1), maxx: Math.max(x0, x1), miny: Math.min(y0, y1), maxy: Math.max(y0, y1) });
  }
  const xs = P.map((p) => p[0]);
  const width = Math.max(...xs) - Math.min(...xs);
  return {
    walls, rest: [], inset: geo.w * 0.006, floorInset: geo.w * geo.floor, size: geo.seed * geo.w,
    mouth: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: top - 10, w: width * 0.62 },
  };
}

const scaled = (shape: Circle[], size: number): Circle[] => shape.map(([x, y, r]) => [x * size, y * size, r * size]);

function place(circ: Circle[], x: number, y: number, a: number): Body {
  const ca = Math.cos(a), sa = Math.sin(a);
  const world = circ.map(([cx, cy, cr]) => [x + cx * ca - cy * sa, y + cx * sa + cy * ca, cr] as Circle);
  const R = Math.max(...circ.map(([cx, cy, cr]) => Math.hypot(cx, cy) + cr));
  return { x, y, R, world };
}

/** Hạt đã biết chỗ (lấy từ bản lưu): đặt vào lọ như hạt đã nằm yên. */
export function addRest(w: World, shape: Circle[], p: { x: number; y: number; a: number }) {
  w.rest.push(place(scaled(shape, w.size), p.x, p.y, p.a));
}

function impulse(v: { vx: number; vy: number; w: number }, rx: number, ry: number, nx: number, ny: number, I: number, e: number, mu: number) {
  const cvx = v.vx - v.w * ry, cvy = v.vy + v.w * rx;
  const vn = cvx * nx + cvy * ny;
  if (vn >= 0) return 0;
  const rn = rx * ny - ry * nx;
  const j = (-(1 + e) * vn) / (1 + (rn * rn) / I);
  v.vx += j * nx; v.vy += j * ny; v.w += (j * rn) / I;
  const tx = -ny, ty = nx;
  const vt = cvx * tx + cvy * ty;
  const rt = rx * ty - ry * tx;
  const lim = mu * j;
  const jt = Math.max(-lim, Math.min(lim, -vt / (1 + (rt * rt) / I)));
  v.vx += jt * tx; v.vy += jt * ty; v.w += (jt * rt) / I;
  return -vn;
}

/** Thả hạt thứ `index` (dùng cho hạt giống ngẫu nhiên) cho tới khi nằm yên; record thì giữ quỹ đạo để dựng hiệu ứng rơi. */
export function drop(w: World, type: string, shape: Circle[], index: number, record = false): Drop {
  const r = prng(SEED * 7919 + index * 104729);
  const circ = scaled(shape, w.size);
  const I = circ.reduce((s, [x, y, rr]) => s + rr * rr * 0.5 + x * x + y * y, 0) / circ.length;
  const reach = Math.max(...circ.map(([x, y, rr]) => Math.hypot(x, y) + rr));
  let px = w.mouth.x + (r() - 0.5) * w.mouth.w;
  let py = w.mouth.y;
  let a = (r() - 0.5) * Math.PI * 1.2;
  const v = { vx: (r() - 0.5) * 60, vy: 40, w: (r() - 0.5) * 5 };
  const path: number[] = [];
  const hits: Array<[number, number]> = [];
  let lastHit = -1;
  const near: Wall[] = [];
  let calm = 0;
  let step = 0;
  for (; step < 240 * 7; step++) {
    v.vy += G * DT;
    px += v.vx * DT; py += v.vy * DT; a += v.w * DT;
    const ca = Math.cos(a), sa = Math.sin(a);
    let hardest = 0;
    // chỉ xét những đoạn thành lọ ở gần hạt
    near.length = 0;
    for (const s of w.walls) {
      const m = reach + (s.floor ? w.floorInset : w.inset);
      if (px + m >= s.minx && px - m <= s.maxx && py + m >= s.miny && py - m <= s.maxy) near.push(s);
    }
    for (let it = 0; it < 2; it++) {
      for (const [cx, cy, cr] of circ) {
        const ox = cx * ca - cy * sa, oy = cx * sa + cy * ca;
        const qx = px + ox, qy = py + oy;
        for (const s of near) {
          const ins = s.floor ? w.floorInset : w.inset;
          const m = cr + ins;
          if (qx + m < s.minx || qx - m > s.maxx || qy + m < s.miny || qy - m > s.maxy) continue;
          const ex = s.x1 - s.x0, ey = s.y1 - s.y0;
          let t = ((qx - s.x0) * ex + (qy - s.y0) * ey) / (ex * ex + ey * ey);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = qx - (s.x0 + ex * t), dy = qy - (s.y0 + ey * t);
          let d = Math.hypot(dx, dy);
          if (dx * s.nx + dy * s.ny < 0) d = -d;
          if (d < m && d > -cr * 2) {
            px += s.nx * (m - d); py += s.ny * (m - d);
            hardest = Math.max(hardest, impulse(v, ox, oy, s.nx, s.ny, I, 0.25, 0.3));
          }
        }
        for (const b of w.rest) {
          if (Math.abs(b.x - px) > b.R + reach || Math.abs(b.y - py) > b.R + reach) continue;
          for (const [bx, by, br] of b.world) {
            let nx = qx - bx, ny = qy - by;
            const d = Math.hypot(nx, ny);
            if (d < cr + br && d > 1e-6) {
              nx /= d; ny /= d;
              const pen = cr + br - d;
              px += nx * pen * 0.9; py += ny * pen * 0.9;
              hardest = Math.max(hardest, impulse(v, ox, oy, nx, ny, I, 0.3, 0.32));
            }
          }
        }
      }
    }
    v.w *= 0.995;
    const sp = Math.hypot(v.vx, v.vy);
    if (sp > 3000) { v.vx *= 3000 / sp; v.vy *= 3000 / sp; }
    if (Math.abs(v.w) > 40) v.w = Math.sign(v.w) * 40;
    if (record) {
      if (step % 4 === 0) path.push(px, py, a);
      if (hardest > 260 && step - lastHit > 30 && hits.length < 3) { hits.push([step * DT, Math.min(1, hardest / 1400)]); lastHit = step; }
    }
    const e = v.vx * v.vx + v.vy * v.vy + v.w * v.w * I;
    calm = e < 900 && py > w.mouth.y + w.size ? calm + 1 : 0;
    if (calm > 36) break;
  }
  if (record) path.push(px, py, a);
  w.rest.push(place(circ, px, py, a));
  return { type, x: px, y: py, a, path, hits };
}
