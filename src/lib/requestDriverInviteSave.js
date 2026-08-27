// Step 0-4 감사 보완 4차(+재작업): directMutationActions.js에서 분리(200줄 제한) —
// 기사 초대 생성/수정만 따로 둔다. 삭제/상태변경보다 로직이 많다: 배정 정보가
// 아직 없는 경우의 로컬 전용 저장(사용자 지시 2번), 이미 동기화된 차량이면 커밋
// *전에* 확정적으로 겹침을 판정하는 것(사용자 지시 3번), 응답 유실 재시도를 위한
// idempotency 사전 확인(사용자 지시 8번)까지 이 파일 하나에 모은다.
import { readJsonKey } from '../store/persist.js'
import { assertCloudWriteReady, getSessionEpoch } from './cloudSession.js'
import { buildMutationOp } from './mutationOutbox.js'
import { commitLocalOnly, commitWithOutboxAndFlush } from './outboxCommit.js'
import { findExistingDriverLinkInsert, findOverlappingDriverLinkOnSupabase } from './directMutations.js'

/**
 * 차량이 이미 클라우드에 동기화돼 있으면, 겹침은 나중에 재시도하면 풀릴 수도 있는
 * 문제가 아니라 확정된 validation 실패다 — 커밋 전에 여기서 먼저 판정해서 로컬/
 * outbox에 아무 것도 남기지 않는다. idempotency 조회도 여기서 먼저 해본다 —
 * "저장" 버튼을 다시 눌렀을 때도 응답 유실 재시도와 같은 안전성을 갖는다.
 * @returns {Promise<string|null>} 확정 실패 메시지, 문제 없으면 null.
 */
async function checkDriverAssignmentConflict(car, driver) {
  if (!driver.supabaseId) {
    const ownPrior = await findExistingDriverLinkInsert(car.supabaseId, driver.startDate, driver.inviteCode)
    if (ownPrior) return null // 이미 내가 성공시킨 삽입 — outbox 실행기가 그대로 재사용한다.
  }
  const conflict = await findOverlappingDriverLinkOnSupabase(car.supabaseId, driver.startDate, driver.endDate, driver.supabaseId || null)
  return conflict ? '같은 차량에 이미 겹치는 기간으로 연결되어 있거나 초대된 기록이 있습니다.' : null
}

export async function requestDriverInviteSave({ ownerKey, userId, items, editingId, cars }) {
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

  let blocked = null
  try { assertCloudWriteReady() } catch (error) { blocked = error.message }
  if (blocked) return { items, blocked, toast: blocked }

  const car = (cars || []).find((item) => item.number === driver.vehicleNumber)
  if (car?.supabaseId) {
    let conflictMessage
    try {
      conflictMessage = await checkDriverAssignmentConflict(car, driver)
    } catch (checkError) {
      console.error('[requestDriverInviteSave] 겹침 확인 실패:', checkError)
      const message = '겹침 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.'
      return { items, blocked: message, toast: message }
    }
    if (conflictMessage) return { items, blocked: conflictMessage, toast: conflictMessage }
  }

  const op = buildMutationOp({
    ownerKey, userId, resourceType: 'driverLink', resourceId: driver.id, operation: 'upsert',
    payload: {
      supabaseId: driver.supabaseId || null, vehicleNumber: driver.vehicleNumber,
      startDate: driver.startDate, endDate: driver.endDate, inviteCode: driver.inviteCode,
    },
    sessionEpoch: getSessionEpoch(),
  })
  const { succeeded, toast, storageFailed } = await commitWithOutboxAndFlush({
    domain: 'drivers', ownerKey, domainValue: items, op,
    successToast: editingId ? '기사 할당 정보를 수정했습니다.' : '기사 초대를 저장했습니다.',
    pendingToast: '기사 초대 저장 요청을 기록했습니다. 연결이 복구되면 자동으로 반영됩니다.',
  })
  if (storageFailed) return { items, blocked: null, toast }
  // 성공했다면 outboxFlush.reconcileDriverAfterUpsertAndRemoveOp이 서버 확정값(실제
  // supabaseId, 충돌 시 재발급된 inviteCode 등)을 이미 localStorage에 되반영해 뒀다 —
  // 그 최종값을 다시 읽어 돌려준다.
  const finalItems = succeeded ? readJsonKey('drivers', ownerKey, items) : items
  return { items: finalItems, blocked: null, toast }
}
