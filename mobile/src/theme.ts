// Hệ màu "lịch bóc và thư tay": nền giấy trắng, mặt nền thứ hai màu giấy pơ-luya, chữ màu mực bút bi,
// một màu nhấn duy nhất là đỏ lịch (Chủ nhật, ngày Tết), xanh chỉ dành cho ngày âm lịch.
// Xem docs/design.md. Các khối tách nhau bằng tông màu, không dùng viền hay bóng đổ.
export const colors = {
  primary: '#C8321F',
  primaryDark: '#A3261A',
  primarySoft: '#F7E4E0',
  primaryTint: '#EEF0F4',
  ink: '#171C2E',
  inkSoft: '#3D4357',
  muted: '#5B6175',
  placeholder: '#656B7F',
  faint: '#8E94A6',
  line: '#E3E6EC',
  field: '#EEF0F4',
  tone: '#EEF0F4',
  toneDeep: '#E2E6ED',
  white: '#FFFFFF',
  black: '#171C2E',
  lunar: '#2C4D9E',
  lunarSoft: '#E6EBF5',
  green: '#2F7A4B',
  greenSoft: '#E3EFE7',
  amber: '#8A5A10',
  amberSoft: '#F5EBDA',
  blue: '#2C4D9E',
  blueSoft: '#E6EBF5',
  purple: '#2E4874',
  purpleSoft: '#E6EBF5',
  overlay: 'rgba(23,28,46,0.62)',
};

export const fonts = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  // Literata: số trên tờ lịch, tiêu đề, lời kể trong Sổ ký ức.
  serif: 'Literata_400Regular',
  serifSemibold: 'Literata_600SemiBold',
  serifBold: 'Literata_700Bold',
};

// Ảnh và tin bo nhẹ như ảnh in; khối nền bo 18; nút bo tròn hẳn.
export const radius = { sm: 6, md: 12, lg: 18, xl: 24, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 };

// Không có bóng cho vật đứng yên. Chỉ thứ thật sự nổi (bảng chọn, hộp thoại) mới dùng `float`.
export const shadow = {
  card: {},
  soft: {},
  float: {
    shadowColor: '#171C2E',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

// Màu riêng của từng người trong nhà, lấy từ chất liệu Việt. Chữ trắng trên các màu này đạt tương phản 4.9:1 trở lên.
export const familyTones = [
  '#8E3A2C', // son
  '#2E4874', // chàm
  '#46663A', // lá chuối
  '#9A6512', // nghệ
  '#A2475E', // sen
  '#3F6E68', // rêu
  '#7A5236', // gốm
];
