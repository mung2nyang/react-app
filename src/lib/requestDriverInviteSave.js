// @ts-check
// Step 0-4 감사 보완 4차(+재작업): directMutationActions.js에서 분리(200줄 제한) —
// 기사 초대 생성/수정만 따로 둔다. 삭제/상태변경보다 로직이 많다: 배정 정보가
// 아직 없는 경우의 로컬 전용 저장(사용자 지시 2번), 이미 동기화된 차량이면 커밋
// *전에* 확정적으로 겹침을 판정하는 것(사용자 지시 3번), 응답 유실 재시도를 위한
// idempotency 사전 확인(사용자 지시 8번)까지 이 파일 하나에 모은다.
//
// 재감사 항목 2: 사전 멱등성/겹침 조회를 시작하기 *전에* session을 캡처해 두고,
// 그 안의 모든 await 직후 + 로컬+outbox 커밋을 시작하기 직전에 epoch를 재검증한다.
// 조회 대기 중에 로그아웃하면(세션이 바뀌면) 이후 아무 로컬/원격 부작용도 남기지
// 않고 조용히 중단한다.
/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('./outboxTypes.js').CarRecord} CarRecord */
/** @typedef {import('./outboxTypes.js').SessionCapture} SessionCapture */
import { readJsonKey } from '../store/persist.js'
import { assertCloudWriteReady, assertSessionStillCurrent, captureSession, getSessionEpoch } from './cloudSession.js'
import { buildMutationOp, OUTBOX_RESULT } from './mutationOutbox.js'
import { commitLocalOnly, commitWithOutboxAndFlush } from './outboxCommit.js'
import { findExistingDriverLinkInsert, findOverlappingDriverLinkOnSupabase } from './directMutations.js'
import { StaleSessionError } from './outboxErrors.js'

const SESSION_CHANGED_MESSAGE = '세션이 바뀌어 저장을 중단했습니다. 다시 로그인한 뒤 시도해 주세요.'

/**
 * 차량이 이미 클라우드에 동기화돼 있으면, 겹침은 나중에 재시도하면 풀릴 수도 있는
 * 문제가 아니라 확정된 validation 실패다 — 커밋 전에 여기서 먼저 판정해서 로컬/
 * outbox에 아무 것도 남기지 않는다. idempotency 조회도 여기서 먼저 해본다 —
 * "저장" 버튼을 다시 눌렀을 때도 응답 유실 재시도와 같은 안전성을 갖는다.
 * @param {number|string} carSupabaseId 호출부가 이미 확정을 확인한 뒤에만 부른다.
 * @param {DriverRecord} driver
 * @param {SessionCapture} captured 조회 시작 전에 캡처한 세션 — 각 await 직후 재검증한다.
 * @returns {Promise<string|null>} 확정 실패 메시지, 문제 없으면 null.
 */
async function checkDriverAssignmentConflict(carSupabaseId, driver, captured) {
  if (!driver.supabaseId) {
    const ownPrior = await findExistingDriverLinkInsert(carSupabaseId, driver.startDate ?? '', driver.inviteCode ?? '')
    assertSessionStillCurrent(captured)
    if (ownPrior) return null // 이미 내가 성공시킨 삽입 — outbox 실행기가 그대로 재사용한다.
  }
  const conflict = await findOverlappingDriverLinkOnSupabase(carSupabaseId, driver.startDate ?? '', driver.endDate ?? '', driver.supabaseId || null)
  assertSessionStillCurrent(captured)
  return conflict ? '같은 차량에 이미 겹치는 기간으로 연결되어 있거나 초대된 기록이 있습니다.' : null
}

/**
 * @param {{ ownerKey: string, userId: string, items: Array<DriverRecord>, editingId: string|null,
 *   cars: Array<CarRecord>|undefined, previousItems: Array<DriverRecord>|undefined }} params
 */
export async function requestDriverInviteSave({ ownerKey, userId, items, editingId, cars, previousItems }) {
  const idx = items.findIndex((item) => item.id === editingId) >= 0
    ? items.findIndex((item) => item.id === editingId)
    : items.length - 1
  const driver = items[idx]
  if (!driver?.vehicleNumber || !driver.startDate) {
    // 사용자 지시 2번: 차량/기간이 아직 안 정해졌어도 이름·연락처 같은 로컬 편집은
    // 게스트(그리고 예전 saveDriverInviteToCloud)와 동일하게 항상 저장하고, 같은
    // 성공 토스트를 보여준다 — 클라우드 시도만 건너뛴다.
    const successToast = editingId ? '초대를 수정했습니다.' : '초대를 저장했습니다.'
    const { value, toast, failed } = commitLocalOnly({ domain: 'drivers', ownerKey, value: items, successToast })
    return { items: failed ? items : value, blocked: null, toast }
  }

  /** @type {string|null} */
  let blocked = null
  try { assertCloudWriteReady() } catch (error) { blocked = error instanceof Error ? error.message : String(error) }
  if (blocked) return { items, blocked, toast: blocked }

  // 재감사 2번: 사전 조회를 시작하기 전에 세션을 캡처한다 — 이 캡처 이후 조회
  // 도중이든 커밋 직전이든 세션이 바뀌면 전부 이 하나의 기준으로 판정한다.
  const captured = captureSession()

  const car = (cars || []).find((item) => item.number === driver.vehicleNumber)
  if (car && car.supabaseId) {
    /** @type {string|null} */
    let conflictMessage
    try {
      conflictMessage = await checkDriverAssignmentConflict(car.supabaseId, driver, captured)
    } catch (checkError) {
      if (checkError instanceof StaleSessionError) {
        // 조회 대기 중 로그아웃 — 로컬/outbox/원격 호출 전부 손대지 않고 멈춘다.
        return { items, blocked: null, toast: SESSION_CHANGED_MESSAGE }
      }
      console.error('[requestDriverInviteSave] 겹침 확인 실패:', checkError)
      const message = '겹침 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.'
      return { items, blocked: message, toast: message }
    }
    if (conflictMessage) return { items, blocked: conflictMessage, toast: conflictMessage }
  }

  // 재감사 2번: 겹침 확인이 끝난 뒤에도, 로컬+outbox 커밋을 시작하기 직전에 한 번
  // 더 재검증한다 — 그 사이(동기 코드 구간이라 하더라도) 세션이 바뀌었으면 이번
  // 저장 시도는 존재한 적 없는 것처럼 아무것도 반영하지 않는다.
  try {
    assertSessionStillCurrent(captured)
  } catch (staleError) {
    if (staleError instanceof StaleSessionError) return { items, blocked: null, toast: SESSION_CHANGED_MESSAGE }
    throw staleError
  }

  // 4차 재작업(사용자 지시 1번): 이 op이 나중에(비동기 flush 도중) 확정 실패로
  // 판정되면, 낙관적으로 반영한 이 driver 항목을 원래대로 되돌려야 한다. 신규
  // 초대 생성이면 원래 배열에 이 항목이 없었으므로 null(=제거가 롤백), 기존 기사
  // 수정이면 수정 전 스냅샷을 그대로 넣어 둔다 — outboxRollback.js가 이 값을 쓴다.
  const previousDriverSnapshot = (previousItems || []).find((item) => item.id === driver.id) || null
  const op = buildMutationOp({
    ownerKey, userId, resourceType: 'driverLink', resourceId: driver.id, operation: 'upsert',
    payload: {
      supabaseId: driver.supabaseId || null, vehicleNumber: driver.vehicleNumber,
      startDate: driver.startDate, endDate: driver.endDate, inviteCode: driver.inviteCode,
      previousDriverSnapshot,
    },
    sessionEpoch: getSessionEpoch(),
  })
  const { status, toast, storageFailed } = await commitWithOutboxAndFlush({
    domain: 'drivers', ownerKey, domainValue: items, op,
    successToast: editingId ? '기사 할당 정보를 수정했습니다.' : '기사 초대를 저장했습니다.',
    pendingToast: '기사 초대 저장 요청을 기록했습니다. 연결이 복구되면 자동으로 반영됩니다.',
  })
  if (storageFailed) return { items, blocked: null, toast }
  // 성공(서버 확정값 되반영) 또는 확정 실패(낙관적 값 롤백) 둘 다 outboxFlush가
  // 이미 localStorage를 원자적으로 갱신해 뒀다 — 그 최종값을 다시 읽어 돌려준다.
  // retryable/staleSession은 아무것도 안 바뀌었으니 원래 items를 그대로 쓴다.
  const reread = status === OUTBOX_RESULT.SUCCESS || status === OUTBOX_RESULT.PERMANENT_FAILURE
  const finalItems = reread ? readJsonKey('drivers', ownerKey, items) : items
  return { items: finalItems, blocked: null, toast }
}
