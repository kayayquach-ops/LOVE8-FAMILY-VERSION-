// Phần thuần (không đụng trình duyệt) của gọi video FaceTime.tsx: ghi trạng thái nối để chẩn đoán, đọc đường nối từ getStats(),
// lịch sửa kết nối khi rớt. Có test ở src/rtcDiag.test.ts (node --import tsx --test).

/** Có TURN trong cấu hình không. Không có TURN thì hai máy sau NAT di động (4G) gần như không nối được với nhau. */
export const hasTurn = (list: RTCIceServer[]) => list.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/.test(u)));
/** Tổng số địa chỉ STUN/TURN. */
export const iceCount = (list: RTCIceServer[]) => list.reduce((n, s) => n + (Array.isArray(s.urls) ? s.urls.length : 1), 0);

/** Đường nối đang dùng, đọc từ getStats(): "relay/udp~srflx/udp" là loại ứng viên/giao thức của máy mình ~ của máy kia.
 * host: cùng mạng, srflx: qua NAT bằng STUN, prflx: tự dò ra, relay: đi vòng qua TURN (relay/tls là TURN qua cổng 443). rtt: ms. */
export function pairOf(reports: Iterable<any>): { pair: string; rtt: number } | null {
  const all = [...reports];
  const by = new Map(all.map((r) => [r.id, r]));
  const tr = all.find((r) => r.type === 'transport' && r.selectedCandidatePairId);
  const cp = (tr && by.get(tr.selectedCandidatePairId)) ?? all.find((r) => r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded')));
  if (!cp) return null;
  const side = (c: any) => (c ? `${c.candidateType ?? '?'}/${(c.candidateType === 'relay' && c.relayProtocol) || c.protocol || '?'}` : '?');
  const rtt = typeof cp.currentRoundTripTime === 'number' ? Math.round(cp.currentRoundTripTime * 1000) : -1;
  return { pair: `${side(by.get(cp.localCandidateId))}~${side(by.get(cp.remoteCandidateId))}`, rtt };
}

/** Rớt kết nối: lần sửa thứ n chờ FIX_DELAYS[n] ms kể từ lần sửa trước. Hai lần đầu khởi động lại ICE (giữ phiên, tìm đường mới,
 * hợp khi đổi Wi-Fi sang 4G), hai lần sau dựng lại hẳn kết nối. Hết lượt mà vẫn chưa nối được thì báo người dùng và thôi. */
export const FIX_DELAYS = [0, 6000, 8000, 12000, 15000];
export const MAX_FIXES = FIX_DELAYS.length - 1;
export const fixDelay = (n: number) => FIX_DELAYS[Math.min(n, FIX_DELAYS.length - 1)];
export const fixKind = (n: number): 'ice' | 'new' => (n < 2 ? 'ice' : 'new');

/** Chẩn đoán một người trong cuộc gọi. p: 6 ký tự đầu mã thành viên (không gửi gì hơn). role: o là bên mời, a là bên trả lời.
 * t0: lúc bắt đầu nối với người này; ttc: bao lâu thì nối được lần đầu (ms); rs: số lần phải sửa kết nối;
 * ev: dòng thời gian "off@0.2 chk@0.6 ok@2.3 up@2.4" (giây kể từ lúc mở màn gọi); remote: đã nhận được lời mời/trả lời của người kia;
 * up: đang nối thông; bye: người kia đã rời cuộc gọi; gaveUp: đã thôi sửa. */
export type PeerDiag = {
  p: string; role: 'o' | 'a'; t0: number; ok: boolean; ttc: number; pair: string; rtt: number; rs: number;
  ev: string[]; skipped: number; remote: boolean; up: boolean; bye: boolean; gaveUp: boolean;
};

export const newPeerDiag = (id: string, role: 'o' | 'a', now: number): PeerDiag => ({
  p: id.slice(0, 6), role, t0: now, ok: false, ttc: -1, pair: '', rtt: -1, rs: 0, ev: [], skipped: 0, remote: false, up: false, bye: false, gaveUp: false,
});

/** Tên ngắn của trạng thái ICE trong dòng thời gian. */
export const ICE_SHORT: Record<string, string> = { new: 'new', checking: 'chk', connected: 'ok', completed: 'done', disconnected: 'dis', failed: 'fail', closed: 'x' };

const KEEP_HEAD = 12, KEEP_TAIL = 18;
/** Ghi một mốc. Giữ 12 mốc đầu và 18 mốc cuối, ở giữa chỉ đếm số mốc bỏ qua. */
export function mark(d: PeerDiag, what: string, now: number, callT0: number) {
  d.ev.push(`${what}@${((now - callT0) / 1000).toFixed(1)}`);
  if (d.ev.length > KEEP_HEAD + KEEP_TAIL) { d.ev.splice(KEEP_HEAD, 1); d.skipped++; }
}

/** Vì sao chưa nối được (hoặc rớt mà chưa nối lại), đoán từ những gì đã ghi. "-" là đang nối tốt. */
export function failReason(d: PeerDiag): string {
  if (d.gaveUp) return 'gave-up';
  if (d.up) return '-';
  if (!d.remote) return d.role === 'o' ? 'no-answer' : 'no-offer';
  if (d.ok) return d.bye ? '-' : 'dropped';
  return 'ice';
}

/** Bản tóm tắt gửi máy chủ (máy chủ lọc lại từng trường trước khi ghi log, server/facetime.ts diagLine). */
export function peerSummary(d: PeerDiag) {
  const ev = d.skipped ? [...d.ev.slice(0, KEEP_HEAD), `+${d.skipped}`, ...d.ev.slice(KEEP_HEAD)] : d.ev;
  return { p: d.p, role: d.role, ok: d.ok, ttc: d.ttc, pair: d.pair || '-', rtt: d.rtt, rs: d.rs, fail: failReason(d), tl: ev.join(' ') };
}
