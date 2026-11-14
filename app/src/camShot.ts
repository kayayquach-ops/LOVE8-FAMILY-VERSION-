// Chụp ảnh từ camera theo khung 3:4 và bộ lọc màu.
// Bộ lọc: khung ngắm dùng CSS filter trên video, ảnh lưu thì tự tính từng điểm ảnh theo đúng công thức của chính các hàm CSS đó
// (Filter Effects: ma trận màu trong sRGB, kẹp 0..1 sau mỗi bước). Không dùng ctx.filter vì Safari iPhone cũ bỏ qua nó, ảnh lưu ra sẽ không có màu.
// Màn "gửi tới" hiện đúng tấm ảnh đã tính này, nên thứ người dùng thấy trước khi gửi luôn là thứ được gửi.

type OpName = 'saturate' | 'sepia' | 'grayscale' | 'contrast' | 'brightness';
export type FilterOp = readonly [OpName, number];
export type CamFilter = { id: 'none' | 'warm' | 'film' | 'soft' | 'mono'; ops: readonly FilterOp[] };

export const FILTERS: readonly CamFilter[] = [
  { id: 'none', ops: [] },
  { id: 'warm', ops: [['sepia', 0.22], ['saturate', 1.18], ['brightness', 1.03]] },
  { id: 'film', ops: [['contrast', 1.08], ['saturate', 0.78], ['sepia', 0.14]] },
  { id: 'soft', ops: [['contrast', 0.88], ['brightness', 1.07], ['saturate', 0.9]] },
  { id: 'mono', ops: [['grayscale', 1], ['contrast', 1.12]] },
];

export const cssFilter = (ops: readonly FilterOp[]) => (ops.length ? ops.map(([k, v]) => `${k}(${v})`).join(' ') : 'none');

/** Ma trận 3x4 (hàng: r, g, b; cột: r, g, b, cộng thêm theo thang 0..255) của một hàm CSS filter. */
function matrix([op, v]: FilterOp): number[] {
  const a = Math.min(1, Math.max(0, v)), n = 1 - a;
  switch (op) {
    case 'grayscale': return [
      0.2126 + 0.7874 * n, 0.7152 - 0.7152 * n, 0.0722 - 0.0722 * n, 0,
      0.2126 - 0.2126 * n, 0.7152 + 0.2848 * n, 0.0722 - 0.0722 * n, 0,
      0.2126 - 0.2126 * n, 0.7152 - 0.7152 * n, 0.0722 + 0.9278 * n, 0];
    case 'sepia': return [
      0.393 + 0.607 * n, 0.769 - 0.769 * n, 0.189 - 0.189 * n, 0,
      0.349 - 0.349 * n, 0.686 + 0.314 * n, 0.168 - 0.168 * n, 0,
      0.272 - 0.272 * n, 0.534 - 0.534 * n, 0.131 + 0.869 * n, 0];
    case 'saturate': return [
      0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0,
      0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0,
      0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v, 0];
    case 'brightness': return [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0];
    case 'contrast': { const o = (0.5 - 0.5 * v) * 255; return [v, 0, 0, o, 0, v, 0, o, 0, 0, v, o]; }
  }
}

const clamp = (x: number) => (x < 0 ? 0 : x > 255 ? 255 : x);

/** Áp lần lượt từng hàm lên dữ liệu ảnh RGBA, kẹp sau mỗi bước như trình duyệt làm. */
export function applyOps(d: Uint8ClampedArray, ops: readonly FilterOp[]) {
  const m = Float64Array.from(ops.flatMap(matrix)), end = m.length;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    for (let j = 0; j < end; j += 12) {
      const nr = clamp(m[j] * r + m[j + 1] * g + m[j + 2] * b + m[j + 3]);
      const ng = clamp(m[j + 4] * r + m[j + 5] * g + m[j + 6] * b + m[j + 7]);
      const nb = clamp(m[j + 8] * r + m[j + 9] * g + m[j + 10] * b + m[j + 11]);
      r = nr; g = ng; b = nb;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
}

/**
 * Chụp đúng vùng khung ngắm đang thấy: cắt giữa theo tỉ lệ 3:4 (như object-fit: cover), zoom số thì lấy vùng giữa đang phóng,
 * camera trước thì lật như gương. Cạnh dài tối đa 1440 px.
 */
export async function shoot(video: HTMLVideoElement, o: { mirror: boolean; zoom: number; ops: readonly FilterOp[] }): Promise<Blob> {
  const vw = video.videoWidth, vh = video.videoHeight;
  let cw = vw, ch = vh;
  if (vw / vh > 3 / 4) cw = vh * 3 / 4; else ch = vw * 4 / 3;
  const z = Math.max(1, o.zoom);
  cw /= z; ch /= z;
  const k = Math.min(1, 1440 / ch);
  const c = document.createElement('canvas');
  c.width = Math.round(cw * k); c.height = Math.round(ch * k);
  const g = c.getContext('2d', { willReadFrequently: o.ops.length > 0 })!;
  if (o.mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
  if (o.ops.length) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    applyOps(img.data, o.ops);
    g.putImageData(img, 0, 0);
  }
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('snap'))), 'image/jpeg', 0.86));
}
