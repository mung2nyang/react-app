// @ts-check
// 홈 운비서 줄 — 마이크를 한 번 누르면 카드가 늘어나며 바로 듣고, 나머지를 누르면 글로 쓰는 칸이 열린다(로드맵 24-B). 이름 "운비서"는 임시.
import { useState } from 'react'
import { assetPath } from '../../../shared/utils/assetPath.js'
import { useUnbiseo } from '../hooks/unbiseoContext.ts'
import HomeAssistantPanel from './HomeAssistantPanel.tsx'
import './home-assistant.css'

const AVATAR = assetPath('/images/assistant_unbiseo.png')

export default function HomeAssistantBar() {
  const [open, setOpen] = useState(false)
  const { assistant, openCall } = useUnbiseo()
  const { speech } = assistant

  function onMic() {
    setOpen(true)
    if (!assistant.loggedIn) return
    if (speech.listening) speech.stop()
    else speech.start()
  }

  return (
    <section className={`home-card home-assistant${open ? ' open' : ''}`} aria-label="AI 운비서">
      <div className="home-assistant-head">
        <button type="button" className="home-assistant-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span className="home-assistant-avatar">
            <img src={AVATAR} alt="" width="36" height="29" />
          </span>
          <span className="home-assistant-copy">
            <strong className="home-assistant-name">AI 운비서</strong>
            <span className="home-assistant-hint">운비서에게 무엇이든 물어보세요</span>
          </span>
        </button>
        {speech.supported && (
          <button
            type="button"
            className={`home-assistant-mic-btn${speech.listening ? ' listening' : ''}`}
            aria-label={speech.listening ? '듣기 멈추기' : '말하기'}
            disabled={assistant.busy}
            onClick={onMic}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3"></rect>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </svg>
          </button>
        )}
      </div>
      {open && <HomeAssistantPanel assistant={assistant} onOpenCall={openCall} />}
    </section>
  )
}
