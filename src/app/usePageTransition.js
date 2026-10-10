// @ts-check
// 화면이 바뀔 때 겉 상자에 들어옴 효과(들어감·뒤로·탭)를 다시 건다. 화면은 새로 만들지 않아 작성 중 상태는 그대로.
import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/** @typedef {'forward' | 'back' | 'fade' | 'none'} PageTransition */
/** @typedef {{ pathname: string, tab: boolean }} PageSpot */

const TAB_PATHS = new Set(['/app', '/app/calendar', '/app/revenue', '/app/me'])
const ENTER_CLASSES = ['page-enter-forward', 'page-enter-back', 'page-enter-fade']

/**
 * 하단 탭 화면인가 — 홈·운행(달력)·매출·마이페이지.
 * @param {string} pathname
 */
export function isTabSpot(pathname) {
  return TAB_PATHS.has(pathname)
}

/**
 * 어떤 효과를 걸지 — 첫 진입·같은 주소(보던 달만 바뀜, 17번 붙잡기 기록)는 없음, 탭끼리는 서서히, 그 외 들어감/뒤로.
 * @param {{ prev: PageSpot | null, next: PageSpot, navigationType: string }} move
 * @returns {PageTransition}
 */
export function decidePageTransition({ prev, next, navigationType }) {
  if (!prev || prev.pathname === next.pathname) return 'none'
  if (prev.tab && next.tab) return 'fade'
  if (navigationType === 'POP') return 'back'
  if (navigationType === 'PUSH') return 'forward'
  return 'fade'
}

/** @returns {import('react').RefObject<HTMLDivElement | null>} 효과를 걸 겉 상자 */
export default function usePageTransition() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const boxRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const prevRef = useRef(/** @type {PageSpot | null} */ (null))

  useLayoutEffect(() => {
    const next = { pathname: location.pathname, tab: isTabSpot(location.pathname) }
    const kind = decidePageTransition({ prev: prevRef.current, next, navigationType })
    prevRef.current = next
    const box = boxRef.current
    if (!box || kind === 'none') return // 동작 줄이기 설정이면 CSS가 밀림 없이 서서히만 보여줌
    box.classList.remove(...ENTER_CLASSES)
    void box.offsetWidth // 같은 효과를 연달아 걸 때도 처음부터 다시 돌게
    box.classList.add(`page-enter-${kind}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록(location.key)이 바뀔 때만 판단
  }, [location.key])

  // 효과가 끝나면 이름을 떼서 가로 넘침 막기(app-shell-base.css)도 같이 풀리게. 안쪽 요소의 효과 끝남은 무시.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return undefined
    /** @param {AnimationEvent} event */
    const done = (event) => { if (event.target === box) box.classList.remove(...ENTER_CLASSES) }
    box.addEventListener('animationend', done)
    box.addEventListener('animationcancel', done)
    return () => {
      box.removeEventListener('animationend', done)
      box.removeEventListener('animationcancel', done)
    }
  }, [])

  return boxRef
}
