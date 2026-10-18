// @ts-check
// 기기에서 새로 만드는 기록 번호 — 시각 + 무작위 6자라 같은 1/1000초에 둘을 만들어도 겹치지 않는다(로드맵 77·81).

/**
 * @param {string} prefix
 * @returns {string}
 */
export function generateLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
