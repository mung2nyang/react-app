// @ts-check
import {
  CAR_SETTLEMENT_MODES, COMM_TYPES, INFO_TYPES, PAYMENT_TERM_VALUES, isAllowedEnum,
} from './persistDomainEnums.js'

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

/** @param {JsonValue} value @returns {value is Record<string, JsonValue>} */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {JsonValue} value */
export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/** @param {JsonValue} value */
export function isStringOrFiniteNumber(value) {
  return typeof value === 'string' || isFiniteNumber(value)
}

/** @param {Record<string, JsonValue>} value @param {ReadonlyArray<string>} allowed */
export function hasOnlyKeys(value, allowed) {
  const set = new Set(allowed)
  return Object.keys(value).every((key) => set.has(key))
}

// 재감사(Step 7 후속) — 기존 7개는 businessInfo(사업자정보)와 혼동돼 있었다.
// personalInfo는 바닐라 정본(ubiquitous-parakeet/car-management.js 저장부 +
// finance.js 조회부의 합집합)상 phone/bank/account/accountHolder도 함께 쓴다 —
// 기존 7개를 빼지 않고(하위호환) 4개를 더한다.
const PERSONAL_INFO_KEYS = [
  'driverName', 'bizNumber', 'name', 'address', 'bizType', 'bizItem', 'email',
  'phone', 'bank', 'account', 'accountHolder',
]
const BUSINESS_INFO_KEYS = ['sameAsOwner', 'name', 'bizNumber', 'representative', 'address', 'bizType', 'bizItem', 'email']
const CAR_KEYS = [
  'id', 'supabaseId', 'number', 'tonnage', 'type', 'settlementMode', 'commEnabled', 'commType',
  'commission', 'insuranceOn', 'logEnabled', 'driverLinkEnabled', 'shareRevenueWithOwner',
  'archived', 'driverName', 'driverPhone', 'driverLinkId', 'infoType', 'personalInfo', 'businessInfo',
]
const CLIENT_KEYS = [
  'id', 'companyName', 'managerName', 'phone', 'bizNumber', 'paymentTerm', 'paymentTermValue',
  'isPinned', 'scopedToVehicleNumber', 'commEnabled', 'commType', 'commValue', 'fixedRouteLinked',
  'palletOn', 'palletPrice', 'fixedUnitPrice', 'taxRepresentative', 'taxEmail', 'taxAddress',
  'taxBizType', 'taxBizItem', 'supabaseId',
]
const EXPENSE_KEYS = ['id', 'kind', 'date', 'name', 'category', 'fuelType', 'payment', 'cost', 'subsidy', 'mileage', 'liters']
const DRIVER_KEYS = ['id', 'name', 'phone', 'vehicleNumber', 'startDate', 'endDate', 'inviteCode', 'status', 'supabaseId']

/**
 * hydrate 정규화(hydrateMergeCars.js)가 재사용한다 — personalInfo/businessInfo raw
 * 백업이 정본 키셋 밖 필드나 잘못된 타입을 가지면(전체) 이 함수가 false를 돌려주고,
 * 그 차량은 해당 중첩 필드만 생략한 채 나머지 필드는 정상 정규화된다(검증기 자체는
 * 그대로 두고 producer만 이 함수로 걸러 쓴다 — 새 검증 로직을 추가하지 않는다).
 * @param {JsonValue} value @param {ReadonlyArray<string>} keys
 */
export function isStringRecord(value, keys) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, keys)) return false
  return Object.entries(value).every(([key, field]) => (key === 'sameAsOwner' ? typeof field === 'boolean' : typeof field === 'string'))
}

export { PERSONAL_INFO_KEYS, BUSINESS_INFO_KEYS }

/** @param {JsonValue} value */
export function isPersistedCar(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, CAR_KEYS) || typeof value.number !== 'string') return false
  if ('id' in value && typeof value.id !== 'string') return false
  if ('supabaseId' in value && !isStringOrFiniteNumber(value.supabaseId)) return false
  if ('tonnage' in value && typeof value.tonnage !== 'string') return false
  if ('type' in value && value.type !== 'main' && value.type !== 'sub') return false
  if ('settlementMode' in value && !isAllowedEnum(value.settlementMode, CAR_SETTLEMENT_MODES)) return false
  if ('commEnabled' in value && typeof value.commEnabled !== 'boolean') return false
  if ('commType' in value && !isAllowedEnum(value.commType, COMM_TYPES)) return false
  if ('commission' in value && !isStringOrFiniteNumber(value.commission)) return false
  for (const flag of ['insuranceOn', 'logEnabled', 'driverLinkEnabled', 'shareRevenueWithOwner', 'archived']) {
    if (flag in value && typeof value[flag] !== 'boolean') return false
  }
  if ('driverName' in value && typeof value.driverName !== 'string') return false
  if ('driverPhone' in value && typeof value.driverPhone !== 'string') return false
  if ('driverLinkId' in value && typeof value.driverLinkId !== 'string') return false
  if ('infoType' in value && !isAllowedEnum(value.infoType, INFO_TYPES)) return false
  if ('personalInfo' in value && !isStringRecord(value.personalInfo, PERSONAL_INFO_KEYS)) return false
  if ('businessInfo' in value && !isStringRecord(value.businessInfo, BUSINESS_INFO_KEYS)) return false
  return true
}

/** @param {JsonValue} value */
export function isPersistedClient(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, CLIENT_KEYS)) return false
  if (typeof value.id !== 'string' || typeof value.companyName !== 'string') return false
  if ('isPinned' in value && typeof value.isPinned !== 'boolean') return false
  if ('commEnabled' in value && typeof value.commEnabled !== 'boolean') return false
  if ('fixedRouteLinked' in value && typeof value.fixedRouteLinked !== 'boolean') return false
  if ('palletOn' in value && typeof value.palletOn !== 'boolean') return false
  if ('commValue' in value && !isStringOrFiniteNumber(value.commValue)) return false
  if ('palletPrice' in value && !isStringOrFiniteNumber(value.palletPrice)) return false
  if ('fixedUnitPrice' in value && !isStringOrFiniteNumber(value.fixedUnitPrice)) return false
  if ('paymentTerm' in value && !isAllowedEnum(value.paymentTerm, PAYMENT_TERM_VALUES)) return false
  if ('commType' in value && !isAllowedEnum(value.commType, COMM_TYPES)) return false
  if ('paymentTermValue' in value && typeof value.paymentTermValue !== 'string') return false
  if ('supabaseId' in value && !isStringOrFiniteNumber(value.supabaseId)) return false
  for (const key of ['managerName', 'phone', 'bizNumber', 'scopedToVehicleNumber', 'taxRepresentative', 'taxEmail', 'taxAddress', 'taxBizType', 'taxBizItem']) {
    if (key in value && typeof value[key] !== 'string') return false
  }
  return true
}

/** @param {JsonValue} value */
export function isPersistedExpense(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, EXPENSE_KEYS)) return false
  if (typeof value.id !== 'string' || typeof value.date !== 'string') return false
  if (value.kind !== 'maint' && value.kind !== 'fuel' && value.kind !== 'misc') return false
  for (const text of ['name', 'category', 'fuelType', 'payment']) {
    if (text in value && typeof value[text] !== 'string') return false
  }
  for (const num of ['cost', 'subsidy', 'mileage']) {
    if (num in value && !isFiniteNumber(value[num])) return false
  }
  if ('liters' in value && !isStringOrFiniteNumber(value.liters)) return false
  return true
}

/** @param {JsonValue} value */
export function isPersistedDriver(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, DRIVER_KEYS) || typeof value.id !== 'string') return false
  if ('status' in value && value.status !== 'pending' && value.status !== 'linked') return false
  if ('supabaseId' in value && !isStringOrFiniteNumber(value.supabaseId)) return false
  for (const text of ['name', 'phone', 'vehicleNumber', 'startDate', 'endDate', 'inviteCode']) {
    if (text in value && typeof value[text] !== 'string') return false
  }
  return true
}
