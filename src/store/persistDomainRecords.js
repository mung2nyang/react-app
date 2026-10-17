// @ts-check
import * as v from 'valibot'
import {
  CAR_SETTLEMENT_MODES, COMM_TYPES, DRIVER_PAY_MODES, INFO_TYPES, PAYMENT_TERM_VALUES,
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

// personalInfo는 phone/bank/account/accountHolder도 쓴다 — 앞의 7개는 옛 저장값 호환으로 남긴다.
const PERSONAL_INFO_KEYS = [
  'driverName', 'bizNumber', 'name', 'address', 'bizType', 'bizItem', 'email',
  'phone', 'bank', 'account', 'accountHolder',
]
const BUSINESS_INFO_KEYS = ['sameAsOwner', 'name', 'bizNumber', 'representative', 'address', 'bizType', 'bizItem', 'email']
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

// 칸 이름 → 그 칸이 있을 때의 모양(Valibot). 목록 밖 칸은 거부, 칸이 있는데 값이 비어 있어도 거부(exactOptional).
const str = v.string()
const bool = v.boolean()
const num = v.pipe(v.number(), v.finite())
const strOrNum = v.union([str, num])

/** @template {Record<string, v.GenericSchema>} T @param {T} fields */
function optional(fields) {
  return /** @type {{ [K in keyof T]: v.ExactOptionalSchema<T[K], undefined> }} */ (
    Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, v.exactOptional(schema)]))
  )
}

const CAR = v.strictObject({
  number: str,
  ...optional({
    id: str, supabaseId: strOrNum, tonnage: str, type: v.picklist(['main', 'sub']),
    // settlementMode: 옛 "계산서 처리 방식"(2026-10-02 삭제) — 옛 저장분 읽기용.
    settlementMode: v.picklist(CAR_SETTLEMENT_MODES),
    commEnabled: bool, commType: v.picklist(COMM_TYPES), commission: strOrNum,
    insuranceOn: bool, withholdingOn: bool, logEnabled: bool, driverLinkEnabled: bool, shareRevenueWithOwner: bool, archived: bool,
    driverIncomeType: v.picklist(['employee', 'business']), expenseRate: strOrNum, insuranceRate: strOrNum,
    driverName: str, driverPhone: str, driverLinkId: str, driverPayMode: v.picklist(DRIVER_PAY_MODES), driverSalaryAmount: str,
    infoType: v.picklist(INFO_TYPES),
    personalInfo: v.custom((value) => isStringRecord(/** @type {JsonValue} */ (value), PERSONAL_INFO_KEYS)),
    businessInfo: v.custom((value) => isStringRecord(/** @type {JsonValue} */ (value), BUSINESS_INFO_KEYS)),
  }),
})

const CLIENT = v.strictObject({
  id: str,
  companyName: str,
  ...optional({
    isPinned: bool, commEnabled: bool, fixedRouteLinked: bool, palletOn: bool,
    commValue: strOrNum, palletPrice: strOrNum, fixedUnitPrice: strOrNum, supabaseId: strOrNum,
    paymentTerm: v.picklist(PAYMENT_TERM_VALUES), commType: v.picklist(COMM_TYPES), paymentTermValue: str,
    managerName: str, phone: str, bizNumber: str, scopedToVehicleNumber: str,
    taxRepresentative: str, taxEmail: str, taxAddress: str, taxBizType: str, taxBizItem: str,
  }),
})

const EXPENSE = v.strictObject({
  id: str,
  date: str,
  kind: v.picklist(['maint', 'fuel', 'misc']),
  ...optional({
    name: str, category: str, fuelType: str, payment: str, vehicleNumber: str,
    cost: num, subsidy: num, mileage: num, liters: strOrNum,
  }),
})

const DRIVER = v.strictObject({
  id: str,
  ...optional({
    status: v.picklist(['pending', 'linked']), supabaseId: strOrNum,
    name: str, phone: str, vehicleNumber: str, startDate: str, endDate: str, inviteCode: str,
  }),
})

/** @param {JsonValue} value */
export function isPersistedCar(value) {
  return v.is(CAR, value)
}

/** @param {JsonValue} value */
export function isPersistedClient(value) {
  return v.is(CLIENT, value)
}

/** @param {JsonValue} value */
export function isPersistedExpense(value) {
  return v.is(EXPENSE, value)
}

/** @param {JsonValue} value */
export function isPersistedDriver(value) {
  return v.is(DRIVER, value)
}
