// @ts-check
// 앱 켤 때 연동 확인이 실패하면 어느 칸으로 들어갈지 몰라 들어가지 않고 이 화면.
import './boot-retry.css'

export default function BootRetryScreen() {
  return (
    <div className="boot-retry" role="alert">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
        <path d="M15 18H9"></path>
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 8.38A1 1 0 0 0 17.52 8H14"></path>
        <circle cx="17" cy="18" r="2"></circle>
        <circle cx="7" cy="18" r="2"></circle>
      </svg>
      <h1>네트워크 연결이 불안정합니다.</h1>
      <p>연결 상태를 확인해 주세요.</p>
      <button type="button" onClick={() => { window.location.reload() }}>다시 시도</button>
    </div>
  )
}
