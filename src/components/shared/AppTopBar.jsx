// @ts-check
// 홈·운행 탭 달력 위쪽 한 줄: 왼쪽 작은 로고(트럭 그림 + 앱 이름), 오른쪽 [알림 종](넘길 때만) + 메뉴.
import { assetPath } from '../../lib/assetPath.js'
import './app-top-bar.css'

const BANNER = assetPath('/images/banner_image.png')

/**
 * @param {Object} props
 * @param {number} [props.notifCount]
 * @param {(() => void)} [props.onOpenNotifs] 없으면 알림 종을 안 그림(운행 탭)
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function AppTopBar({ notifCount = 0, onOpenNotifs, onOpenMenu }) {
  return (
    <div className="settings-header app-topbar">
      <div className="app-brand">
        <img src={BANNER} alt="" className="app-brand-logo" />
        <span className="app-brand-text">운행일지</span>
      </div>
      <div className="app-topbar-actions">
        {onOpenNotifs && (
          <button type="button" className="icon-btn top-notification-btn" title="알림" onClick={onOpenNotifs}>
            <svg viewBox="0 0 24 24">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {notifCount > 0 && <span className="notification-count-badge">{notifCount > 99 ? '99+' : notifCount}</span>}
          </button>
        )}
        {onOpenMenu && (
          <button type="button" className="icon-btn top-menu-btn" title="메뉴" onClick={onOpenMenu}>
            <svg viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
