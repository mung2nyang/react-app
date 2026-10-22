// @ts-check
// 홈 운비서 줄 — 누르면 카드가 아래로 늘어나 말하기·쳐서 넣기(로드맵 24-B). 이름 "운비서"는 임시.
import { useState } from 'react'
import { assetPath } from '../../../shared/utils/assetPath.js'
import HomeAssistantPanel from './HomeAssistantPanel.tsx'
import './home-assistant.css'

const AVATAR = assetPath('/images/assistant_unbiseo.png')

export default function HomeAssistantBar() {
  const [open, setOpen] = useState(false)
  return (
    <section className={`home-card home-assistant${open ? ' open' : ''}`} aria-label="운비서">
      <button type="button" className="home-assistant-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="home-assistant-avatar">
          <img src={AVATAR} alt="" width="36" height="29" />
        </span>
        <span className="home-assistant-copy">
          <strong className="home-assistant-name">운비서</strong>
          <span className="home-assistant-hint">말로 운행 기록하기</span>
        </span>
        <svg className="home-assistant-mic" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3"></rect>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="22"></line>
        </svg>
      </button>
      {open && <HomeAssistantPanel />}
    </section>
  )
}
