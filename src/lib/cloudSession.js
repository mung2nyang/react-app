// @ts-check
// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — 로그인 세션/세대(epoch) 상태와
// 그 상태를 근거로 한 판정 함수들만 모은다. hydrate.js/outboxFlush.js/
// directMutationActions.js가 전부 이 모듈의 getSessionEpoch()로 "내가 시작했을 때와
// 지금이 같은 세션인지"를 재확인한다(사용자 지시 11번 — async 세대/세션 무효화 규칙).
/** @typedef {import('./outboxTypes.js').SessionCapture} SessionCapture */
/** @typedef {import('./outboxTypes.js').AppSession} AppSession */
import { getState, setHydration } from '../store/app-store.js'
import { evict } from './singleFlight.js'
import { StaleSessionError } from './outboxErrors.js'

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
// 로그인/로그아웃/재로그인/새 hydrate 시작마다 올라가는 세대(epoch) 카운터. hydrate뿐
// 아니라 outbox flush도 이 같은 카운터로 "내가 캡처했던 세션이 지금도 최신인가"를
// 재검증한다 — 두 기능이 별도 카운터를 쓰면 한쪽만 무효화되는 사고가 날 수 있어서
// 하나로 통일했다.
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
 * 4차 재작업(사용자 지시 2/3번) — 다단계 원격 작업(차량/거래처 삭제의 자식 테이블
 * 순차 삭제, 기사 upsert의 syncVehicles→upsert 순서) 중간의 매 await 직후 여기를
 * 부른다. 세션이 바뀌었으면 이 에러를 던져 남은 단계를 실행하지 않는다 —
 * outboxFlush.js/syncQueue.js가 `instanceof StaleSessionError`로 이 에러를 구분해
 * op을 그대로 보존한다(permanent 실패처럼 제거하지도, 그냥 콘솔만 찍고 재시도
 * 남기지도 않는다). 재감사 3번: `.staleSession` 표시 + 캐스팅 대신 전용 클래스를 쓴다.
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
 * 로그아웃. 커밋 전 자체 교차검증(2차)에서 발견: 세대를 안 올리면 로그아웃 시점에
 * 아직 응답을 기다리던 이전 계정의 hydrate/outbox flush가 로그아웃 *이후*에 끝나도
 * "최신 세대"로 통과해 로그아웃한 계정의 데이터를 store/localStorage에 다시 반영할
 * 수 있었다.
 *
 * 감사 보완 4차 재작업(사용자 지시 6번): 세대만 올리는 걸로는 부족했다 — 로그아웃
 * 시점에 같은 owner의 hydrate가 아직 singleFlight에 걸려 있는 채였다면, 바로 이어지는
 * 재로그인(같은 owner)의 hydrateFromSupabase 호출이 그 오래된 in-flight Promise에
 * "합류"해서 새 factory를 아예 실행하지 않았다 — 그 결과 재로그인의 hydrate가 세대
 * 불일치로 조용히 버려지고, status는 영영 'ready'가 되지 못한 채 멈췄다. 로그아웃
 * 시점에 그 owner의 singleFlight 항목을 강제로 지워서, 재로그인이 항상 진짜 새
 * hydrate를 시작하게 한다.
 */
export function endCloudSession() {
  const outgoingOwnerKey = cloudOwnerKey
  cloudUserId = null
  cloudOwnerKey = null
  sessionEpoch += 1
  setHydration({ status: 'idle', userId: null, ownerKey: null })
  if (outgoingOwnerKey) evict(hydrateSingleFlightKey(outgoingOwnerKey))
}

/**
 * queueSync/scheduleCloudSync/outboxFlush 큐를 거치지 않고 UI에서 직접 부르는 Supabase
 * mutation이 공통으로 거치는 관문. hydrate가 ready가 아니면(아직 안 됐거나 실패했으면)
 * 던진다.
 */
export function assertCloudWriteReady() {
  if (!cloudUserId || !cloudOwnerKey) throw new Error('로그인이 필요합니다.')
  if (!isHydrationReady()) throw new Error('클라우드 동기화가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.')
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
