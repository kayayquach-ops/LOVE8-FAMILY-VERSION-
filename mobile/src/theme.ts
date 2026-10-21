// Giao diện tối theo tham khảo "MAD – Social Dares" (Nixtio): nền đen, thẻ bo tròn lớn màu đất và pastel
// có nét lượn mờ, avatar tròn, chữ đậm khít; điểm nhấn là dải chuyển màu tím, hồng, cam.
export const colors = {
  bg: '#000000',
  // Mặt nền thứ hai và các mức sáng dần cho trạng thái bấm.
  tone: '#141416',
  toneDeep: '#222226',
  field: '#141416',
  primaryTint: '#141416',
  line: '#26262B',
  // Chữ trên nền tối.
  ink: '#FFFFFF',
  inkSoft: '#D4D4D8',
  muted: '#A1A1AA',
  placeholder: '#8B8B94',
  faint: '#5A5A63',
  // Màu chữ và icon đặt trên thẻ màu hoặc nút tô màu.
  white: '#FFFFFF',
  black: '#000000',
  // Màu nhấn: hồng đậm cho nút tô màu, hồng sáng cho chữ nhấn trên nền đen.
  primary: '#D9366E',
  primaryDark: '#B52A5B',
  primarySoft: '#3A1424',
  accentText: '#FF8FB1',
  // Chủ nhật, ngày Tết, ngày giỗ trên lịch.
  holiday: '#FF7A6B',
  // Ngày âm lịch.
  lunar: '#C4B5FD',
  lunarSoft: '#1E1A2E',
  green: '#5EE0A0',
  greenSoft: '#11251B',
  amber: '#F5C451',
  amberSoft: '#2A2210',
  blue: '#9DB8FF',
  blueSoft: '#161C2E',
  purple: '#C4B5FD',
  purpleSoft: '#1E1A2E',
  overlay: 'rgba(0,0,0,0.6)',
};

// Dải chuyển màu dùng cho viền nút chính, nút "+" và vòng thông báo.
export const gradient = ['#8F20B3', '#E0306E', '#F28A3C'] as const;

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

export const radius = { sm: 14, md: 20, lg: 28, xl: 32, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 };

export const shadow = {
  card: {},
  soft: {},
  float: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
};

// Màu thẻ của từng người trong nhà, lấy theo bảng màu tham khảo nhưng đậm hơn một chút để chữ trắng đọc rõ.
export const familyTones = [
  '#A8775A', // đất nung
  '#B9788D', // hồng phấn
  '#5E8C78', // xanh lá xám
  '#A38842', // vàng mù tạt
  '#8A5DA6', // tím oải hương
  '#A44A3B', // gạch cam
  '#4F7A8C', // xanh mòng két
];

/** Làm sáng (amount > 0) hoặc tối (amount < 0) một mã màu, dùng để tạo dải màu trong thẻ. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
