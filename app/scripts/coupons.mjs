// Thêm, xem, tắt ưu đãi của nhãn hàng (bảng brand_coupons, ghi chú app/docs/uu-dai.md). Không có màn quản trị: dùng script này hoặc SQL.
// Bảng do máy chủ tạo lúc khởi động (server/coupons.ts): máy chủ phải chạy ít nhất một lần trước.
//
// Trên máy (đọc DATABASE_URL trong app/.env):  cd app && node scripts/coupons.mjs list
// Trên Railway (bản thật):                      railway ssh --service homeletter -- node scripts/coupons.mjs list
//
//   list                       liệt kê mọi ưu đãi, kể cả đã tắt, đã hết hạn
//   add --brand "Tên nhãn hàng" --category massage --title "Giảm cho ghế thứ hai" --discount "-20%"
//       [--code MA20] [--url https://...] [--until 2026-12-31] [--family] [--lang vi] [--stars 40]
//   off ID | on ID             tắt, bật lại (app chỉ hiện ưu đãi đang bật và còn hạn)
//   delete ID                  xoá hẳn
//
// --category: massage (ghế massage), health (chăm sóc sức khoẻ), pharmacy (giao thuốc), supplement (thực phẩm chức năng),
//             homecare (khám tại nhà), other (khác).
// --discount: chữ ngắn hiện to trên thẻ, ví dụ "-20%", "-100K", "Miễn phí".
// --until:    dùng được hết ngày đó theo giờ Việt Nam. Bỏ trống là không hết hạn.
// --family:   chỉ dành cho gói gia đình. App chưa có thanh toán nên hiện chỉ gắn nhãn "Gói gia đình", ai cũng xem và dùng được.
// --lang:     vi, en hoặc ko: chỉ người dùng app bằng thứ tiếng đó thấy. Bỏ trống là mọi thứ tiếng.
// --stars:    quà mốc lọ sao (cột min_stars), một trong 40, 100, 200, 400, 700, 1000. Chỉ nhà có tổng sao từ mốc đó trở lên
//             mới thấy ưu đãi này, kèm nhãn "Quà mốc 40 sao"; lọ sao báo "có quà nhỏ" cho mốc đó. Bỏ trống là ưu đãi thường (0).
//             Ghi chú: app/docs/lo-moc.md.
//
// QUY TẮC: chỉ ghi tên nhãn hàng THẬT khi đã có hợp tác thật với nhãn hàng đó. Chưa có thì không thêm gì lên bản thật,
// và dữ liệu thử chỉ dùng tên tự đặt, chỉ nạp vào DB trên máy.
import pg from 'pg';
import { randomBytes } from 'node:crypto';

try { process.loadEnvFile(); } catch {}

const CATEGORIES = ['massage', 'health', 'pharmacy', 'supplement', 'homecare', 'other'];
const LANGS = ['vi', 'en', 'ko'];
// Bản sao JAR_MILESTONES trong src/shared.ts (server/coupons.test.ts so hai bản, đổi một chỗ thì đổi cả hai).
const MILESTONES = [40, 100, 200, 400, 700, 1000];
const [cmd, ...rest] = process.argv.slice(2);

/** --ten giá trị, --co (không có giá trị). */
function flags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) fail(`không hiểu "${args[i]}"`);
    const k = args[i].slice(2);
    if (k === 'family') out.family = true;
    else { if (args[i + 1] == null) fail(`--${k} thiếu giá trị`); out[k] = args[++i]; }
  }
  return out;
}

function fail(msg) {
  console.error(`Lỗi: ${msg}. Xem hướng dẫn ở đầu scripts/coupons.mjs.`);
  process.exit(1);
}

function addRow(f) {
  for (const k of ['brand', 'category', 'title', 'discount']) if (!f[k]?.trim()) fail(`thiếu --${k}`);
  if (!CATEGORIES.includes(f.category)) fail(`--category phải là một trong: ${CATEGORIES.join(', ')}`);
  if (f.url && !/^https?:\/\/\S+$/i.test(f.url)) fail('--url phải bắt đầu bằng http:// hoặc https://');
  if (f.until && !/^\d{4}-\d{2}-\d{2}$/.test(f.until)) fail('--until dạng YYYY-MM-DD');
  if (f.lang && !LANGS.includes(f.lang)) fail(`--lang phải là một trong: ${LANGS.join(', ')}`);
  if (f.stars != null && !MILESTONES.includes(Number(f.stars))) fail(`--stars phải là một mốc lọ sao: ${MILESTONES.join(', ')}`);
  const until = f.until ? new Date(`${f.until}T23:59:59+07:00`) : null;
  if (until && Number.isNaN(until.getTime())) fail('--until không phải ngày có thật');
  return {
    id: randomBytes(4).toString('hex'), brand: f.brand.trim(), category: f.category, title: f.title.trim(), discount: f.discount.trim(),
    code: f.code?.trim() || null, url: f.url || null, expires_at: until, audience: f.family ? 'family' : 'all', lang: f.lang || null,
    min_stars: f.stars != null ? Number(f.stars) : 0,
  };
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (cmd === 'list') {
    const { rows } = await pool.query('select * from brand_coupons order by created_at');
    for (const r of rows) {
      const exp = r.expires_at ? r.expires_at.toISOString().slice(0, 10) : 'không hạn';
      const state = !r.active ? 'TẮT' : r.expires_at && r.expires_at < new Date() ? 'HẾT HẠN' : 'đang hiện';
      console.log([r.id, state.padEnd(9), r.category.padEnd(10), exp.padEnd(10), (r.lang ?? 'mọi tiếng').padEnd(9), r.audience === 'family' ? 'gói GĐ' : '      ',
        (r.min_stars ? `mốc ${r.min_stars}` : '').padEnd(9),
        `${r.brand} | ${r.title} | ${r.discount}${r.code ? ` | mã ${r.code}` : ''}${r.url ? ` | ${r.url}` : ''}`].join('  '));
    }
    console.log(`Tổng ${rows.length} ưu đãi.`);
  } else if (cmd === 'add') {
    const r = addRow(flags(rest));
    await pool.query('insert into brand_coupons (id, brand, category, title, discount, code, url, expires_at, audience, lang, min_stars) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [r.id, r.brand, r.category, r.title, r.discount, r.code, r.url, r.expires_at, r.audience, r.lang, r.min_stars]);
    console.log(`Đã thêm ${r.id}: ${r.brand} | ${r.title} | ${r.discount}${r.min_stars ? ` | quà mốc ${r.min_stars} sao` : ''}`);
  } else if (cmd === 'off' || cmd === 'on' || cmd === 'delete') {
    const id = rest[0];
    if (!id) fail(`${cmd} cần ID (cột đầu khi list)`);
    const { rowCount } = cmd === 'delete'
      ? await pool.query('delete from brand_coupons where id = $1', [id])
      : await pool.query('update brand_coupons set active = $2 where id = $1', [id, cmd === 'on']);
    if (!rowCount) fail(`không có ưu đãi ${id}`);
    console.log(cmd === 'delete' ? `Đã xoá ${id}.` : `Đã ${cmd === 'on' ? 'bật' : 'tắt'} ${id}.`);
  } else fail(cmd ? `không có lệnh "${cmd}"` : 'thiếu lệnh');
} finally {
  await pool.end();
}
