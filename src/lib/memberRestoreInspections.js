// @ts-check
// 회원 데이터 불러오기(22-C): 파일의 일상점검표 중 서버에 없는 날짜만 더한다.
// 점검표는 Store에 없고 저장이 "차량+날짜 덮어쓰기"라, 고르기 전에 서버에 있는 날짜를 먼저 읽는다.
// 점검자 이름·조치 기록은 파일 그대로(그날 점검한 사람 기록), 점검 항목은 기존 정리 규칙으로 거른다.
import { readOwnerCars } from '../store/ownerDataHooks.js'
import { isPlainObject } from '../store/persistDomainRecords.js'
import { isValidCalendarDateKey } from '../domain/dateKey.js'
import { sanitizeInspectionItems } from '../domain/dailyInspectionItems.js'
import { fetchVehiclesDailyInspections, saveDailyInspection } from './dailyInspections.js'
import { isOwnUnlinkedCar } from './memberRestoreRecords.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('./dailyInspections.js').DailyInspection} DailyInspection */
/** @typedef {DailyInspection & { vehicleId: string|number, workDate: string }} InspectionPick */

const INVALID_FILE = '파일 내용이 올바르지 않습니다.'
const FETCH_FAIL = '점검표를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const SAVE_FAIL = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

/**
 * 파일의 점검표를 차량 칸(main·서브 번호) → 날짜별로 꺼낸다. 칸이 없으면 빈 값, 하나라도 틀리면 null.
 * @param {JsonValue} parsed
 * @returns {Record<string, Record<string, DailyInspection>>|null}
 */
function readFileInspections(parsed) {
  if (!isPlainObject(parsed) || !('dailyInspections' in parsed)) return {}
  const byPlate = parsed.dailyInspections
  if (!isPlainObject(byPlate)) return null
  /** @type {Record<string, Record<string, DailyInspection>>} */
  const out = {}
  for (const [plate, byDate] of Object.entries(byPlate)) {
    if (!isPlainObject(byDate)) return null
    /** @type {Record<string, DailyInspection>} */
    const days = {}
    for (const [workDate, row] of Object.entries(byDate)) {
      if (!isValidCalendarDateKey(workDate) || !isPlainObject(row) || !isPlainObject(row.items)) return null
      if (typeof row.actionNote !== 'string' || typeof row.inspectorName !== 'string') return null
      days[workDate] = { items: sanitizeInspectionItems(row.items), actionNote: row.actionNote, inspectorName: row.inspectorName }
    }
    out[plate] = days
  }
  return out
}

/** @param {string} ownerKey @param {string} plate @returns {string|number|null} */
function vehicleIdFor(ownerKey, plate) {
  if (!isOwnUnlinkedCar(ownerKey, plate)) return null
  const cars = readOwnerCars(ownerKey)
  const car = plate === 'main'
    ? cars.find((item) => item.type === 'main')
    : cars.find((item) => String(item.number || '').trim() === plate)
  return car?.supabaseId ?? null
}

/**
 * 서버에 없는 날짜의 점검표만 고른다(저장 안 함).
 * @param {string} ownerKey @param {JsonValue} parsed
 * @returns {Promise<{ ok: true, picks: InspectionPick[], skipped: number } | { ok: false, error: string }>}
 */
export async function pickInspections(ownerKey, parsed) {
  const fileInspections = readFileInspections(parsed)
  if (!fileInspections) return { ok: false, error: INVALID_FILE }
  /** @type {Array<{ vehicleId: string|number, days: Record<string, DailyInspection> }>} */
  const targets = []
  let skipped = 0
  for (const [plate, days] of Object.entries(fileInspections)) {
    if (Object.keys(days).length === 0) continue
    const vehicleId = vehicleIdFor(ownerKey, plate)
    if (vehicleId == null) skipped += 1
    else targets.push({ vehicleId, days })
  }
  if (targets.length === 0) return { ok: true, picks: [], skipped }
  /** @type {Record<string, Record<string, DailyInspection>>} */
  let existing
  try {
    existing = await fetchVehiclesDailyInspections(targets.map((target) => target.vehicleId))
  } catch (error) {
    console.error('[memberRestoreInspections] 점검표 확인 실패:', error)
    return { ok: false, error: FETCH_FAIL }
  }
  /** @type {InspectionPick[]} */
  const picks = []
  for (const { vehicleId, days } of targets) {
    const onServer = existing[String(vehicleId)] || {}
    for (const workDate of Object.keys(days).sort()) {
      if (!onServer[workDate]) picks.push({ vehicleId, workDate, ...days[workDate] })
    }
  }
  return { ok: true, picks, skipped }
}

/**
 * 고른 점검표를 날짜마다 저장한다. 하나라도 실패하면 거기서 멈춘다.
 * @param {InspectionPick[]} picks
 * @returns {Promise<{ ok: boolean, count: number, toast: string|null }>}
 */
export async function restoreInspections(picks) {
  let count = 0
  for (const pick of picks) {
    try {
      await saveDailyInspection(pick)
    } catch (error) {
      console.error('[memberRestoreInspections] 점검표 불러오기 실패:', error)
      return { ok: false, count, toast: SAVE_FAIL }
    }
    count += 1
  }
  return { ok: true, count, toast: null }
}
