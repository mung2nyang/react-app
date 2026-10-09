// @ts-check
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './app/App.jsx'
import { routerBasename } from './app/routerBasename.js'
import { registerServiceWorker } from './lib/registerServiceWorker.js'
import { installChunkReload } from './lib/chunkReload.js'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')
createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename()}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
try { installChunkReload(window, window.sessionStorage) } catch { /* 탭 저장소를 못 쓰면 자동 새로고침 없이 안내 화면만 */ }
void registerServiceWorker({ prod: import.meta.env.PROD, base: import.meta.env.BASE_URL, nav: navigator })
