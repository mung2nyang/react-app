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

/** @param {JsonValue} value @param {string} fallback */
function labelOr(value, fallback) {
  return typeof value === 'string' && value !== '' ? value : fallback
}

/** @param {Record<string, JsonValue>} value @param {string} key @param {JsonValue} [alias] */
function moneyOrZero(value, key, alias) {
  if (hasValidMoney(value, key)) return value[key]
  if (alias !== undefined && (isFiniteNumber(alias) || isValidCurrencyAmount(alias))) return alias
  return 0
}

/** @param {JsonValue} value */
function stringOrNumberOrZero(value) {
  return isStringOrFiniteNumber(value) ? value : 0
}

/**
 * 서버/레거시 raw를 persist 주유 한 줄로 정규화한다. 모르는 키는 버리고, 빈 필드는 기본값.
 * @param {JsonValue|null|undefined} value
 */
export function coercePersistedFuelItem(value) {
  if (value == null || !isPlainObject(value)) return null
  /** @type {Record<string, JsonValue>} */
  const item = {
    type: labelOr(value.type, labelOr(value.name, labelOr(value.fuelType, '주유'))),
    cost: moneyOrZero(value, 'cost'),
  }
  if ('subsidy' in value) item.subsidy = isFiniteNumber(value.subsidy) || isValidCurrencyAmount(value.subsidy) ? value.subsidy : 0
  if ('mileage' in value) item.mileage = stringOrNumberOrZero(value.mileage)
  if ('liter' in value) item.liter = stringOrNumberOrZero(value.liter)
  if ('liters' in value) item.liters = stringOrNumberOrZero(value.liters)
  return item
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

/**
 * @param {JsonValue|null|undefined} value
 */
export function coercePersistedMaintItem(value) {
  if (value == null || !isPlainObject(value)) return null
  /** @type {Record<string, JsonValue>} */
  const item = {
    name: labelOr(value.name, labelOr(value.category, '정비')),
    fare: moneyOrZero(value, 'fare', value.cost),
  }
  if ('mileage' in value) item.mileage = stringOrNumberOrZero(value.mileage)
  if ('category' in value) item.category = typeof value.category === 'string' ? value.category : ''
  if ('payment' in value) item.payment = typeof value.payment === 'string' ? value.payment : ''
  return item
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

/**
 * @param {JsonValue|null|undefined} value
 */
export function coercePersistedMiscItem(value) {
  if (value == null || !isPlainObject(value)) return null
  /** @type {Record<string, JsonValue>} */
  const item = {
    name: labelOr(value.name, labelOr(value.category, '기타')),
    fare: moneyOrZero(value, 'fare', value.cost),
  }
  if ('mileage' in value) item.mileage = stringOrNumberOrZero(value.mileage)
  if ('category' in value) item.category = typeof value.category === 'string' ? value.category : ''
  if ('payment' in value) item.payment = typeof value.payment === 'string' ? value.payment : ''
  if (typeof value.id === 'string' && value.id !== '') item.id = value.id
  return item
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

