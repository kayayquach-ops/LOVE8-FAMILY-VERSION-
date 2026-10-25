// Tách người khỏi nền thành miếng dán: PNG trong suốt, cắt sát, viền xanh neon góc cạnh như cắt kéo.
// Mô hình và wasm phục vụ từ /mediapipe trên chính server, chỉ tải khi gọi cutOut lần đầu.
import type { ImageSegmenter } from '@mediapipe/tasks-vision';

const BASE = '/mediapipe';
const MODEL = `${BASE}/selfie_multiclass_256x256.tflite`;

export type CutOutOptions = { outline?: string; maxSide?: number };

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let segmenterP: Promise<ImageSegmenter> | null = null;
let usingGpu = false;

async function createSegmenter(gpu: boolean): Promise<ImageSegmenter> {
  const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  return ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: gpu ? 'GPU' : 'CPU' },
    runningMode: 'IMAGE',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
}

function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterP) {
    segmenterP = createSegmenter(true)
      .then((s) => { usingGpu = true; return s; })
      .catch(() => { usingGpu = false; return createSegmenter(false); });
    segmenterP.catch(() => { segmenterP = null; });
  }
  return segmenterP;
}

// Nhường luồng chính giữa các bước nặng. MessageChannel không bị kìm 1 giây như setTimeout khi tab ẩn.
const tick = () => new Promise<void>((r) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); r(); };
  ch.port2.postMessage(0);
});

function makeCanvas(w: number, h: number): { c: AnyCanvas; ctx: Ctx } {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d');
      if (ctx) return { c, ctx };
    } catch { /* Safari cũ: dùng canvas thường */ }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Không tạo được canvas'); // i18n-ok: lỗi nội bộ
  return { c, ctx };
}

function toPng(c: AnyCanvas): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/png' });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Không xuất được PNG'))), 'image/png')); // i18n-ok: lỗi nội bộ
}

// Giải mã ảnh, xoay theo EXIF, rồi thu nhỏ ngay để không giữ bitmap lớn.
async function loadScaled(file: Blob, maxSide: number): Promise<{ c: AnyCanvas; ctx: Ctx; w: number; h: number }> {
  let src: ImageBitmap | HTMLImageElement;
  let sw: number, sh: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    src = bmp; sw = bmp.width; sh = bmp.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      src = img; sw = img.naturalWidth; sh = img.naturalHeight;
    } finally { URL.revokeObjectURL(url); }
  }
  if (!sw || !sh) throw new Error('Không đọc được ảnh'); // i18n-ok: lỗi nội bộ
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const { c, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  if ('close' in src) src.close();
  return { c, ctx, w, h };
}

// Xác suất là người, cùng kích thước ảnh làm việc.
async function personProb(img: AnyCanvas, n: number): Promise<Float32Array> {
  let seg = await getSegmenter();
  let res;
  try {
    res = seg.segment(img);
  } catch (e) {
    if (!usingGpu) throw e;
    // GPU tạo được nhưng chạy lỗi (hay gặp trên iOS): chuyển hẳn sang CPU.
    seg.close();
    usingGpu = false;
    segmenterP = createSegmenter(false);
    seg = await segmenterP;
    res = seg.segment(img);
  }
  try {
    const masks = res.confidenceMasks;
    if (!masks?.length) throw new Error('Mô hình không trả về mặt nạ'); // i18n-ok: lỗi nội bộ
    const m = masks[0].getAsFloat32Array();
    if (m.length !== n) throw new Error('Mặt nạ sai kích thước'); // i18n-ok: lỗi nội bộ
    const out = new Float32Array(n);
    // Mô hình nhiều lớp: lớp 0 là nền. Mô hình một lớp: chính là người.
    if (masks.length > 1) for (let i = 0; i < n; i++) out[i] = 1 - m[i];
    else out.set(m);
    return out;
  } finally {
    res.close();
  }
}

// Làm mờ hộp tách hai chiều, chạy hai lần cho gần Gauss.
function boxBlur(a: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(a.length);
  const d = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s / d;
        s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / d;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
}

// Gán nhãn thành phần liên thông (4 hướng) cho các điểm có m[i] === v.
type Labels = { lab: Int32Array; areas: number[]; touches: boolean[]; firsts: number[] };
function label(m: Uint8Array, w: number, h: number, v: number): Labels {
  const lab = new Int32Array(m.length).fill(-1);
  const areas: number[] = [];
  const touches: boolean[] = [];
  const firsts: number[] = [];
  const q = new Int32Array(m.length);
  for (let s = 0; s < m.length; s++) {
    if (m[s] !== v || lab[s] !== -1) continue;
    const id = areas.length;
    let head = 0, tail = 0, area = 0, edge = false;
    q[tail++] = s; lab[s] = id;
    while (head < tail) {
      const i = q[head++];
      area++;
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      if (x > 0 && m[i - 1] === v && lab[i - 1] === -1) { lab[i - 1] = id; q[tail++] = i - 1; }
      if (x < w - 1 && m[i + 1] === v && lab[i + 1] === -1) { lab[i + 1] = id; q[tail++] = i + 1; }
      if (y > 0 && m[i - w] === v && lab[i - w] === -1) { lab[i - w] = id; q[tail++] = i - w; }
      if (y < h - 1 && m[i + w] === v && lab[i + w] === -1) { lab[i + w] = id; q[tail++] = i + w; }
    }
    areas.push(area); touches.push(edge); firsts.push(s);
  }
  return { lab, areas, touches, firsts };
}

// Lấp các lỗ (vùng 0 không chạm mép) nhỏ hơn maxHole điểm. Trả về nhãn và id các lỗ lớn còn lại.
function fillHoles(m: Uint8Array, w: number, h: number, maxHole: number): { L: Labels; big: number[] } {
  const L = label(m, w, h, 0);
  const fill = L.areas.map((a, i) => !L.touches[i] && a <= maxHole);
  for (let i = 0; i < m.length; i++) if (L.lab[i] >= 0 && fill[L.lab[i]]) m[i] = 1;
  const big: number[] = [];
  L.areas.forEach((a, i) => { if (!L.touches[i] && a > maxHole) big.push(i); });
  return { L, big };
}

// Khoảng cách chamfer 3-4 tới điểm m=target gần nhất (đơn vị: 3 = 1 điểm ảnh). Ngoài khung ảnh không tính.
function distanceTo(m: Uint8Array, w: number, h: number, target = 1): Uint32Array {
  const INF = 1e9;
  const d = new Uint32Array(m.length);
  for (let i = 0; i < m.length; i++) d[i] = m[i] === target ? 0 : INF;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let v = d[i];
    if (!v) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) {
      v = Math.min(v, d[i - w] + 3);
      if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    let v = d[i];
    if (!v) continue;
    if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + 3);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
      if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
    }
    d[i] = v;
  }
  return d;
}

// Dò biên ngoài (Moore, 8 hướng) của vùng chứa điểm start, với inside(i) cho biết điểm thuộc vùng.
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
function traceOuter(inside: (i: number) => boolean, w: number, h: number, start: number): number[] {
  // Lùi về điểm trái nhất của hàng để chắc chắn đang đứng ở biên, bên trái là ngoài.
  let s = start;
  while (s % w > 0 && inside(s - 1)) s--;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(y * w + x);
  const pts: number[] = [];
  let cx = s % w, cy = (s - cx) / w;
  let back = 4; // đi tới từ phía tây
  let firstNext = -1;
  const limit = 4 * w * h;
  for (let step = 0; step < limit; step++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      if (ok(cx + DX[d], cy + DY[d])) { found = d; break; }
    }
    if (found < 0) { pts.push(cx, cy); break; } // điểm lẻ loi
    const nx = cx + DX[found], ny = cy + DY[found];
    const ni = ny * w + nx;
    if (cy * w + cx === s && step > 0 && ni === firstNext) break;
    if (step === 0) firstNext = ni;
    pts.push(cx, cy);
    // Điểm được xét ngay trước hướng tìm thấy là điểm ngoài, tính hướng của nó từ điểm mới.
    const pd = (found + 7) % 8;
    const bx = cx + DX[pd] - nx, by = cy + DY[pd] - ny;
    for (let d = 0; d < 8; d++) if (DX[d] === bx && DY[d] === by) { back = d; break; }
    cx = nx; cy = ny;
  }
  return pts;
}

// Douglas-Peucker cho đường khép kín (mảng x,y phẳng), không đệ quy.
function simplify(p: number[], eps: number): number[] {
  const n = p.length / 2;
  if (n < 4) return p;
  let far = 0, best = -1;
  for (let i = 1; i < n; i++) {
    const dd = (p[2 * i] - p[0]) ** 2 + (p[2 * i + 1] - p[1]) ** 2;
    if (dd > best) { best = dd; far = i; }
  }
  const keep = new Uint8Array(n + 1);
  keep[0] = keep[far] = keep[n] = 1;
  const X = (i: number) => p[2 * (i % n)], Y = (i: number) => p[2 * (i % n) + 1];
  const stack: number[] = [0, far, far, n];
  const e2 = eps * eps;
  while (stack.length) {
    const b = stack.pop()!, a = stack.pop()!;
    if (b - a < 2) continue;
    const ax = X(a), ay = Y(a), bx = X(b), by = Y(b);
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy || 1;
    let idx = -1, md = 0;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((X(i) - ax) * vx + (Y(i) - ay) * vy) / len2));
      const dx = X(i) - ax - t * vx, dy = Y(i) - ay - t * vy;
      const dd = dx * dx + dy * dy;
      if (dd > md) { md = dd; idx = i; }
    }
    if (md > e2) { keep[idx] = 1; stack.push(a, idx, idx, b); }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return out;
}

function pathPoly(ctx: Ctx, p: number[], ox: number, oy: number) {
  ctx.moveTo(p[0] - ox + 0.5, p[1] - oy + 0.5);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] - ox + 0.5, p[i + 1] - oy + 0.5);
  ctx.closePath();
}

export async function cutOut(file: Blob, opts: CutOutOptions = {}): Promise<Blob> {
  const outline = opts.outline ?? '#B6F23A';
  const maxSide = Math.max(128, Math.round(opts.maxSide ?? 900));

  const segP = getSegmenter(); // tải mô hình song song với giải mã ảnh
  const work = await loadScaled(file, maxSide);
  const { w, h } = work;
  const n = w * h;
  await segP;
  await tick();

  // 1. Mặt nạ người: làm mượt rồi lấy ngưỡng.
  const prob = await personProb(work.c, n);
  await tick();
  const long = Math.max(w, h);
  boxBlur(prob, w, h, Math.max(1, Math.round(long * 0.004)));
  await tick();
  const bin = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) if (prob[i] >= 0.5) { bin[i] = 1; total++; }
  if (total < n * 0.02) throw new Error('Không thấy người trong ảnh'); // i18n-ok: lỗi nội bộ, giao diện chỉ hiện letters.cut.fail

  // Mở hình thái (co rồi nở) để bỏ dải mảnh dính theo người, như khung cửa, mép ghế.
  const open = Math.max(2, Math.round(long * 0.008)) * 3;
  const din = distanceTo(bin, w, h, 0);
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (din[i] > open) core[i] = 1;
  const dcore = distanceTo(core, w, h);
  for (let i = 0; i < n; i++) if (bin[i] && dcore[i] > open + 3) bin[i] = 0;
  await tick();

  // 2. Giữ thành phần lớn nhất (và các thành phần gần to bằng nó, cho ảnh hai người đứng tách nhau).
  const comps = label(bin, w, h, 1);
  if (!comps.areas.length) throw new Error('Không thấy người trong ảnh'); // i18n-ok: lỗi nội bộ, giao diện chỉ hiện letters.cut.fail
  const maxA = Math.max(...comps.areas);
  const keepC = comps.areas.map((a) => a >= maxA * 0.3);
  let area = 0;
  for (let i = 0; i < n; i++) {
    if (bin[i] && !keepC[comps.lab[i]]) bin[i] = 0;
    if (bin[i]) area++;
  }
  if (area < n * 0.02) throw new Error('Phần người tách được quá nhỏ'); // i18n-ok: lỗi nội bộ, giao diện chỉ hiện letters.cut.fail
  if (area > n * 0.92) throw new Error('Không tách được nền: mặt nạ phủ gần cả khung'); // i18n-ok: lỗi nội bộ, giao diện chỉ hiện letters.cut.fail
  await tick();

  // 3. Lấp lỗ nhỏ trong người (khe tay, chỗ sáng lóa).
  fillHoles(bin, w, h, Math.round(area * 0.01));
  const inner = distanceTo(bin, w, h, 0); // khoảng cách vào trong người, để làm mềm mép vào trong
  await tick();

  // 4. Viền: chép mặt nạ sang khung có lề P (để viền chạy cả qua mép ảnh, ví dụ dưới thân người),
  //    nới theo khoảng cách, lấp lỗ, dò biên rồi giản lược thành đa giác góc cạnh.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const thick = Math.max(4, Math.round(Math.max(x1 - x0, y1 - y0) * 0.035));
  const P = thick + 3;
  const W = w + 2 * P, H = h + 2 * P, N = W * H;
  const pb = new Uint8Array(N);
  for (let y = 0; y < h; y++) pb.set(bin.subarray(y * w, y * w + w), (y + P) * W + P);
  const dist = distanceTo(pb, W, H);
  await tick();
  const grown = new Uint8Array(N);
  const lim = thick * 3;
  for (let i = 0; i < N; i++) if (dist[i] <= lim) grown[i] = 1;
  const { L: HL, big } = fillHoles(grown, W, H, Math.round(thick * thick * 6));
  await tick();

  const eps = thick * 0.45;
  const G = label(grown, W, H, 1);
  const outers: number[][] = [];
  G.areas.forEach((a, id) => {
    if (a >= thick * thick) outers.push(simplify(traceOuter((i) => G.lab[i] === id, W, H, G.firsts[id]), eps));
  });
  const holePolys = big.map((id) => simplify(traceOuter((i) => HL.lab[i] === id, W, H, HL.firsts[id]), eps));
  await tick();

  // 5. Khung cắt: bao các đa giác viền cộng lề nhỏ (toạ độ khung có lề).
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const p of outers) for (let i = 0; i < p.length; i += 2) {
    bx0 = Math.min(bx0, p[i]); bx1 = Math.max(bx1, p[i]);
    by0 = Math.min(by0, p[i + 1]); by1 = Math.max(by1, p[i + 1]);
  }
  const pad = Math.max(2, Math.round(thick * 0.25));
  const ox = Math.floor(bx0) - pad, oy = Math.floor(by0) - pad;
  const cw = Math.ceil(bx1) - ox + pad + 1, ch = Math.ceil(by1) - oy + pad + 1;

  // 6. Alpha của người: mềm ~2 điểm ảnh vào phía trong mép, để không dính quầng màu nền.
  const alpha = new ImageData(cw, ch);
  const ad = alpha.data;
  for (let y = 0; y < ch; y++) {
    const sy = y + oy - P;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < cw; x++) {
      const sx = x + ox - P;
      if (sx < 0 || sx >= w) continue;
      const i = sy * w + sx;
      if (!bin[i]) continue;
      const t = Math.min(1, inner[i] / 7);
      ad[(y * cw + x) * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
  }
  await tick();

  const person = makeCanvas(cw, ch);
  person.ctx.putImageData(alpha, 0, 0);
  person.ctx.globalCompositeOperation = 'source-in';
  person.ctx.drawImage(work.c, P - ox, P - oy);

  // Lề viền có thể làm khung vượt maxSide một chút: thu lại cho đúng giới hạn.
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const out = makeCanvas(Math.round(cw * k), Math.round(ch * k));
  const o = out.ctx;
  o.scale(k, k);
  o.imageSmoothingQuality = 'high';
  o.fillStyle = outline;
  o.beginPath();
  for (const p of outers) pathPoly(o, p, ox, oy);
  o.fill('nonzero');
  if (holePolys.length) {
    o.globalCompositeOperation = 'destination-out';
    o.beginPath();
    for (const p of holePolys) pathPoly(o, p, ox, oy);
    o.fill();
    o.globalCompositeOperation = 'source-over';
  }
  o.drawImage(person.c, 0, 0);
  work.c.width = work.c.height = 1; // trả bộ nhớ sớm (quan trọng trên iPhone)
  const blob = await toPng(out.c);
  person.c.width = person.c.height = out.c.width = out.c.height = 1;
  return blob;
}
