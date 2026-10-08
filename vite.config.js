import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 배포 주소: https://getdrivelog.com/ (GitHub Pages 사용자 도메인) — 개발·배포 모두 루트 `/`.
export default defineConfig({
  plugins: [react()],
  base: '/',
})
