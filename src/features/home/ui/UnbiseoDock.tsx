// 홈이 아닌 화면에서 아래 메뉴 위에 떠 있는 운비서 줄. 줄을 누르면 위로 펼친다.
import { assetPath } from '../../../shared/utils/assetPath.js'
import { useUnbiseo } from '../hooks/unbiseoContext.ts'
import HomeAssistantPanel from './HomeAssistantPanel.tsx'
import './home-assistant.css'
import './unbiseo-dock.css'

const AVATAR = assetPath('/images/assistant_unbiseo.png')

export default function UnbiseoDock() {
  const { assistant, openCall, dockOpen, setDockOpen } = useUnbiseo()
  const { speech } = assistant
  // 비회원은 띄우지 않는다 — 홈 카드에서 로그인 안내.
  if (!assistant.loggedIn) return null

  function onMic() {
    setDockOpen(true)
    if (speech.listening) speech.stop()
    else speech.start()
  }

  return (
    <section className={`unbiseo-dock${dockOpen ? ' open' : ''}`} aria-label="Ai 운비서">
      {dockOpen && (
        <div className="unbiseo-dock-card">
          <HomeAssistantPanel assistant={assistant} onOpenCall={openCall} />
        </div>
      )}
      <div className="home-assistant-head unbiseo-dock-bar">
        <button type="button" className="home-assistant-toggle" aria-expanded={dockOpen} onClick={() => setDockOpen(!dockOpen)}>
          <span className="home-assistant-avatar">
            <img src={AVATAR} alt="" width="36" height="29" />
          </span>
          <span className="home-assistant-copy">
            <strong className="home-assistant-name">Ai 운비서</strong>
            <span className="home-assistant-hint">운비서에게 무엇이든 물어보세요</span>
          </span>
          <svg className="unbiseo-dock-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="6 15 12 9 18 15"></polyline>
          </svg>
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
    </section>
  )
}
