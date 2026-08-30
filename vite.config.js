import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: https://mung2nyang.github.io/react-app/
// `vite`(dev)는 루트 `/`를 유지해서 localhost:5173 기존 경로를 깨지 않는다.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/react-app/' : '/',
}))
