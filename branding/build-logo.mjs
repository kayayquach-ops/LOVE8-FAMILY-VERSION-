// Sinh logo Homeletter (SVG) và xuất PNG cho icon app, splash, favicon.
// Chạy: node branding/build-logo.mjs <đường dẫn tới Chromium của Playwright>
// Ý tưởng: ngôi nhà (Nhà) có thân là một phong thư (Thư), con dấu trái tim gắn ở nắp thư.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const require = createRequire(path.join(root, 'mobile', 'package.json'));

const CORAL = '#F2676A';
const CORAL_DEEP = '#D9474B';
const ROSE = '#FF9A8B';

// Trái tim chuẩn trong khung 100x100, đặt lại vị trí bằng transform.
const HEART = 'M50 88 C22 68 6 52 6 33 C6 18 17 8 30 8 C39 8 46 13 50 21 C54 13 61 8 70 8 C83 8 94 18 94 33 C94 52 78 68 50 88 Z';

/** Biểu tượng (mark) trong khung 1024. `body` là màu ngôi nhà, `ink` là màu nét phong thư và tim. */
function mark({ body, ink, heart = ink }) {
  return `
    <path d="M512 236 L806 492 L726 492 L726 768 L298 768 L298 492 L218 492 Z"
      fill="${body}" stroke="${body}" stroke-width="56" stroke-linejoin="round"/>
    <path d="M330 516 L512 640 L694 516" fill="none" stroke="${ink}" stroke-width="44"
      stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(426 570) scale(1.72)"><path d="${HEART}" fill="${heart}" stroke="${body}" stroke-width="8"/></g>`;
}

const svg = (w, h, inner, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${extra}${inner}</svg>`;

const defs = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${ROSE}"/><stop offset="0.55" stop-color="${CORAL}"/><stop offset="1" stop-color="${CORAL_DEEP}"/>
</linearGradient></defs>`;

const files = {
  // Icon app: nền san hô, nhà trắng, nét thư và tim màu san hô.
  'icon.svg': svg(1024, 1024, `<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>
    <g transform="translate(512 512) scale(0.86) translate(-512 -500)">${mark({ body: '#FFFFFF', ink: CORAL })}</g>`, defs),
  // Logo dùng trên nền trắng: nhà san hô, nét thư trắng, tim đậm.
  'mark.svg': svg(1024, 1024, mark({ body: CORAL, ink: '#FFFFFF', heart: CORAL_DEEP })),
  // Phiên bản một màu (thông báo Android, in ấn).
  'mark-mono.svg': svg(1024, 1024, `<mask id="m"><rect width="1024" height="1024" fill="black"/>${mark({ body: 'white', ink: 'black', heart: 'black' })}</mask>
    <rect width="1024" height="1024" fill="#FFFFFF" mask="url(#m)"/>`),
  // Lớp trước của icon thích ứng Android: chỉ phần mark, nằm trong vùng an toàn 66%.
  'android-foreground.svg': svg(1024, 1024, `<g transform="translate(512 512) scale(0.6) translate(-512 -500)">${mark({ body: '#FFFFFF', ink: CORAL })}</g>`),
  'android-background.svg': svg(1024, 1024, `<rect width="1024" height="1024" fill="url(#bg)"/>`, defs),
};

for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(here, name), content);

const fontPath = require.resolve('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf');
const fontB64 = fs.readFileSync(fontPath).toString('base64');
const fontCss = `@font-face{font-family:BVP;src:url(data:font/ttf;base64,${fontB64})}`;

const { chromium } = require('playwright');
const browser = await chromium.launch(process.argv[2] ? { executablePath: process.argv[2] } : {});
const page = await browser.newPage();

async function render(html, out, w, h, transparent = true) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><head><style>${fontCss}html,body{margin:0;background:transparent}</style></head><body>${html}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}
const img = (file, w, h) => `<img src="data:image/svg+xml;base64,${Buffer.from(files[file]).toString('base64')}" width="${w}" height="${h}" style="display:block">`;

const assets = path.join(root, 'mobile', 'assets');
await render(img('icon.svg', 1024, 1024), path.join(assets, 'icon.png'), 1024, 1024);
await render(img('android-foreground.svg', 1024, 1024), path.join(assets, 'android-icon-foreground.png'), 1024, 1024);
await render(img('android-background.svg', 1024, 1024), path.join(assets, 'android-icon-background.png'), 1024, 1024, false);
await render(img('mark-mono.svg', 1024, 1024), path.join(assets, 'android-icon-monochrome.png'), 1024, 1024);
await render(img('mark.svg', 512, 512), path.join(assets, 'splash-icon.png'), 512, 512);
await render(img('mark.svg', 256, 256), path.join(assets, 'logo-mark.png'), 256, 256);
await render(img('icon.svg', 48, 48), path.join(assets, 'favicon.png'), 48, 48);

// Bảng giới thiệu logo cho hồ sơ dự thi.
const lockup = (color, sub) => `<div style="display:flex;align-items:center;gap:22px">
  ${img(color === '#fff' ? 'mark-mono.svg' : 'mark.svg', 120, 120)}
  <div><div style="font-family:BVP;font-size:64px;color:${color};line-height:1">Homeletter</div>
  <div style="font-family:BVP;font-size:20px;color:${sub};margin-top:10px;letter-spacing:.5px">Stay close, wherever you are</div></div></div>`;
await render(`<div style="width:1600px;height:900px;background:#FFF5F4;font-family:BVP;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:28px;padding:40px;box-sizing:border-box">
  <div style="background:#fff;border-radius:36px;display:flex;align-items:center;justify-content:center">${lockup('#1C1B1F', '#8E8A93')}</div>
  <div style="background:${CORAL};border-radius:36px;display:flex;align-items:center;justify-content:center">${lockup('#fff', 'rgba(255,255,255,.85)')}</div>
  <div style="background:#fff;border-radius:36px;display:flex;align-items:center;justify-content:center;gap:48px">
    ${img('icon.svg', 220, 220)}${img('icon.svg', 120, 120)}${img('icon.svg', 64, 64)}</div>
  <div style="background:#1C1B1F;border-radius:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff">
    <div style="display:flex;gap:18px">${['#FF9A8B', CORAL, CORAL_DEEP, '#1C1B1F', '#FFF5F4'].map((c) => `<div style="text-align:center"><div style="width:88px;height:88px;border-radius:24px;background:${c};border:2px solid rgba(255,255,255,.25)"></div><div style="font-size:15px;margin-top:8px">${c}</div></div>`).join('')}</div>
    <div style="font-size:18px;opacity:.8;max-width:620px;text-align:center;line-height:1.5">Ngôi nhà có thân là một phong thư. Nắp thư khép lại bằng trái tim: lời thương gửi về nhà.</div>
  </div></div>`, path.join(here, 'logo-sheet.png'), 1600, 900, false);

await browser.close();
console.log('logo assets written');
