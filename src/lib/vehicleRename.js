// @ts-check
// 기사 차량 번호를 바꾸면 그 번호에 묶인 일지·지출·전용 거래처·기사 연결·차량 설정을 새 번호로 함께 옮긴다.
// 서버는 rename_sub_vehicle(DB 0022) 한 번으로 차량 번호·전용 거래처·설정 키를 같이 바꾼다.
import { supabase } from '../data/cloud/supabaseClient.js'
import { getState } from '../data/store/app-store.js'
import { readLogWorkData, storageKeyForLog } from '../data/store/persist.js'
import { assertSessionStillCurrent } from '../data/cloud/cloudSession.js'
import { planPendingLogMove } from './logPendingLifecycle.js'

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../data/store/app-store.js').BatchEntry} BatchEntry */

/** @param {Record<string, DayRecordLike>|undefined} data */
function hasDates(data) {
  return !!(data && typeof data === 'object' && Object.keys(data).length)
}

/**
 * @param {string} ownerKey
 * @param {string} oldNumber
 * @param {string} newNumber
 * @returns {{ error: string } | { extraWrites: Array<import('../data/store/atomicPersist.js').KeyedWrite>, nextLogs: Record<string, Record<string, DayRecordLike>>, afterPersist: () => void }}
 */
export function planSubLogRename(ownerKey, oldNumber, newNumber) {
  const fromRead = readLogWorkData(ownerKey, oldNumber)
  const toRead = readLogWorkData(ownerKey, newNumber)
  if (!fromRead.ok || !toRead.ok) {
    return { error: '운행 기록을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.' }
  }
  const pending = planPendingLogMove(ownerKey, oldNumber, newNumber)
  if ('error' in pending) return pending
  const fromStore = getState().workLogs[ownerKey]?.[oldNumber]
  const toStore = getState().workLogs[ownerKey]?.[newNumber]
  const fromData = hasDates(fromStore) ? fromStore : fromRead.value
  const toData = hasDates(toStore) ? toStore : toRead.value
  if (hasDates(fromData) && hasDates(toData)) {
    return { error: '이미 그 번호의 운행 기록이 있습니다.' }
  }
  const moved = hasDates(fromData) ? fromData : (hasDates(toData) ? toData : {})
  const prev = getState().workLogs[ownerKey] || {}
  const nextLogs = { ...prev, [newNumber]: moved }
  delete nextLogs[oldNumber]
  const jsonMoved = /** @type {import('../data/store/atomicPersist.js').JsonValue} */ (moved)
  return {
    extraWrites: [
      { key: storageKeyForLog(ownerKey, newNumber), value: jsonMoved },
      { key: storageKeyForLog(ownerKey, oldNumber), remove: true },
      ...pending.extraWrites,
    ],
    nextLogs,
    afterPersist: pending.afterPersist,
  }
}

/** @param {string|undefined} value */
function plate(value) {
  return String(value || '').trim()
}

/**
 * 옛 번호를 가리키는 지출·전용 거래처·기사 연결·차량 설정을 새 번호로 바꾼 commitBatch 항목(바뀐 도메인만).
 * @param {string} ownerKey @param {string} oldNumber @param {string} newNumber
 * @returns {Array<BatchEntry>}
 */
export function planRenamedPlateEntries(ownerKey, oldNumber, newNumber) {
  const state = getState()
  /** @type {Array<BatchEntry>} */
  const entries = []
  const expenses = state.expenses[ownerKey] || []
  if (expenses.some((item) => plate(item.vehicleNumber) === oldNumber)) {
    const value = expenses.map((item) => (plate(item.vehicleNumber) === oldNumber ? { ...item, vehicleNumber: newNumber } : item))
    entries.push({ domain: 'expenses', ownerKey, value })
  }
  const clients = state.clients[ownerKey] || []
  if (clients.some((item) => plate(item.scopedToVehicleNumber) === oldNumber)) {
    const value = clients.map((item) => (plate(item.scopedToVehicleNumber) === oldNumber ? { ...item, scopedToVehicleNumber: newNumber } : item))
    entries.push({ domain: 'clients', ownerKey, value })
  }
  const drivers = state.drivers[ownerKey] || []
  if (drivers.some((item) => plate(item.vehicleNumber) === oldNumber)) {
    const value = drivers.map((item) => (plate(item.vehicleNumber) === oldNumber ? { ...item, vehicleNumber: newNumber } : item))
    entries.push({ domain: 'drivers', ownerKey, value })
  }
  const settings = state.settings[ownerKey]
  const carSettings = settings?.subCarSettings?.[oldNumber]
  if (settings && settings.subCarSettings && carSettings) {
    const { [oldNumber]: _old, ...rest } = settings.subCarSettings
    entries.push({ domain: 'settings', ownerKey, value: { ...settings, subCarSettings: { ...rest, [newNumber]: carSettings } } })
  }
  return entries
}

/**
 * 서버 차량 번호·전용 거래처·설정 키를 한 번에 바꾼다(셋 다 되거나 하나도 안 됨).
 * @param {string|number} vehicleSupabaseId @param {string} newNumber
 * @param {import('./outboxTypes.js').SessionCapture} captured
 */
export async function renameSubVehicleOnServer(vehicleSupabaseId, newNumber, captured) {
  const { error } = await supabase.rpc('rename_sub_vehicle', { p_vehicle_id: vehicleSupabaseId, p_new_number: newNumber })
  assertSessionStillCurrent(captured)
  if (error) throw error
}
