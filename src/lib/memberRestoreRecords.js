// @ts-check
// 회원 데이터 불러오기(22-B): 파일의 거래처·지출·세금계산서 중 지금 없는 것만 고르고, 기존 저장 길로 더한다.
// 같은 것 판단: 거래처는 업체명·번호, 지출·계산서는 번호. 내 차량이 아니거나 연동 차량 기록은 건너뛴다.
import { readOwnerCars, readOwnerClients, readOwnerDrivers, readOwnerExpenses, readOwnerInvoices } from '../store/ownerDataHooks.js'
import { isPersistedClient, isPersistedExpense, isPlainObject } from '../store/persistDomainRecords.js'
import { isPersistedInvoice } from '../store/persistDomainInvoice.js'
import { isValidCalendarDateKey } from '../domain/dateKey.js'
import { saveClientsToCloud } from './clientCloudSave.js'
import { getCloudUserId } from './cloudSession.js'
import { saveExpenses } from './expenses.js'
import { saveInvoices } from './invoices.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {{ clients: ClientLike[], expenses: ExpenseItem[], invoices: InvoiceLike[], skippedItems: number }} RecordPicks */

/**
 * 차량 번호('main'이면 메인)가 서버에 있는 내 차량이고 연동 기사가 붙지 않았는지.
 * @param {string} ownerKey @param {string} plate
 */
export function isOwnUnlinkedCar(ownerKey, plate) {
  const cars = readOwnerCars(ownerKey)
  const car = plate === 'main'
    ? cars.find((item) => item.type === 'main')
    : cars.find((item) => String(item.number || '').trim() === plate)
  if (!car || car.supabaseId == null || car.supabaseId === '') return false
  const number = String(car.number || '').trim()
  return !readOwnerDrivers(ownerKey).some((driver) => (
    String(driver?.status || '') !== 'disconnected' && String(driver?.vehicleNumber || '').trim() === number
  ))
}

/** @param {string} name */
function nameKey(name) {
  return String(name || '').trim()
}

/**
 * 파일 칸이 있으면 전부 올바른 모양이어야 한다(하나라도 틀리면 null). 칸이 없으면 빈 목록.
 * @param {JsonValue} parsed @param {string} key @param {(item: JsonValue) => boolean} check
 * @returns {JsonValue[]|null}
 */
function readList(parsed, key, check) {
  if (!isPlainObject(parsed) || !(key in parsed)) return []
  const list = parsed[key]
  if (!Array.isArray(list) || !list.every(check)) return null
  return list
}

/** 회원 지출은 서브 차량 번호(vehicleNumber)를 달고 있어 그 칸만 따로 본다. @param {JsonValue} item */
function isRestorableExpense(item) {
  if (!isPlainObject(item)) return false
  const { vehicleNumber, ...rest } = item
  if (vehicleNumber !== undefined && typeof vehicleNumber !== 'string') return false
  return isPersistedExpense(rest) && isValidCalendarDateKey(String(item.date))
}

/**
 * 지금 없는 것만 더한 거래처 목록(새 것은 옛 서버 번호 지움, 고정노선 연결은 한 곳만).
 * @param {ClientLike[]} current @param {ClientLike[]} picked
 */
function newClientsAgainst(current, picked) {
  const names = new Set(current.map((item) => nameKey(item.companyName)))
  const ids = new Set(current.map((item) => item.id))
  let linkedTaken = current.some((item) => item.fixedRouteLinked)
  /** @type {ClientLike[]} */
  const out = []
  for (const { supabaseId: _old, ...client } of picked) {
    const key = nameKey(client.companyName)
    if (!key || names.has(key) || ids.has(client.id)) continue
    names.add(key)
    ids.add(client.id)
    if (client.fixedRouteLinked && linkedTaken) client.fixedRouteLinked = false
    if (client.fixedRouteLinked) linkedTaken = true
    out.push(client)
  }
  return out
}

/**
 * @template {{ id: string }} T
 * @param {T[]} current @param {T[]} picked
 */
function newById(current, picked) {
  const ids = new Set(current.map((item) => item.id))
  return picked.filter((item) => !ids.has(item.id))
}

/**
 * 파일에서 지금 없는 거래처·지출·계산서를 고른다(저장 안 함). 모양이 틀리면 null.
 * @param {string} ownerKey @param {JsonValue} parsed
 * @returns {RecordPicks|null}
 */
export function pickMemberRecords(ownerKey, parsed) {
  const clients = readList(parsed, 'clients', isPersistedClient)
  const expenses = readList(parsed, 'expenses', isRestorableExpense)
  const invoices = readList(parsed, 'invoices', isPersistedInvoice)
  if (!clients || !expenses || !invoices) return null
  let skippedItems = 0
  /** @param {string} plate */
  const usable = (plate) => {
    const ok = isOwnUnlinkedCar(ownerKey, plate)
    if (!ok) skippedItems += 1
    return ok
  }
  const fileClients = /** @type {ClientLike[]} */ (clients).filter((item) => (
    !nameKey(item.scopedToVehicleNumber || '') || usable(nameKey(item.scopedToVehicleNumber || ''))
  ))
  const fileExpenses = /** @type {ExpenseItem[]} */ (expenses).filter((item) => usable(nameKey(item.vehicleNumber || '') || 'main'))
  const fileInvoices = /** @type {InvoiceLike[]} */ (invoices).filter((item) => (
    usable(nameKey(item.carNumber || (item.vehicleNumbers || [])[0] || '') || 'main')
  ))
  return {
    clients: newClientsAgainst(readOwnerClients(ownerKey), fileClients),
    expenses: newById(readOwnerExpenses(ownerKey), fileExpenses),
    invoices: newById(readOwnerInvoices(ownerKey), fileInvoices).map(({ supabaseId: _old, ...item }) => item),
    skippedItems,
  }
}

/** @typedef {{ ok: boolean, count: number, toast: string|null }} StepResult */

const SAVE_FAIL = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

/** 저장 직전 Store를 다시 읽어 그 사이 생긴 거래처는 뺀다. @param {string} ownerKey @param {ClientLike[]} picked @returns {Promise<StepResult>} */
export async function restoreClients(ownerKey, picked) {
  const previous = /** @type {ClientLike[]} */ (readOwnerClients(ownerKey))
  const add = newClientsAgainst(previous, picked)
  if (add.length === 0) return { ok: true, count: 0, toast: null }
  const res = await saveClientsToCloud({
    ownerKey, userId: getCloudUserId(), previous, next: [...previous, ...add], changedIds: add.map((item) => item.id), okToast: null,
  })
  return res.failed ? { ok: false, count: 0, toast: res.toast } : { ok: true, count: add.length, toast: null }
}

/** @param {string} ownerKey @param {ExpenseItem[]} picked @returns {Promise<StepResult>} */
export async function restoreExpenses(ownerKey, picked) {
  const previous = /** @type {ExpenseItem[]} */ (readOwnerExpenses(ownerKey))
  const add = newById(previous, picked)
  if (add.length === 0) return { ok: true, count: 0, toast: null }
  try {
    await saveExpenses(ownerKey, [...previous, ...add])
    return { ok: true, count: add.length, toast: null }
  } catch (error) {
    console.error('[memberRestoreRecords] 지출 불러오기 실패:', error)
    return { ok: false, count: 0, toast: SAVE_FAIL }
  }
}

/** @param {string} ownerKey @param {InvoiceLike[]} picked @returns {Promise<StepResult>} */
export async function restoreInvoices(ownerKey, picked) {
  const previous = /** @type {InvoiceLike[]} */ (readOwnerInvoices(ownerKey))
  const add = newById(previous, picked)
  if (add.length === 0) return { ok: true, count: 0, toast: null }
  try {
    await saveInvoices(ownerKey, [...previous, ...add])
    return { ok: true, count: add.length, toast: null }
  } catch (error) {
    console.error('[memberRestoreRecords] 세금계산서 불러오기 실패:', error)
    return { ok: false, count: 0, toast: SAVE_FAIL }
  }
}

/** @param {{ days: number, clients: number, expenses: number, invoices: number }} counts */
export function describeRestoreCounts(counts) {
  return [
    counts.days ? `일지 ${counts.days}일` : '',
    counts.clients ? `거래처 ${counts.clients}곳` : '',
    counts.expenses ? `지출 ${counts.expenses}건` : '',
    counts.invoices ? `세금계산서 ${counts.invoices}건` : '',
  ].filter(Boolean).join(' · ')
}
