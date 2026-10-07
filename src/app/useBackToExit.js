// @ts-check
// 로드맵 17번: 설치 앱(바탕화면 아이콘) 홈에서 더 돌아갈 화면이 없을 때, 뒤로가기 1번은 안내만, 안내 4초 안에 1번 더면 종료.
// 같은 홈 주소로 "붙잡기용 기록"을 하나 더 쌓아 두고, 그게 빠지면(뒤로가기) 안내를 띄운 뒤 4초 동안은 다시 안 쌓는다.
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

export const EXIT_HINT = '뒤로가기를 한 번 더 누르면 종료돼요'
export const EXIT_WINDOW_MS = 4000 // 안내 문구 표시 시간(useAppSession.js 4초)과 같게

/**
 * 여기서 뒤로가면 앱이 닫히는 자리인가 — 설치 앱 + 홈 + 이번 접속의 첫 기록(라우터 idx 0).
 * @param {{ standalone: boolean, pathname: string, idx: unknown }} where
 */
export function isExitEdge({ standalone, pathname, idx }) {
  return standalone && pathname === '/app' && idx === 0
}

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
  } catch {
    return false
  }
}

function historyIdx() {
  const state = window.history.state
  return state && typeof state === 'object' ? Reflect.get(state, 'idx') : undefined
}

/**
 * @param {((message: string) => void) | undefined} showToast
 * @param {number} [windowMs] 테스트용으로만 바꿈
 */
export default function useBackToExit(showToast, windowMs = EXIT_WINDOW_MS) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigate()
  const armedRef = useRef(false)

  useEffect(() => {
    if (!isExitEdge({ standalone: isStandalone(), pathname: location.pathname, idx: historyIdx() })) return undefined
    const guard = () => {
      armedRef.current = true
      navigate({ pathname: location.pathname, search: location.search }, { state: { exitGuard: true } })
    }
    if (navigationType === 'POP' && armedRef.current) {
      armedRef.current = false
      showToast?.(EXIT_HINT)
      const timer = setTimeout(guard, windowMs)
      return () => clearTimeout(timer)
    }
    guard()
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록(location.key)이 바뀔 때만 판단
  }, [location.key])
}
