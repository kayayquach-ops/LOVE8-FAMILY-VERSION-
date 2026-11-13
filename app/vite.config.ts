import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API_PORT, VITE_PORT: chạy nhiều bản dev cùng lúc (mỗi worktree một cặp cổng).
const api = `http://localhost:${process.env.API_PORT || 3010}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT || 5180),
    host: true,
    proxy: { '/api': api, '/media': api },
  },
});
