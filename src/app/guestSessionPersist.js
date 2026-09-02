// 게스트 "비회원으로 시작" 선택을 새로고침 후에도 복원하기 위한 단일 boolean 영속화.
// durable/fallback/retry 레이어가 아니라 localStorage 플래그 하나만 쓴다.
/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

const GUEST_MODE_STORAGE_KEY = 'reactPracticeGuestMode'

/** @type {AppSession} */
export const GUEST_APP_SESSION = {
  name: '비회원',
  accountType: 'owner_driver',
  guestMode: true,
}

export function isGuestModePersisted() {
  try {
    return localStorage.getItem(GUEST_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** @param {boolean} active */
export function setGuestModePersisted(active) {
  try {
    if (active) localStorage.setItem(GUEST_MODE_STORAGE_KEY, '1')
    else localStorage.removeItem(GUEST_MODE_STORAGE_KEY)
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearGuestModePersisted() {
  setGuestModePersisted(false)
}
