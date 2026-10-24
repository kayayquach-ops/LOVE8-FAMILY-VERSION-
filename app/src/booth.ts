// Photobooth: vẽ một tấm ảnh chung từ các ô video, trên nền và khung theo chủ đề. Tất cả vẽ bằng canvas, không cần dịch vụ ngoài.

export const W = 1080, H = 1350;

export type Tile = { id?: string; video: HTMLVideoElement | null; name: string; mirror: boolean };
type Ctx = CanvasRenderingContext2D;
type Theme = { id: string; name: string; ink: string; frame: string; radius: number; bg: (c: Ctx, photo?: HTMLImageElement | null) => void };

// Ngẫu nhiên có hạt giống: vẽ lại mỗi khung hình mà hoạ tiết không nhảy.
function rand(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

function grain(c: Ctx, alpha: number, seed = 7) {
  const r = rand(seed);
  c.fillStyle = `rgba(60,50,45,${alpha})`;
  for (let i = 0; i < 2600; i++) c.fillRect(r() * W, r() * H, 1.6, 1.6);
}

function blob(c: Ctx, x: number, y: number, rad: number, color: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

function flower(c: Ctx, x: number, y: number, s: number, color: string) {
  c.fillStyle = color;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    c.beginPath();
    c.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.5, s * 0.34, a, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(255,236,200,.9)';
  c.beginPath(); c.arc(x, y, s * 0.2, 0, Math.PI * 2); c.fill();
}

export const THEMES: Theme[] = [
  {
    id: 'mist', name: 'Sương sớm', ink: '#2B2723', frame: '#FFFFFF', radius: 34,
    bg: (c) => {
      c.fillStyle = '#ECEAE8'; c.fillRect(0, 0, W, H);
      blob(c, 540, 520, 700, 'rgba(255,255,255,.95)');
      blob(c, 80, 1300, 760, 'rgba(241,200,182,.85)');
      blob(c, 1040, 1250, 700, 'rgba(190,182,204,.8)');
      grain(c, 0.07);
    },
  },
  {
    id: 'film', name: 'Phim cũ', ink: '#F3E7D3', frame: '#F3E7D3', radius: 6,
    bg: (c) => {
      c.fillStyle = '#2A211C'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#F3E7D3';
      for (let y = 30; y < H; y += 64) { c.fillRect(14, y, 22, 34); c.fillRect(W - 36, y, 22, 34); }
      grain(c, 0.12, 3);
    },
  },
  {
    id: 'tet', name: 'Hoa đào', ink: '#FFF4EE', frame: '#FFF4EE', radius: 30,
    bg: (c) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#A8322D'); g.addColorStop(1, '#7C1F22');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const r = rand(11);
      for (let i = 0; i < 26; i++) flower(c, r() * W, r() * H, 14 + r() * 22, `rgba(248,${170 + Math.round(r() * 40)},${180 + Math.round(r() * 30)},.75)`);
    },
  },
  {
    id: 'sea', name: 'Biển', ink: '#24425A', frame: '#FFFFFF', radius: 40,
    bg: (c) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#F4EFE6'); g.addColorStop(0.55, '#BFD8E2'); g.addColorStop(1, '#6E9BB4');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3;
      for (let y = 700; y < H; y += 46) {
        c.beginPath();
        for (let x = 0; x <= W; x += 20) c.lineTo(x, y + Math.sin(x / 60 + y) * 9);
        c.stroke();
      }
      blob(c, 880, 180, 220, 'rgba(255,230,190,.9)');
    },
  },
  {
    id: 'night', name: 'Đêm sao', ink: '#F2EEE6', frame: 'rgba(242,238,230,.9)', radius: 999,
    bg: (c) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1C2340'); g.addColorStop(1, '#3B3355');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const r = rand(5);
      for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,250,235,${0.3 + r() * 0.7})`; c.beginPath(); c.arc(r() * W, r() * H, r() * 2.4 + 0.4, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#F6EFD9'; c.beginPath(); c.arc(900, 150, 62, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1C2340'; c.beginPath(); c.arc(876, 132, 56, 0, Math.PI * 2); c.fill();
    },
  },
  {
    id: 'letter', name: 'Thư nhà', ink: '#5A4636', frame: '#FFFDF8', radius: 8,
    bg: (c) => {
      c.fillStyle = '#F6EEDF'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(154,90,68,.18)'; c.lineWidth = 2;
      for (let y = 90; y < H; y += 54) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.strokeStyle = 'rgba(184,90,80,.35)'; c.beginPath(); c.moveTo(96, 0); c.lineTo(96, H); c.stroke();
      grain(c, 0.06, 9);
    },
  },
  {
    id: 'photo', name: 'Ảnh của mình', ink: '#FFFFFF', frame: '#FFFFFF', radius: 30,
    bg: (c, photo) => {
      c.fillStyle = '#8A8278'; c.fillRect(0, 0, W, H);
      if (photo?.naturalWidth) cover(c, photo, photo.naturalWidth, photo.naturalHeight, 0, 0, W, H, false);
      c.fillStyle = 'rgba(30,25,22,.22)'; c.fillRect(0, 0, W, H);
    },
  },
];

export function cover(c: Ctx, src: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number, mirror: boolean) {
  const s = Math.max(w / sw, h / sh);
  const cw = w / s, ch = h / s;
  c.save();
  if (mirror) { c.translate(x + w, y); c.scale(-1, 1); x = 0; y = 0; c.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h); }
  else c.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
  c.restore();
}

function rounded(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** Chia ô: 1 người một ô lớn, 2 người chồng nhau, 3 đến 6 người hai cột, nhiều hơn ba cột. */
export function cells(n: number, x0: number, y0: number, w: number, h: number, gap: number) {
  const cols = n <= 2 ? 1 : n <= 6 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols), k = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const off = ((cols - inRow) * (cw + gap)) / 2;
    return { x: x0 + off + k * (cw + gap), y: y0 + r * (ch + gap), w: cw, h: ch };
  });
}

export function drawBooth(c: Ctx, themeId: string, tiles: Tile[], title: string, photo?: HTMLImageElement | null) {
  const t = THEMES.find((x) => x.id === themeId) ?? THEMES[0];
  c.save();
  t.bg(c, photo);
  const box = cells(Math.max(tiles.length, 1), 70, 96, W - 140, H - 96 - 230, 30);
  tiles.forEach((tile, i) => {
    const b = box[i];
    const pad = t.radius >= 999 ? 0 : 12;
    // Đêm sao dùng ô tròn như ô cửa sổ.
    const round = t.radius >= 999;
    const side = Math.min(b.w, b.h);
    const r = round ? { x: b.x + (b.w - side) / 2, y: b.y + (b.h - side) / 2, w: side, h: side } : b;
    c.save();
    c.shadowColor = 'rgba(30,20,15,.22)'; c.shadowBlur = 28; c.shadowOffsetY = 10;
    c.fillStyle = t.frame;
    if (round) { c.beginPath(); c.arc(r.x + side / 2, r.y + side / 2, side / 2, 0, Math.PI * 2); }
    else rounded(c, r.x, r.y, r.w, r.h, t.radius);
    c.fill();
    c.restore();
    c.save();
    if (round) { c.beginPath(); c.arc(r.x + side / 2, r.y + side / 2, side / 2 - 10, 0, Math.PI * 2); }
    else rounded(c, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, Math.max(t.radius - pad, 4));
    c.clip();
    c.fillStyle = '#3A332E';
    c.fillRect(r.x, r.y, r.w, r.h);
    const v = tile.video;
    if (v && v.videoWidth && v.readyState >= 2) cover(c, v, v.videoWidth, v.videoHeight, r.x, r.y, r.w, r.h, tile.mirror);
    else {
      c.fillStyle = '#F1E2D8';
      c.font = `500 ${Math.round(side * 0.28)}px BVP, system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText((tile.name.trim().split(/\s+/).pop()?.[0] ?? '?').toUpperCase(), r.x + r.w / 2, r.y + r.h / 2);
    }
    // Tên nằm trong ô, góc dưới, trên một dải mờ.
    const fs = Math.round(Math.max(24, Math.min(34, side * 0.075)));
    c.font = `500 ${fs}px BVP, system-ui, sans-serif`;
    const tw = c.measureText(tile.name).width + fs * 1.2;
    const tx = round ? r.x + (r.w - tw) / 2 : r.x + pad + 16;
    const ty = r.y + r.h - pad - fs * 1.7 - (round ? side * 0.08 : 14);
    c.fillStyle = 'rgba(30,25,22,.38)';
    c.beginPath(); c.roundRect(tx, ty, tw, fs * 1.7, fs);
    c.fill();
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(tile.name, tx + tw / 2, ty + fs * 0.88);
    c.restore();
  });
  c.fillStyle = t.ink;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = '500 64px BVP, system-ui, sans-serif';
  c.fillText(title, W / 2, H - 112);
  c.font = '400 32px BVP, system-ui, sans-serif';
  c.globalAlpha = 0.75;
  c.fillText(new Date().toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, H - 60);
  c.restore();
}
