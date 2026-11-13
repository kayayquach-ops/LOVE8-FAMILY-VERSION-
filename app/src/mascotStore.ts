import { useSyncExternalStore } from 'react';
import { setMascotName } from './i18n';
import { isMascotShape, type Family, type MascotShape } from './shared';

// Hình linh vật của nhà, đặt một lần khi có /api/me. Mọi chỗ vẽ linh vật (tab, cuộc gọi) đọc ở đây, không phải truyền qua props.
let shape: MascotShape = 'cloud';
const subs = new Set<() => void>();

export function applyMascot(f?: Pick<Family, 'mascotName' | 'mascotShape'> | null) {
  setMascotName(f?.mascotName);
  const s = isMascotShape(f?.mascotShape) ? f.mascotShape : 'cloud';
  if (s === shape) return;
  shape = s;
  subs.forEach((fn) => fn());
}

export function useMascotShape(): MascotShape {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => { subs.delete(fn); }; }, () => shape, () => shape);
}
