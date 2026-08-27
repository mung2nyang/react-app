// Step 0-4 감사 보완 4차(+재작업): 컴포넌트가 부르는 고수준 서비스 함수들 — 사용자
// 지시 6번("JSX 렌더 테스트가 없다면 UI handler의 오케스트레이션을 순수 함수/서비스로
// 추출"). 컴포넌트는 이 함수들만 호출하고, 여기서 readiness 게이트 → 도메인 값+outbox
// 원자적 저장 → 즉시 flush 시도 → 결과 토스트 문구까지 전부 처리한다. 공용 커밋
// 프리미티브(로컬 전용/원자적 outbox 커밋)는 outboxCommit.js로, 기사 초대 생성·수정
// (겹침 확정 판정+idempotency)은 requestDriverInviteSave.js로 뺐다(200줄 제한).
import { removeCar } from '../domain/cars.js'
import { removeClient } from '../domain/clients.js'
import { removeDriver, setDriverStatus } from '../domain/drivers.js'
import { blockedReasonForCloudWrite, getSessionEpoch } from './cloudSession.js'
import { buildMutationOp, buildTombstoneOp } from './mutationOutbox.js'
import { commitLocalOnly, commitWithOutboxAndFlush } from './outboxCommit.js'

export { requestDriverInviteSave } from './requestDriverInviteSave.js'

export async function requestVehicleDeletion({ ownerKey, userId, cars, vehicleId }) {
  const car = cars.find((item) => item.id === vehicleId)
  if (!car) return { cars, blocked: null, toast: null }
  if (!car.supabaseId) {
    const { value, toast, failed } = commitLocalOnly({ domain: 'cars', ownerKey, value: removeCar(cars, vehicleId), successToast: '차량을 삭제했습니다.' })
    return { cars: failed ? cars : value, blocked: null, toast }
  }
  const blocked = blockedReasonForCloudWrite(car.supabaseId)
  if (blocked) return { cars, blocked, toast: blocked }

  const nextCars = removeCar(cars, vehicleId)
  const op = buildTombstoneOp({ ownerKey, userId, resourceType: 'vehicle', resourceId: car.supabaseId, operation: 'delete', sessionEpoch: getSessionEpoch() })
  const { toast, storageFailed } = await commitWithOutboxAndFlush({
    domain: 'cars', ownerKey, domainValue: nextCars, op,
    successToast: '차량을 삭제했습니다.',
    pendingToast: '차량 삭제 요청을 저장했습니다. 연결이 복구되면 자동으로 반영됩니다.',
  })
  return { cars: storageFailed ? cars : nextCars, blocked: null, toast }
}

export async function requestClientDeletion({ ownerKey, userId, clients, clientId }) {
  const client = clients.find((item) => item.id === clientId)
  if (!client) return { clients, blocked: null, toast: null }
  if (!client.supabaseId) {
    const { value, toast, failed } = commitLocalOnly({ domain: 'clients', ownerKey, value: removeClient(clients, clientId), successToast: '거래처를 삭제했습니다.' })
    return { clients: failed ? clients : value, blocked: null, toast }
  }
  const blocked = blockedReasonForCloudWrite(client.supabaseId)
  if (blocked) return { clients, blocked, toast: blocked }

  const nextClients = removeClient(clients, clientId)
  const op = buildTombstoneOp({ ownerKey, userId, resourceType: 'client', resourceId: client.supabaseId, operation: 'delete', sessionEpoch: getSessionEpoch() })
  const { toast, storageFailed } = await commitWithOutboxAndFlush({
    domain: 'clients', ownerKey, domainValue: nextClients, op,
    successToast: '거래처를 삭제했습니다.',
    pendingToast: '거래처 삭제 요청을 저장했습니다. 연결이 복구되면 자동으로 반영됩니다.',
  })
  return { clients: storageFailed ? clients : nextClients, blocked: null, toast }
}

export async function requestDriverStatusChange({ ownerKey, userId, drivers, driverId, status, cloud }) {
  const driver = drivers.find((item) => item.id === driverId)
  const statusToast = status === 'linked' ? '연동 중으로 바꿨습니다.' : '대기 상태로 바꿨습니다.'
  if (!cloud || !driver?.supabaseId) {
    const { value, toast, failed } = commitLocalOnly({ domain: 'drivers', ownerKey, value: setDriverStatus(drivers, driverId, status), successToast: statusToast })
    return { drivers: failed ? drivers : value, blocked: null, toast }
  }
  const blocked = blockedReasonForCloudWrite(driver.supabaseId)
  if (blocked) return { drivers, blocked, toast: blocked }

  const nextDrivers = setDriverStatus(drivers, driverId, status)
  const op = buildMutationOp({
    ownerKey, userId, resourceType: 'driverLink', resourceId: driver.id, operation: 'updateStatus',
    payload: { supabaseId: driver.supabaseId, status }, sessionEpoch: getSessionEpoch(),
  })
  const { toast, storageFailed } = await commitWithOutboxAndFlush({
    domain: 'drivers', ownerKey, domainValue: nextDrivers, op,
    successToast: statusToast,
    pendingToast: '상태변경 요청을 저장했습니다. 연결이 복구되면 자동으로 반영됩니다.',
  })
  return { drivers: storageFailed ? drivers : nextDrivers, blocked: null, toast }
}

export async function requestDriverDeletion({ ownerKey, userId, drivers, driverId, cloud }) {
  const driver = drivers.find((item) => item.id === driverId)
  if (!cloud || !driver?.supabaseId) {
    const { value, toast, failed } = commitLocalOnly({ domain: 'drivers', ownerKey, value: removeDriver(drivers, driverId), successToast: '초대를 삭제했습니다.' })
    return { drivers: failed ? drivers : value, blocked: null, toast }
  }
  const blocked = blockedReasonForCloudWrite(driver.supabaseId)
  if (blocked) return { drivers, blocked, toast: blocked }

  const nextDrivers = removeDriver(drivers, driverId)
  const op = buildTombstoneOp({
    ownerKey, userId, resourceType: 'driverLink', resourceId: driver.id, operation: 'delete',
    payload: { supabaseId: driver.supabaseId }, sessionEpoch: getSessionEpoch(),
  })
  const { toast, storageFailed } = await commitWithOutboxAndFlush({
    domain: 'drivers', ownerKey, domainValue: nextDrivers, op,
    successToast: '초대를 삭제했습니다.',
    pendingToast: '초대 삭제 요청을 저장했습니다. 연결이 복구되면 자동으로 반영됩니다.',
  })
  return { drivers: storageFailed ? drivers : nextDrivers, blocked: null, toast }
}
