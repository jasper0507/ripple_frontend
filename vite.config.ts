import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// 开发代理：保留完整 API 前缀，不重写路径。
// 后端未配置 CORS，浏览器经 Vite 同源访问；部署由 Caddy 以相同路径反代。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ping': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
})
