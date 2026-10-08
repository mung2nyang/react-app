// @ts-check
// 로드맵 18-B: 안내 문구가 뜰 때 짧은 진동. 진동 기능이 없는 기기(아이폰 브라우저 등)는 아무것도 안 함.
export const BUZZ_MS = 10

/** @param {{ vibrate?: (pattern: number) => boolean } | undefined} [nav] 테스트용으로만 바꿈 */
export function buzz(nav = globalThis.navigator) {
  try {
    if (nav && typeof nav.vibrate === 'function') nav.vibrate(BUZZ_MS)
  } catch {
    // 진동을 막은 브라우저 — 조용히 넘어감
  }
}
