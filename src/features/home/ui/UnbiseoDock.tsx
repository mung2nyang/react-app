// 홈이 아닌 화면에서 아래 메뉴 위 오른쪽에 떠 있는 운비서 캐릭터 버튼. 누르면 위로 카드가 열리며 바로 듣는다.
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

  // 받아쓰기 없는 휴대폰이면 글 칸만.
  function openAndListen() {
    setDockOpen(true)
    if (speech.supported && !speech.listening && !assistant.busy) speech.start()
  }

  if (!dockOpen) {
    return (
      <section className="unbiseo-dock" aria-label="Ai 운비서">
        <button type="button" className="unbiseo-dock-fab" aria-label="Ai 운비서 열기" aria-expanded={false} onClick={openAndListen}>
          <img src={AVATAR} alt="" width="40" height="32" />
        </button>
      </section>
    )
  }

  return (
    <section className="unbiseo-dock open" aria-label="Ai 운비서">
      <div className="unbiseo-dock-card">
        <div className="home-assistant-head unbiseo-dock-head">
          <span className="home-assistant-avatar">
            <img src={AVATAR} alt="" width="36" height="29" />
          </span>
          <strong className="home-assistant-name unbiseo-dock-name">Ai 운비서</strong>
          {speech.supported && (
            <button
              type="button"
              className={`home-assistant-mic-btn${speech.listening ? ' listening' : ''}`}
              aria-label={speech.listening ? '듣기 멈추기' : '말하기'}
              disabled={assistant.busy}
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="2" width="6" height="12" rx="3"></rect>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="22"></line>
              </svg>
            </button>
          )}
          <button type="button" className="unbiseo-dock-close" aria-label="작게" aria-expanded onClick={() => { if (speech.listening) speech.stop(); setDockOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
        <HomeAssistantPanel assistant={assistant} onOpenCall={openCall} />
      </div>
    </section>
  )
}
