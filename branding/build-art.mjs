// Sinh hình cho bản demo theo phong cách thẻ màu (tham khảo MAD của Nixtio):
//  - avatar hoạt hình cho 5 người trong gia đình mẫu (Avataaars của Pablo Stanley, dùng tự do cả thương mại),
//  - nét lượn mờ phủ lên thẻ màu,
//  - đường cong chuyển màu dưới tiêu đề màn hình đăng nhập.
// Chạy: cd mobile && npm i --no-save @dicebear/core@9 @dicebear/collection@9 && node ../branding/build-art.mjs <Chromium>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const require = createRequire(path.join(root, 'mobile', 'package.json'));
const { createAvatar } = require('@dicebear/core');
const { avataaars } = require('@dicebear/collection');
const { chromium } = require('playwright');

const out = path.join(root, 'mobile', 'assets', 'art');
fs.mkdirSync(out, { recursive: true });

const BLACK_HAIR = '2c1b18';
const SKIN = 'edb98a';
// Mỗi người một nét mặt, một nền tròn sáng màu để nổi trên thẻ.
const PEOPLE = {
  lan: { top: ['straight01'], hairColor: [BLACK_HAIR], accessories: ['round'], accessoriesProbability: 100, eyes: ['happy'], eyebrows: ['raisedExcitedNatural'], mouth: ['smile'], clothing: ['hoodie'], clothesColor: ['ffffff'], bg: 'f7c873' },
  me: { top: ['longButNotTooLong'], hairColor: [BLACK_HAIR], accessoriesProbability: 0, eyes: ['happy'], eyebrows: ['defaultNatural'], mouth: ['smile'], clothing: ['collarAndSweater'], clothesColor: ['e6e6e6'], bg: 'f4a988' },
  bo: { top: ['theCaesarAndSidePart'], hairColor: [BLACK_HAIR], accessories: ['prescription02'], accessoriesProbability: 100, facialHair: ['moustacheFancy'], facialHairProbability: 100, facialHairColor: [BLACK_HAIR], eyes: ['squint'], eyebrows: ['upDownNatural'], mouth: ['smile'], clothing: ['blazerAndShirt'], clothesColor: ['262e33'], bg: 'a8d8c4' },
  nam: { top: ['shortWaved'], hairColor: [BLACK_HAIR], accessories: ['sunglasses'], accessoriesProbability: 100, eyes: ['surprised'], eyebrows: ['raisedExcited'], mouth: ['screamOpen'], clothing: ['graphicShirt'], clothesColor: ['ff5c5c'], bg: 'fbe07a' },
  ba: { top: ['bun'], hairColor: ['e8e1e1'], accessories: ['round'], accessoriesProbability: 100, eyes: ['happy'], eyebrows: ['defaultNatural'], mouth: ['smile'], clothing: ['shirtScoopNeck'], clothesColor: ['b1e2ff'], bg: 'd7c4f5' },
};

const browser = await chromium.launch(process.argv[2] ? { executablePath: process.argv[2] } : {});
const page = await browser.newPage();
async function render(svg, file, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: path.join(out, file), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}

for (const [id, { bg, ...opts }] of Object.entries(PEOPLE)) {
  const svg = createAvatar(avataaars, { seed: id, skinColor: [SKIN], backgroundColor: [bg], radius: 50, size: 256, ...opts }).toString();
  await render(svg, `avatar-${id}.png`, 256, 256);
}

// Nét lượn mờ: vài đường cong kín, nét trắng mảnh, vẽ trên nền trong suốt.
const loops = [
  'M -40 120 C 120 20, 260 220, 420 110 S 640 40, 720 160',
  'M -60 300 C 80 180, 220 420, 380 300 S 600 200, 700 330',
  'M 120 -40 C 40 140, 260 220, 200 380 S 60 620, 260 700',
  'M 460 -30 C 380 160, 620 260, 520 420 S 360 640, 560 720',
];
for (const [i, pick] of [[0, [0, 2, 3]], [1, [1, 2]], [2, [0, 1, 3]]]) {
  const paths = pick.map((k) => `<path d="${loops[k]}" fill="none" stroke="white" stroke-opacity="0.22" stroke-width="2.4" stroke-linecap="round"/>`).join('');
  await render(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">${paths}</svg>`, `lines-${i}.png`, 640, 640);
}

// Đường cong chuyển màu tím, hồng, cam dưới chữ "Đăng nhập".
await render(`<svg xmlns="http://www.w3.org/2000/svg" width="780" height="240" viewBox="0 0 780 240">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#8F20B3"/><stop offset=".55" stop-color="#E0306E"/><stop offset="1" stop-color="#F28A3C"/></linearGradient></defs>
  <path d="M 0 90 C 120 230, 300 230, 420 150 S 640 60, 780 0" fill="none" stroke="url(#g)" stroke-width="5" stroke-linecap="round"/></svg>`, 'curve.png', 780, 240);

await browser.close();
console.log('art written to', path.relative(root, out));
