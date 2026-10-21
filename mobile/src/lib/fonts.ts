// Font chữ đã cắt gọn còn chữ Latin và tiếng Việt (xem scripts/subset-fonts.py).
// Bản iOS và Android dùng TTF; bản web dùng fonts.web.ts (WOFF2, nhẹ hơn khoảng 3 lần).
export const TEXT_FONTS = {
  BeVietnamPro_400Regular: require('../../assets/fonts/BeVietnamPro-Regular.ttf'),
  BeVietnamPro_500Medium: require('../../assets/fonts/BeVietnamPro-Medium.ttf'),
  BeVietnamPro_600SemiBold: require('../../assets/fonts/BeVietnamPro-SemiBold.ttf'),
  BeVietnamPro_700Bold: require('../../assets/fonts/BeVietnamPro-Bold.ttf'),
  Literata_400Regular: require('../../assets/fonts/Literata-Regular.ttf'),
  Literata_600SemiBold: require('../../assets/fonts/Literata-SemiBold.ttf'),
  Literata_700Bold: require('../../assets/fonts/Literata-Bold.ttf'),
};
