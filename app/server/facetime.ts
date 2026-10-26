import express from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from './db.ts';
import { notifyCall } from './push.ts';
import { errorBody, tReq } from './i18n.ts';

// Gọi video cả nhà: mỗi nhà một phòng, máy chủ chỉ chuyển lời mời kết nối (SDP, ICE) giữa các máy qua SSE.
// Hình và tiếng đi thẳng giữa các máy (WebRTC). Mạng di động thường cần TURN, đặt CF_TURN_KEY_ID và CF_TURN_API_TOKEN (Cloudflare) hoặc TURN_URL.

type Room = { id: string; by: string; to: string | null; members: Set<string>; started: number };
export type LiveRoom = { id: string; by: string; to: string | null; members: string[]; started: number } | null;

const rooms = new Map<string, Room>(); // family_id -> phòng đang gọi
const conns = new Map<string, { fid: string; set: Set<express.Response> }>(); // member_id -> các luồng SSE đang mở
const gone = new Map<string, ReturnType<typeof setTimeout>>();

const view = (r?: Room): LiveRoom => (r ? { id: r.id, by: r.by, to: r.to, members: [...r.members], started: r.started } : null);

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
let cf: { at: number; list: Ice[] } | null = null;

/** Cloudflare Realtime TURN: xin mật khẩu ngắn hạn (6 giờ), nhớ 1 giờ. Lỗi thì dùng cấu hình tĩnh. */
async function cloudflareIce(): Promise<Ice[] | null> {
  const id = process.env.CF_TURN_KEY_ID, token = process.env.CF_TURN_API_TOKEN;
  if (!id || !token) return null;
  if (cf && Date.now() - cf.at < 3600_000) return cf.list;
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 21600 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`Cloudflare TURN ${r.status}`);
    const j = (await r.json()) as { iceServers?: Ice[] };
    if (!j.iceServers?.length) throw new Error('Cloudflare TURN trả rỗng');
    cf = { at: Date.now(), list: j.iceServers };
    return cf.list;
  } catch (e) {
    console.error('[facetime]', (e as Error).message);
    return cf?.list ?? null;
  }
}

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
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
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

export const liveRouter = express.Router();

liveRouter.get('/live/config', h(async (_req, res) => { res.json({ iceServers: await iceServers() }); }));

liveRouter.get('/live/room', (req: any, res) => { res.json({ room: view(rooms.get(req.member.family_id)) }); });

liveRouter.post('/live/join', h(async (req, res) => {
  const { id: mid, family_id: fid } = req.member;
  let r = rooms.get(fid);
  if (!r) {
    // `to`: gọi riêng một người trong nhà (chuông và thông báo chỉ tới người đó).
    let to: string | null = typeof req.body?.to === 'string' && req.body.to !== mid ? req.body.to : null;
    if (to) {
      const { rows } = await pool.query('select 1 from members where id = $1 and family_id = $2', [to, fid]);
      if (!rows[0]) to = null;
    }
    // Trong lúc kiểm tra người nhận, người khác có thể đã mở phòng: dùng phòng đó.
    r = rooms.get(fid);
    if (!r) {
      r = { id: randomUUID(), by: mid, to, members: new Set(), started: Date.now() };
      rooms.set(fid, r);
      notifyCall(fid, mid, to);
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

/** Chuyển một gói tin kết nối (sdp, candidate, trạng thái mic/camera, chụp chung) tới một người cùng nhà đang trong phòng. */
liveRouter.post('/live/signal', (req: any, res) => {
  const r = rooms.get(req.member.family_id);
  const to = String(req.body?.to || '');
  const targets = to === '*' ? [...(r?.members ?? [])].filter((m) => m !== req.member.id) : r?.members.has(to) ? [to] : [];
  for (const m of targets) send(m, { type: 'signal', from: req.member.id, data: req.body?.data ?? null });
  res.json({ ok: true, sent: targets.length });
});
