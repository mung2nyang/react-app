// @ts-check
// 아래 메뉴·← 이동이 기록을 쌓지 않게 고른다(로드맵 63). 홈은 처음 기록으로 되감는다.

/** @typedef {{ kind: 'push' } | { kind: 'replace' } | { kind: 'rewind', steps: number }} HistoryMove */

const HOME = '/app'

// 이번 접속의 첫 기록(번호 0)이 홈인가 — 번호 0에 올 때마다 다시 적는다(저장 안 함).
let startedAtHome = false
// 홈 되감기로 돌아온 것인가 — 종료 안내 대신 붙잡기만 다시 쌓게(useBackToExit).
let rewinding = false

/** 라우터가 기록마다 붙이는 번호(이번 접속 첫 기록 0). */
export function historyIdx() {
  const state = window.history.state
  const idx = state && typeof state === 'object' ? Reflect.get(state, 'idx') : undefined
  return typeof idx === 'number' ? idx : undefined
}

/** @param {string} pathname @param {number|undefined} idx */
export function noteLocation(pathname, idx) {
  if (idx === 0) startedAtHome = pathname === HOME
}

/** 홈 되감기 직후 한 번만 true. */
export function takeRewind() {
  const was = rewinding
  rewinding = false
  return was
}

export function markRewind() {
  rewinding = true
}

/**
 * 아래 메뉴·← 로 `to`에 갈 때 기록을 어떻게 할지.
 * @param {{ from: string, to: string, idx: number|undefined, startedAtHome?: boolean }} move
 * @returns {HistoryMove}
 */
export function chooseMove({ from, to, idx, startedAtHome: atHome = startedAtHome }) {
  if (to === HOME) {
    if (from === HOME) return { kind: 'replace' }
    if (atHome && typeof idx === 'number' && idx > 0) return { kind: 'rewind', steps: idx }
    return { kind: 'replace' }
  }
  return from === HOME ? { kind: 'push' } : { kind: 'replace' }
}
