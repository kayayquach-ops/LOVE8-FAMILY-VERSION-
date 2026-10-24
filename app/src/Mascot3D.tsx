import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { Mascot, type Drive, type MascotMode } from './Mascot';

type Props = { mode?: MascotMode; drive?: React.RefObject<Drive>; size?: number; className?: string };

const still: React.RefObject<Drive> = { current: { talking: false, pulse: 0, level: 0 } };

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const Inner = lazy(() => Promise.resolve({ default: Mascot3D }));

/** Linh vật 3D (Blender → mascot.glb, vẽ bằng three.js). Máy không có WebGL hoặc tải lỗi thì rơi về bản SVG. */
export function MascotAny(p: Props) {
  const [ok, setOk] = useState(() => hasWebGL());
  const svg = <Mascot mode={p.mode} drive={p.drive} size={p.size} className={p.className} />;
  if (!ok) return svg;
  return <Suspense fallback={svg}><Inner {...p} onFail={() => setOk(false)} /></Suspense>;
}

function Mascot3D({ mode = 'idle', drive = still, size = 220, className = '', onFail }: Props & { onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [ready, setReady] = useState(false);
  const w = size, h = Math.round(size * 260 / 240);

  useEffect(() => {
    let dead = false;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        if (dead || !host.current) return;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1.0;
        host.current.appendChild(renderer.domElement);
        renderer.domElement.style.display = 'block';

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        const key = new THREE.DirectionalLight(0xfff3e6, 1.1);
        key.position.set(-2.5, 4, 5);
        scene.add(key);
        const camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 50);
        camera.position.set(0, 1.1, 6.3);
        camera.lookAt(0, 1.02, 0);

        const gltf = await new GLTFLoader().loadAsync('/mascot.glb');
        if (dead) { renderer.dispose(); return; }
        const root = gltf.scene;
        scene.add(root);

        // Chất liệu mềm như silicon: phủ một lớp bóng nhẹ, mắt thì bóng hẳn.
        const get = (n: string) => root.getObjectByName(n) as THREE.Object3D;
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const old = m.material as THREE.MeshStandardMaterial;
          const eye = /^Eye/.test(m.name), glint = /^Glint/.test(m.name);
          m.material = new THREE.MeshPhysicalMaterial({
            color: old.color, roughness: eye ? 0.1 : glint ? 0.3 : 0.55, metalness: 0,
            clearcoat: eye ? 1 : 0.25, clearcoatRoughness: eye ? 0.05 : 0.35,
            sheen: eye || glint ? 0 : 0.5, sheenColor: new THREE.Color('#F5EEFF'), sheenRoughness: 0.6,
            emissive: glint ? new THREE.Color('#ffffff') : new THREE.Color('#000000'), emissiveIntensity: glint ? 0.9 : 0,
          });
        });

        const eyeL = get('EyeL'), eyeR = get('EyeR'), mouth = get('Mouth');
        const armL = get('ArmL'), armR = get('ArmR'), stalk = get('Stalk'), face = get('Face');
        const cheekL = get('CheekL'), cheekR = get('CheekR'), ball = get('Ball') as THREE.Mesh;
        const ballMat = ball.material as THREE.MeshPhysicalMaterial;
        mouth.scale.set(0, 0, 0);

        // Trạng thái đang chạy, trượt dần về đích để đổi chế độ không bị giật.
        const s = { open: 1, tilt: 0, armL: 0, armR: 0, droop: 0, lean: 0, happy: 0, glow: 0, m: 0, lv: 0 };
        let nextBlink = 1500, blinkAt = -1;
        const k = (a: number, b: number, r: number) => a + (b - a) * r;
        setReady(true);

        const frame = (t: number) => {
          raf = requestAnimationFrame(frame);
          if (document.hidden) return;
          const mo = modeRef.current, d = drive.current;
          const listen = mo === 'listen', sleep = mo === 'sleep', happy = mo === 'happy', wave = mo === 'wave';

          // Miệng: nhịp giả theo âm tiết cộng cú mở mỗi khi máy báo một từ mới.
          let tgt = 0;
          if (d?.talking) {
            const beat = Math.abs(Math.sin(t / 95)) * 0.55 + Math.abs(Math.sin(t / 160 + 1)) * 0.25;
            const kick = Math.max(0, 1 - (t - d.pulse) / 200) * 0.45;
            tgt = Math.min(1, 0.15 + beat + kick);
          }
          s.m = k(s.m, tgt, tgt > s.m ? 0.45 : 0.3);
          s.lv = k(s.lv, listen ? d?.level ?? 0 : 0, 0.25);

          // Chớp mắt.
          let blink = 1;
          if (t > nextBlink && blinkAt < 0) blinkAt = t;
          if (blinkAt >= 0) {
            const p = (t - blinkAt) / 150;
            blink = p < 0.5 ? 1 - p * 2 * 0.92 : 0.08 + (p - 0.5) * 2 * 0.92;
            if (p >= 1) { blinkAt = -1; blink = 1; nextBlink = t + 2200 + Math.random() * 2600; }
          }
          const wantOpen = sleep ? 0.06 : happy || wave ? 0.2 : listen ? 1.12 : 1;
          s.open = k(s.open, wantOpen, 0.18);
          const eyeY = Math.min(s.open, s.open * blink + (s.open > 1 ? 0 : 0));
          eyeL.scale.set(happy || wave ? 1.15 : 1, Math.max(0.05, eyeY), 1);
          eyeR.scale.copy(eyeL.scale);

          s.tilt = k(s.tilt, listen ? 0.13 : sleep ? 0.22 : 0, 0.08);
          s.lean = k(s.lean, listen ? -0.08 : 0, 0.08);
          s.droop = k(s.droop, sleep ? 0.9 : 0, 0.06);
          s.glow = k(s.glow, listen ? 0.7 : 0, 0.1);
          s.happy = k(s.happy, happy ? 1 : 0, 0.12);
          // ArmL nằm bên phải màn hình (dùng để vẫy), ArmR bên trái; xoay quanh vai, dương là giơ lên.
          s.armL = k(s.armL, wave ? 2.4 + Math.sin(t / 140) * 0.45 : happy ? 1.5 + Math.sin(t / 200) * 0.2 : 0, 0.14);
          s.armR = k(s.armR, happy ? 1.5 + Math.sin(t / 200 + 1) * 0.2 : 0, 0.14);

          // Thân: thở, nhún theo mic, nhảy khi vui, xẹp xuống khi ngủ.
          const breathe = sleep ? Math.sin(t / 1400) * 0.015 : Math.sin(t / 900) * 0.03;
          const hop = happy ? Math.abs(Math.sin(t / 260)) * 0.1 : 0;
          const squash = sleep ? 0.9 : 1;
          root.position.y = breathe + hop + s.lv * 0.1 - (sleep ? 0.05 : 0);
          root.scale.set(squash + s.lv * 0.05 + (sleep ? 0.06 : 0), squash - s.lv * 0.03, squash + (sleep ? 0.06 : 0));
          root.rotation.z = s.tilt + Math.sin(t / 1900) * 0.015;
          root.rotation.x = s.lean;
          root.rotation.y = Math.sin(t / 2600) * 0.06 + (listen ? 0.1 : 0);

          armL.rotation.z = s.armL + Math.sin(t / 1100) * 0.03;
          armR.rotation.z = -s.armR - Math.sin(t / 1100 + 2) * 0.03;

          // Ăng-ten đung đưa, rủ xuống khi ngủ, sáng lên khi lắng nghe.
          stalk.rotation.z = Math.sin(t / 700) * 0.12 + s.droop * 0.7;
          stalk.rotation.x = Math.sin(t / 900 + 1) * 0.06;
          ballMat.emissive.set('#B9A0FF');
          ballMat.emissiveIntensity = s.glow * (0.6 + Math.sin(t / 220) * 0.2);
          cheekL.scale.setScalar(1 + s.happy * 0.25);
          cheekR.scale.setScalar(1 + s.happy * 0.25);

          // Miệng chỉ hiện khi đang nói; mở theo chiều đứng.
          const open = s.m;
          if (open > 0.06) mouth.scale.set(0.9 + open * 0.5, 1, Math.max(0.1, open * 1.7));
          else mouth.scale.set(0, 0, 0);
          void face;

          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(frame);

        cleanup = () => {
          cancelAnimationFrame(raf);
          scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
        if (dead) cleanup();
      } catch {
        if (!dead) onFail();
      }
    })();
    return () => { dead = true; cancelAnimationFrame(raf); cleanup(); };
  }, [w, h]);

  return (
    <div className={`mascot mascot3d ${className}`} style={{ width: w, height: h }} role="img" aria-label="Homeletter">
      <i className="mascot3d-shadow" style={{ opacity: ready ? 1 : 0 }} />
      <div ref={host} className="mascot3d-gl" style={{ opacity: ready ? 1 : 0 }} />
    </div>
  );
}
