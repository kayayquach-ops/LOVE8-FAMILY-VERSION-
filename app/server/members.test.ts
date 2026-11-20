// Kiểm thử xoá một người khỏi nhà (server/members.ts). Không cần Postgres: bảng và khoá ngoại đọc thẳng từ các câu
// create table / add column trong server/*.ts, rồi dựng một DB giả trong bộ nhớ chạy đúng các câu SQL members.ts gửi
// (có giao dịch, kiểm khoá ngoại như Postgres, cascade). Cách làm theo server/shot.test.ts (DB giả, không gọi gì thật).
// Chạy: node --import tsx --test server/members.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(path.join(tmpdir(), 'members-test-'));
const MEDIA = path.join(root, 'media');
mkdirSync(MEDIA, { recursive: true });
process.env.MEDIA_DIR = MEDIA;

const M = await import('./members.ts');
const { langMiddleware } = await import('./i18n.ts');
const express = (await import('express')).default;

const here = path.dirname(fileURLToPath(import.meta.url));
const vi = JSON.parse(readFileSync(path.join(here, 'i18n/vi.json'), 'utf8'));
const en = JSON.parse(readFileSync(path.join(here, 'i18n/en.json'), 'utf8'));

// ---------- Đọc lược đồ từ mã ----------

type Col = { def: string; ref?: { table: string; col: string; cascade: boolean } };
function parseSchema() {
  const tables = new Map<string, Map<string, Col>>();
  const add = (table: string, name: string, def: string) => {
    let t = tables.get(table);
    if (!t) tables.set(table, (t = new Map()));
    const m = /references\s+(\w+)\s*\(\s*(\w+)\s*\)([^,]*)/i.exec(def);
    t.set(name, { def, ref: m ? { table: m[1], col: m[2], cascade: /on delete cascade/i.test(m[3]) } : undefined });
  };
  for (const f of readdirSync(here).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
    const src = readFileSync(path.join(here, f), 'utf8');
    for (const m of src.matchAll(/create table (?:if not exists\s+)?(\w+)\s*\(/gi)) {
      if (!tables.has(m[1])) tables.set(m[1], new Map());
      const parts: string[] = [];
      let part = '', depth = 1;
      for (let i = m.index! + m[0].length; i < src.length; i++) {
        const ch = src[i];
        if (ch === '(') depth++;
        if (ch === ')' && --depth === 0) break;
        if (ch === ',' && depth === 1) { parts.push(part); part = ''; } else part += ch;
      }
      parts.push(part);
      for (const p of parts.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
        if (/^(primary|unique|foreign|constraint|check)\b/i.test(p)) continue;
        add(m[1], p.split(' ')[0], p);
      }
    }
    for (const m of src.matchAll(/alter table\s+(\w+)\s+add column\s+(?:if not exists\s+)?(\w+)([^;\n`]*)/gi)) add(m[1], m[2], `${m[2]}${m[3]}`);
  }
  return tables;
}
const schema = parseSchema();
const fks = [...schema].flatMap(([table, cols]) => [...cols].filter(([, c]) => c.ref).map(([col, c]) => ({ table, col, parent: c.ref!.table, pcol: c.ref!.col, cascade: c.ref!.cascade })));

/** Cột trỏ tới một thành viên: khoá ngoại tới members, hoặc tên kiểu member_id, author_id, by_id, from_id, to_id, created_by, user_id... */
const MEMBER_NAME = /^(member_id|author_id|by_id|from_id|to_id|created_by|user_id|owner_id|sender_id|receiver_id|recipient_id)$|member|_by$/;
const memberRef = (table: string, col: string, c: Col) => table !== 'members' && (c.ref?.table === 'members' || MEMBER_NAME.test(col));
/** Cột trỏ tới hàng sẽ bị xoá theo người (bài, cuộc gọi, lượt chụp, tin nhắn): tập mã tương ứng trong PLAN. */
const PARENT_SET: Record<string, string> = { posts: 'posts', calls: 'calls', shots: 'shots', messages: 'messages' };
const CHILD_NAME: Record<string, string> = { post_id: 'posts', call_id: 'calls', delivered_call_id: 'calls', shot_id: 'shots', reply_to: 'messages' };
/** Cố ý giữ, có lý do. */
const KEPT: Record<string, string> = {
  'shot_runs.shot_id': 'sổ đếm hạn mức ghép ảnh trong ngày (không có cột người): xoá người không được trả lại lượt',
};

const covered = (set: (s: string) => boolean) => new Set(M.PLAN.flatMap((s) => s.any.filter((c) => set(c.in)).map((c) => `${s.table}.${c.col}`)));

test('lược đồ: đọc được đủ các bảng đã biết (để kiểm thử dưới không đỗ vì đọc thiếu)', () => {
  for (const t of ['families', 'members', 'posts', 'reactions', 'replies', 'missions_done', 'google_auth', 'seen', 'events', 'calls', 'call_answers',
    'vault', 'relays', 'messages', 'message_reads', 'member_seed', 'owned_seeds', 'letters', 'podcasts', 'podcast_plans', 'podcast_words',
    'push_subs', 'push_prefs', 'push_sent', 'recaps', 'shots', 'shot_parts', 'shot_runs', 'app_settings']) assert.ok(schema.has(t), t);
  assert.ok(schema.get('posts')!.has('shot_id'), 'cột thêm bằng alter table');
  assert.ok(schema.get('events')!.has('created_by'));
  assert.deepEqual(schema.get('relays')!.get('to_id')!.ref, { table: 'members', col: 'id', cascade: true });
  assert.deepEqual(schema.get('replies')!.get('author_id')!.ref, { table: 'members', col: 'id', cascade: false });
});

test('kế hoạch xoá phủ mọi cột trỏ tới thành viên trong server/*.ts', () => {
  const have = covered((s) => s === 'member');
  const found: string[] = [];
  const missing: string[] = [];
  for (const [table, cols] of schema) for (const [col, c] of cols) {
    if (!memberRef(table, col, c)) continue;
    found.push(`${table}.${col}`);
    if (!have.has(`${table}.${col}`)) missing.push(`${table}.${col}`);
  }
  assert.deepEqual(missing, [], `cột trỏ tới thành viên chưa có trong PLAN của server/members.ts: ${missing.join(', ')}`);
  for (const k of ['posts.author_id', 'reactions.member_id', 'shots.by_id', 'shot_parts.member_id', 'relays.from_id', 'relays.to_id',
    'letters.from_id', 'letters.to_id', 'events.created_by', 'events.member_id', 'podcasts.member_id', 'google_auth.member_id', 'owned_seeds.member_id']) {
    assert.ok(found.includes(k), `bộ dò cột bỏ sót ${k}`);
  }
  // Chính hàng members là bước cuối.
  const last = M.PLAN.at(-1)!;
  assert.equal(last.table, 'members');
  assert.equal(last.op, 'delete');
  assert.deepEqual(last.any, [{ col: 'id', in: 'member' }]);
});

test('kế hoạch xoá phủ mọi cột trỏ tới bài, cuộc gọi, lượt chụp, tin nhắn của người bị xoá', () => {
  const missing: string[] = [];
  for (const [table, cols] of schema) for (const [col, c] of cols) {
    const parent = c.ref && PARENT_SET[c.ref.table] ? c.ref.table : CHILD_NAME[col];
    if (!parent || parent === table && col === 'id') continue;
    const k = `${table}.${col}`;
    if (k in KEPT) continue;
    if (!covered((s) => s === PARENT_SET[parent]).has(k)) missing.push(k);
  }
  assert.deepEqual(missing, [], `cột còn trỏ tới hàng sắp xoá: ${missing.join(', ')}`);
});

test('mọi bảng, cột trong PLAN có thật trong lược đồ', () => {
  for (const s of M.PLAN) {
    const cols = schema.get(s.table);
    assert.ok(cols, `bảng ${s.table}`);
    for (const c of s.any) assert.ok(cols.has(c.col), `${s.table}.${c.col}`);
    if (s.set) assert.ok(cols.has(s.set), `${s.table}.${s.set}`);
    if (s.family) assert.ok(cols.has('family_id'), `${s.table}.family_id`);
    assert.ok(s.why.length > 5);
  }
  for (const p of M.PICKS) for (const c of [p.col, ...p.any.map((x) => x.col)]) assert.ok(schema.get(p.table)?.has(c), `${p.table}.${c}`);
});

// ---------- DB giả ----------

type Row = Record<string, any>;
const likeRe = (p: string) => {
  let s = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '\\') s += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '%') s += '[^]*';
    else if (ch === '_') s += '[^]';
    else s += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${s}$`);
};

class FakeDb {
  t: Record<string, Row[]> = Object.fromEntries([...schema.keys()].map((k) => [k, []]));
  log: string[] = [];
  cascaded: string[] = [];
  failOn: string | null = null;
  connects = 0;
  released = 0;
  private snap: string | null = null;

  add(table: string, row: Row) {
    const cols = schema.get(table);
    assert.ok(cols, `bảng ${table}`);
    for (const k of Object.keys(row)) assert.ok(cols.has(k), `cột ${table}.${k}`);
    this.t[table].push(row);
  }
  dump() { return JSON.parse(JSON.stringify(this.t)) as Record<string, Row[]>; }
  connect = async () => { this.connects++; return { query: (s: string, a?: any[]) => this.query(s, a), release: () => { this.released++; } }; };

  /** Mọi khoá ngoại đều đúng (không còn hàng trỏ tới hàng đã mất). */
  check() {
    for (const f of fks) {
      const keys = new Set(this.t[f.parent].map((r) => r[f.pcol]));
      for (const r of this.t[f.table]) if (r[f.col] != null) assert.ok(keys.has(r[f.col]), `${f.table}.${f.col} = ${r[f.col]} trỏ tới ${f.parent} không còn`);
    }
  }

  private cols(table: string) {
    const c = schema.get(table);
    if (!c) throw new Error(`relation "${table}" does not exist`);
    return c;
  }
  private pred(table: string, cond: string, args: any[], fam?: string) {
    const cols = this.cols(table);
    const parts = cond.split(' or ').map((p) => {
      const m = /^"(\w+)" (=|like) any\(\$(\d+)::text\[\]\)$/.exec(p);
      if (!m) throw new Error(`điều kiện lạ: ${p}`);
      if (!cols.has(m[1])) throw new Error(`column "${m[1]}" does not exist (${table})`);
      const vals: string[] = args[Number(m[3]) - 1];
      assert.ok(Array.isArray(vals), `tham số $${m[3]} phải là mảng`);
      return m[2] === '=' ? (r: Row) => r[m[1]] != null && vals.includes(r[m[1]]) : (r: Row) => r[m[1]] != null && vals.some((v) => likeRe(v).test(String(r[m[1]])));
    });
    const famId = fam ? args[Number(fam) - 1] : null;
    return (r: Row) => parts.some((p) => p(r)) && (!fam || r.family_id === famId);
  }
  private remove(table: string, pred: (r: Row) => boolean, viaCascade = false): Row[] {
    const gone = this.t[table].filter(pred);
    if (!gone.length) return gone;
    if (viaCascade) this.cascaded.push(`${table}: ${gone.length}`);
    this.t[table] = this.t[table].filter((r) => !pred(r));
    const mine = fks.filter((f) => f.parent === table);
    for (const f of mine.filter((x) => x.cascade)) {
      const keys = new Set(gone.map((r) => r[f.pcol]));
      this.remove(f.table, (r) => keys.has(r[f.col]), true);
    }
    for (const f of mine.filter((x) => !x.cascade)) {
      const keys = new Set(gone.map((r) => r[f.pcol]));
      if (this.t[f.table].some((r) => keys.has(r[f.col]))) {
        throw new Error(`update or delete on table "${table}" violates foreign key constraint on "${f.table}.${f.col}"`);
      }
    }
    return gone;
  }

  async query(sql: string, args: any[] = []): Promise<{ rows: Row[]; rowCount: number }> {
    this.log.push(sql);
    const res = (rows: Row[], n = rows.length) => ({ rows, rowCount: n });
    if (sql === 'begin') { this.snap = JSON.stringify(this.t); return res([]); }
    if (sql === 'commit') { this.snap = null; return res([]); }
    if (sql === 'rollback') { if (this.snap) this.t = JSON.parse(this.snap); this.snap = null; return res([]); }
    if (sql === M.LOCK_SQL) {
      return res(this.t.members.filter((r) => args[0].includes(r.id) && r.family_id === args[1]).map((r) => ({ id: r.id })).sort((a, b) => (a.id < b.id ? -1 : 1)));
    }
    let m = /^select "(\w+)" from "(\w+)" where \((.*)\)$/.exec(sql);
    if (m) {
      const [, col, table, cond] = m;
      if (!this.cols(table).has(col)) throw new Error(`column "${col}" does not exist`);
      return res(this.t[table].filter(this.pred(table, cond, args)).map((r) => ({ [col]: r[col] ?? null })));
    }
    m = /^delete from "(\w+)" where \((.*)\)(?: and "family_id" = \$(\d+))? returning \*$/.exec(sql);
    if (m) {
      if (this.failOn === m[1]) throw new Error(`lỗi giả ở ${m[1]}`);
      return res(this.remove(m[1], this.pred(m[1], m[2], args, m[3])));
    }
    m = /^update "(\w+)" set "(\w+)" = null where \((.*)\)(?: and "family_id" = \$(\d+))?$/.exec(sql);
    if (m) {
      if (!this.cols(m[1]).has(m[2])) throw new Error(`column "${m[2]}" does not exist`);
      const p = this.pred(m[1], m[3], args, m[4]);
      let n = 0;
      for (const r of this.t[m[1]]) if (p(r)) { r[m[2]] = null; n++; }
      return res([], n);
    }
    if (/^select table_name from information_schema\.tables where table_schema = current_schema\(\) and table_type = 'BASE TABLE'$/.test(sql)) {
      return res(Object.keys(this.t).map((table_name) => ({ table_name })));
    }
    m = /^select distinct u\.needle from "(\w+)" as whole, unnest\(\$1::text\[\]\) as u\(needle\) where strpos\(row_to_json\(whole\.\*\)::text, u\.needle\) > 0$/.exec(sql);
    if (m) {
      const texts = this.cols(m[1]) && this.t[m[1]].map((r) => JSON.stringify(r));
      return res((args[0] as string[]).filter((n) => texts.some((s) => s.includes(n))).map((needle) => ({ needle })));
    }
    throw new Error(`DB giả chưa biết câu này: ${sql}`);
  }
}

// ---------- Dữ liệu mẫu: nhà A (a1 tạo nhà, x sắp bị xoá, a3), nhà B (b1, b2) ----------

const A = 'fam-a', B = 'fam-b';
const a1 = 'mem-a1', x = 'mem-x', a3 = 'mem-a3', b1 = 'mem-b1', b2 = 'mem-b2';

/** Tệp media có thật trên đĩa (tên tương đối trong MEDIA), kèm ảnh thu nhỏ của vài tệp. */
const FILES = [
  'x-avatar.jpg', 'a3-avatar.jpg', 'xp1.jpg', 'xp2.jpg', 'xv.m4a', 'a1p.jpg', 'a1r.m4a', 'b1p.jpg',
  'sx-result.jpg', 'sx-x.jpg', 'sx-a1.jpg', 's3-result.jpg', 's3-x.jpg', 's3-a3.jpg', 'sb-b1.jpg',
  'ans-x1.webm', 'ans-3.webm', 'v-x.jpg', 'v-a1.jpg', 'v-x2.jpg', 'v-x3.jpg', 'v-3.jpg',
  'podcasts/pod-first.m4a', 'pod-first-1.jpg', 'podcasts/pod-story.m4a', 'podcasts/pod-story.mp4', 'podcasts/pod-call.m4a', 'podcasts/pod-topic.m4a',
  'm-x.jpg', 'l-x.jpg', 'l-a1.jpg', 'e-x.jpg', 'recaps/r-a.mp4', 'recaps/r-a.jpg',
  'w160/xp1.jpg', 'w360/xp1.jpg', 'w1080/xp1.jpg', 'w360/pod-first-1.jpg', 'w360/sx-result.jpg', 'w360/xp2.jpg',
];
const OUTSIDE = path.join(root, 'secret.jpg');
function makeFiles() {
  for (const f of FILES) { mkdirSync(path.dirname(path.join(MEDIA, f)), { recursive: true }); writeFileSync(path.join(MEDIA, f), f); }
  writeFileSync(OUTSIDE, 'không được xoá');
}
const has = (f: string) => existsSync(path.join(MEDIA, f));

function seed() {
  const db = new FakeDb();
  db.add('families', { id: A, name: 'Nhà A', code: '1111111' });
  db.add('families', { id: B, name: 'Nhà B', code: '2222222' });
  const mem = (id: string, fam: string, avatar: string | null = null) => db.add('members', { id, family_id: fam, name: id, role: 'con', token: `tok-${id}`, avatar });
  mem(a1, A); mem(x, A, '/media/x-avatar.jpg'); mem(a3, A, '/media/a3-avatar.jpg'); mem(b1, B); mem(b2, B);

  const post = (id: string, fam: string, author: string, kind: string, media: string | null, shot_id: string | null = null) =>
    db.add('posts', { id, family_id: fam, author_id: author, kind, media, shot_id });
  post('p-x1', A, x, 'photo', '/media/xp1.jpg');
  post('p-x2', A, x, 'photo', '/media/xp2.jpg');
  post('p-xv', A, x, 'voice', '/media/xv.m4a');
  post('p-xs3', A, x, 'photo', '/media/s3-result.jpg', 's-3'); // x đăng ảnh ghép của lượt a3 tạo
  post('p-a1', A, a1, 'photo', '/media/a1p.jpg');
  post('p-a1sx', A, a1, 'photo', '/media/sx-result.jpg', 's-x'); // a1 đăng ảnh ghép của lượt x tạo
  post('p-b1', B, b1, 'photo', '/media/b1p.jpg');

  db.add('reactions', { post_id: 'p-x1', member_id: a1, emoji: 'h' });
  db.add('reactions', { post_id: 'p-a1', member_id: x, emoji: 'h' });
  db.add('reactions', { post_id: 'p-a1', member_id: a3, emoji: 'h' });
  db.add('reactions', { post_id: 'p-b1', member_id: b2, emoji: 'h' });
  db.add('replies', { id: 'r-1', post_id: 'p-x1', author_id: a1, kind: 'voice', media: '/media/a1r.m4a' });
  db.add('replies', { id: 'r-2', post_id: 'p-a1', author_id: x, kind: 'text', text: 'hi' });
  db.add('replies', { id: 'r-3', post_id: 'p-a1', author_id: a3, kind: 'text', text: 'hi' });
  db.add('replies', { id: 'r-4', post_id: 'p-b1', author_id: b2, kind: 'text', text: 'hi' });

  db.add('shots', { id: 's-x', family_id: A, by_id: x, occasion: 'tet', status: 'done', result: '/media/sx-result.jpg', post_id: 'p-a1sx' });
  db.add('shots', { id: 's-3', family_id: A, by_id: a3, occasion: 'tet', status: 'done', result: '/media/s3-result.jpg', post_id: 'p-xs3' });
  db.add('shots', { id: 's-b', family_id: B, by_id: b1, occasion: 'tet', status: 'waiting' });
  db.add('shot_parts', { shot_id: 's-x', member_id: x, media: '/media/sx-x.jpg' });
  db.add('shot_parts', { shot_id: 's-x', member_id: a1, media: '/media/sx-a1.jpg' });
  db.add('shot_parts', { shot_id: 's-3', member_id: a3, media: '/media/s3-a3.jpg' });
  db.add('shot_parts', { shot_id: 's-3', member_id: x, media: '/media/s3-x.jpg' });
  db.add('shot_parts', { shot_id: 's-3', member_id: a1, media: null });
  db.add('shot_parts', { shot_id: 's-b', member_id: b1, media: '/media/sb-b1.jpg' });
  db.add('shot_runs', { shot_id: 's-x', family_id: A, kst_day: '2026-11-17' });

  db.add('calls', { id: 'c-x', family_id: A, member_id: x, week: '2026-11-16', status: 'done', script: '{}' });
  db.add('calls', { id: 'c-3', family_id: A, member_id: a3, week: '2026-11-16', status: 'done', script: '{}' });
  db.add('calls', { id: 'c-b', family_id: B, member_id: b1, week: '2026-11-16', status: 'done', script: '{}' });
  const ans = (id: string, call: string, fam: string, member: string, media: string) =>
    db.add('call_answers', { id, call_id: call, family_id: fam, member_id: member, idx: 0, turn: 0, question: 'q', topic: 'gia-dinh', media });
  ans('ans-x1', 'c-x', A, x, '/media/ans-x1.webm');
  ans('ans-3', 'c-3', A, a3, '/media/ans-3.webm');
  ans('ans-b', 'c-b', B, b1, '/media/ans-b.webm');
  db.add('vault', { id: 'v-x', family_id: A, member_id: x, media: '/media/v-x.jpg', call_id: 'c-x', story: 0 });
  db.add('vault', { id: 'v-a1', family_id: A, member_id: a1, media: '/media/v-a1.jpg', call_id: 'c-x', story: 0 }); // a1 thêm ảnh vào chuyện của x
  db.add('vault', { id: 'v-x2', family_id: A, member_id: x, media: '/media/v-x2.jpg', call_id: null });
  db.add('vault', { id: 'v-x3', family_id: A, member_id: x, media: '/media/v-x3.jpg', call_id: 'c-3', story: 0 }); // x thêm ảnh vào chuyện của a3
  db.add('vault', { id: 'v-3', family_id: A, member_id: a3, media: '/media/v-3.jpg', call_id: 'c-3', story: 0 });
  db.add('relays', { id: 'rl-1', family_id: A, call_id: 'c-x', from_id: x, to_id: a1, media: '/media/ans-x1.webm' });
  db.add('relays', { id: 'rl-2', family_id: A, call_id: 'c-3', from_id: a3, to_id: x, media: '/media/ans-3.webm', delivered_call_id: 'c-x' });
  db.add('relays', { id: 'rl-3', family_id: A, call_id: 'c-3', from_id: a3, to_id: a1, media: '/media/ans-3.webm' });
  db.add('podcast_plans', { call_id: 'c-x', sig: 's', plan: '{}' });
  db.add('podcast_plans', { call_id: 'c-3', sig: 's', plan: '{}' });
  const pod = (id: string, fam: string, key: string, kind: string, member: string | null, extra: Row = {}) =>
    db.add('podcasts', { id, family_id: fam, key, kind, member_id: member, topic: 'gia-dinh', title: id, status: 'ready', ...extra });
  pod('pod-first', A, `first:${x}`, 'person', x, { media: '/media/podcasts/pod-first.m4a?v=1', poster: '/media/pod-first-1.jpg', cover: '/media/xp1.jpg' });
  pod('pod-story', A, 'story:c-x:0', 'person', x, { media: '/media/podcasts/pod-story.m4a?v=2', video: '/media/podcasts/pod-story.mp4?v=2', cover: '/media/v-a1.jpg' });
  pod('pod-call', A, 'call:c-x', 'person', null, { media: '/media/podcasts/pod-call.m4a' }); // hàng cũ thiếu member_id: xoá theo khoá
  pod('pod-xy', A, 'story:c-xy:0', 'person', a3); // khoá gần giống, không được dính
  pod('pod-a3', A, 'story:c-3:0', 'person', a3, { cover: '/media/v-x3.jpg' });
  pod('pod-topic', A, 'topic:gia-dinh', 'topic', null, { media: '/media/podcasts/pod-topic.m4a', chapters: JSON.stringify([{ who: x }, { who: a3 }]) });
  pod('pod-b', B, `first:${b1}`, 'person', b1);
  for (const key of ['ans:ans-x1', 'post:xv.m4a', 'ans:ans-3', 'post:a1p.jpg']) db.add('podcast_words', { key, ver: '1', dur: 1, words: '[]' });

  db.add('messages', { id: 'm-x', family_id: A, author_id: x, kind: 'photo', media: '/media/m-x.jpg' });
  db.add('messages', { id: 'm-a1', family_id: A, author_id: a1, kind: 'text', text: 'ok', reply_to: 'm-x' });
  db.add('messages', { id: 'm-a3', family_id: A, author_id: a3, kind: 'text', text: 'ok', reply_to: 'm-a1' });
  db.add('messages', { id: 'm-b', family_id: B, author_id: b1, kind: 'text', text: 'ok' });
  for (const id of [x, a1, b1]) db.add('message_reads', { member_id: id });
  const photo = (media: string) => [{ type: 'photo', media, shape: 'polaroid', x: 10, y: 10 }];
  db.add('letters', { id: 'l-1', family_id: A, from_id: x, to_id: a1, body: 'b', items: photo('/media/l-x.jpg') });
  db.add('letters', { id: 'l-2', family_id: A, from_id: a1, to_id: x, body: 'b', items: photo('/media/l-a1.jpg') });
  db.add('letters', { id: 'l-3', family_id: A, from_id: a1, to_id: a3, body: 'b', items: photo('/media/xp2.jpg') }); // thư khác dùng ảnh bài của x

  const ev = (id: string, fam: string, by: string, member: string | null, extra: Row = {}) =>
    db.add('events', { id, family_id: fam, member_id: member, kind: 'birthday', title: id, day: 1, month: 1, created_by: by, ...extra });
  ev('e-x', A, x, null, { photo: '/media/e-x.jpg' });
  ev('e-call', A, x, x); // ngày rút từ cuộc gọi của x
  ev('e-forx', A, a1, x); // a1 thêm ngày của x
  ev('e-a3', A, a1, a3);
  ev('e-b', B, b1, b1);

  db.add('missions_done', { family_id: A, member_id: x, mission: 'call', week: '2026-11-16' });
  db.add('missions_done', { family_id: A, member_id: a1, mission: 'call', week: '2026-11-16' });
  for (const id of [x, a1]) db.add('seen', { member_id: id });
  db.add('push_subs', { endpoint: 'ep-x', member_id: x, family_id: A, p256dh: 'k', auth: 'a' });
  db.add('push_subs', { endpoint: 'ep-a1', member_id: a1, family_id: A, p256dh: 'k', auth: 'a' });
  db.add('push_prefs', { member_id: x, prefs: '{}' });
  for (const key of [`weekly:${x}:2026-11-16`, `weekly:${a1}:2026-11-16`, `weekly:${x}y:2026-11-16`, `cal:${A}:dob-${x}:2026-11-20:1`, `cal:${A}:dob-${a1}:2026-12-01:0`]) {
    db.add('push_sent', { key });
  }
  db.add('google_auth', { state: 'g-x', bind_hash: 'h', nonce: 'n', intent: 'link', member_id: x });
  db.add('google_auth', { state: 'g-a1', bind_hash: 'h', nonce: 'n', intent: 'link', member_id: a1 });
  db.add('member_seed', { member_id: x, seed: 'gold' });
  db.add('member_seed', { member_id: a1, seed: 'pearl' });
  db.add('owned_seeds', { member_id: x, seed: 'gold' });
  db.add('recaps', { family_id: A, week: '2026-11-09', status: 'ready', media: '/media/recaps/r-a.mp4', cover: '/media/recaps/r-a.jpg' });
  db.add('app_settings', { key: 'vapid', value: '{}' });
  db.check();
  return db;
}
const rowsOf = (db: FakeDb, fam: string) => Object.fromEntries(Object.entries(db.t).map(([k, rows]) => [k, rows.filter((r) => r.family_id === fam)]));

// ---------- Xoá trong DB ----------

test('xoá x: hết mọi hàng của x, khoá ngoại vẫn đúng, không nhờ cascade, nhà B không đổi', async () => {
  const db = seed();
  const famB = JSON.stringify(rowsOf(db, B));
  const out = await M.removeMember(db.connect, A, a1, x);
  assert.equal(out.status, 'ok');
  db.check();
  assert.deepEqual(db.cascaded, [], 'không hàng nào bị xoá theo cascade (sẽ sót tệp media)');
  assert.equal(db.connects, db.released);
  assert.ok(db.log.includes('commit'));
  // Không còn cột nào trỏ tới x, kể cả cột không có khoá ngoại.
  for (const [table, cols] of schema) for (const [col, c] of cols) {
    if (memberRef(table, col, c) || (table === 'members' && col === 'id')) assert.ok(!db.t[table].some((r) => r[col] === x), `${table}.${col} còn trỏ tới x`);
  }
  assert.equal(JSON.stringify(rowsOf(db, B)), famB);
  const ids = (table: string, key = 'id') => db.t[table].map((r) => r[key]).sort();
  assert.deepEqual(ids('members'), [a1, a3, b1, b2].sort());
  assert.deepEqual(ids('posts'), ['p-a1', 'p-a1sx', 'p-b1']);
  assert.deepEqual(db.t.reactions.map((r) => `${r.post_id}/${r.member_id}`).sort(), ['p-a1/mem-a3', 'p-b1/mem-b2']);
  assert.deepEqual(ids('replies'), ['r-3', 'r-4']);
  assert.deepEqual(ids('calls'), ['c-3', 'c-b']);
  assert.deepEqual(ids('call_answers'), ['ans-3', 'ans-b']);
  assert.deepEqual(ids('vault'), ['v-3']);
  assert.deepEqual(ids('relays'), ['rl-3']);
  assert.deepEqual(ids('podcast_plans', 'call_id'), ['c-3']);
  assert.deepEqual(ids('podcast_words', 'key'), ['ans:ans-3', 'post:a1p.jpg']);
  assert.deepEqual(ids('messages'), ['m-a1', 'm-a3', 'm-b']);
  assert.deepEqual(ids('message_reads', 'member_id'), [a1, b1].sort());
  assert.deepEqual(ids('letters'), ['l-3']);
  assert.deepEqual(ids('missions_done', 'member_id'), [a1]);
  assert.deepEqual(ids('push_subs', 'endpoint'), ['ep-a1']);
  assert.deepEqual(ids('push_prefs', 'member_id'), []);
  assert.deepEqual(ids('push_sent', 'key'), [`cal:${A}:dob-${a1}:2026-12-01:0`, `weekly:${a1}:2026-11-16`, `weekly:${x}y:2026-11-16`]);
  assert.deepEqual(ids('google_auth', 'state'), ['g-a1']);
  assert.deepEqual(ids('member_seed', 'member_id'), [a1]);
  assert.deepEqual(ids('owned_seeds', 'member_id'), []);
  assert.equal(db.t.families.length, 2, 'nhà vẫn còn');
  assert.equal(db.t.recaps.length, 1, 'video tuần giữ');
  assert.equal(db.t.app_settings.length, 1);
});

test('đồ chung: chụp chung, podcast, lịch, tin trả lời', async () => {
  const db = seed();
  await M.removeMember(db.connect, A, a1, x);
  const one = (table: string, id: string) => db.t[table].find((r) => r.id === id) as Row;
  // Lượt a3 tạo mà x chỉ tham gia: giữ lượt, bỏ phần của x; bài x đăng từ lượt đó mất nên post_id về null.
  assert.ok(one('shots', 's-3'));
  assert.equal(one('shots', 's-3').post_id, null);
  assert.deepEqual(db.t.shot_parts.filter((p) => p.shot_id === 's-3').map((p) => p.member_id).sort(), [a1, a3].sort());
  // Lượt x tạo: xoá cả phần ảnh; bài a1 đăng từ đó còn, thành ảnh thường.
  assert.equal(one('shots', 's-x'), undefined);
  assert.equal(db.t.shot_parts.filter((p) => p.shot_id === 's-x').length, 0);
  assert.equal(one('posts', 'p-a1sx').shot_id, null);
  assert.equal(one('posts', 'p-a1sx').media, '/media/sx-result.jpg');
  assert.equal(db.t.shot_runs.length, 1, 'sổ hạn mức giữ');
  // Podcast: album của x mất (kể cả hàng cũ thiếu member_id), tập chủ đề và tập của a3 giữ, khoá gần giống không dính.
  assert.deepEqual(db.t.podcasts.map((p) => p.id).sort(), ['pod-a3', 'pod-b', 'pod-topic', 'pod-xy']);
  // Lịch: ngày x thêm mất; ngày của x do a1 thêm thì giữ, thành ngày chung.
  assert.deepEqual(db.t.events.map((e) => e.id).sort(), ['e-a3', 'e-b', 'e-forx']);
  assert.equal(one('events', 'e-forx').member_id, null);
  assert.equal(one('events', 'e-a3').member_id, a3);
  // Tin a1 trả lời tin của x: giữ tin, bỏ trỏ; tin a3 trả lời tin a1 không đổi.
  assert.equal(one('messages', 'm-a1').reply_to, null);
  assert.equal(one('messages', 'm-a3').reply_to, 'm-a1');
});

test('lỗi giữa chừng thì không xoá gì (một giao dịch)', async () => {
  const db = seed();
  const before = db.dump();
  db.failOn = 'letters';
  await assert.rejects(M.removeMember(db.connect, A, a1, x), /lỗi giả ở letters/);
  assert.deepEqual(db.dump(), before);
  assert.ok(db.log.includes('rollback'));
  assert.ok(!db.log.includes('commit'));
  assert.equal(db.connects, db.released);
  assert.ok(db.log.some((s) => s.startsWith('delete from "posts"')), 'đã chạy tới giữa kế hoạch rồi mới lỗi');
});

test('quyền: tự xoá mình, người nhà khác, mã không có, người gọi đã bị xoá', async () => {
  const db = seed();
  const before = db.dump();
  assert.deepEqual(await M.removeMember(db.connect, A, x, x), { status: 'self' });
  assert.equal(db.connects, 0, 'tự xoá mình: không đụng DB');
  assert.deepEqual(await M.removeMember(db.connect, A, a1, b1), { status: 'not_found' });
  assert.deepEqual(await M.removeMember(db.connect, A, a1, 'không-có'), { status: 'not_found' });
  assert.deepEqual(await M.removeMember(db.connect, B, a1, b1), { status: 'gone' }, 'người gọi không còn trong nhà');
  assert.deepEqual(db.dump(), before);
  assert.equal(db.connects, db.released);
  // Ai trong nhà cũng xoá được người khác, kể cả người tạo nhà (a1).
  assert.equal((await M.removeMember(db.connect, A, a3, a1)).status, 'ok');
  assert.ok(!db.t.members.some((m) => m.id === a1));
  db.check();
});

// ---------- Tệp media ----------

test('đường dẫn media: mọi cột kể cả jsonb, bỏ ?v=, không lấy đường lạ', () => {
  assert.deepEqual(M.mediaPaths({ media: '/media/podcasts/a1.m4a?v=17', poster: '/media/pod-a-1.jpg', items: [{ media: '/media/l.jpg' }] }).sort(),
    ['l.jpg', 'pod-a-1.jpg', 'podcasts/a1.m4a']);
  assert.deepEqual(M.mediaPaths({ a: '/media/../secret.jpg', b: '/media/w/360/x.jpg', c: 'https://x/y.jpg', d: null }), []);
});

test('tệp media: xoá tệp của x và ảnh thu nhỏ, giữ tệp còn hàng khác dùng, không ra ngoài thư mục media', async () => {
  makeFiles();
  const db = seed();
  const out = await M.removeMember(db.connect, A, a1, x);
  assert.equal(out.status, 'ok');
  const files = out.status === 'ok' ? out.files : [];
  assert.ok(files.includes('sx-result.jpg') && files.includes('xp2.jpg') && files.includes('ans-3.webm'), 'các tệp này có trong hàng đã xoá');
  const gone = await M.sweepMedia(db, MEDIA, [...files, '../secret.jpg', 'podcasts/../../secret.jpg']);
  for (const f of ['x-avatar.jpg', 'xp1.jpg', 'xv.m4a', 'a1r.m4a', 'sx-x.jpg', 'sx-a1.jpg', 's3-x.jpg', 'ans-x1.webm', 'v-x.jpg', 'v-a1.jpg', 'v-x2.jpg',
    'podcasts/pod-first.m4a', 'pod-first-1.jpg', 'podcasts/pod-story.m4a', 'podcasts/pod-story.mp4', 'podcasts/pod-call.m4a', 'm-x.jpg', 'l-x.jpg', 'l-a1.jpg', 'e-x.jpg',
    'w160/xp1.jpg', 'w360/xp1.jpg', 'w1080/xp1.jpg', 'w360/pod-first-1.jpg']) assert.ok(!has(f), `phải xoá ${f}`);
  // Ảnh ghép lượt x tạo nhưng a1 đã đăng: bài a1 còn dùng. Ảnh ghép lượt a3: shots.result còn dùng. xp2: thư a1 gửi a3 còn dùng.
  // ans-3: câu trả lời của a3 còn dùng (lời nhắn a3 gửi x đã xoá). v-x3: hàng vault của x đã xoá nhưng tập podcast của a3 còn lấy làm bìa.
  for (const f of ['sx-result.jpg', 'w360/sx-result.jpg', 's3-result.jpg', 'xp2.jpg', 'w360/xp2.jpg', 'ans-3.webm', 'v-x3.jpg', 'a3-avatar.jpg', 'a1p.jpg', 's3-a3.jpg', 'v-3.jpg',
    'podcasts/pod-topic.m4a', 'recaps/r-a.mp4', 'recaps/r-a.jpg', 'b1p.jpg', 'sb-b1.jpg']) assert.ok(has(f), `phải giữ ${f}`);
  assert.ok(existsSync(OUTSIDE), 'không bao giờ xoá ngoài thư mục media');
  assert.ok(!gone.includes('sx-result.jpg') && !gone.includes('../secret.jpg'));
});

// ---------- Đường API ----------

test('DELETE /api/members/:id: 400 tự xoá, 404 nhà khác hay không có (giống hệt nhau), 200 cùng nhà, 401 khi người gọi đã bị xoá', async () => {
  const db = seed();
  const app = express();
  app.use(langMiddleware);
  // Thay cho auth ở index.ts: req.member lấy từ header của kiểm thử.
  app.use((req: any, _res, next) => { req.member = { id: String(req.headers['x-member']), family_id: String(req.headers['x-family']) }; next(); });
  app.use('/api', M.membersRouter({ connect: db.connect, db, mediaDir: MEDIA }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const del = async (id: string, member: string, family: string, lang = 'vi') => {
    const r = await fetch(`${base}/api/members/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-member': member, 'x-family': family, 'x-lang': lang } });
    return { status: r.status, body: await r.json() };
  };
  try {
    const before = db.dump();
    assert.deepEqual(await del(x, x, A), { status: 400, body: { code: 'member_self', error: vi['error.member_self'], message: vi['error.member_self'] } });
    const other = await del(b1, a1, A);
    assert.deepEqual(other, { status: 404, body: { code: 'member_not_found', error: vi['error.member_not_found'], message: vi['error.member_not_found'] } });
    assert.deepEqual(await del('khong-co-ai', a1, A), other, 'người nhà khác và mã không có trả lời y hệt nhau');
    assert.equal((await del(b1, a1, A, 'en')).body.message, en['error.member_not_found']);
    assert.deepEqual(db.dump(), before, 'chưa xoá gì');

    assert.deepEqual(await del(x, a1, A), { status: 200, body: { ok: true } });
    assert.ok(!db.t.members.some((m) => m.id === x));
    assert.equal((await del(x, a1, A)).status, 404, 'xoá lại thì không thấy nữa');
    // Máy của x gửi yêu cầu đã lọt qua auth trước lúc bị xoá: không làm được gì, nhận 401.
    assert.deepEqual(await del(a3, x, A), { status: 401, body: { code: 'not_signed_in', error: vi['error.not_signed_in'], message: vi['error.not_signed_in'] } });
    assert.ok(db.t.members.some((m) => m.id === a3));
    db.check();
  } finally {
    server.close();
  }
});

// ---------- Tin riêng (server/chat.ts, messages.to_id) ----------

test('tin riêng: xoá x thì mất cả luồng riêng có x ở bên nào, luồng riêng của người khác giữ, tệp ảnh gửi riêng được gom', async () => {
  const db = seed();
  db.add('messages', { id: 'dm-x-a1', family_id: A, author_id: x, to_id: a1, kind: 'text', text: 'riêng' });
  db.add('messages', { id: 'dm-a1-x', family_id: A, author_id: a1, to_id: x, kind: 'photo', media: '/media/dm-a1.jpg' });
  db.add('messages', { id: 'dm-a1-a3', family_id: A, author_id: a1, to_id: a3, kind: 'text', text: 'riêng' });
  db.check();
  const out = await M.removeMember(db.connect, A, a1, x);
  assert.equal(out.status, 'ok');
  db.check();
  assert.deepEqual(db.cascaded, []);
  assert.deepEqual(db.t.messages.map((r) => r.id).sort(), ['dm-a1-a3', 'm-a1', 'm-a3', 'm-b']);
  assert.ok(!db.t.messages.some((r) => r.to_id === x || r.author_id === x));
  assert.ok(out.status === 'ok' && out.files.includes('dm-a1.jpg'), 'ảnh a1 gửi riêng cho x được gom để dọn');
});
