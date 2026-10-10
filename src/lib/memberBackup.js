// @ts-check
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// 회원 데이터 다운로드(B-1): 비회원 백업(guestBackup.js)과 같은 파일 모양을 Store(서버에서 불러온 정본)에서 만들고 일상점검표를 더한다.
// 회원 업무 기록은 기기에 저장하지 않으므로(batchWrites.js CLOUD_MEMORY_ONLY_DOMAINS) localStorage가 아니라 Store에서 읽는다.
import {
  readOwnerCars,
  readOwnerClients,
  readOwnerDrivers,
  readOwnerExpenses,
  readOwnerInvoices,
  readOwnerProfile,
  readOwnerSettings,
  readOwnerWorkDataByLogId,
} from '../store/ownerDataHooks.js'
import { getCloudOwnerKey, isHydrationReady } from './cloudSession.js'
import { fetchVehiclesDailyInspections } from './dailyInspections.js'

/**
 * 서버에서 다 불러오기 전엔 빈 파일이 나가지 않게 막는다.
 * @param {string} ownerKey
 * @returns {string|null} 막는 이유(없으면 null)
 */
export function memberBackupBlockedReason(ownerKey) {
  if (!ownerKey || getCloudOwnerKey() !== ownerKey || !isHydrationReady()) {
    return '기록을 아직 불러오는 중입니다. 잠시 후 다시 시도해 주세요.'
  }
  return null
}

/**
 * @param {string} ownerKey 로그인한 차주·개인 회원 id
 * @returns {Promise<Record<string, JsonValue>>}
 */
export async function buildMemberBackupData(ownerKey) {
  const cars = readOwnerCars(ownerKey)
  const workLogs = readOwnerWorkDataByLogId(ownerKey)
  const vehicleIds = cars.map((car) => car?.supabaseId).filter((id) => id != null && id !== '')
  const byVehicleId = await fetchVehiclesDailyInspections(/** @type {Array<string|number>} */ (vehicleIds))
  /** @type {Record<string, JsonValue>} */
  const dailyInspections = {}
  for (const car of cars) {
    const id = car?.supabaseId
    if (id == null || !byVehicleId[String(id)]) continue
    dailyInspections[car.type === 'sub' && car.number ? car.number : 'main'] = byVehicleId[String(id)]
  }
  return {
    backupType: 'react_practice_backup',
    version: 1,
    createdAt: new Date().toISOString(),
    cars,
    clients: readOwnerClients(ownerKey),
    settings: readOwnerSettings(ownerKey),
    expenses: readOwnerExpenses(ownerKey),
    invoices: readOwnerInvoices(ownerKey),
    drivers: readOwnerDrivers(ownerKey),
    profile: readOwnerProfile(ownerKey),
    workData: workLogs.main || {},
    workLogs,
    dailyInspections,
  }
}
