// In cấu trúc GLB: dung lượng, số đỉnh, kiểu thuộc tính, phần mở rộng. V=1 để in từng lưới.
import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + len).toString());
  const T = { 5120: 'i8', 5121: 'u8', 5122: 'i16', 5123: 'u16', 5125: 'u32', 5126: 'f32' };
  let verts = 0, tris = 0;
  const rows = j.meshes.map((m) => m.primitives.map((p) => {
    const a = j.accessors[p.attributes.POSITION];
    verts += a.count;
    tris += j.accessors[p.indices].count / 3;
    return `${m.name}:${a.count}v ${Object.entries(p.attributes).map(([k, v]) => `${k}=${T[j.accessors[v].componentType]}`).join(' ')} idx=${T[j.accessors[p.indices].componentType]}`;
  }).join(' | '));
  console.log(`${f.split(/[\\/]/).pop()} ${(b.length / 1024).toFixed(0)}KB verts=${verts} tris=${tris} ext=${JSON.stringify(j.extensionsUsed || [])}`);
  if (process.env.V) rows.forEach((r) => console.log('  ' + r));
}
