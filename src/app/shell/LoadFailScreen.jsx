// @ts-check
// 비회원 기록을 못 읽으면 앱 대신 이 화면 — 빈 화면에서 입력해 기존 기록을 덮어쓰지 않게. 모양은 BootRetryScreen과 같음.
import './boot-retry.css'

export default function LoadFailScreen() {
  return (
    <div className="boot-retry" role="alert">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
        <path d="M15 18H9"></path>
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 8.38A1 1 0 0 0 17.52 8H14"></path>
        <circle cx="17" cy="18" r="2"></circle>
        <circle cx="7" cy="18" r="2"></circle>
      </svg>
      <h1>기록을 불러오지 못했습니다.</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={() => { window.location.reload() }}>다시 시도</button>
    </div>
  )
}
