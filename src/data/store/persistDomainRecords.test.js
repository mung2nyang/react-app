// 저장 자료 검사(차량·거래처·지출·기사)의 통과/거부를 칸마다 못 박는다 — 검사 코드를 라이브러리로 바꿔도 결과가 같아야 한다.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { isPersistedCar, isPersistedClient, isPersistedDriver, isPersistedExpense } from './persistDomainRecords.js'

/** @typedef {import('../../domain/jsonTypes.js').JsonValue} JsonValue */
/** @typedef {Record<string, JsonValue>} Rec */

const CAR = {
  id: 'car-1', supabaseId: 7, number: '12가3456', tonnage: '5톤', type: 'sub', settlementMode: 'none',
  commEnabled: true, commType: 'percent', commission: '10', insuranceOn: false, logEnabled: true,
  driverLinkEnabled: false, shareRevenueWithOwner: true, archived: false, driverName: '박기사',
  driverPhone: '010-1111-2222', driverLinkId: 'link-1', driverPayMode: 'salary', driverSalaryAmount: '3000000',
  infoType: 'new',
  personalInfo: { driverName: 'a', bizNumber: 'b', name: 'c', address: 'd', bizType: 'e', bizItem: 'f', email: 'g', phone: 'h', bank: 'i', account: 'j', accountHolder: 'k' },
  businessInfo: { sameAsOwner: false, name: 'a', bizNumber: 'b', representative: 'c', address: 'd', bizType: 'e', bizItem: 'f', email: 'g' },
  driverIncomeType: 'business', withholdingOn: true, expenseRate: 43.1, insuranceRate: '0.8', driverShareBase: 'afterClientCommission',
}
/** 칸마다 틀린 값 — 표에서 만들지 않고 손으로 적는다. @type {Array<[string, JsonValue]>} */
const CAR_BAD = [
  ['id', 1], ['supabaseId', true], ['number', 5], ['tonnage', 5], ['type', 'other'], ['settlementMode', 'x'],
  ['commEnabled', 'true'], ['commType', 'x'], ['commission', null], ['insuranceOn', 1], ['logEnabled', 'y'],
  ['driverLinkEnabled', 0], ['shareRevenueWithOwner', null], ['archived', 'no'], ['driverName', 1],
  ['driverPhone', 1], ['driverLinkId', 1], ['driverPayMode', 'x'], ['driverSalaryAmount', 3000000],
  ['infoType', 'x'], ['personalInfo', { junk: 'a' }], ['personalInfo', { name: 1 }], ['personalInfo', 'a'],
  ['businessInfo', { sameAsOwner: 'no' }], ['businessInfo', { name: 1 }], ['businessInfo', { junk: 'a' }],
  ['driverIncomeType', 'x'], ['withholdingOn', '1'], ['expenseRate', {}], ['insuranceRate', []],
  ['driverShareBase', 'x'], ['driverShareBase', 1],
]

const CLIENT = {
  id: 'c-1', companyName: '한빛물류', managerName: '김담당', phone: '010', bizNumber: '123-45-67890',
  paymentTerm: 'after_days', paymentTermValue: '3', isPinned: true, scopedToVehicleNumber: '12가3456',
  commEnabled: true, commType: 'direct', commValue: 5000, fixedRouteLinked: false, palletOn: true,
  palletPrice: '3000', fixedUnitPrice: 50000, taxRepresentative: '대표', taxEmail: 'a@b.c', taxAddress: '서울',
  taxBizType: '운수', taxBizItem: '화물', supabaseId: 'uuid-1',
}
/** @type {Array<[string, JsonValue]>} */
const CLIENT_BAD = [
  ['id', 1], ['companyName', null], ['managerName', 1], ['phone', 1], ['bizNumber', 1], ['paymentTerm', 'x'],
  ['paymentTermValue', 3], ['isPinned', 'y'], ['scopedToVehicleNumber', 1], ['commEnabled', 1], ['commType', 'x'],
  ['commValue', true], ['fixedRouteLinked', 'y'], ['palletOn', null], ['palletPrice', {}], ['fixedUnitPrice', []],
  ['taxRepresentative', 1], ['taxEmail', 1], ['taxAddress', 1], ['taxBizType', 1], ['taxBizItem', 1], ['supabaseId', false],
]

const EXPENSE = {
  id: 'e-1', kind: 'fuel', date: '2026-10-01', name: '주유', category: '경유', fuelType: 'diesel', payment: 'card',
  cost: 50000, subsidy: 1000, mileage: 12345, liters: '40.5', vehicleNumber: '12가3456',
}
/** @type {Array<[string, JsonValue]>} */
const EXPENSE_BAD = [
  ['id', 1], ['kind', 'x'], ['date', 5], ['name', 1], ['category', 1], ['fuelType', 1], ['payment', 1],
  ['cost', '5000'], ['subsidy', '1'], ['mileage', '1'], ['liters', true], ['vehicleNumber', 1],
]

const DRIVER = {
  id: 'd-1', name: '최기사', phone: '010', vehicleNumber: '12가3456', startDate: '2026-10-01', endDate: '',
  inviteCode: '123456', status: 'linked', supabaseId: 3,
}
/** @type {Array<[string, JsonValue]>} */
const DRIVER_BAD = [
  ['id', 1], ['name', 1], ['phone', 1], ['vehicleNumber', 1], ['startDate', 1], ['endDate', 1],
  ['inviteCode', 123456], ['status', 'disconnected'], ['supabaseId', null],
]

/** @type {Array<{ name: string, check: (value: JsonValue) => boolean, full: Rec, bad: Array<[string, JsonValue]>, required: Array<string>, numbers: Array<string> }>} */
const CASES = [
  { name: '차량', check: isPersistedCar, full: CAR, bad: CAR_BAD, required: ['number'], numbers: ['supabaseId', 'commission', 'expenseRate', 'insuranceRate'] },
  { name: '거래처', check: isPersistedClient, full: CLIENT, bad: CLIENT_BAD, required: ['id', 'companyName'], numbers: ['commValue', 'palletPrice', 'fixedUnitPrice', 'supabaseId'] },
  { name: '지출', check: isPersistedExpense, full: EXPENSE, bad: EXPENSE_BAD, required: ['id', 'date', 'kind'], numbers: ['cost', 'subsidy', 'mileage', 'liters'] },
  { name: '기사', check: isPersistedDriver, full: DRIVER, bad: DRIVER_BAD, required: ['id'], numbers: ['supabaseId'] },
]

for (const { name, check, full, bad, required, numbers } of CASES) {
  describe(`${name} 검사`, () => {
    test('모든 칸이 올바르면 통과', () => {
      assert.equal(check(full), true)
    })

    test('칸마다 틀린 종류면 거부', () => {
      for (const [key, value] of bad) assert.equal(check({ ...full, [key]: value }), false, `${key}=${JSON.stringify(value)}`)
    })

    test('모르는 칸이 있으면 거부', () => {
      assert.equal(check({ ...full, junk: 'x' }), false)
    })

    test('꼭 있어야 하는 칸이 빠지면 거부', () => {
      for (const key of required) {
        const copy = { ...full }
        delete copy[key]
        assert.equal(check(copy), false, key)
      }
    })

    test('선택 칸이 모두 없으면 통과', () => {
      /** @type {Rec} */
      const only = {}
      for (const key of required) only[key] = full[key]
      assert.equal(check(only), true)
    })

    test('객체가 아니면 거부', () => {
      for (const value of [null, [], 'text', 3, true]) assert.equal(check(value), false, JSON.stringify(value))
    })

    test('칸은 있는데 값이 비어 있으면(undefined) 거부', () => {
      for (const key of Object.keys(full)) {
        const copy = { ...full }
        Reflect.set(copy, key, undefined)
        assert.equal(check(copy), false, key)
      }
    })

    test('숫자 칸에 NaN·무한대면 거부, 글자·숫자 둘 다 받는 칸은 둘 다 통과', () => {
      for (const key of numbers) {
        assert.equal(check({ ...full, [key]: Number.NaN }), false, `${key}=NaN`)
        assert.equal(check({ ...full, [key]: Number.POSITIVE_INFINITY }), false, `${key}=Infinity`)
      }
    })
  })
}

test('글자·숫자 둘 다 받는 칸: 글자도 숫자도 통과', () => {
  assert.equal(isPersistedCar({ ...CAR, commission: 10, supabaseId: 'uuid' }), true)
  assert.equal(isPersistedClient({ ...CLIENT, commValue: '5000', palletPrice: 3000, fixedUnitPrice: '50000', supabaseId: 9 }), true)
  assert.equal(isPersistedExpense({ ...EXPENSE, liters: 40.5 }), true)
  assert.equal(isPersistedDriver({ ...DRIVER, supabaseId: 'uuid' }), true)
})

test('허용 값 칸은 목록 안의 다른 값도 통과', () => {
  assert.equal(isPersistedCar({ ...CAR, type: 'main', settlementMode: 'driver_direct', commType: 'direct', driverPayMode: 'revenue', infoType: 'existing', driverIncomeType: 'employee' }), true)
  assert.equal(isPersistedCar({ ...CAR, driverShareBase: 'gross' }), true)
  assert.equal(isPersistedClient({ ...CLIENT, paymentTerm: 'second_month_end', commType: 'percent' }), true)
  assert.equal(isPersistedExpense({ ...EXPENSE, kind: 'maint' }), true)
  assert.equal(isPersistedExpense({ ...EXPENSE, kind: 'misc' }), true)
  assert.equal(isPersistedDriver({ ...DRIVER, status: 'pending' }), true)
})
