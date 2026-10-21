// Cho bản web mở nhanh hơn trên điện thoại: báo trình duyệt tải trước font và các đoạn mã của màn hình đầu
// ngay khi đọc trang, thay vì đợi tải xong mã chính mới biết cần gì (tải nối đuôi nhau).
// Ảnh không tải trước: chúng giành băng thông với mã chính trên mạng chậm.
// Chạy sau `expo export`:  node scripts/preload-web.mjs <thư mục bản web>
import fs from 'node:fs';
import path from 'node:path';

const site = process.argv[2];
if (!site) throw new Error('Cần đường dẫn thư mục bản web');
const htmlPath = path.join(site, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Tiền tố đường dẫn (ví dụ /LOVE8-FAMILY-VERSION-), lấy từ thẻ script có sẵn.
const entry = html.match(/src="([^"]*)\/_expo\/static\/js\/web\/entry-/);
if (!entry) throw new Error('Không thấy thẻ script entry trong index.html');
const prefix = entry[1];

const list = (dir) => (fs.existsSync(path.join(site, dir)) ? fs.readdirSync(path.join(site, dir)) : []);
const links = [];

// Mã của các màn hình mở đầu: khung app, màn chọn vai và bốn tab. Bỏ qua đoạn lớn của camera.
const ROUTES = /^(_layout|index|onboarding|home|chat|understand|calendar)-[0-9a-f]+\.js$/;
for (const f of list('_expo/static/js/web')) {
  if (ROUTES.test(f) && fs.statSync(path.join(site, '_expo/static/js/web', f)).size < 20_000) {
    links.push(`<link rel="preload" as="script" href="${prefix}/_expo/static/js/web/${f}">`);
  }
}

// Font chữ và icon. Font luôn tải theo chế độ CORS nên cần crossorigin để trình duyệt dùng lại bản đã tải.
for (const f of list('assets/assets/fonts')) {
  const type = f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.ttf') && f.startsWith('Ionicons') ? 'font/ttf' : '';
  if (type) links.push(`<link rel="preload" as="font" type="${type}" crossorigin href="${prefix}/assets/assets/fonts/${f}">`);
}

html = html.replace(/<link rel="preload"[^>]*>\n?/g, '').replace('</head>', `${links.join('\n')}\n</head>`);
fs.writeFileSync(htmlPath, html);
console.log(`Đã thêm ${links.length} dòng tải trước vào ${htmlPath}`);
