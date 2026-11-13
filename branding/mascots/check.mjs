// Soát GLB linh vật bằng chính three + GLTFLoader: đủ tên nút, khung toạ độ, trục miệng dựng đứng.
// node branding/mascots/check.mjs app/public/mascots/cloud.glb ...
import fs from 'node:fs';
import * as THREE from '../../app/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../app/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const NEED = ['EyeL', 'EyeR', 'Mouth', 'CheekL', 'CheekR', 'ArmL', 'ArmR', 'Stalk'];
let bad = 0;
for (const f of process.argv.slice(2)) {
  const buf = fs.readFileSync(f);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const miss = NEED.filter((n) => !root.getObjectByName(n));
  const box = new THREE.Box3().setFromObject(root);
  const eye = new THREE.Vector3();
  root.getObjectByName('EyeL')?.getWorldPosition(eye);
  const mouth = root.getObjectByName('Mouth');
  const zAxis = mouth ? new THREE.Vector3(0, 0, 1).transformDirection(mouth.matrixWorld) : new THREE.Vector3();
  const armL = new THREE.Vector3();
  root.getObjectByName('ArmL')?.getWorldPosition(armL);
  const errs = [];
  if (miss.length) errs.push(`thiếu ${miss.join(',')}`);
  if (Math.abs(box.min.y) > 0.02) errs.push(`chân y=${box.min.y.toFixed(3)}`);
  if (box.max.y > 2.4) errs.push(`đỉnh y=${box.max.y.toFixed(3)}`);
  if (eye.y < 0.8 || eye.y > 1.25) errs.push(`mắt y=${eye.y.toFixed(2)}`);
  if (zAxis.y < 0.95) errs.push(`trục z miệng không dựng đứng (${zAxis.toArray().map((v) => v.toFixed(2))})`);
  if (armL.x <= 0) errs.push('ArmL không ở bên phải màn hình');
  bad += errs.length;
  console.log(`${f.split(/[\\/]/).pop()} ${(buf.length / 1024).toFixed(0)}KB box y ${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)} x ±${Math.max(-box.min.x, box.max.x).toFixed(2)} mắt y=${eye.y.toFixed(2)} Ball=${!!root.getObjectByName('Ball')} ${errs.length ? 'LỖI: ' + errs.join('; ') : 'ok'}`);
}
process.exit(bad ? 1 : 0);
