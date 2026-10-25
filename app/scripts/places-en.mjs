// Thêm tên tiếng Anh vào src/places.json (chạy lại được, không gọi mạng): node scripts/places-en.mjs
// Mỗi địa danh thêm phần tử thứ 7 `en` khi tên Anh khác tên Việt; `ce` là tên nước tiếng Anh theo mã nước.
// Tên Việt Nam tiếng Anh là tên không dấu (Hà Nội thành Hanoi, Huế thành Hue). Thiếu `en` thì app hiện tên Việt.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../src/places.json', import.meta.url);
const j = JSON.parse(readFileSync(file, 'utf8'));

const CE = {
  VN: 'Vietnam', KR: 'South Korea', JP: 'Japan', TW: 'Taiwan', CN: 'China', HK: 'Hong Kong', MO: 'Macao', TH: 'Thailand', MY: 'Malaysia', SG: 'Singapore',
  ID: 'Indonesia', PH: 'Philippines', KH: 'Cambodia', LA: 'Laos', MM: 'Myanmar', IN: 'India', AU: 'Australia', NZ: 'New Zealand', US: 'United States', CA: 'Canada',
  GB: 'United Kingdom', FR: 'France', DE: 'Germany', NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland', IT: 'Italy', ES: 'Spain', PT: 'Portugal', PL: 'Poland',
  CZ: 'Czechia', RU: 'Russia', NO: 'Norway', SE: 'Sweden', FI: 'Finland', DK: 'Denmark', IE: 'Ireland', AE: 'UAE', QA: 'Qatar', SA: 'Saudi Arabia', TR: 'Turkey',
  IL: 'Israel', ZA: 'South Africa', AT: 'Austria', GR: 'Greece', MN: 'Mongolia', BN: 'Brunei',
};

const OTHER = {
  'Đài Bắc': 'Taipei', 'Tân Bắc': 'New Taipei', 'Đào Viên': 'Taoyuan', 'Đài Trung': 'Taichung', 'Đài Nam': 'Tainan', 'Cao Hùng': 'Kaohsiung', 'Tân Trúc': 'Hsinchu',
  'Cơ Long': 'Keelung', 'Gia Nghĩa': 'Chiayi', 'Chương Hóa': 'Changhua', 'Bình Đông': 'Pingtung', 'Hoa Liên': 'Hualien', 'Miêu Lật': 'Miaoli',
  'Bắc Kinh': 'Beijing', 'Thượng Hải': 'Shanghai', 'Quảng Châu': 'Guangzhou', 'Thâm Quyến': 'Shenzhen', 'Thành Đô': 'Chengdu', 'Hàng Châu': 'Hangzhou',
  'Vũ Hán': 'Wuhan', 'Trùng Khánh': 'Chongqing', 'Tây An': "Xi'an", 'Thiên Tân': 'Tianjin', 'Thẩm Dương': 'Shenyang', 'Đại Liên': 'Dalian', 'Thanh Đảo': 'Qingdao',
  'Hạ Môn': 'Xiamen', 'Tô Châu': 'Suzhou', 'Trường Sa': 'Changsha', 'Trịnh Châu': 'Zhengzhou', 'Côn Minh': 'Kunming', 'Quế Lâm': 'Guilin', 'Phúc Châu': 'Fuzhou',
  'Cáp Nhĩ Tân': 'Harbin', 'Tế Nam': 'Jinan', 'Đông Hoản': 'Dongguan', 'Phật Sơn': 'Foshan', 'Hồng Kông': 'Hong Kong', 'Viêng Chăn': 'Vientiane',
  'Montréal': 'Montreal', 'München': 'Munich', 'Köln': 'Cologne', 'Düsseldorf': 'Dusseldorf', 'Nürnberg': 'Nuremberg', 'Zürich': 'Zurich', 'Kraków': 'Krakow',
  'Wrocław': 'Wroclaw', 'Gdańsk': 'Gdansk', 'Poznań': 'Poznan', 'Göteborg': 'Gothenburg', 'Malmö': 'Malmo',
};
const VN = { 'Hà Nội': 'Hanoi', 'TP. Hồ Chí Minh': 'Ho Chi Minh City', 'Huế': 'Hue' };
const fold = (s) => s.replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[̀-ͯ]/g, '');

let n = 0;
j.p = j.p.map((p) => {
  const [name, cc] = p;
  const en = OTHER[name] ?? VN[name] ?? (cc === 'VN' ? fold(name) : name);
  const row = p.slice(0, 6);
  if (en !== name) { row.push(en); n++; }
  return row;
});
j.ce = Object.fromEntries(Object.keys(j.c).map((c) => [c, CE[c]]));
const missing = Object.entries(j.ce).filter(([, v]) => !v);
if (missing.length) throw new Error(`Thiếu tên nước: ${missing.map(([c]) => c)}`);
writeFileSync(file, JSON.stringify(j));
console.log(`Thêm tên tiếng Anh cho ${n}/${j.p.length} địa danh, ${Object.keys(j.ce).length} nước.`);
