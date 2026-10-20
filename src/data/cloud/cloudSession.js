// @ts-check
// 로그인 세션·세대(epoch) 상태와 그 판정 함수. hydrate·directMutationActions가 getSessionEpoch()로 "시작 때와 같은 세션인지" 재확인한다.
/** @typedef {import('../sync/syncTypes.js').SessionCapture} SessionCapture */
/** @typedef {import('../sync/syncTypes.js').AppSession} AppSession */
import { getState, setHydration } from '../store/app-store.js'
import { evict } from './singleFlight.js'
import { StaleSessionError } from '../sync/saveErrors.js'
import { SESSION_CHANGED_FAIL } from '../../shared/utils/failureMessages.js'

// hydrate.js가 실제로 쓰는 singleFlight 키 형식과 반드시 같아야 한다(문자열 하나를
// 공유하려고 새 모듈을 만들 만큼은 아니라고 판단해 복제했다 — hydrate.js가 이 파일을
// 이미 가져다 쓰므로 반대 방향으로 가져오면 순환 참조가 된다).
/** @param {string} ownerKey */
function hydrateSingleFlightKey(ownerKey) {
  return `hydrate:${ownerKey}`
}

/** @type {string|null} */
let cloudUserId = null
/** @type {string|null} */
let cloudOwnerKey = null
// 로그인/로그아웃/재로그인/새 hydrate 시작마다 올라가는 세대(epoch) 카운터. hydrate와
// 직접 저장이 이 카운터로 "내가 캡처했던 세션이 지금도 최신인가"를 재검증한다.
let sessionEpoch = 0

/** @returns {SessionCapture} */
export function captureSession() {
  return { userId: cloudUserId, ownerKey: cloudOwnerKey, epoch: sessionEpoch }
}

export function getCloudUserId() { return cloudUserId }
export function getCloudOwnerKey() { return cloudOwnerKey }
export function getSessionEpoch() { return sessionEpoch }

/**
 * hydrateFromSupabase가 호출마다 부른다 — 세션을 지정하고 세대를 하나 올린다.
 * @param {string} userId
 * @param {string} ownerKey
 */
export function beginSessionEpoch(userId, ownerKey) {
  cloudUserId = userId
  cloudOwnerKey = ownerKey
  sessionEpoch += 1
  return sessionEpoch
}

/**
 * @param {SessionCapture} captured
 * @returns {boolean} 캡처했던 세션이 지금도 유효한 최신 세션이면 true.
 */
export function isSessionStillCurrent(captured) {
  return (
    captured.epoch === sessionEpoch
    && captured.userId === cloudUserId
    && captured.ownerKey === cloudOwnerKey
    && cloudUserId != null
    && cloudOwnerKey != null
  )
}

/**
 * 다단계 원격 작업 중 매 await 직후 부른다. 세션이 바뀌었으면 StaleSessionError를 던져 남은 단계를 멈춘다.
 * @param {SessionCapture} captured
 */
export function assertSessionStillCurrent(captured) {
  if (!isSessionStillCurrent(captured)) {
    throw new StaleSessionError()
  }
}

export function isHydrationReady() {
  return getState().hydration.status === 'ready'
}

/** @param {AppSession|null|undefined} session */
export function isCloudSession(session) {
  return !!(session?.userId && !session.guestMode)
}

/**
 * 로그아웃. 세대를 올려 이전 계정의 늦게 끝난 hydrate·flush 결과를 버리고, 그 owner의 singleFlight 항목을 지워 재로그인이 옛 요청에 합류하지 않고 새 hydrate를 시작하게 한다.
 */
export function endCloudSession() {
  const outgoingOwnerKey = cloudOwnerKey
  cloudUserId = null
  cloudOwnerKey = null
  sessionEpoch += 1
  setHydration({ status: 'idle', userId: null, ownerKey: null, epoch: 0 })
  if (outgoingOwnerKey) evict(hydrateSingleFlightKey(outgoingOwnerKey))
}

/**
 * UI에서 직접 부르는 Supabase
 * mutation이 공통으로 거치는 관문. hydrate가 ready가 아니면(아직 안 됐거나 실패했으면)
 * 던진다.
 */
export function assertCloudWriteReady() {
  if (!cloudUserId || !cloudOwnerKey) throw new Error('로그인이 필요합니다.')
  if (!isHydrationReady()) throw new Error('아직 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.')
}

/**
 * UI가 로컬 변경을 시작하기 *전에* 동기적으로 부를 수 있는 판정판. cloudId가 없으면
 * (로컬 전용 레코드) 항상 허용(null). cloudId가 있는데 준비 안 됐으면 메시지를
 * 돌려준다(throw 대신 반환값 — 호출부가 조기 리턴하기 쉽게).
 * @param {string|number|null|undefined} cloudId
 * @returns {string|null}
 */
export function blockedReasonForCloudWrite(cloudId) {
  if (!cloudId) return null
  try {
    assertCloudWriteReady()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * 로그인 계정에서 hydrate가 ready가 아니면 거래처/차량 추가·수정·삭제를 막는다.
 * 게스트(cloudUserId 없음)는 로컬만 쓰므로 허용.
 * 로그인이면 액션의 ownerKey/userId가 현재 cloud owner/user/session epoch·hydration과
 * 같아야 한다 — 계정 B ready 상태에서 stale owner A 쓰기를 거부한다.
 * @param {{ ownerKey?: string, userId?: string|null, sessionEpoch?: number }} [expected]
 */
export function blockedReasonForOwnerDataWrite(expected = {}) {
  if (!getCloudUserId()) return null
  try {
    assertCloudWriteReady()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  if (expected.ownerKey && getCloudOwnerKey() !== expected.ownerKey) {
    return SESSION_CHANGED_FAIL
  }
  if (expected.userId && getCloudUserId() !== expected.userId) {
    return SESSION_CHANGED_FAIL
  }
  if (expected.sessionEpoch != null && expected.sessionEpoch !== getSessionEpoch()) {
    return SESSION_CHANGED_FAIL
  }
  const hydration = getState().hydration
  if (expected.ownerKey && hydration.ownerKey && hydration.ownerKey !== expected.ownerKey) {
    return SESSION_CHANGED_FAIL
  }
  if (expected.userId && hydration.userId && hydration.userId !== expected.userId) {
    return SESSION_CHANGED_FAIL
  }
  return null
}
