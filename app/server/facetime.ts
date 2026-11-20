import express from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from './db.ts';
import { notifyCall } from './push.ts';
import { errorBody, tReq } from './i18n.ts';
import { Limit } from './limit.ts';

// Gọi video cả nhà: mỗi nhà một phòng, máy chủ chỉ chuyển lời mời kết nối (SDP, ICE) giữa các máy qua SSE.
// Hình và tiếng đi thẳng giữa các máy (WebRTC). Mạng di động thường cần TURN, đặt CF_TURN_KEY_ID và CF_TURN_API_TOKEN (Cloudflare) hoặc TURN_URL.
// Phòng nằm trong bộ nhớ của máy chủ: chỉ đúng khi Railway chạy MỘT instance (không có railway.json/toml nào đặt numReplicas, mặc định 1).

// audio: gọi thoại (không camera). up: những người đã nối thông thật trong cuộc gọi này (để móc onCallConnected chỉ chạy một lần mỗi người).
type Room = { id: string; by: string; to: string | null; audio: boolean; members: Set<string>; started: number; up: Set<string> };
export type LiveRoom = { id: string; by: string; to: string | null; audio: boolean; members: string[]; started: number } | null;

const rooms = new Map<string, Room>(); // family_id -> phòng đang gọi
const conns = new Map<string, { fid: string; set: Set<express.Response> }>(); // member_id -> các luồng SSE đang mở
const gone = new Map<string, ReturnType<typeof setTimeout>>();

const view = (r?: Room): LiveRoom => (r ? { id: r.id, by: r.by, to: r.to, audio: r.audio, members: [...r.members], started: r.started } : null);

/** Móc cho phần khác (nhiệm vụ tuần...): chạy khi một cuộc gọi nối thông thật (máy báo hình/tiếng đã đi được giữa hai người).
 * Mỗi người chỉ được tính một lần mỗi cuộc gọi: cặp đầu tiên nối được thì gọi với cả hai người; gọi nhóm có người nối thêm thì gọi lại chỉ với người mới. */
export const onCallConnected: Array<(familyId: string, memberIds: string[]) => void> = [];

function send(memberId: string, msg: unknown) {
  const c = conns.get(memberId);
  if (!c) return;
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of c.set) res.write(data);
}

function toFamily(fid: string, msg: unknown) {
  for (const [mid, c] of conns) if (c.fid === fid) send(mid, msg);
}

function leave(fid: string, memberId: string) {
  const r = rooms.get(fid);
  if (!r || !r.members.delete(memberId)) return;
  if (!r.members.size) rooms.delete(fid);
  toFamily(fid, { type: 'room', room: view(rooms.get(fid)) });
}

type Ice = { urls: string[] | string; username?: string; credential?: string };
const CF_TTL = 21600_000; // mật khẩu TURN sống 6 giờ
let cf: { at: number; list: Ice[] } | null = null;
let cfFailAt = 0;

/** Cloudflare Realtime TURN: xin mật khẩu ngắn hạn (6 giờ), nhớ 1 giờ. Mỗi lần xin được ghi một dòng log (tức tối đa một dòng mỗi giờ).
 * Lỗi thì dùng lại bản cũ nếu còn hạn ít nhất 1 giờ, không thì cấu hình tĩnh (chỉ STUN nếu không có TURN_URL: gọi qua 4G dễ hỏng).
 * Vừa lỗi thì 60 giây sau mới hỏi lại, để Cloudflare chập chờn không làm mỗi cuộc gọi chờ thêm 5 giây. */
async function cloudflareIce(): Promise<Ice[] | null> {
  const id = process.env.CF_TURN_KEY_ID, token = process.env.CF_TURN_API_TOKEN;
  if (!id || !token) return null;
  const now = Date.now();
  const valid = cf && now - cf.at < CF_TTL - 3600_000 ? cf.list : null;
  if (cf && now - cf.at < 3600_000) return cf.list;
  if (now - cfFailAt < 60_000) return valid;
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: CF_TTL / 1000 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`Cloudflare TURN ${r.status}`);
    const j = (await r.json()) as { iceServers?: Ice[] };
    if (!j.iceServers?.length) throw new Error('Cloudflare TURN trả rỗng');
    cf = { at: Date.now(), list: j.iceServers };
    const urls = j.iceServers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    console.log(`[facetime] turn ok: ${j.iceServers.length} ICE servers, ${urls.length} urls (${urls.filter((u) => /^turns?:/.test(u)).length} turn), ${Date.now() - now} ms`);
    return cf.list;
  } catch (e) {
    cfFailAt = Date.now();
    console.error('[facetime] turn lỗi:', (e as Error).message, valid ? '(dùng mật khẩu cũ còn hạn)' : '(chỉ còn cấu hình tĩnh)');
    return valid;
  }
}
// Xin sẵn lúc khởi động: cuộc gọi đầu sau deploy không phải chờ, và log có ngay một dòng "turn ok" (hoặc lỗi) để biết TURN chạy.
if (process.env.CF_TURN_KEY_ID && process.env.CF_TURN_API_TOKEN) void cloudflareIce();

export async function iceServers() {
  const viaCf = await cloudflareIce();
  if (viaCf) return viaCf;
  return staticIce();
}

function staticIce() {
  const stun = (process.env.STUN_URL || 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478').split(',').map((s) => s.trim()).filter(Boolean);
  const list: Array<{ urls: string[]; username?: string; credential?: string }> = [{ urls: stun }];
  if (process.env.TURN_URL) {
    list.push({
      urls: process.env.TURN_URL.split(',').map((s) => s.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    });
  }
  return list;
}

const h = (fn: (req: any, res: express.Response) => Promise<unknown>) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || tReq('error.server') });
  });

/** Luồng sự kiện gọi video. Gắn TRƯỚC auth, tự kiểm tra ?token= vì EventSource không gửi được header. */
export const liveStreamRouter = express.Router();
liveStreamRouter.get('/live/stream', h(async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.status(401).json(errorBody('not_signed_in'));
  const { rows } = await pool.query('select id, family_id from members where token = $1', [token]);
  if (!rows[0]) return res.status(401).json(errorBody('not_signed_in'));
  const mid: string = rows[0].id, fid: string = rows[0].family_id;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  let c = conns.get(mid);
  if (!c) conns.set(mid, (c = { fid, set: new Set() }));
  c.set.add(res);
  clearTimeout(gone.get(mid));
  gone.delete(mid);
  res.write(`data: ${JSON.stringify({ type: 'hello', room: view(rooms.get(fid)) })}\n\n`);
  // Nhịp tim là sự kiện có tên (không phải dòng chú thích) để máy nhận biết kênh còn sống: im quá lâu thì máy tự mở kênh mới (src/live.ts).
  const ping = setInterval(() => res.write('event: ping\ndata: 1\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    c!.set.delete(res);
    if (c!.set.size) return;
    conns.delete(mid);
    // Mất kết nối hẳn một lúc thì coi như đã gác máy.
    // iPhone cắt kênh khi app xuống nền một lúc: chờ lâu hơn trước khi coi là đã gác máy, để người nhận bấm vào thông báo vẫn còn phòng để vào.
    gone.set(mid, setTimeout(() => { gone.delete(mid); if (!conns.has(mid)) leave(fid, mid); }, 75000));
  });
}));

/** Người vừa bị xoá khỏi nhà (members.ts): cắt luồng gọi video của người đó (dọn ở req 'close') và cho rời phòng ngay. */
export function closeLive(familyId: string, memberId: string) {
  for (const res of [...(conns.get(memberId)?.set ?? [])]) res.destroy();
  leave(familyId, memberId);
}

export const liveRouter = express.Router();

liveRouter.get('/live/config', h(async (_req, res) => { res.json({ iceServers: await iceServers() }); }));

liveRouter.get('/live/room', (req: any, res) => { res.json({ room: view(rooms.get(req.member.family_id)) }); });

liveRouter.post('/live/join', h(async (req, res) => {
  const { id: mid, family_id: fid } = req.member;
  const b = req.body ?? {};
  // rejoin: máy đang trong cuộc gọi mà máy chủ vừa khởi động lại (deploy) nên mất phòng. Mở lại đúng phòng cũ (mã phòng, người gọi,
  // người được gọi riêng, giờ bắt đầu, gọi thoại hay video) và không gửi thông báo, để cả nhà không bị đổ chuông lại.
  const rejoin = b.rejoin === true;
  let r = rooms.get(fid);
  if (!r) {
    // `to`: gọi riêng một người trong nhà (chuông và thông báo chỉ tới người đó). Vào lại thì người được gọi có thể chính là mình.
    let to: string | null = typeof b.to === 'string' && (rejoin || b.to !== mid) ? b.to : null;
    let by: string = rejoin && typeof b.by === 'string' ? b.by : mid;
    const check = [to, by].filter((x): x is string => !!x && x !== mid);
    if (check.length) {
      const { rows } = await pool.query('select id from members where family_id = $1 and id = any($2)', [fid, check]);
      const ok = new Set<string>(rows.map((x) => x.id).concat(mid));
      if (to && !ok.has(to)) to = null;
      if (!ok.has(by)) by = mid;
    }
    const started = rejoin && Number.isFinite(b.started) && b.started <= Date.now() && b.started > Date.now() - 86400e3 ? b.started : Date.now();
    const rid = rejoin && typeof b.id === 'string' && /^[0-9a-f-]{36}$/.test(b.id) ? b.id : randomUUID();
    // Trong lúc kiểm tra người nhận, người khác có thể đã mở phòng: dùng phòng đó.
    r = rooms.get(fid);
    if (!r) {
      r = { id: rid, by, to, audio: b.audio === true, members: new Set(), started, up: new Set() };
      rooms.set(fid, r);
      if (!rejoin) notifyCall(fid, mid, to);
    }
  }
  r.members.add(mid);
  toFamily(fid, { type: 'room', room: view(r) });
  res.json({ room: view(r) });
}));

liveRouter.post('/live/leave', (req: any, res) => {
  leave(req.member.family_id, req.member.id);
  res.json({ ok: true });
});

liveRouter.post('/live/decline', (req: any, res) => {
  const r = rooms.get(req.member.family_id);
  for (const m of r?.members ?? []) send(m, { type: 'declined', from: req.member.id });
  res.json({ ok: true });
});

/** Chuyển một gói tin kết nối (sdp, candidate, trạng thái mic/camera, chụp chung) tới một người cùng nhà đang trong phòng.
 * sent: số người nhận đang trong phòng. Gói tin vẫn có thể rơi nếu kênh SSE của người nhận đang nối lại, nên máy tự gửi lại (FaceTime.tsx). */
liveRouter.post('/live/signal', (req: any, res) => {
  const r = rooms.get(req.member.family_id);
  const to = String(req.body?.to || '');
  const targets = to === '*' ? [...(r?.members ?? [])].filter((m) => m !== req.member.id) : r?.members.has(to) ? [to] : [];
  for (const m of targets) send(m, { type: 'signal', from: req.member.id, data: req.body?.data ?? null });
  res.json({ ok: true, sent: targets.length });
});

// ---- Chẩn đoán cuộc gọi ----
// Mỗi cuộc gọi máy gửi một bản tóm tắt lúc gác máy (trạng thái ICE theo thời gian, loại đường nối host/srflx/relay, có TURN không...),
// máy chủ chỉ ghi đúng một dòng "[facetime] diag ...". Không có tên, chỉ 6 ký tự đầu mã thành viên. Ngoài ra máy báo "up" khi vừa nối
// thông với một người, để chạy móc onCallConnected (không ghi log). Mỗi người tối đa 30 lần mỗi giờ.
const diagLimit = new Limit(30, 3600e3);

const pre = (v: unknown, n = 6) => String(v ?? '').replace(/[^0-9a-zA-Z]/g, '').slice(0, n) || '-';
const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), max) : -1);
const sec = (ms: number) => (ms < 0 ? '-' : `${(ms / 1000).toFixed(1)}s`);
const word = (v: unknown, n: number) => String(v ?? '').replace(/[^a-zA-Z0-9/~.@:>+_-]/g, '').slice(0, n) || '-';
const flag = (v: unknown) => (v ? 1 : 0);

/** Dựng dòng log từ bản tóm tắt máy gửi. Mọi trường đều lọc lại ở đây (chỉ chữ số, chữ cái thường gặp, cắt độ dài), máy gửi bậy cũng không chèn được gì vào log. */
export function diagLine(memberId: string, b: any): string {
  const peers: any[] = Array.isArray(b?.peers) ? b.peers.slice(0, 8) : [];
  const head = [
    `me=${pre(memberId)}`, `room=${pre(b?.room, 8)}`, `audio=${flag(b?.audio)}`, `turn=${flag(b?.turn)}`, `ice=${num(b?.ice, 99)}`,
    `cfg=${num(b?.cfg, 99999)}ms`, `media=${word(b?.media, 8)}`, `dur=${sec(num(b?.dur, 864e5))}`, `wait=${sec(num(b?.wait, 864e5))}`,
    `end=${word(b?.end, 12)}`, `sse=${num(b?.sse, 999)}`, `drop=${num(b?.drop, 9999)}`, `peers=${peers.length}`,
  ];
  const tail = peers.map((p) => [
    pre(p?.p), p?.role === 'o' ? 'o' : 'a', `ok=${flag(p?.ok)}`, `ttc=${sec(num(p?.ttc, 864e5))}`, `pair=${word(p?.pair, 40)}`,
    `rtt=${num(p?.rtt, 99999)}ms`, `rs=${num(p?.rs, 99)}`, `fail=${word(p?.fail, 16)}`,
    `tl="${String(p?.tl ?? '').replace(/[^a-z0-9@.+ -]/gi, '').slice(0, 240)}"`,
  ].join(' '));
  return `[facetime] diag ${head.join(' ')}${tail.length ? ` | ${tail.join(' | ')}` : ''}`;
}

liveRouter.post('/live/diag', (req: any, res) => {
  const { id: mid, family_id: fid } = req.member;
  if (!diagLimit.take(mid)) return void res.status(429).json(errorBody('slow_down'));
  const b = req.body ?? {};
  if (typeof b.up === 'string') {
    const r = rooms.get(fid);
    if (r && (!b.room || b.room === r.id) && r.members.has(mid) && r.members.has(b.up) && b.up !== mid) {
      const fresh = [mid, b.up].filter((m) => !r.up.has(m));
      fresh.forEach((m) => r.up.add(m));
      if (fresh.length) for (const f of onCallConnected) { try { f(fid, fresh); } catch (e) { console.error('[facetime] onCallConnected', e); } }
    }
    return void res.json({ ok: true });
  }
  console.log(diagLine(mid, b));
  res.json({ ok: true });
});
