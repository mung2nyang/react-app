// @ts-check
import { isValidCurrencyAmount } from '../lib/callDetailSchema.js'
import { hasOnlyKeys, isFiniteNumber, isPlainObject, isStringOrFiniteNumber } from './persistDomainRecords.js'

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

const FUEL_ITEM_KEYS = ['type', 'cost', 'subsidy', 'liter', 'liters', 'mileage']
const MAINT_ITEM_KEYS = ['name', 'fare', 'mileage', 'category', 'payment']
const MISC_ITEM_KEYS = ['id', 'name', 'fare', 'mileage', 'category', 'payment']

/** @param {Record<string, JsonValue>} value @param {string} key */
function hasValidMoney(value, key) {
  const amount = value[key]
  return amount !== undefined && (isFiniteNumber(amount) || isValidCurrencyAmount(amount))
}

/** @param {JsonValue} value */
export function isPersistedFuelItem(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, FUEL_ITEM_KEYS)) return false
  if (typeof value.type !== 'string' || value.type === '') return false
  if (!hasValidMoney(value, 'cost')) return false
  if ('subsidy' in value && !isFiniteNumber(value.subsidy) && !isValidCurrencyAmount(value.subsidy)) return false
  if ('mileage' in value && !isStringOrFiniteNumber(value.mileage)) return false
  if ('liter' in value && !isStringOrFiniteNumber(value.liter)) return false
  if ('liters' in value && !isStringOrFiniteNumber(value.liters)) return false
  return true
}

/** @param {JsonValue} value */
export function isPersistedMaintItem(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, MAINT_ITEM_KEYS)) return false
  if (typeof value.name !== 'string' || value.name === '') return false
  if (!hasValidMoney(value, 'fare')) return false
  if ('mileage' in value && !isStringOrFiniteNumber(value.mileage)) return false
  if ('category' in value && typeof value.category !== 'string') return false
  if ('payment' in value && typeof value.payment !== 'string') return false
  return true
}

/** @param {JsonValue} value */
export function isPersistedMiscItem(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, MISC_ITEM_KEYS)) return false
  if (typeof value.name !== 'string' || value.name === '') return false
  if (!hasValidMoney(value, 'fare')) return false
  if ('mileage' in value && !isStringOrFiniteNumber(value.mileage)) return false
  if ('category' in value && typeof value.category !== 'string') return false
  if ('payment' in value && typeof value.payment !== 'string') return false
  if ('id' in value && (typeof value.id !== 'string' || value.id === '')) return false
  return true
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

