import type * as T3 from 'three';
import type { MascotShape } from './shared';

// Các hình linh vật là thú bông vải nỉ dựng trong Blender (may từng mảnh rồi bơm phồng; script ở branding/mascots, file nguồn
// C:\Users\YT KOREA\homeletter\mascots-plush.blend), xuất ra public/mascots/<hình>.glb. Hình nào cũng có đủ bộ phận cùng tên (EyeL, EyeR, Mouth,
// CheekL, CheekR, ArmL, ArmR, Stalk; Mây có thêm Ball), nên một bộ chuyển động dùng chung: chớp mắt, miệng mở theo giọng, vẫy tay, nghiêng đầu, ngủ.
// ArmL nằm bên phải màn hình.
// Stalk là phần trên đầu đung đưa (ăng-ten, tai, mầm, chỏm lông, đuôi), gốc ở chân nó. Tay xoay quanh vai. Miệng có trục z dựng đứng.
// Khung toạ độ: chân ở y = 0, mắt quanh y = 1, đỉnh không quá y = 2.4, mặt hướng về +z.

type Three = typeof T3;

export type Rig = {
  root: T3.Object3D;
  eyeL: T3.Object3D; eyeR: T3.Object3D; mouth: T3.Object3D;
  armL: T3.Object3D; armR: T3.Object3D; stalk: T3.Object3D;
  cheekL: T3.Object3D; cheekR: T3.Object3D;
  /** Hệ số góc giơ tay (mặc định 1). */
  armGain: number;
  /** Quả bi trên ăng-ten (chỉ Mây), sáng lên khi lắng nghe. */
  ball?: T3.Mesh;
};

/** Cánh sao vẫy nhẹ hơn tay tròn: giơ hết cỡ thì mũi cánh chui ra sau thân. */
const ARM_GAIN: Partial<Record<MascotShape, number>> = { star: 0.4 };

let feltTex: Promise<T3.Texture> | null = null;

/** Normal map sợi nỉ dùng chung cho mọi hình, tải một lần. */
function feltNormal(THREE: Three) {
  feltTex ??= new THREE.TextureLoader().loadAsync('/mascots/felt-normal.jpg').then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }).catch((e) => { feltTex = null; throw e; });
  return feltTex;
}

/** Số lần vân nỉ lặp trên 1 đơn vị (thân linh vật rộng khoảng 1,6) và độ nổi của sợi. */
const FELT_SCALE = 1.6, FELT_STRENGTH = 0.55;

/** Phủ vân sợi nỉ bằng chiếu ba mặt (triplanar) theo toạ độ của chính lưới: GLB không cần UV nên nhẹ, vân không trôi khi linh vật cử động. */
function addFeltDetail(mat: T3.MeshPhysicalMaterial, tex: T3.Texture) {
  mat.customProgramCacheKey = () => 'mascot-felt';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.feltMap = { value: tex };
    sh.uniforms.feltScale = { value: FELT_SCALE };
    sh.uniforms.feltStrength = { value: FELT_STRENGTH };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFeltPos;\nvarying vec3 vFeltNrm;\nvarying vec3 vFeltX;\nvarying vec3 vFeltY;\nvarying vec3 vFeltZ;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFeltPos = position; vFeltNrm = normal;
vFeltX = normalMatrix * vec3(1.0, 0.0, 0.0); vFeltY = normalMatrix * vec3(0.0, 1.0, 0.0); vFeltZ = normalMatrix * vec3(0.0, 0.0, 1.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D feltMap; uniform float feltScale; uniform float feltStrength;
varying vec3 vFeltPos; varying vec3 vFeltNrm; varying vec3 vFeltX; varying vec3 vFeltY; varying vec3 vFeltZ;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 fn = normalize(vFeltNrm);
  vec3 fw = pow(abs(fn), vec3(4.0));
  fw /= fw.x + fw.y + fw.z;
  vec3 fp = vFeltPos * feltScale;
  vec2 fx = texture2D(feltMap, fp.zy).xy * 2.0 - 1.0;
  vec2 fy = texture2D(feltMap, fp.xz).xy * 2.0 - 1.0;
  vec2 fz = texture2D(feltMap, fp.xy).xy * 2.0 - 1.0;
  vec3 fd = fw.x * vec3(0.0, fx.y, fx.x) + fw.y * vec3(fy.x, 0.0, fy.y) + fw.z * vec3(fz.x, fz.y, 0.0);
  vec3 fo = normalize(fn + fd * feltStrength);
  normal = normalize(vFeltX * fo.x + vFeltY * fo.y + vFeltZ * fo.z);
}`);
  };
}

/** Tải hình linh vật từ GLB và phủ chất liệu vải nỉ (nhám, sheen của lông tơ, vân sợi nỉ); mắt nút nhựa thì bóng hẳn. */
export async function loadMascotModel(THREE: Three, shape: MascotShape): Promise<T3.Object3D> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const [gltf, felt] = await Promise.all([
    new GLTFLoader().loadAsync(`/mascots/${shape}.glb`),
    feltNormal(THREE).catch(() => null),
  ]);
  const root = gltf.scene;
  root.userData.armGain = ARM_GAIN[shape] ?? 1;
  const white = new THREE.Color('#ffffff');
  root.traverse((o) => {
    const m = o as T3.Mesh;
    if (!m.isMesh) return;
    const old = m.material as T3.MeshStandardMaterial;
    const glossy = old.roughness < 0.3;
    if (glossy) {
      m.material = new THREE.MeshPhysicalMaterial({ color: old.color, roughness: old.roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
    } else {
      const mat = new THREE.MeshPhysicalMaterial({
        color: old.color, roughness: 0.95, metalness: 0, side: old.side,
        sheen: 1, sheenRoughness: 0.45, sheenColor: old.color.clone().lerp(white, 0.5),
      });
      if (felt) addFeltDetail(mat, felt);
      m.material = mat;
    }
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
  scene.environmentIntensity = 0.75;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xfff3e6, 1.7);
  key.position.set(-2.5, 4, 5);
  scene.add(key);
  // Đèn viền phía sau bên phải: tách dáng linh vật khỏi nền kem, ánh sheen chạy dọc mép.
  const rim = new THREE.DirectionalLight(0xf4f0ff, 0.9);
  rim.position.set(3, 2.5, -4);
  scene.add(rim);
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
