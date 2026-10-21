// Cấu hình động: khi đưa bản web lên GitHub Pages (chạy ở đường dẫn con /<tên repo>),
// đặt EXPO_BASE_URL để mọi file JS, font, ảnh được nạp đúng chỗ. Vercel và bản điện thoại không cần.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
