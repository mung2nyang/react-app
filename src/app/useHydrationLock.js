// hydrate(서버 데이터 불러오기) 중에는 설정류 입력을 막는다 — 그 사이 편집하면 불러온 값을 빈 값으로 덮는다.
// 'hydrating'일 때만 잠그고, 'failed'는 로컬 편집을 계속 허용한다.
import { useEffect, useState } from 'react'
import { getState, subscribe } from '../store/app-store.js'

/**
 * @returns {boolean} true면 편집 잠금 — 게스트/로그인 전/일반 상태의 기본값은 항상 false.
 */
export function useHydrationLock() {
  // 초기값은 렌더 중에 store에서 직접 구해 온다 — 마운트 직후 setState를 한 번 더
  // 부르지 않기 위해서다(oxlint react(set-state-in-effect)). 이후 변화는 구독으로만 받는다.
  const [locked, setLocked] = useState(() => getState().hydration.status === 'hydrating')

  useEffect(() => subscribe((state) => setLocked(state.hydration.status === 'hydrating')), [])

  return locked
}
