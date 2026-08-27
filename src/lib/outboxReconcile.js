// Step 0-4 감사 보완 4차: hydrate가 서버 병합 결과에 outbox(아직 반영 안 된 로컬 의도)를
// 겹쳐 적용하는 순수 함수들. "서버 삭제가 아직 완료되지 않은 레코드는 hydrate 응답에
// 존재하더라도 활성 tombstone을 적용해 로컬에 부활시키지 마라"(사용자 지시 4번)와
// "pending 상태변경도 hydrate 서버값으로 덮어쓰지 말고 로컬 의도를 다시 적용하라"를
// 구현한다.
import { getPendingMutation, isTombstoned } from './mutationOutbox.js'

export function reconcileCars(ownerKey, mergedCars) {
  return mergedCars.filter((car) => !isTombstoned(ownerKey, 'vehicle', car.supabaseId))
}

export function reconcileClients(ownerKey, mergedClients) {
  return mergedClients.filter((client) => !isTombstoned(ownerKey, 'client', client.supabaseId))
}

function applyPendingDriverMutation(driver, pending) {
  if (pending.operation === 'updateStatus') return { ...driver, status: pending.payload.status }
  if (pending.operation === 'upsert') {
    return {
      ...driver,
      vehicleNumber: pending.payload.vehicleNumber,
      startDate: pending.payload.startDate,
      endDate: pending.payload.endDate,
      inviteCode: pending.payload.inviteCode,
    }
  }
  return driver
}

/**
 * @param {string} ownerKey
 * @param {Array<object>} mergedDrivers 서버 응답과 병합된(=hydrateMerge.mergeDriversFromRows 결과) 목록
 * @param {Array<object>} localDrivers 병합 전 로컬 목록 — 서버에 아직 없는 pending 생성 건을 되찾는 데 쓴다
 */
export function reconcileDrivers(ownerKey, mergedDrivers, localDrivers) {
  const tombstoneFiltered = mergedDrivers.filter((driver) => !isTombstoned(ownerKey, 'driverLink', driver.id))
  const reapplied = tombstoneFiltered.map((driver) => {
    const pending = getPendingMutation(ownerKey, 'driverLink', driver.id)
    return pending ? applyPendingDriverMutation(driver, pending) : driver
  })

  // 서버 병합(mergeDriversFromRows)이 "서버에 아직 없는 로컬 전용 드라이버"를 통째로
  // 떨어뜨릴 수 있다(다른 driver_link가 하나라도 있으면 merged가 로컬 목록을 완전히
  // 대체하므로). pending upsert가 있는데 결과에 없다면 로컬 원본에서 되찾아 온다.
  const presentIds = new Set(reapplied.map((driver) => driver.id))
  const recovered = (localDrivers || []).filter((driver) => {
    if (presentIds.has(driver.id)) return false
    if (isTombstoned(ownerKey, 'driverLink', driver.id)) return false
    return !!getPendingMutation(ownerKey, 'driverLink', driver.id)
  })

  return [...reapplied, ...recovered]
}
