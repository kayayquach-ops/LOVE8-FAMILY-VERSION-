// Kiểm thử chat cả nhà và tin riêng (server/chat.ts): người thứ ba không đọc, không nghe được tin riêng của hai người khác,
// luồng cả nhà vẫn như cũ, không nhắn riêng sang nhà khác được, số tin chưa đọc tính theo từng luồng.
// Không cần Postgres: DB giả chạy đúng từng câu trong SQL của chat.ts (điều kiện viết lại bằng JS), kênh tức thời là SSE thật qua fetch.
// Chạy: node --import tsx --test server/chat.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'chat-test-'));

const C = await import('./chat.ts');
const { langMiddleware } = await import('./i18n.ts');
const express = (await import('express')).default;

// ---------- DB giả ----------

// i18n-ok-begin: dữ liệu kiểm thử
type Member = { id: string; family_id: string; token: string; lang: string | null };
type Msg = {
  id: string; family_id: string; author_id: string; to_id: string | null; kind: string; text: string | null; media: string | null;
  sticker: string | null; seconds: number | null; reply_to: string | null; created_at: Date; read_at: Date | null;
};

const A = 'fam-a', B = 'fam-b';
const a1 = 'mem-a1', a2 = 'mem-a2', a3 = 'mem-a3', b1 = 'mem-b1';

class FakeDb {
  members: Member[] = [
    { id: a1, family_id: A, token: 'tok-a1', lang: 'vi' },
    { id: a2, family_id: A, token: 'tok-a2', lang: 'ko' },
    { id: a3, family_id: A, token: 'tok-a3', lang: 'vi' },
    { id: b1, family_id: B, token: 'tok-b1', lang: 'en' },
  ];
  messages: Msg[] = [];
  reads = new Map<string, Date>();
  log: string[] = [];
  private clock = Date.parse('2026-11-20T01:00:00Z');
  now() { return new Date(this.clock += 1000); }

  /** Thêm một tin sẵn (như tin cũ trong DB). */
  add(m: Partial<Msg> & { id: string; author_id: string }) {
    const fam = this.members.find((x) => x.id === m.author_id)!.family_id;
    this.messages.push({ family_id: fam, to_id: null, kind: 'text', text: m.id, media: null, sticker: null, seconds: null, reply_to: null, created_at: this.now(), read_at: null, ...m });
  }

  /** Hàng trả về giống COLS_LANG: không có read_at, có author_lang. */
  private out(m: Msg) {
    const { read_at: _r, family_id: _f, ...rest } = m;
    return { ...rest, author_lang: this.members.find((x) => x.id === m.author_id)?.lang ?? null };
  }
  private byTime = (a: Msg, b: Msg) => +a.created_at - +b.created_at;
  private pair = (m: Msg, me: string, peer: string) => (m.author_id === me && m.to_id === peer) || (m.author_id === peer && m.to_id === me);

  async query(q: string, v: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    this.log.push(q);
    const res = (rows: any[]) => ({ rows, rowCount: rows.length });
    const S = C.SQL;
    const fam = (f: string) => this.messages.filter((m) => m.family_id === f);
    switch (q) {
      case 'select id, family_id from members where token = $1':
        return res(this.members.filter((m) => m.token === v[0]).map(({ id, family_id }) => ({ id, family_id })));
      case S.peer:
        return res(this.members.filter((m) => m.id === v[0] && m.family_id === v[1]).map(({ id }) => ({ id })));
      case S.familyRecent:
        return res(fam(v[0]).filter((m) => m.to_id == null).sort(this.byTime).slice(-100).map((m) => this.out(m)));
      case S.familyAfter:
        return res(fam(v[0]).filter((m) => m.to_id == null && m.created_at > v[1]).sort(this.byTime).slice(0, 200).map((m) => this.out(m)));
      case S.dmRecent:
        return res(fam(v[0]).filter((m) => this.pair(m, v[1], v[2])).sort(this.byTime).slice(-100).map((m) => this.out(m)));
      case S.dmAfter:
        return res(fam(v[0]).filter((m) => this.pair(m, v[1], v[2]) && m.created_at > v[3]).sort(this.byTime).slice(0, 200).map((m) => this.out(m)));
      case S.insert: {
        const [id, family_id, author_id, to_id, kind, text, media, sticker, seconds, reply_to] = v;
        const m: Msg = { id, family_id, author_id, to_id, kind, text, media, sticker, seconds, reply_to, created_at: this.now(), read_at: null };
        this.messages.push(m);
        return res([this.out(m)]);
      }
      case S.readFamily:
        this.reads.set(v[0], this.now());
        return res([]);
      case S.readDm: {
        const t = this.now();
        const hit = this.messages.filter((m) => m.family_id === v[0] && m.to_id === v[1] && m.author_id === v[2] && !m.read_at);
        for (const m of hit) m.read_at = t;
        return { rows: [], rowCount: hit.length };
      }
      case S.unreadFamily: {
        const at = this.reads.get(v[1]) ?? new Date(0);
        return res([{ n: fam(v[0]).filter((m) => m.to_id == null && m.author_id !== v[1] && m.created_at > at).length }]);
      }
      case S.unreadDm: {
        const n = new Map<string, number>();
        for (const m of fam(v[0])) if (m.to_id === v[1] && !m.read_at) n.set(m.author_id, (n.get(m.author_id) ?? 0) + 1);
        return res([...n].map(([author_id, c]) => ({ author_id, n: c })));
      }
      case S.lastFamily:
        return res(fam(v[0]).filter((m) => m.to_id == null).sort(this.byTime).slice(-1).map((m) => this.out(m)));
      case S.lastDm: {
        const last = new Map<string, Msg>();
        for (const m of fam(v[0]).filter((x) => x.to_id != null && (x.author_id === v[1] || x.to_id === v[1])).sort(this.byTime)) {
          last.set(m.author_id === v[1] ? m.to_id! : m.author_id, m);
        }
        return res([...last].map(([peer, m]) => ({ ...this.out(m), peer })));
      }
    }
    throw new Error(`DB giả chưa biết câu này: ${q}`);
  }
}

// ---------- Máy chủ thử ----------

type Note = { kind: 'family' | 'to'; fid: string; from: string; to?: string; text?: string | null };

async function start() {
  const db = new FakeDb();
  const notes: Note[] = [];
  const app = express();
  app.use(langMiddleware);
  app.use(express.json());
  app.use('/api', C.makeChatStreamRouter(db));
  // Thay cho auth ở index.ts: mã máy ở header như máy khách thật.
  app.use('/api', (req: any, res, next) => {
    const m = db.members.find((x) => `Bearer ${x.token}` === req.headers.authorization);
    if (!m) return res.status(401).json({ code: 'not_signed_in' });
    req.member = m;
    next();
  });
  app.use('/api', C.makeChatRouter({
    db,
    notifyFamily: (fid, from, m) => notes.push({ kind: 'family', fid, from, text: m.text }),
    notifyTo: (fid, from, to, m) => notes.push({ kind: 'to', fid, from, to, text: m.text }),
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const auth = (who: string) => ({ authorization: `Bearer tok-${who.replace('mem-', '')}` });
  const q = (peer?: string, extra = '') => (peer ? `?with=${encodeURIComponent(peer)}${extra ? `&${extra}` : ''}` : extra ? `?${extra}` : '');

  const api = {
    list: async (who: string, peer?: string, after?: string) => {
      const r = await fetch(`${base}/api/chat${q(peer, after ? `after=${encodeURIComponent(after)}` : '')}`, { headers: auth(who) });
      return { status: r.status, body: await r.json() as any };
    },
    send: async (who: string, text: string, peer?: string) => {
      const f = new FormData();
      f.set('kind', 'text');
      f.set('text', text);
      const r = await fetch(`${base}/api/chat${q(peer)}`, { method: 'POST', headers: auth(who), body: f });
      return { status: r.status, body: await r.json() as any };
    },
    read: async (who: string, peer?: string) => (await fetch(`${base}/api/chat/read${q(peer)}`, { method: 'POST', headers: auth(who) })).status,
    unread: async (who: string) => (await (await fetch(`${base}/api/chat/unread`, { headers: auth(who) })).json()) as { n: number; family: number; people: Record<string, number> },
    threads: async (who: string) => (await (await fetch(`${base}/api/chat/threads`, { headers: auth(who) })).json()) as any,
  };

  /** Mở kênh tức thời như EventSource, gom các tin nhận được. */
  const streams: AbortController[] = [];
  async function listen(who: string) {
    const ctrl = new AbortController();
    streams.push(ctrl);
    const r = await fetch(`${base}/api/chat/stream?token=tok-${who.replace('mem-', '')}`, { signal: ctrl.signal });
    assert.equal(r.status, 200);
    const got: any[] = [];
    const bell = { wake: () => {} };
    void (async () => {
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const data = buf.slice(0, i).split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
            buf = buf.slice(i + 2);
            if (data) { got.push(JSON.parse(data)); bell.wake(); }
          }
        }
      } catch { /* đóng kênh */ }
    })();
    let used = 0;
    return {
      got,
      /** Tin kế tiếp nhận được (chờ tối đa 2 giây). */
      next: async () => {
        const deadline = Date.now() + 2000;
        while (got.length <= used) {
          if (Date.now() > deadline) throw new Error(`${who}: không nhận được tin nào`);
          await new Promise<void>((ok) => { bell.wake = ok; setTimeout(ok, 50); });
        }
        return got[used++];
      },
    };
  }

  const stop = async () => {
    for (const c of streams) c.abort();
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  };
  return { db, notes, api, listen, stop };
}

// ---------- Kiểm thử ----------

test('tin riêng: chỉ hai người trong cuộc đọc và nghe được, người thứ ba cùng nhà không thấy ở đâu cả', async () => {
  const s = await start();
  try {
    const [l1, l2, l3, lb] = await Promise.all([s.listen(a1), s.listen(a2), s.listen(a3), s.listen(b1)]);

    const dm = await s.api.send(a1, 'chuyện riêng của hai mẹ con', a2);
    assert.equal(dm.status, 200);
    assert.equal(dm.body.to_id, a2);
    assert.equal(dm.body.author_id, a1);
    assert.equal(s.db.messages.find((m) => m.id === dm.body.id)!.family_id, A);
    // Rồi một tin cả nhà: tin đầu tiên a3 nhận phải là tin cả nhà, tức là a3 không nhận tin riêng.
    const fam = await s.api.send(a1, 'cả nhà ơi', undefined);
    assert.equal(fam.body.to_id, null);

    assert.equal((await l1.next()).id, dm.body.id, 'người gửi nhận lại tin riêng của mình');
    assert.equal((await l2.next()).id, dm.body.id, 'người nhận nhận tin riêng');
    assert.equal((await l3.next()).id, fam.body.id, 'người thứ ba chỉ nhận tin cả nhà');
    assert.equal((await l2.next()).id, fam.body.id);
    assert.equal((await l1.next()).id, fam.body.id);
    assert.ok(!l3.got.some((m) => m.id === dm.body.id));
    // Nhà khác không nghe được gì của nhà A.
    await s.api.send(b1, 'nhà B đây');
    assert.equal((await lb.next()).text, 'nhà B đây');
    assert.ok(!lb.got.some((m) => m.id === dm.body.id || m.id === fam.body.id));

    // Đọc: người thứ ba mở luồng riêng với từng người, luồng cả nhà: không có tin riêng của a1 với a2.
    for (const peer of [a1, a2, undefined]) {
      const r = await s.api.list(a3, peer);
      assert.equal(r.status, 200);
      assert.ok(!r.body.some((m: any) => m.id === dm.body.id), `a3 thấy tin riêng ở luồng ${peer ?? 'cả nhà'}`);
      const after = await s.api.list(a3, peer, '2000-01-01T00:00:00Z');
      assert.ok(!after.body.some((m: any) => m.id === dm.body.id), `a3 thấy tin riêng khi hỏi bù ở luồng ${peer ?? 'cả nhà'}`);
    }
    // Hai người trong cuộc thấy, ở cả hai chiều; luồng cả nhà của họ cũng không lẫn tin riêng.
    assert.deepEqual((await s.api.list(a2, a1)).body.map((m: any) => m.id), [dm.body.id]);
    assert.deepEqual((await s.api.list(a1, a2)).body.map((m: any) => m.id), [dm.body.id]);
    assert.deepEqual((await s.api.list(a1)).body.map((m: any) => m.id), [fam.body.id]);
    assert.deepEqual((await s.api.list(a2)).body.map((m: any) => m.id), [fam.body.id]);

    // Thông báo: tin riêng chỉ báo người nhận, tin cả nhà vẫn báo cả nhà như cũ.
    assert.deepEqual(s.notes.filter((n) => n.fid === A), [
      { kind: 'to', fid: A, from: a1, to: a2, text: 'chuyện riêng của hai mẹ con' },
      { kind: 'family', fid: A, from: a1, text: 'cả nhà ơi' },
    ]);

    // Danh sách luồng và số chưa đọc của a3 không lộ tin riêng.
    const t3 = await s.api.threads(a3);
    assert.deepEqual(t3.people, {});
    assert.equal(t3.family.last.id, fam.body.id);
    assert.deepEqual(await s.api.unread(a3), { n: 1, family: 1, people: {} });
  } finally {
    await s.stop();
  }
});

test('không nhắn riêng sang nhà khác, cho chính mình hay người không có: 404, không ghi, không phát, không báo', async () => {
  const s = await start();
  try {
    const l1 = await s.listen(a1);
    const lb = await s.listen(b1);
    for (const peer of [b1, a1, 'khong-co-ai']) {
      const r = await s.api.send(a1, 'xin chào', peer);
      assert.equal(r.status, 404, peer);
      assert.equal(r.body.code, 'member_not_found');
      assert.equal((await s.api.list(a1, peer)).status, 404);
      assert.equal(await s.api.read(a1, peer), 404);
    }
    // Người nhà B cũng không mở được luồng riêng với người nhà A.
    assert.equal((await s.api.list(b1, a1)).status, 404);
    assert.equal((await s.api.send(b1, 'hi', a1)).status, 404);
    assert.equal(s.db.messages.length, 0);
    assert.equal(s.notes.length, 0);
    // Kênh của hai bên không nhận gì: tin đầu tiên là tin cả nhà gửi sau.
    const ok = await s.api.send(a1, 'tin cả nhà');
    assert.equal((await l1.next()).id, ok.body.id);
    await s.api.send(b1, 'tin nhà B');
    assert.equal((await lb.next()).text, 'tin nhà B');
  } finally {
    await s.stop();
  }
});

test('luồng cả nhà như cũ: tin cũ (to_id null) vẫn ở đây, hỏi bù theo after, ai cũng nhận, mốc đọc ở message_reads', async () => {
  const s = await start();
  try {
    s.db.add({ id: 'old-1', author_id: a2, text: 'tin cũ trước khi có tin riêng' });
    s.db.add({ id: 'old-2', author_id: a3 });
    const ls = await Promise.all([s.listen(a1), s.listen(a2), s.listen(a3)]);
    const all = await s.api.list(a1);
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.map((m: any) => m.id), ['old-1', 'old-2']);
    assert.equal(all.body[0].author_lang, 'ko', 'vẫn kèm thứ tiếng của người viết cho nút dịch');
    assert.equal(all.body[0].to_id, null);

    const sent = await s.api.send(a1, 'mọi người ăn cơm chưa');
    for (const l of ls) assert.equal((await l.next()).id, sent.body.id, 'cả nhà, kể cả người gửi, đều nhận');
    assert.deepEqual((await s.api.list(a3, undefined, all.body[1].created_at)).body.map((m: any) => m.id), [sent.body.id]);
    assert.deepEqual(s.notes, [{ kind: 'family', fid: A, from: a1, text: 'mọi người ăn cơm chưa' }]);
    // Gửi vào luồng cả nhà thì mốc đọc cả nhà của người gửi đặt lại, như trước.
    assert.ok(s.db.reads.has(a1));
    assert.equal((await s.api.unread(a1)).family, 0);
    assert.equal((await s.api.unread(a2)).family, 2);
    assert.equal(await s.api.read(a2), 200);
    assert.equal((await s.api.unread(a2)).family, 0);
    // Câu lệnh luồng cả nhà lọc tin riêng ra.
    for (const k of ['familyRecent', 'familyAfter', 'unreadFamily', 'lastFamily'] as const) assert.match(C.SQL[k], /to_id is null/, k);
  } finally {
    await s.stop();
  }
});

test('số chưa đọc theo từng luồng: đọc luồng này không xoá số của luồng khác, trả lời là đã đọc', async () => {
  const s = await start();
  try {
    await s.api.send(a1, 'con ơi', a2);
    await s.api.send(a1, 'con ăn cơm chưa', a2);
    await s.api.send(a3, 'anh ơi', a2);
    await s.api.send(a1, 'cả nhà ơi');
    assert.deepEqual(await s.api.unread(a2), { n: 4, family: 1, people: { [a1]: 2, [a3]: 1 } });
    // Người gửi không tính tin của chính mình.
    assert.deepEqual(await s.api.unread(a1), { n: 0, family: 0, people: {} });
    assert.deepEqual(await s.api.unread(a3), { n: 1, family: 1, people: {} });

    const t = await s.api.threads(a2);
    assert.equal(t.family.unread, 1);
    assert.equal(t.family.last.text, 'cả nhà ơi');
    assert.equal(t.people[a1].unread, 2);
    assert.equal(t.people[a1].last.text, 'con ăn cơm chưa');
    assert.equal(t.people[a3].last.text, 'anh ơi');
    // Người gửi thấy luồng riêng của mình với người nhận, không có số chưa đọc.
    const t1 = await s.api.threads(a1);
    assert.deepEqual(Object.keys(t1.people), [a2]);
    assert.equal(t1.people[a2].unread, 0);

    // a2 mở luồng với a1: chỉ luồng đó hết chưa đọc.
    assert.equal(await s.api.read(a2, a1), 200);
    assert.deepEqual(await s.api.unread(a2), { n: 2, family: 1, people: { [a3]: 1 } });
    // a3 mở luồng với a1 không đụng tới tin a1 gửi a2.
    assert.equal(await s.api.read(a3, a1), 200);
    // a2 trả lời a3: luồng với a3 coi như đã đọc; luồng cả nhà vẫn còn.
    await s.api.send(a2, 'dạ em đây', a3);
    assert.deepEqual(await s.api.unread(a2), { n: 1, family: 1, people: {} });
    assert.deepEqual(await s.api.unread(a3), { n: 2, family: 1, people: { [a2]: 1 } });
    assert.equal(await s.api.read(a2), 200);
    assert.deepEqual(await s.api.unread(a2), { n: 0, family: 0, people: {} });
  } finally {
    await s.stop();
  }
});

test('câu lệnh tin riêng luôn lọc theo nhà và đúng cặp hai người, cả hai chiều', () => {
  const pair = /\(\(author_id = \$2 and to_id = \$3\) or \(author_id = \$3 and to_id = \$2\)\)/;
  for (const k of ['dmRecent', 'dmAfter'] as const) {
    assert.match(C.SQL[k], /where family_id = \$1 and /, k);
    assert.match(C.SQL[k], pair, k);
  }
  assert.match(C.SQL.lastDm, /family_id = \$1 and to_id is not null and \(author_id = \$2 or to_id = \$2\)/);
  assert.match(C.SQL.unreadDm, /family_id = \$1 and to_id = \$2 and read_at is null/);
  assert.match(C.SQL.readDm, /family_id = \$1 and to_id = \$2 and author_id = \$3/);
  assert.match(C.SQL.peer, /id = \$1 and family_id = \$2/);
  // Ai nhận tin qua kênh tức thời.
  assert.deepEqual(C.audience({ author_id: a1, to_id: a2 }), [a1, a2]);
  assert.equal(C.audience({ author_id: a1, to_id: null }), undefined);
});
// i18n-ok-end
