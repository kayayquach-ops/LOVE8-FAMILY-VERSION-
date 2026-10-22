// Giao diện sáng, tối giản: nền trắng ngà như giấy viết thư, chữ mực đen ấm, xám nhạt cho mặt nền thứ hai.
// Chỉ một màu nhấn nâu đỏ như mực dấu bưu điện. Thẻ của từng người dùng màu trầm, không chuyển màu sặc sỡ.
export const colors = {
  bg: '#FAF9F6',
  // Mặt nền thứ hai và các mức đậm dần cho trạng thái bấm.
  tone: '#F0EEE9',
  toneDeep: '#E5E2DB',
  field: '#F0EEE9',
  primaryTint: '#F4ECE7',
  line: '#E3E0D8',
  // Chữ trên nền sáng.
  ink: '#1F1D1A',
  inkSoft: '#45423C',
  muted: '#76726A',
  placeholder: '#A29E95',
  faint: '#C2BEB5',
  // Màu chữ và icon đặt trên thẻ màu hoặc nút tô màu.
  white: '#FFFFFF',
  black: '#000000',
  // Màu nhấn duy nhất: nâu đỏ như mực dấu thư.
  primary: '#9A5A44',
  primaryDark: '#7D4735',
  primarySoft: '#F2E6E0',
  accentText: '#9A5A44',
  // Chủ nhật, ngày Tết, ngày giỗ trên lịch.
  holiday: '#B8473A',
  // Ngày âm lịch.
  lunar: '#6A5E9C',
  lunarSoft: '#EEECF5',
  green: '#3B7F5A',
  greenSoft: '#E5F0E9',
  amber: '#9A7322',
  amberSoft: '#F5EEDC',
  blue: '#41609E',
  blueSoft: '#E8EDF6',
  purple: '#6A5E9C',
  purpleSoft: '#EEECF5',
  overlay: 'rgba(31,29,26,0.45)',
  // Khung đầu màn hình chat: xám than ấm, chữ trắng.
  deep: '#3A3833',
  online: '#3B9A62',
  endCall: '#C8553F',
};

// Giữ tên cũ để mã cũ chạy; nay chỉ là một màu phẳng, không còn dải tím hồng cam.
export const gradient = ['#9A5A44', '#9A5A44'] as const;

// Một họ chữ: Be Vietnam Pro (do người Việt thiết kế cho tiếng Việt).
// Các tên "serif" giữ lại để mã cũ vẫn chạy, nay trỏ về cùng họ chữ.
export const fonts = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  serif: 'BeVietnamPro_400Regular',
  serifSemibold: 'BeVietnamPro_600SemiBold',
  serifBold: 'BeVietnamPro_700Bold',
};

export const radius = { sm: 12, md: 18, lg: 24, xl: 28, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 };

export const shadow = {
  card: {},
  soft: {},
  float: {
    shadowColor: '#1F1D1A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
};

// Màu thẻ của từng người trong nhà: tông trầm như ảnh phim cũ, đủ đậm để chữ trắng cỡ lớn đọc rõ.
export const familyTones = [
  '#8A6F5C', // nâu gỗ
  '#946F7B', // hồng tro
  '#5F7D6C', // xanh lá xám
  '#857551', // vàng rơm cũ
  '#6F6584', // tím khói
  '#8C5B4E', // đất nung
  '#5A7380', // xanh đá
];

/** Làm sáng (amount > 0) hoặc tối (amount < 0) một mã màu, dùng để tạo dải màu trong thẻ. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
