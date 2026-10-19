// @ts-check
// 열린 일지의 "저장할 게 남았나"·"지금 저장" — 메모리에만 두고, 새로고침·앱 닫기 확인과 숨김 때 바로 저장에 쓴다.

/** @typedef {{ isBusy: () => boolean, flush: () => void, released: boolean }} DayDraftEntry */

/** @type {Map<symbol, DayDraftEntry>} */
const entries = new Map()
let listening = false

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flushDayDrafts()
}

function listenOnce() {
  if (listening || typeof window === 'undefined' || typeof document === 'undefined') return
  listening = true
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', flushDayDrafts)
}

/**
 * @param {() => boolean} isBusy 저장 대기(타이머) 또는 서버 저장 중이면 true
 * @param {() => void} flush 기다리던 저장을 지금 시작한다
 * @returns {symbol}
 */
export function registerDayDraft(isBusy, flush) {
  listenOnce()
  const token = Symbol('dayDraft')
  entries.set(token, { isBusy, flush, released: false })
  return token
}

/** 화면이 닫혔다 — 저장이 남았으면 끝날 때(pruneDayDraft)까지 목록에 둔다. @param {symbol} token */
export function releaseDayDraft(token) {
  const entry = entries.get(token)
  if (!entry) return
  entry.released = true
  pruneDayDraft(token)
}

/** @param {symbol} token */
export function pruneDayDraft(token) {
  const entry = entries.get(token)
  if (entry?.released && !entry.isBusy()) entries.delete(token)
}

export function flushDayDrafts() {
  for (const entry of [...entries.values()]) {
    if (entry.isBusy()) entry.flush()
  }
}

export function hasBusyDayDraft() {
  return [...entries.values()].some((entry) => entry.isBusy())
}
