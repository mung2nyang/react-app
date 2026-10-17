// @ts-check
import * as v from 'valibot'
import { isValidCurrencyAmount } from '../lib/callDetailSchema.js'
import { by, finiteNumber, nonEmptyString, opt, plain, str, stringOrNumber } from '../domain/schemaParts.js'

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

// 옛 하루 기록 안 주유·정비·기타 항목의 칸 → 모양(Valibot, 공용 조각은 domain/schemaParts.js). 목록 밖 칸·값이 비어 있는 칸은 거부.
// 돈: 유한 숫자면 음수·소수도 받고, 글자면 금액 규칙("1,000원"·빈 글자).
const money = v.union([finiteNumber, by(isValidCurrencyAmount)])

const FUEL_ITEM = plain(v.strictObject({
  type: nonEmptyString, cost: money, subsidy: opt(money), liter: opt(stringOrNumber), liters: opt(stringOrNumber), mileage: opt(stringOrNumber),
}))

const MAINT_FIELDS = { name: nonEmptyString, fare: money, mileage: opt(stringOrNumber), category: opt(str), payment: opt(str) }
const MAINT_ITEM = plain(v.strictObject(MAINT_FIELDS))
const MISC_ITEM = plain(v.strictObject({ ...MAINT_FIELDS, id: opt(nonEmptyString) }))

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

