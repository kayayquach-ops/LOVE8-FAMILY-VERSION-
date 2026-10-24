// Dọn nhà thử trên máy chủ. Chạy trong container: railway ssh --service homeletter -- node scripts/cleanup-families.mjs
//
//   (không tham số)          liệt kê mọi nhà, chỉ ĐỌC
//   --delete ID1,ID2         xem trước những gì sẽ xoá (chưa xoá gì)
//   --delete ID1,ID2 --yes   xoá thật (một giao dịch, lỗi thì không xoá gì), rồi xoá luôn file ảnh, giọng nói, podcast của các nhà đó
//
// ID là 8 ký tự đầu của id nhà (cột "id" khi liệt kê). Không xoá được nhà nào không có trong danh sách.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const del = args.includes('--delete') ? (args[args.indexOf('--delete') + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : [];
const yes = args.includes('--yes');
const MEDIA_DIR = process.env.MEDIA_DIR || '/data/media';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function list() {
  const { rows } = await pool.query(`
    select f.id, f.name, f.code, f.created_at,
      (select count(*) from members m where m.family_id = f.id) as members,
      (select string_agg(m.name || ' (' || m.role || ')', ', ' order by m.created_at) from members m where m.family_id = f.id) as who,
      (select count(*) from posts p where p.family_id = f.id) as posts,
      (select max(m.last_seen) from members m where m.family_id = f.id) as last_seen
    from families f order by f.created_at`);
  console.log('id        tên nhà                 mã      tạo lúc          người  bài  lần cuối vào    thành viên');
  for (const r of rows) {
    console.log([
      r.id.slice(0, 8).padEnd(9), String(r.name).slice(0, 22).padEnd(23), String(r.code).padEnd(7),
      r.created_at.toISOString().slice(0, 16).replace('T', ' ').padEnd(16), String(r.members).padEnd(6), String(r.posts).padEnd(4),
      (r.last_seen ? r.last_seen.toISOString().slice(0, 16).replace('T', ' ') : '-').padEnd(15), r.who ?? '',
    ].join(' '));
  }
  console.log(`\nTổng ${rows.length} nhà.`);
}

async function removeFamilies(prefixes) {
  const { rows: fams } = await pool.query('select id, name from families where left(id, 8) = any($1)', [prefixes]);
  const missing = prefixes.filter((p) => !fams.some((f) => f.id.startsWith(p)));
  if (missing.length) { console.log('Không thấy nhà có id:', missing.join(', ')); process.exit(1); }
  const famIds = fams.map((f) => f.id);
  console.log('Sẽ xoá các nhà:', fams.map((f) => `${f.name} (${f.id.slice(0, 8)})`).join('; '));

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("set local session_replication_role = replica"); // bỏ qua kiểm tra khoá ngoại trong giao dịch này, tự xoá đủ bên dưới
    const memberIds = (await client.query('select id from members where family_id = any($1)', [famIds])).rows.map((r) => r.id);
    const postIds = (await client.query('select id from posts where family_id = any($1)', [famIds])).rows.map((r) => r.id);

    // Mọi bảng và cột cần xét.
    const { rows: cols } = await client.query(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and data_type in ('text', 'character varying', 'uuid')
        and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')`);
    const by = (names) => cols.filter((c) => names.includes(c.column_name));
    const rules = [
      ['family_id', by(['family_id']), famIds],
      ['member', by(['member_id', 'author_id', 'created_by', 'from_id', 'user_id']), memberIds],
      ['post', by(['post_id']), postIds],
    ];

    // Gom đường dẫn file trong các dòng sắp xoá (cột nào chứa /media/...) trước khi xoá dòng.
    const files = new Set();
    const counts = {};
    const seen = new Set();
    for (const [, cs, ids] of rules) {
      if (!ids.length) continue;
      for (const c of cs) {
        const key = `${c.table_name}.${c.column_name}`;
        if (seen.has(key)) continue; seen.add(key);
        const q = `select row_to_json(t)::text as j from "${c.table_name}" t where "${c.column_name}"::text = any($1)`;
        for (const r of (await client.query(q, [ids])).rows) for (const m of r.j.matchAll(/\/media\/([A-Za-z0-9_./-]+?\.[A-Za-z0-9]+)/g)) files.add(m[1]);
      }
    }
    // Xoá theo thứ tự: bảng phụ thuộc trước, rồi posts, members, families.
    const order = (t) => ({ families: 3, members: 2, posts: 1 }[t] ?? 0);
    const targets = [];
    for (const [, cs, ids] of rules) for (const c of cs) if (ids.length) targets.push({ ...c, ids });
    targets.sort((a, b) => order(a.table_name) - order(b.table_name));
    const done = new Set();
    for (const t of targets) {
      const key = `${t.table_name}.${t.column_name}`;
      if (done.has(key)) continue; done.add(key);
      const r = await client.query(`delete from "${t.table_name}" where "${t.column_name}"::text = any($1)`, [t.ids]);
      if (r.rowCount) counts[key] = (counts[key] ?? 0) + r.rowCount;
    }
    const f = await client.query('delete from families where id = any($1)', [famIds]);
    counts['families.id'] = f.rowCount;

    console.log('\nSố dòng bị xoá theo bảng:');
    for (const [k, n] of Object.entries(counts)) console.log(`  ${k}: ${n}`);
    console.log(`File media liên quan: ${files.size}`);
    if (!yes) { await client.query('rollback'); console.log('\nĐÂY CHỈ LÀ XEM TRƯỚC, chưa xoá gì. Thêm --yes để xoá thật.'); return; }
    await client.query('commit');
    let removed = 0;
    for (const rel of files) {
      const base = path.resolve(MEDIA_DIR);
      const p = path.resolve(base, rel);
      if (!p.startsWith(base + path.sep)) continue; // không ra ngoài thư mục media
      try { fs.unlinkSync(p); removed++; } catch {}
    }
    console.log(`\nĐã xoá xong. Đã xoá ${removed}/${files.size} file media.`);
  } catch (e) {
    await client.query('rollback').catch(() => {});
    console.error('Lỗi, không xoá gì:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

if (del.length) await removeFamilies(del); else await list();
await pool.end();
