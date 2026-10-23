// Nạp .env khi chạy trên máy; trên Railway biến môi trường có sẵn.
try {
  process.loadEnvFile();
} catch {}
