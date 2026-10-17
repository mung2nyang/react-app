// @ts-check
import * as v from 'valibot'
import { bool, by, finiteNumber, isPlainObject, opt, str, stringOrNumber } from '../domain/schemaParts.js'
import {
  CAR_SETTLEMENT_MODES, COMM_TYPES, DRIVER_PAY_MODES, INFO_TYPES, PAYMENT_TERM_VALUES,
} from './persistDomainEnums.js'

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

// isPlainObject는 공용 조각(domain/schemaParts.js) 것 — 이 파일에서 가져다 쓰던 곳이 많아 그대로 내보낸다.
export { isPlainObject }

/** @param {JsonValue} value */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/** @param {JsonValue} value */
export function isStringOrFiniteNumber(value) {
  return typeof value === 'string' || isFiniteNumber(value)
}

/** @param {Record<string, JsonValue>} value @param {ReadonlyArray<string>} allowed */
function hasOnlyKeys(value, allowed) {
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

// 칸 이름 → 그 칸이 있을 때의 모양(Valibot, 공용 조각은 domain/schemaParts.js). 목록 밖 칸·값이 비어 있는 칸은 거부.
const CAR = v.strictObject({
  number: str,
  id: opt(str), supabaseId: opt(stringOrNumber), tonnage: opt(str), type: opt(v.picklist(['main', 'sub'])),
  // settlementMode: 옛 "계산서 처리 방식"(2026-10-02 삭제) — 옛 저장분 읽기용.
  settlementMode: opt(v.picklist(CAR_SETTLEMENT_MODES)),
  commEnabled: opt(bool), commType: opt(v.picklist(COMM_TYPES)), commission: opt(stringOrNumber),
  insuranceOn: opt(bool), withholdingOn: opt(bool), logEnabled: opt(bool), driverLinkEnabled: opt(bool), shareRevenueWithOwner: opt(bool), archived: opt(bool),
  driverIncomeType: opt(v.picklist(['employee', 'business'])), expenseRate: opt(stringOrNumber), insuranceRate: opt(stringOrNumber),
  driverName: opt(str), driverPhone: opt(str), driverLinkId: opt(str), driverPayMode: opt(v.picklist(DRIVER_PAY_MODES)), driverSalaryAmount: opt(str),
  infoType: opt(v.picklist(INFO_TYPES)),
  personalInfo: opt(by((value) => isStringRecord(value, PERSONAL_INFO_KEYS))),
  businessInfo: opt(by((value) => isStringRecord(value, BUSINESS_INFO_KEYS))),
})

const CLIENT = v.strictObject({
  id: str,
  companyName: str,
  isPinned: opt(bool), commEnabled: opt(bool), fixedRouteLinked: opt(bool), palletOn: opt(bool),
  commValue: opt(stringOrNumber), palletPrice: opt(stringOrNumber), fixedUnitPrice: opt(stringOrNumber), supabaseId: opt(stringOrNumber),
  paymentTerm: opt(v.picklist(PAYMENT_TERM_VALUES)), commType: opt(v.picklist(COMM_TYPES)), paymentTermValue: opt(str),
  managerName: opt(str), phone: opt(str), bizNumber: opt(str), scopedToVehicleNumber: opt(str),
  taxRepresentative: opt(str), taxEmail: opt(str), taxAddress: opt(str), taxBizType: opt(str), taxBizItem: opt(str),
})

const EXPENSE = v.strictObject({
  id: str,
  date: str,
  kind: v.picklist(['maint', 'fuel', 'misc']),
  name: opt(str), category: opt(str), fuelType: opt(str), payment: opt(str), vehicleNumber: opt(str),
  cost: opt(finiteNumber), subsidy: opt(finiteNumber), mileage: opt(finiteNumber), liters: opt(stringOrNumber),
})

const DRIVER = v.strictObject({
  id: str,
  status: opt(v.picklist(['pending', 'linked'])), supabaseId: opt(stringOrNumber),
  name: opt(str), phone: opt(str), vehicleNumber: opt(str), startDate: opt(str), endDate: opt(str), inviteCode: opt(str),
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
