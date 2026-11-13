// Trang vẽ thử linh vật bằng đúng mã của app (loadMascotModel, bindRig, makeStage), để xem GLB trông thế nào trong app.
// Tham số URL: shapes=a,b,c  px=chiều ngang mỗi ô  views=front,34,side  cols=số cột  bg=màu nền  label=1  talk=1
import * as THREE from 'three';
import { loadMascotModel, bindRig, makeStage, disposeTree } from '../../../app/src/mascotModels';
import type { MascotShape } from '../../../app/src/shared';

const NAMES: Record<string, string> = {
  cloud: 'Mây', chick: 'Gà con', bunny: 'Thỏ', kitten: 'Mèo', bear: 'Gấu', sprout: 'Mầm', riceball: 'Cơm nắm', star: 'Ngôi sao',
};
const VIEW_Y: Record<string, number> = { front: 0, '34': -0.62, side: -1.35, back: Math.PI, '34r': 0.62 };

async function main() {
  const q = new URLSearchParams(location.search);
  const shapes = (q.get('shapes') || 'cloud,chick,bunny,kitten,bear,sprout,riceball,star').split(',') as MascotShape[];
  const views = (q.get('views') || 'front,34').split(',');
  const px = Number(q.get('px') || 300);
  const cols = Number(q.get('cols') || 4);
  const bg = q.get('bg') || '#F3E9DA';
  const label = q.get('label') !== '0';
  const talk = Number(q.get('talk') || 0);
  const w = px, h = Math.round(px * 260 / 240);
  const cellW = w * views.length, cellH = h + (label ? 44 : 0);
  const rows = Math.ceil(shapes.length / cols);
  const out = document.createElement('canvas');
  out.width = cellW * cols;
  out.height = cellH * rows;
  document.body.appendChild(out);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h);
  const { scene, camera } = await makeStage(THREE, renderer, w, h);
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * cellH;
    try {
      const root = await loadMascotModel(THREE, s);
      const rig = bindRig(root);
      if (talk) rig.mouth.scale.set(0.9 + talk * 0.5, 1, Math.max(0.1, talk * 1.7));
      // Tư thế giống Mascot3D.tsx để soát khớp tay, Stalk, mắt.
      const pose = q.get('pose');
      if (pose === 'wave' || pose === 'happy') {
        rig.armL.rotation.z = (pose === 'wave' ? 2.4 : 1.5) * rig.armGain;
        if (pose === 'happy') rig.armR.rotation.z = -1.5 * rig.armGain;
        rig.eyeL.scale.set(1.15, 0.2, 1); rig.eyeR.scale.set(1.15, 0.2, 1);
        if (pose === 'happy') { rig.cheekL.scale.setScalar(1.25); rig.cheekR.scale.setScalar(1.25); }
      }
      if (pose === 'sleep') {
        rig.stalk.rotation.z = 0.7 + 0.12;
        rig.eyeL.scale.set(1, 0.06, 1); rig.eyeR.scale.set(1, 0.06, 1);
      }
      if (pose === 'sway') { rig.stalk.rotation.z = -0.12; rig.stalk.rotation.x = 0.06; }
      scene.add(root);
      views.forEach((v, j) => {
        root.rotation.y = VIEW_Y[v] ?? 0;
        renderer.render(scene, camera);
        // Bóng đổ mềm dưới chân như .mascot3d-shadow trong app.
        const sx = cx + j * w, sy = cy + (label ? 44 : 0);
        const g = ctx.createRadialGradient(sx + w / 2, sy + h * 0.935, 0, sx + w / 2, sy + h * 0.935, w * 0.28);
        g.addColorStop(0, 'rgba(90,70,130,.22)');
        g.addColorStop(1, 'rgba(90,70,130,0)');
        ctx.save();
        ctx.translate(sx + w / 2, sy + h * 0.935);
        ctx.scale(1, 0.13);
        ctx.translate(-(sx + w / 2), -(sy + h * 0.935));
        ctx.fillStyle = g;
        ctx.fillRect(sx, sy + h * 0.935 - w * 0.3, w, w * 0.6);
        ctx.restore();
        ctx.drawImage(renderer.domElement, sx, sy);
      });
      scene.remove(root);
      disposeTree(root);
    } catch (e) {
      ctx.fillStyle = '#a00';
      ctx.fillText(String(e), cx + 10, cy + 60);
    }
    if (label) {
      ctx.fillStyle = '#5b4a3f';
      ctx.font = '500 22px "Segoe UI", sans-serif';
      ctx.fillText(`${NAMES[s] ?? s}  ·  ${s}`, cx + 18, cy + 32);
    }
  }
  renderer.dispose();
  document.title = 'done';
}

main().catch((e) => { document.body.textContent = String(e); document.title = 'error'; });
