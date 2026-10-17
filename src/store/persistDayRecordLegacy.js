// @ts-check
import * as v from 'valibot'
import { isValidCurrencyAmount } from '../lib/callDetailSchema.js'
import { isPlainObject } from './persistDomainRecords.js'

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

// 옛 하루 기록 안 주유·정비·기타 항목의 칸 → 모양(Valibot). 목록 밖 칸·값이 비어 있는 칸은 거부.
const opt = v.exactOptional
const str = v.string()
const text = v.pipe(str, v.nonEmpty())
const strOrNum = v.union([str, v.pipe(v.number(), v.finite())])
// 돈: 유한 숫자면 음수·소수도 받고, 글자면 금액 규칙("1,000원"·빈 글자).
const money = v.union([v.pipe(v.number(), v.finite()), v.custom((input) => isValidCurrencyAmount(/** @type {JsonValue} */ (input)))])
/** Valibot은 배열도 객체로 받고 검사 뒤엔 새 객체를 넘기므로, 객체 검사 앞에서 배열을 먼저 거른다. @template {v.GenericSchema} T @param {T} schema */
const plain = (schema) => v.pipe(v.custom((input) => isPlainObject(/** @type {JsonValue} */ (input))), schema)

const FUEL_ITEM = plain(v.strictObject({
  type: text, cost: money, subsidy: opt(money), liter: opt(strOrNum), liters: opt(strOrNum), mileage: opt(strOrNum),
}))

const MAINT_FIELDS = { name: text, fare: money, mileage: opt(strOrNum), category: opt(str), payment: opt(str) }
const MAINT_ITEM = plain(v.strictObject(MAINT_FIELDS))
const MISC_ITEM = plain(v.strictObject({ ...MAINT_FIELDS, id: opt(text) }))

/** @param {JsonValue} value */
export function isPersistedFuelItem(value) {
  return v.is(FUEL_ITEM, value)
}

/** @param {JsonValue} value */
export function isPersistedMaintItem(value) {
  return v.is(MAINT_ITEM, value)
}

/** @param {JsonValue} value */
export function isPersistedMiscItem(value) {
  return v.is(MISC_ITEM, value)
}

/** @param {JsonValue} value @param {(item: JsonValue) => boolean} check */
function isItemList(value, check) {
  return Array.isArray(value) && value.every(check)
}

/** @param {JsonValue} value */
export function isPersistedFuelList(value) {
  return isItemList(value, isPersistedFuelItem)
}

/** @param {JsonValue} value */
export function isPersistedMaintList(value) {
  return isItemList(value, isPersistedMaintItem)
}

/** @param {JsonValue} value */
export function isPersistedMiscList(value) {
  return isItemList(value, isPersistedMiscItem)
}

