// @ts-check
// 로그인 계정이 쓰는 중 인터넷이 끊기면 화면 맨 위 빨간 띠(로드맵 84) — 화면 안내만, 저장은 그대로.
import { useSyncExternalStore } from 'react'
import { isCloudSession } from '../data/cloud/cloudSession.js'
import '../shared/styles/offline-banner.css'

/** @typedef {import('../data/sync/syncTypes.js').AppSession} AppSession */

/** @param {() => void} onChange */
function subscribe(onChange) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

// 휴대폰이 "연결 없음"이라고 알릴 때만 끊김으로 본다(알 수 없으면 연결됨).
function readOnline() {
  return navigator.onLine !== false
}

/**
 * @param {Object} props
 * @param {AppSession|null} [props.session]
 */
export default function OfflineBanner({ session }) {
  const online = useSyncExternalStore(subscribe, readOnline, () => true)
  if (online || !isCloudSession(session)) return null
  return (
    <div className="offline-banner" role="alert">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <line x1="2" y1="2" x2="22" y2="22" />
        <path d="M8.5 16.5a5 5 0 0 1 7 0" />
        <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
        <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
        <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
        <path d="M5 13a10 10 0 0 1 5.24-2.76" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span>
        <span className="offline-banner-line">인터넷 연결이 끊겼습니다.</span>
        <span className="offline-banner-line"> 다시 연결되기 전에는 저장되지 않습니다.</span>
      </span>
    </div>
  )
}
