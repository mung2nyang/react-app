// 앱을 켤 때·비회원 백업 불러오기의 자료 검사 입구(matchesDomainSchema)와 설정·개인정보·지운 날 검사의 통과/거부를 칸마다 못 박는다.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { isPersistedProfile, isPersistedSettings, isPersistedWorkDataDeletedDates, matchesDomainSchema } from './persistDomainSchema.js'

/** @typedef {import('../../domain/jsonTypes.js').JsonValue} JsonValue */
/** @typedef {Record<string, JsonValue>} Rec */

const CAR = { id: 'car-1', number: '12가3456', type: 'main' }
const CLIENT = { id: 'c-1', companyName: '한빛물류' }
const LINK = { id: 'l-1', vehicleNumber: '12가3456', assignmentStart: '2026-10-01', assignmentEnd: '', status: 'linked' }
const PRESET = { id: 'p-1', loadLoc: '부산', unloadLoc: '대구' }
const SUB = { inputMode: 'fare', callDetail: true, timeOn: false, platformOn: true, distanceOn: false, cargoTonnageOn: true, dailyInspectionOn: false }

const SETTINGS = {
  cars: [CAR], clients: [CLIENT], driverLinks: [LINK],
  paymentOn: true, subPaymentOn: false, fixedOn: true, subFixedOn: false,
  defaultDriverSettlementMode: 'none', driverInvoiceBasis: 'net', unitPrice: '50000',
  bizName: '차주로지스', bizNumber: '123-45-67890', bizRepresentative: '대표', userName: '홍길동',
  bizAddress: '서울', bizType: '운수', bizItem: '화물', bizEmail: 'a@b.c', theme: 'dark',
  inputMode: 'count', callDetail: true, timeOn: false, platformOn: true, distanceOn: false, cargoTonnageOn: true,
  fixedRouteOn: true, fixedRoutePresets: [PRESET], runCountToggle: true, runCountPresets: [1, 2, 3],
  subFixedRouteOn: false, subFixedRoutePresets: [PRESET], subRunCountToggle: false, subRunCountPresets: [4],
  pinnedLocations: ['부산'], subCarSettings: { '34나5678': SUB }, dailyInspectionOn: true, notifOff: ['backup'],
}
/** 칸마다 틀린 값(설정 37칸 전부) — 손으로 적는다. @type {Array<[string, JsonValue]>} */
const SETTINGS_BAD = [
  ['cars', 'x'], ['cars', [{ number: 1 }]], ['clients', {}], ['clients', [{ id: 'c' }]],
  ['driverLinks', 'x'], ['driverLinks', [{ id: 1 }]], ['driverLinks', [{ junk: 'a' }]], ['driverLinks', [[]]],
  ['paymentOn', 'y'], ['subPaymentOn', 1], ['fixedOn', null], ['subFixedOn', 'n'],
  ['defaultDriverSettlementMode', 'x'], ['driverInvoiceBasis', 'x'], ['unitPrice', true],
  ['bizName', 1], ['bizNumber', 1], ['bizRepresentative', 1], ['userName', 1], ['bizAddress', 1],
  ['bizType', 1], ['bizItem', 1], ['bizEmail', 1], ['theme', 'blue'], ['inputMode', 'x'],
  ['callDetail', 'y'], ['timeOn', 1], ['platformOn', 'y'], ['distanceOn', 0], ['cargoTonnageOn', 'y'],
  ['fixedRouteOn', 1], ['fixedRoutePresets', 'x'], ['fixedRoutePresets', [{ id: 'p', loadLoc: '부산' }]],
  ['fixedRoutePresets', [{ ...PRESET, junk: 1 }]], ['fixedRoutePresets', [[]]],
  ['runCountToggle', 'y'], ['runCountPresets', ['1']], ['runCountPresets', [Number.NaN]], ['runCountPresets', {}],
  ['subFixedRouteOn', 'y'], ['subFixedRoutePresets', [{ id: 1, loadLoc: 'a', unloadLoc: 'b' }]],
  ['subRunCountToggle', 1], ['subRunCountPresets', [Number.POSITIVE_INFINITY]],
  ['pinnedLocations', [1]], ['pinnedLocations', 'x'], ['subCarSettings', []], ['subCarSettings', 'x'],
  ['subCarSettings', { a: { inputMode: 'x' } }], ['subCarSettings', { a: { callDetail: 'y' } }],
  ['subCarSettings', { a: { junk: true } }], ['subCarSettings', { a: [] }], ['subCarSettings', { a: null }],
  ['dailyInspectionOn', 'y'], ['notifOff', [1]], ['notifOff', 'backup'],
]

const PROFILE = {
  name: '홍길동', phone: '010', bizName: '차주로지스', bizRepresentative: '대표', bizNumber: '123', bizAddress: '서울',
  bizType: '운수', bizItem: '화물', bizEmail: 'a@b.c', bankName: '은행', accountNumber: '000', accountHolder: '홍길동',
}

const NOT_OBJECTS = [null, [], [1], 'text', 3, true]

describe('설정 검사', () => {
  test('모든 칸이 올바르면 통과, 빈 설정도 통과', () => {
    assert.equal(isPersistedSettings(SETTINGS), true)
    assert.equal(isPersistedSettings({}), true)
  })

  test('칸마다 틀린 종류면 거부', () => {
    for (const [key, value] of SETTINGS_BAD) assert.equal(isPersistedSettings({ ...SETTINGS, [key]: value }), false, `${key}=${JSON.stringify(value)}`)
  })

  test('모르는 칸, 값이 비어 있는 칸, 객체가 아니면 거부', () => {
    assert.equal(isPersistedSettings({ ...SETTINGS, junk: 1 }), false)
    for (const key of Object.keys(SETTINGS)) {
      const copy = { ...SETTINGS }
      Reflect.set(copy, key, undefined)
      assert.equal(isPersistedSettings(copy), false, key)
    }
    for (const value of NOT_OBJECTS) assert.equal(isPersistedSettings(value), false, JSON.stringify(value))
  })

  test('숫자·글자 둘 다 받는 칸, 허용 값의 다른 값, 빈 목록·빈 차량 설정 묶음은 통과', () => {
    assert.equal(isPersistedSettings({ ...SETTINGS, unitPrice: 50000, theme: 'light', inputMode: 'fare', defaultDriverSettlementMode: 'company', driverInvoiceBasis: 'gross' }), true)
    assert.equal(isPersistedSettings({ ...SETTINGS, unitPrice: Number.NaN }), false)
    assert.equal(isPersistedSettings({ cars: [], clients: [], driverLinks: [], fixedRoutePresets: [], runCountPresets: [], pinnedLocations: [], notifOff: [], subCarSettings: {} }), true)
    assert.equal(isPersistedSettings({ driverLinks: [{}], subCarSettings: { a: {} } }), true)
  })
})

describe('개인정보 검사', () => {
  test('모든 칸 글자면 통과, 빈 개인정보도 통과', () => {
    assert.equal(isPersistedProfile(PROFILE), true)
    assert.equal(isPersistedProfile({}), true)
  })

  test('칸마다 글자가 아니거나 비어 있으면 거부, 모르는 칸·객체 아님 거부', () => {
    for (const key of Object.keys(PROFILE)) {
      assert.equal(isPersistedProfile({ ...PROFILE, [key]: 1 }), false, key)
      const copy = { ...PROFILE }
      Reflect.set(copy, key, undefined)
      assert.equal(isPersistedProfile(copy), false, `${key}=undefined`)
    }
    assert.equal(isPersistedProfile({ ...PROFILE, fax: '02' }), false)
    for (const value of NOT_OBJECTS) assert.equal(isPersistedProfile(value), false, JSON.stringify(value))
  })
})

describe('지운 날 목록 검사', () => {
  test('날짜 → 글자면 통과, 빈 묶음도 통과', () => {
    assert.equal(isPersistedWorkDataDeletedDates({ '2026-10-01': '2026-10-02T00:00:00.000Z' }), true)
    assert.equal(isPersistedWorkDataDeletedDates({}), true)
  })

  test('날짜 아닌 키, 글자 아닌 값, 객체 아님 거부', () => {
    assert.equal(isPersistedWorkDataDeletedDates({ 'not-a-date': 'x' }), false)
    assert.equal(isPersistedWorkDataDeletedDates({ '2026-02-30': 'x' }), false)
    assert.equal(isPersistedWorkDataDeletedDates({ '2026-10-01': 1 }), false)
    assert.equal(isPersistedWorkDataDeletedDates({ '2026-10-01': null }), false)
    for (const value of NOT_OBJECTS) assert.equal(isPersistedWorkDataDeletedDates(value), false, JSON.stringify(value))
  })
})

describe('자료 검사 입구(matchesDomainSchema)', () => {
  /** @type {Array<[import('./persist.js').PersistDomain, JsonValue, JsonValue]>} 종류, 통과 값, 거부 값 */
  const DOMAINS = [
    ['dismissedNotifications', ['backup:never'], [1]],
    ['cars', [CAR], [{ number: 1 }]],
    ['clients', [CLIENT], [{ id: 'c' }]],
    ['expenses', [{ id: 'e', date: '2026-10-01', kind: 'fuel' }], [{ id: 'e', date: '2026-10-01', kind: 'x' }]],
    ['invoices', [{ id: 'i-1', flow: 'sales', supplyAmount: 1000 }], [{ id: 'i-1', flow: 'x' }]],
    ['drivers', [{ id: 'd-1', status: 'pending' }], [{ id: 'd-1', status: 'x' }]],
    ['settings', SETTINGS, { theme: 'blue' }],
    ['profile', PROFILE, { name: 1 }],
    ['workDataDeletedDates', { '2026-10-01': 'x' }, { bad: 'x' }],
    ['workData', { '2026-10-01': { count: 1 } }, { '2026-10-01': null }],
  ]

  test('종류마다 올바른 값은 통과, 틀린 값은 거부', () => {
    for (const [domain, ok, bad] of DOMAINS) {
      assert.equal(matchesDomainSchema(domain, ok), true, `${domain} 통과`)
      assert.equal(matchesDomainSchema(domain, bad), false, `${domain} 거부`)
    }
  })

  test('목록 종류에 목록이 아닌 값, 묶음 종류에 배열이면 거부', () => {
    for (const domain of /** @type {Array<import('./persist.js').PersistDomain>} */ (['dismissedNotifications', 'cars', 'clients', 'expenses', 'invoices', 'drivers'])) {
      assert.equal(matchesDomainSchema(domain, {}), false, domain)
      assert.equal(matchesDomainSchema(domain, []), true, `${domain} 빈 목록`)
    }
    for (const domain of /** @type {Array<import('./persist.js').PersistDomain>} */ (['settings', 'profile', 'workDataDeletedDates', 'workData'])) {
      assert.equal(matchesDomainSchema(domain, []), false, domain)
    }
  })
})
