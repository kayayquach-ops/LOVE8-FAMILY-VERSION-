import type { ImageSourcePropType } from 'react-native';

// Avatar hoạt hình cho gia đình mẫu (Avataaars của Pablo Stanley, dùng tự do cả thương mại; sinh bằng branding/build-art.mjs).
// Khoá theo tên trong dữ liệu mẫu: người dùng đổi tên hoặc tự đăng ký thì quay về avatar chữ cái đầu.
export const DEMO_AVATARS: Record<string, ImageSourcePropType> = {
  'Nguyễn Thu Lan': require('../../assets/art/avatar-lan.png'),
  'Trần Thị Hoa': require('../../assets/art/avatar-me.png'),
  'Nguyễn Văn Minh': require('../../assets/art/avatar-bo.png'),
  'Nguyễn Hoàng Nam': require('../../assets/art/avatar-nam.png'),
  'Phạm Thị Thảo': require('../../assets/art/avatar-ba.png'),
};

// Nét lượn mờ phủ lên thẻ màu.
export const CARD_LINES: ImageSourcePropType[] = [
  require('../../assets/art/lines-0.png'),
  require('../../assets/art/lines-1.png'),
  require('../../assets/art/lines-2.png'),
];
