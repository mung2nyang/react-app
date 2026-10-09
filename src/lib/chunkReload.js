// @ts-check
// 로드맵 33: 업데이트 뒤 켜 둔 앱이 지워진 옛 화면 파일을 찾다 실패하면(vite:preloadError) 한 번 새로고침해 새 파일을 받는다.
// 10초 안에 또 실패하면 다시 새로고침하지 않는다(반복 방지) — 오류는 그대로 올라가 PageLoadErrorBoundary가 안내.
const KEY = 'chunkReloadAt'
export const CHUNK_RELOAD_WINDOW_MS = 10000

/**
 * @param {{ addEventListener: (type: string, listener: (event: Event) => void) => void, location: { reload: () => void } }} win
 * @param {{ getItem: (key: string) => string|null, setItem: (key: string, value: string) => void }} storage 탭 안에서만 남는 저장소(sessionStorage)
 * @param {() => number} [now]
 */
export function installChunkReload(win, storage, now = Date.now) {
  win.addEventListener('vite:preloadError', (event) => {
    let last = 0
    try {
      last = Number(storage.getItem(KEY)) || 0
    } catch {
      last = 0
    }
    if (now() - last < CHUNK_RELOAD_WINDOW_MS) return
    try {
      storage.setItem(KEY, String(now()))
    } catch {
      return // 시각을 못 남기면 반복을 막을 수 없어 새로고침하지 않는다
    }
    event.preventDefault()
    win.location.reload()
  })
}
