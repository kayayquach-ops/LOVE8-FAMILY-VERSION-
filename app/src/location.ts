// Vị trí cả nhà, phía app (máy chủ: server/location.ts, phần tính thuần: src/geo.ts).
// Gửi vị trí của mình chỉ khi đang bật chia sẻ VÀ app đang mở: iPhone không cho app web đọc vị trí lúc chạy nền,
// nên ẩn app là thôi theo dõi, mở lại là theo dõi tiếp. Vị trí người khác đến qua kênh sự kiện chung (src/live.ts), loại tin 'loc'.
import { useEffect, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { errorText, token } from './api';
import { onLive } from './live';
import { patchLoc, shouldSend, type LatLon, type Sent } from './geo';
import type { Me, MemberLoc } from './shared';

type LocMsg = { type: 'loc'; memberId: string; loc: MemberLoc | null };

async function call(method: 'POST' | 'PUT', path: string, body: unknown) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token.get() ?? ''}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(errorText(data)), { status: res.status, code: data.code as string | undefined });
  return data;
}

const geo = () => (typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null);
/** Máy có đọc được vị trí không (trình duyệt cũ, trang không https thì không). */
export const canLocate = () => !!geo();

// ---------- Theo dõi vị trí của mình ----------

let on = false; // đang bật chia sẻ (theo máy chủ, hoặc vừa bật, tắt ở Cài đặt)
let denied = false; // máy không cho đọc vị trí: thôi theo dõi tới lần bật lại
let watchId: number | null = null;
let beat = 0;
let fix: (LatLon & { acc: number }) | null = null; // vị trí mới nhất máy báo, chỉ trong lúc đang theo dõi
let last: Sent | null = null; // lần gửi gần nhất
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function push(now = Date.now()) {
  if (!on || !fix || !shouldSend(last, fix, now)) return;
  // Ghi mốc trước khi gửi: mất mạng thì lần thử sau cũng cách ít nhất một phút, không gửi dồn.
  last = { lat: fix.lat, lon: fix.lon, at: now };
  call('POST', '/api/me/location', { lat: fix.lat, lon: fix.lon, acc: fix.acc }).catch((e: { code?: string }) => {
    // Máy chủ nói chia sẻ đang tắt: thôi gửi.
    if (e.code === 'location_off') setSharing(false);
  });
}

function update() {
  const g = geo();
  const run = on && !denied && !!g && !document.hidden;
  if (run && watchId == null) {
    watchId = g!.watchPosition(
      (p) => { fix = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; push(); },
      (e) => { if (e.code === e.PERMISSION_DENIED) { denied = true; update(); emit(); } },
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 60_000 },
    );
    // Đứng yên thì máy ít báo vị trí mới: cứ 15 giây xem lại, đủ một phút thì gửi lại vị trí đang có để cả nhà thấy "vừa xong".
    beat = window.setInterval(() => push(), 15_000);
  } else if (!run && watchId != null) {
    g?.clearWatch(watchId);
    watchId = null;
    clearInterval(beat);
    // Vị trí cũ không dùng lại sau khi mở app lần sau: có thể đã đi chỗ khác.
    fix = null;
  }
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', update);

/** Bật, tắt theo dõi trên máy này (không gọi máy chủ). */
function setSharing(v: boolean) {
  if (v === on) return;
  on = v;
  if (v) denied = false;
  else last = null;
  update();
  emit();
}

/** Công tắc ở Cài đặt: 'off', 'on', hoặc 'denied' (đang bật nhưng máy không cho đọc vị trí). */
export function useSharing(): 'off' | 'on' | 'denied' {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => (on ? (denied ? 'denied' : 'on') : 'off'),
  );
}

/** Bật chia sẻ, sau khi người dùng đồng ý ở tấm hỏi: xin quyền vị trí của máy trước, được thì mới báo máy chủ rồi gửi vị trí đầu tiên.
 *  Máy không cho thì trả 'denied' và không bật gì. Chưa lấy được vị trí (hết giờ, mất tín hiệu) vẫn bật, lát nữa gửi. */
export async function turnOn(): Promise<'on' | 'denied'> {
  const g = geo();
  const p = await new Promise<GeolocationPosition | 'denied' | null>((done) => {
    if (!g) return done('denied');
    g.getCurrentPosition(done, (e) => done(e.code === e.PERMISSION_DENIED ? 'denied' : null), { enableHighAccuracy: false, timeout: 20_000, maximumAge: 60_000 });
  });
  if (p === 'denied') return 'denied';
  await call('PUT', '/api/me/location/share', { on: true });
  setSharing(true);
  if (p) { fix = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; push(); }
  return 'on';
}

/** Tắt chia sẻ: thôi theo dõi ngay, máy chủ xoá vị trí đã lưu. Lỗi mạng thì bật lại như cũ và báo lỗi. */
export async function turnOff() {
  setSharing(false);
  try { await call('PUT', '/api/me/location/share', { on: false }); }
  catch (e) { setSharing(true); throw e; }
}

/** Gắn vào App một lần: công tắc theo máy chủ (me.locShare), vị trí người khác đổi thì sửa đúng người đó, không tải lại cả danh sách. */
export function useLocationLive(me: Me | null, setMe: Dispatch<SetStateAction<Me | null>>) {
  const share = !!me?.locShare;
  useEffect(() => { setSharing(share); }, [share]);
  const signed = !!me;
  useEffect(() => {
    if (!signed) return;
    return onLive((m) => {
      const x = m as unknown as LocMsg;
      if (x.type !== 'loc' || typeof x.memberId !== 'string') return;
      setMe((prev) => (prev ? patchLoc(prev, x.memberId, x.loc ?? null) : prev));
    });
  }, [signed]);
}
