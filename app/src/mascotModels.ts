import type * as T3 from 'three';
import type { MascotShape } from './shared';

// Các hình linh vật. "cloud" là bản gốc dựng trong Blender (mascot.glb); các hình còn lại dựng bằng khối tròn ngay trong three.js.
// Hình nào cũng có đủ bộ phận cùng tên với bản gốc (EyeL, EyeR, Mouth, CheekL, CheekR, ArmL, ArmR, Stalk), nên một bộ chuyển động dùng chung:
// chớp mắt, miệng mở theo giọng, vẫy tay, nghiêng đầu, ngủ. ArmL nằm bên phải màn hình. Stalk là phần trên đầu đung đưa (tai, mầm, chỏm lông, đuôi).
// Khung toạ độ giống bản gốc: chân ở y = 0, mắt quanh y = 1, đỉnh không quá y = 2.4, mặt hướng về +z.

type Three = typeof T3;

export type Rig = {
  root: T3.Object3D;
  eyeL: T3.Object3D; eyeR: T3.Object3D; mouth: T3.Object3D;
  armL: T3.Object3D; armR: T3.Object3D; stalk: T3.Object3D;
  cheekL: T3.Object3D; cheekR: T3.Object3D;
  /** Hệ số góc giơ tay (mặc định 1). */
  armGain: number;
  /** Quả bi trên ăng-ten (chỉ bản gốc), sáng lên khi lắng nghe. */
  ball?: T3.Mesh;
};

const EYE = '#231C26';
const GLINT = '#ffffff';
const CHEEK = '#F2A7A4';
const MOUTH = '#5C2633';

/** Bề mặt phía trước của thân: z tại (x, y). */
type Surf = (x: number, y: number) => number;

function kit(THREE: Three) {
  const mesh = (geo: T3.BufferGeometry, color: string, name = '') => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color }));
    m.name = name;
    return m;
  };
  /** Khối tròn kéo dãn theo ba trục. */
  const blob = (rx: number, ry: number, rz: number, color: string, name = '', seg = 48) => {
    const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
    g.scale(rx, ry, rz);
    return mesh(g, color, name);
  };
  const at = <O extends T3.Object3D>(o: O, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };
  const group = (name = '') => { const g = new THREE.Group(); g.name = name; return g; };
  /** Mặt dùng chung: mắt có đốm sáng, má hồng, miệng (ẩn tới khi nói). */
  const face = (root: T3.Object3D, surf: Surf, o: { eyeX?: number; eyeY?: number; mouthY?: number; cheekX?: number; cheekY?: number; eye?: number } = {}) => {
    const { eyeX = 0.25, eyeY = 1, mouthY = 0.78, cheekX = 0.43, cheekY = 0.84, eye = 1 } = o;
    for (const s of [1, -1]) {
      const e = blob(0.105 * eye, 0.145 * eye, 0.055, EYE, s > 0 ? 'EyeL' : 'EyeR', 32);
      at(e, s * eyeX, eyeY, surf(s * eyeX, eyeY) - 0.012);
      const g = blob(0.036 * eye, 0.036 * eye, 0.02, GLINT, s > 0 ? 'GlintL' : 'GlintR', 16);
      at(g, -0.035 * eye, 0.065 * eye, 0.048);
      e.add(g);
      root.add(e);
      const c = blob(0.075, 0.048, 0.025, CHEEK, s > 0 ? 'CheekL' : 'CheekR', 24);
      at(c, s * cheekX, cheekY, surf(s * cheekX, cheekY) - 0.006);
      c.rotation.y = s * Math.asin(Math.min(0.9, cheekX * 0.9));
      root.add(c);
    }
    // Miệng xoay để trục z của nó dựng đứng: bộ chuyển động kéo trục z khi nói là miệng mở theo chiều dọc.
    const m = blob(0.065, 0.03, 0.045, MOUTH, 'Mouth', 24);
    at(m, 0, mouthY, surf(0, mouthY) - 0.012);
    m.rotation.x = -Math.PI / 2;
    root.add(m);
  };
  /** Tay ngắn mập: khớp vai ở gốc, tay buông xuống. */
  const arms = (root: T3.Object3D, x: number, y: number, z: number, color: string, size: [number, number, number] = [0.13, 0.25, 0.13]) => {
    for (const s of [1, -1]) {
      const pivot = at(group(s > 0 ? 'ArmL' : 'ArmR'), s * x, y, z);
      const a = at(blob(size[0], size[1], size[2], color, '', 32), s * 0.09, -size[1] * 0.72, 0.03);
      a.rotation.z = s * 0.22;
      pivot.add(a);
      root.add(pivot);
    }
  };
  const feet = (root: T3.Object3D, color: string, x = 0.3, size: [number, number, number] = [0.22, 0.15, 0.25]) => {
    for (const s of [1, -1]) root.add(at(blob(size[0], size[1], size[2], color, s > 0 ? 'LegL' : 'LegR', 32), s * x, 0.1, 0.08));
  };
  /** Thân tròn kéo dãn có tâm ở (0, cy, 0); trả về hàm bề mặt trước. */
  const body = (root: T3.Object3D, rx: number, ry: number, rz: number, cy: number, color: string): Surf => {
    root.add(at(blob(rx, ry, rz, color, 'Body', 64), 0, cy, 0));
    return (x, y) => rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2));
  };
  return { mesh, blob, at, group, face, arms, feet, body };
}

function chick(THREE: Three) {
  const k = kit(THREE);
  const root = k.group('Mascot');
  const yellow = '#F8DA84', wing = '#F1C866', orange = '#EE9F57';
  const surf = k.body(root, 0.8, 0.82, 0.74, 0.9, yellow);
  k.face(root, surf, { mouthY: 0.72, eyeY: 1.02 });
  const beak = k.blob(0.095, 0.06, 0.08, orange, 'Beak', 24);
  root.add(k.at(beak, 0, 0.86, surf(0, 0.86) + 0.02));
  k.arms(root, 0.74, 0.98, 0.1, wing, [0.11, 0.26, 0.09]);
  k.feet(root, orange, 0.28, [0.17, 0.07, 0.22]);
  // Chỏm lông trên đỉnh đầu.
  const stalk = k.at(k.group('Stalk'), 0, 1.66, 0.02);
  for (const [a, h] of [[-0.45, 0.12], [0, 0.16], [0.45, 0.12]] as const) {
    const f = k.blob(0.045, h, 0.045, wing, '', 20);
    f.geometry.translate(0, h * 0.9, 0);
    f.rotation.z = a;
    stalk.add(f);
  }
  root.add(stalk);
  return root;
}

function bunny(THREE: Three) {
  const k = kit(THREE);
  const root = k.group('Mascot');
  const cream = '#F8F0E5', pink = '#F1B5B1';
  const surf = k.body(root, 0.76, 0.8, 0.7, 0.88, cream);
  k.face(root, surf, {});
  root.add(k.at(k.blob(0.045, 0.035, 0.03, pink, 'Nose', 16), 0, 0.88, surf(0, 0.88) + 0.005));
  k.arms(root, 0.7, 0.96, 0.12, cream);
  k.feet(root, cream);
  root.add(k.at(k.blob(0.16, 0.16, 0.16, cream, 'Tail', 24), 0, 0.45, -0.68));
  // Hai tai dài đung đưa cùng nhau.
  const stalk = k.at(k.group('Stalk'), 0, 1.5, 0);
  for (const s of [1, -1]) {
    const ear = k.at(k.group(), s * 0.24, 0, 0);
    ear.rotation.z = -s * 0.16;
    ear.add(k.at(k.blob(0.15, 0.42, 0.1, cream, '', 32), 0, 0.38, 0));
    ear.add(k.at(k.blob(0.08, 0.31, 0.04, pink, '', 24), 0, 0.38, 0.075));
    stalk.add(ear);
  }
  root.add(stalk);
  return root;
}

function kitten(THREE: Three) {
  const k = kit(THREE);
  const root = k.group('Mascot');
  const ginger = '#EDBA8E', cream = '#FAEBD8', pink = '#EFA9A6', stripe = '#DD9E6E';
  const surf = k.body(root, 0.8, 0.76, 0.7, 0.86, ginger);
  // Mảng kem quanh miệng.
  root.add(k.at(k.blob(0.3, 0.18, 0.12, cream, 'Muzzle', 32), 0, 0.8, surf(0, 0.8) - 0.07));
  const muzzle: (x: number, y: number) => number = (x, y) => Math.max(surf(x, y), surf(0, 0.8) - 0.07 + 0.12 * Math.sqrt(Math.max(0, 1 - (x / 0.3) ** 2 - ((y - 0.8) / 0.18) ** 2)));
  k.face(root, muzzle, { eyeY: 1.0, mouthY: 0.74, cheekX: 0.46, cheekY: 0.86 });
  root.add(k.at(k.blob(0.045, 0.032, 0.03, pink, 'Nose', 16), 0, 0.85, muzzle(0, 0.85) + 0.005));
  // Ba vằn nhỏ trên trán.
  for (const [x, r] of [[-0.14, 0.25], [0, 0], [0.14, -0.25]] as const) {
    const s = k.blob(0.03, 0.1, 0.03, stripe, '', 16);
    s.rotation.z = r;
    root.add(k.at(s, x, 1.42, surf(x, 1.42) - 0.012));
  }
  // Tai tam giác bo tròn, đứng yên trên đầu.
  for (const s of [1, -1]) {
    const ear = k.at(k.group(), s * 0.44, 1.38, 0);
    ear.rotation.z = -s * 0.38;
    const outer = k.mesh(new THREE.ConeGeometry(0.21, 0.36, 32, 1), ginger);
    outer.position.y = 0.16;
    const inner = k.mesh(new THREE.ConeGeometry(0.12, 0.22, 24, 1), pink);
    inner.position.set(0, 0.12, 0.09);
    inner.scale.z = 0.5;
    ear.add(outer, inner, k.at(k.blob(0.21, 0.06, 0.21, ginger, '', 24), 0, -0.02, 0));
    root.add(ear);
  }
  k.arms(root, 0.74, 0.94, 0.12, ginger);
  k.feet(root, cream);
  // Đuôi cong ló ra bên trái, đung đưa.
  const stalk = k.at(k.group('Stalk'), -0.5, 0.35, -0.35);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.35, 0.1, -0.05), new THREE.Vector3(-0.5, 0.45, 0), new THREE.Vector3(-0.38, 0.72, 0.05),
  ]);
  stalk.add(k.mesh(new THREE.TubeGeometry(curve, 32, 0.075, 16, false), ginger));
  stalk.add(k.at(k.blob(0.075, 0.075, 0.075, ginger, '', 16), -0.38, 0.72, 0.05));
  root.add(stalk);
  return root;
}

function bear(THREE: Three) {
  const k = kit(THREE);
  const root = k.group('Mascot');
  const honey = '#C99C74', cream = '#F0DCC2', inner = '#E6C3A2', nose = '#4A3530';
  const surf = k.body(root, 0.8, 0.8, 0.72, 0.88, honey);
  const mz = surf(0, 0.78) - 0.06;
  root.add(k.at(k.blob(0.28, 0.2, 0.12, cream, 'Muzzle', 32), 0, 0.78, mz));
  const muzzle: Surf = (x, y) => Math.max(surf(x, y), mz + 0.12 * Math.sqrt(Math.max(0, 1 - (x / 0.28) ** 2 - ((y - 0.78) / 0.2) ** 2)));
  k.face(root, muzzle, { eyeY: 1.04, mouthY: 0.71, cheekX: 0.46, cheekY: 0.86 });
  root.add(k.at(k.blob(0.07, 0.048, 0.04, nose, 'Nose', 20), 0, 0.84, muzzle(0, 0.84) + 0.01));
  for (const s of [1, -1]) {
    root.add(k.at(k.blob(0.21, 0.2, 0.13, honey, '', 32), s * 0.5, 1.5, 0));
    root.add(k.at(k.blob(0.12, 0.11, 0.05, inner, '', 24), s * 0.5, 1.49, 0.1));
  }
  k.arms(root, 0.74, 0.96, 0.12, honey);
  k.feet(root, honey);
  root.add(k.at(k.blob(0.38, 0.32, 0.1, cream, 'Belly', 32), 0, 0.42, surf(0, 0.42) - 0.08));
  // Không có gì trên đầu: Stalk để trống cho bộ chuyển động.
  root.add(k.at(k.group('Stalk'), 0, 1.7, 0));
  return root;
}

function sprout(THREE: Three) {
  const k = kit(THREE);
  const root = k.group('Mascot');
  const seed = '#E4C69B', green = '#93B97F', leaf = '#A9CB8F';
  // Hạt hình quả trứng: dưới đầy, trên thon.
  const rx = 0.76, ry = 0.84, rz = 0.7, cy = 0.86;
  const taper = (y: number) => 1 - 0.14 * Math.max(0, (y - cy) / ry);
  const g = new THREE.SphereGeometry(1, 64, 45);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) * ry + cy;
    p.setXYZ(i, p.getX(i) * rx * taper(y), p.getY(i) * ry, p.getZ(i) * rz * taper(y));
  }
  g.computeVertexNormals();
  root.add(k.at(k.mesh(g, seed, 'Body'), 0, cy, 0));
  const surf: Surf = (x, y) => { const t = taper(y); return rz * t * Math.sqrt(Math.max(0, 1 - (x / (rx * t)) ** 2 - ((y - cy) / ry) ** 2)); };
  k.face(root, surf, {});
  k.arms(root, 0.7, 0.94, 0.12, seed);
  k.feet(root, seed);
  // Mầm: thân nhỏ và hai lá.
  const stalk = k.at(k.group('Stalk'), 0, 1.66, 0);
  const stem = k.mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 12), green);
  stem.position.y = 0.13;
  stalk.add(stem);
  for (const s of [1, -1]) {
    const l = k.blob(0.2, 0.055, 0.11, leaf, '', 24);
    l.geometry.translate(0.18, 0, 0);
    l.position.set(0, 0.27, 0);
    l.rotation.set(0, s > 0 ? 0 : Math.PI, 0.35);
    stalk.add(l);
  }
  root.add(stalk);
  return root;
}

function riceball(THREE: Three) {
  const k = kit(THREE);
  const root = k.group('Mascot');
  const rice = '#FBF7EE', nori = '#3E4A3F';
  // Cơm nắm tam giác bo tròn: kéo thon phần trên của khối cầu.
  const rx = 0.88, ry = 0.82, rz = 0.6, cy = 0.86;
  const tri = (yn: number) => 1.14 - 0.52 * ((yn + 1) / 2);
  const shape = (g: T3.BufferGeometry, grow = 1) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const yn = p.getY(i);
      p.setXYZ(i, p.getX(i) * rx * tri(yn) * grow, yn * ry * grow, p.getZ(i) * rz * grow);
    }
    g.computeVertexNormals();
    return g;
  };
  root.add(k.at(k.mesh(shape(new THREE.SphereGeometry(1, 64, 45)), rice, 'Body'), 0, cy, 0));
  // Lá rong biển ôm mặt dưới phía trước.
  const band = k.mesh(shape(new THREE.SphereGeometry(1, 48, 24, Math.PI / 2 - 0.62, 1.24, 2.05, 0.75), 1.012), nori, 'Nori');
  (band.material as T3.MeshStandardMaterial).side = THREE.DoubleSide;
  root.add(k.at(band, 0, cy, 0));
  const surf: Surf = (x, y) => { const yn = (y - cy) / ry; return rz * Math.sqrt(Math.max(0, 1 - (x / (rx * tri(yn))) ** 2 - yn ** 2)); };
  k.face(root, surf, { eyeY: 0.98, mouthY: 0.78, cheekX: 0.42, cheekY: 0.84 });
  k.arms(root, 0.8, 0.76, 0.08, rice, [0.12, 0.2, 0.12]);
  k.feet(root, rice, 0.3, [0.2, 0.13, 0.22]);
  root.add(k.at(k.group('Stalk'), 0, 1.62, 0));
  return root;
}

function star(THREE: Three) {
  const k = kit(THREE);
  const root = k.group('Mascot');
  const gold = '#F4C27E';
  const depth = 0.34, bevel = { bevelEnabled: true, bevelThickness: 0.17, bevelSize: 0.13, bevelSegments: 8, curveSegments: 20 };
  const front = depth / 2 + bevel.bevelThickness;
  const cy = 0.98;
  // Ngôi sao bo góc: đi qua trung điểm các cạnh, góc nào cũng uốn cong. Hai cánh ngang ngắn lại, thay bằng hai tay rời để vẫy được.
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const side = i === 2 || i === 8;
    const r = i % 2 ? 0.5 : side ? 0.58 : 1.02;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const roundPoly = (p: Array<[number, number]>) => {
    const s = new THREE.Shape();
    const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
    const m0 = mid(p[p.length - 1], p[0]);
    s.moveTo(m0[0], m0[1]);
    for (let i = 0; i < p.length; i++) {
      const m = mid(p[i], p[(i + 1) % p.length]);
      s.quadraticCurveTo(p[i][0], p[i][1], m[0], m[1]);
    }
    return s;
  };
  const extrude = (s: T3.Shape) => {
    const g = new THREE.ExtrudeGeometry(s, { depth, ...bevel });
    g.translate(0, 0, -depth / 2);
    return g;
  };
  root.add(k.at(k.mesh(extrude(roundPoly(pts)), gold, 'Body'), 0, cy, 0));
  const surf: Surf = () => front;
  k.face(root, surf, { eyeY: 1.02, mouthY: 0.82, eyeX: 0.22, cheekX: 0.4, cheekY: 0.86, eye: 0.95 });
  // Hai cánh ngang là tay: khớp ở vai, mũi cánh chếch lên 18 độ như ngôi sao.
  const tilt = Math.PI / 10;
  for (const s of [1, -1]) {
    const tip: Array<[number, number]> = [[0, 0.24], [0.62 * Math.cos(tilt), 0.62 * Math.sin(tilt)], [0, -0.24], [-0.12, 0]];
    const sh = roundPoly(tip.map(([x, y]) => [s * x, y] as [number, number]));
    const pivot = k.at(k.group(s > 0 ? 'ArmL' : 'ArmR'), s * 0.46, cy + 0.14, -0.03);
    pivot.add(k.mesh(extrude(sh), gold));
    root.add(pivot);
  }
  root.add(k.at(k.group('Stalk'), 0, 2.0, 0));
  // Cánh sao vẫy nhẹ hơn tay tròn: giơ hết cỡ thì mũi cánh chui ra sau thân.
  root.userData.armGain = 0.4;
  return root;
}

const BUILD: Record<Exclude<MascotShape, 'cloud'>, (THREE: Three) => T3.Group> = { chick, bunny, kitten, bear, sprout, riceball, star };

/** Dựng hình linh vật (bản gốc tải từ mascot.glb) và phủ chất liệu mềm như silicon, mắt thì bóng hẳn. */
export async function loadMascotModel(THREE: Three, shape: MascotShape): Promise<T3.Object3D> {
  let root: T3.Object3D;
  let sheen = '#FFF4E8';
  if (shape === 'cloud') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    root = (await new GLTFLoader().loadAsync('/mascot.glb')).scene;
    sheen = '#F5EEFF';
  } else root = BUILD[shape](THREE);
  root.traverse((o) => {
    const m = o as T3.Mesh;
    if (!m.isMesh) return;
    const old = m.material as T3.MeshStandardMaterial;
    const eye = /^Eye/.test(m.name), glint = /^Glint/.test(m.name);
    m.material = new THREE.MeshPhysicalMaterial({
      color: old.color, roughness: eye ? 0.1 : glint ? 0.3 : 0.55, metalness: 0, side: old.side,
      clearcoat: eye ? 1 : 0.25, clearcoatRoughness: eye ? 0.05 : 0.35,
      sheen: eye || glint ? 0 : 0.5, sheenColor: new THREE.Color(sheen), sheenRoughness: 0.6,
      emissive: glint ? new THREE.Color('#ffffff') : new THREE.Color('#000000'), emissiveIntensity: glint ? 0.9 : 0,
    });
    old.dispose();
  });
  return root;
}

export function bindRig(root: T3.Object3D): Rig {
  const get = (n: string) => {
    const o = root.getObjectByName(n);
    if (!o) throw new Error(`mascot: missing ${n}`);
    return o;
  };
  const ball = root.getObjectByName('Ball') as T3.Mesh | undefined;
  const rig: Rig = {
    root, eyeL: get('EyeL'), eyeR: get('EyeR'), mouth: get('Mouth'), armL: get('ArmL'), armR: get('ArmR'),
    stalk: get('Stalk'), cheekL: get('CheekL'), cheekR: get('CheekR'), ball, armGain: Number(root.userData.armGain) || 1,
  };
  rig.mouth.scale.set(0, 0, 0);
  return rig;
}

export function disposeTree(root: T3.Object3D) {
  root.traverse((o) => {
    const m = o as T3.Mesh;
    if (m.isMesh) { m.geometry.dispose(); (m.material as T3.Material).dispose(); }
  });
}

/** Sân khấu chung: ánh sáng phòng dịu, một đèn chính ấm, máy quay nhìn ngang tầm mắt linh vật. */
export async function makeStage(THREE: Three, renderer: T3.WebGLRenderer, w: number, h: number) {
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xfff3e6, 1.1);
  key.position.set(-2.5, 4, 5);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 50);
  camera.position.set(0, 1.1, 6.3);
  camera.lookAt(0, 1.02, 0);
  return { scene, camera };
}

let thumbs: Promise<Partial<Record<MascotShape, string>>> | null = null;

/** Ảnh nhỏ của mọi hình, vẽ một lần bằng một bộ vẽ rồi trả lại (đỡ mở nhiều WebGL cùng lúc). */
export function mascotThumbs(shapes: readonly MascotShape[], px = 160): Promise<Partial<Record<MascotShape, string>>> {
  thumbs ??= (async () => {
    const THREE = await import('three');
    const w = px, h = Math.round(px * 260 / 240);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h);
    const { scene, camera } = await makeStage(THREE, renderer, w, h);
    const out: Partial<Record<MascotShape, string>> = {};
    for (const s of shapes) {
      try {
        const root = await loadMascotModel(THREE, s);
        bindRig(root);
        scene.add(root);
        renderer.render(scene, camera);
        out[s] = renderer.domElement.toDataURL('image/png');
        scene.remove(root);
        disposeTree(root);
      } catch { /* hình lỗi thì nút đó hiện chữ */ }
    }
    renderer.dispose();
    renderer.forceContextLoss();
    return out;
  })().catch(() => { thumbs = null; return {}; });
  return thumbs;
}
