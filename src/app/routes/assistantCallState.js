// @ts-check
// 주소 상태로 넘어온 운비서 운행(로드맵 24-B-2) — 칸마다 모양을 보고, 이상한 칸은 빈 칸으로.

const TEXT_MAX = 100

/** @typedef {{ loadLoc: string, unloadLoc: string, fare: number|null, client: string, cancelOff: boolean }} AssistantCall */

/** @param {object} row @param {string} key */
function textOf(row, key) {
  const value = Reflect.get(row, key)
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > TEXT_MAX ? '' : trimmed
}

/**
 * @param {object|null|undefined} state location.state
 * @returns {AssistantCall|null}
 */
export function readAssistantCall(state) {
  const row = state && typeof state === 'object' ? Reflect.get(state, 'assistantCall') : null
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const fare = Reflect.get(row, 'fare')
  return {
    loadLoc: textOf(row, 'loadLoc'),
    unloadLoc: textOf(row, 'unloadLoc'),
    fare: typeof fare === 'number' && Number.isSafeInteger(fare) && fare >= 0 ? fare : null,
    client: textOf(row, 'client'),
    // 휴무를 끄라는 표시 — 참일 때만 참.
    cancelOff: Reflect.get(row, 'cancelOff') === true,
  }
}
