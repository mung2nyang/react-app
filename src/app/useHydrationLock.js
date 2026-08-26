// Step 2: 설정류 화면이 hydrate(클라우드 데이터 불러오기) 도중에는 입력을 막게 하는 훅
// (migration-plan.md 2.3 useHydrationLock(), migration-plan.md 3.9). hydrate 전에
// 로컬 편집이 들어가면 방금 불러온 서버 값을 빈 값으로 덮어쓰는 실버그가 재현된다.
//
// Step 0-4 감사 보완: hydration.completed(boolean) 대신 status 상태기계를 구독한다.
// 'hydrating'일 때만 잠근다 — 'failed'는 로컬 편집은 계속 허용하되(기존 fail-open
// 철학) 원격 쓰기만 cloudSync.js가 따로 막는다(dirty queue + 명시적 retry).
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
