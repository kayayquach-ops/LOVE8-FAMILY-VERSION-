// Hệ màu lấy cảm hứng từ bản thiết kế tham khảo: san hô ấm, thẻ trắng bo tròn,
// chữ đậm màu gần đen, nút chính hình viên thuốc.
export const colors = {
  primary: '#F2676A',
  primaryDark: '#D9474B',
  primarySoft: '#FDE3E1',
  primaryTint: '#FFF5F4',
  ink: '#1C1B1F',
  inkSoft: '#3B3940',
  muted: '#8E8A93',
  faint: '#B9B5BD',
  line: '#EFEAEA',
  field: '#F5F3F3',
  white: '#FFFFFF',
  black: '#111014',
  green: '#3DBE7A',
  greenSoft: '#E3F6EC',
  amber: '#F2A93B',
  amberSoft: '#FDF1DC',
  blue: '#4D8DF5',
  blueSoft: '#E5EEFE',
  purple: '#8A6CF0',
  purpleSoft: '#EEE9FE',
  overlay: 'rgba(17,16,20,0.55)',
};

export const fonts = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const shadow = {
  card: {
    shadowColor: '#C9787A',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};

// Bảng màu cho ảnh minh họa và avatar khi chưa có ảnh thật.
export const swatches: Array<[string, string]> = [
  ['#FFB8A8', '#F2676A'],
  ['#FFE0A3', '#F2A93B'],
  ['#BFE6CF', '#3DBE7A'],
  ['#C7DBFF', '#4D8DF5'],
  ['#DCD1FF', '#8A6CF0'],
  ['#FFD1E3', '#E9578E'],
  ['#C8EEF0', '#2AA9B3'],
];
