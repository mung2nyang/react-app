// @ts-check
// AI 비서 1단계: 홈 비서 입력 줄 — 화면 자리만(동작 연결 전이라 버튼이 아니라 모양만). 이름 "운비서"는 임시.
import { assetPath } from '../../lib/assetPath.js'
import './home-assistant.css'

const AVATAR = assetPath('/images/assistant_unbiseo.png')

export default function HomeAssistantBar() {
  return (
    <section className="home-card home-assistant" aria-label="운비서">
      <span className="home-assistant-avatar">
        <img src={AVATAR} alt="" width="36" height="29" />
      </span>
      <span className="home-assistant-copy">
        <strong className="home-assistant-name">운비서</strong>
        <span className="home-assistant-hint">무엇이든 물어보세요</span>
      </span>
      <svg className="home-assistant-mic" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3"></rect>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="22"></line>
      </svg>
    </section>
  )
}
