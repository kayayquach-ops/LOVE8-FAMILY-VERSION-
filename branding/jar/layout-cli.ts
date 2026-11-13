// npx tsx branding/jar/layout-cli.ts <danh sách loại hạt, phẩy> [cỡ hạt px]
// Xếp hạt bằng đúng mô phỏng của app (app/src/jarSim.ts), in JSON vị trí (px trên ảnh lọ lớn) cho preview.py.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drop, makeWorld, type Circle, type JarGeo } from '../../app/src/jarSim.ts';

const data = JSON.parse(readFileSync(fileURLToPath(new URL('../../app/src/jarData.json', import.meta.url)), 'utf8')) as {
  jar: JarGeo; charms: Record<string, { c: Circle[] }>;
};
const [list, size] = process.argv.slice(2);
const geo = size ? { ...data.jar, seed: Number(size) / data.jar.w } : data.jar;
const w = makeWorld(geo);
const t0 = Date.now();
const out = list.split(',').map((type, i) => {
  const d = drop(w, type, data.charms[type].c, i);
  return { type, x: d.x, y: d.y, a: d.a };
});
process.stderr.write(`layout ${out.length} seeds in ${Date.now() - t0} ms\n`);
console.log(JSON.stringify(out));
