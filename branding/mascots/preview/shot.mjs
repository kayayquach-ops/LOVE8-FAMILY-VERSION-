// Chụp ảnh linh vật bằng Chrome headless, vẽ bằng đúng mã three.js của app.
// node branding/mascots/preview/shot.mjs <out.png> [shapes=a,b] [px=300] [views=front,34] [cols=4] [label=1] [talk=0]
import { build } from '../../../app/node_modules/esbuild/lib/main.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../../../app');
const out = path.resolve(process.argv[2] || 'mascots-shot.png');
const params = Object.fromEntries(process.argv.slice(3).map((a) => a.split('=')));
const shapes = (params.shapes || 'cloud,chick,bunny,kitten,bear,sprout,riceball,star').split(',');
const views = (params.views || 'front,34').split(',');
const px = Number(params.px || 300);
const cols = Math.min(Number(params.cols || 4), shapes.length);
const label = params.label !== '0';
const W = px * views.length * cols;
const H = (Math.round(px * 260 / 240) + (label ? 44 : 0)) * Math.ceil(shapes.length / cols);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mascot-shot-'));
await build({
  entryPoints: [path.join(here, 'entry.ts')], bundle: true, format: 'esm', outfile: path.join(tmp, 'bundle.js'),
  nodePaths: [path.join(app, 'node_modules')], logLevel: 'error', target: 'es2022',
});
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#F3E9DA}canvas{display:block}</style><script type="module" src="/bundle.js"></script>`;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/' || u.pathname === '/index.html') { res.setHeader('content-type', 'text/html'); return res.end(html); }
  if (u.pathname === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(fs.readFileSync(path.join(tmp, 'bundle.js'))); }
  const f = path.join(app, 'public', decodeURIComponent(u.pathname));
  if (f.startsWith(path.join(app, 'public')) && fs.existsSync(f)) {
    res.setHeader('content-type', f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.png') ? 'image/png' : 'model/gltf-binary');
    return res.end(fs.readFileSync(f));
  }
  res.statusCode = 404; res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const qs = new URLSearchParams({ ...params, shapes: shapes.join(','), views: views.join(','), px: String(px), cols: String(cols) });
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = [
  '--headless=new', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--hide-scrollbars', `--user-data-dir=${path.join(tmp, 'prof')}`, `--window-size=${W},${H}`, '--virtual-time-budget=60000',
  `--screenshot=${out}`, `http://127.0.0.1:${port}/?${qs}`,
];
await new Promise((resolve) => execFile(chrome, args, { timeout: 180000 }, (err, so, se) => { if (err) console.error(String(se).slice(-2000)); resolve(); }));
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fs.existsSync(out) ? `ok ${out} ${W}x${H}` : 'no screenshot');
