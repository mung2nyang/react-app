// 하루 운행 기록 검사(14칸)와 날짜별 읽기의 통과/거부를 칸마다 못 박는다 — 검사 코드를 라이브러리로 바꿔도 결과가 같아야 한다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAY_RECORD_KEYS, isPersistedDayRecord, isPersistedWorkDataMap, parsePersistedWorkDataMap } from './persistDayRecord.js'

/** @typedef {import('../../domain/jsonTypes.js').JsonValue} JsonValue */

const DAY = {
  isOff: false, fixedCount: 2, palletCount: 1, callDetails: [{ id: 'c-1', fare: '300,000' }],
  fixedRouteCounts: { 'route-1': 2 }, fare: '1,000', fixedFare: 100000, totalFare: '400,000원', count: 3,
  dailyDistance: 120.5, fuelItems: [{ type: 'diesel', cost: 50000 }], maintItems: [{ name: '오일', fare: '30,000' }],
  miscItems: [{ id: 'm-1', name: '세차', fare: 10000 }], assignedVehicleNumber: '12가3456',
}
/** 칸마다 틀린 값 — 손으로 적는다. @type {Array<[string, JsonValue]>} */
const DAY_BAD = [
  ['isOff', 'yes'], ['isOff', 1],
  ['fixedCount', 1.5], ['fixedCount', -1], ['fixedCount', '2'], ['fixedCount', Number.NaN], ['fixedCount', Number.POSITIVE_INFINITY],
  ['palletCount', 0.5], ['palletCount', -2], ['palletCount', null],
  ['count', 2.2], ['count', -1], ['count', '3'],
  ['dailyDistance', -0.1], ['dailyDistance', '120'], ['dailyDistance', Number.NaN], ['dailyDistance', Number.POSITIVE_INFINITY],
  ['fare', 'abc'], ['fare', -1], ['fare', 1.5], ['fixedFare', '1,00'], ['totalFare', true],
  ['assignedVehicleNumber', 1],
  ['fixedRouteCounts', []], ['fixedRouteCounts', [1]], ['fixedRouteCounts', 'x'], ['fixedRouteCounts', null],
  ['fixedRouteCounts', { r: 1.5 }], ['fixedRouteCounts', { r: -1 }], ['fixedRouteCounts', { r: '1' }],
  ['callDetails', {}], ['callDetails', 'x'], ['callDetails', [{}]], ['callDetails', [{ loadLoc: 1 }]], ['callDetails', [[]]],
  ['fuelItems', {}], ['fuelItems', [{ type: '', cost: 1 }]], ['fuelItems', [{ cost: 1 }]],
  ['maintItems', 'x'], ['maintItems', [{ name: '오일' }]], ['miscItems', [{ name: '세차', fare: 1, id: '' }]],
]

test('14칸 모두 올바른 하루는 통과', () => {
  assert.equal(isPersistedDayRecord(DAY), true)
})

test('칸마다 틀린 종류면 거부', () => {
  for (const [key, value] of DAY_BAD) assert.equal(isPersistedDayRecord({ ...DAY, [key]: value }), false, `${key}=${JSON.stringify(value)}`)
})

test('모르는 칸, 빈 하루, 값이 비어 있는 칸, 객체가 아니면 거부', () => {
  assert.equal(isPersistedDayRecord({ ...DAY, memo: 'x' }), false)
  assert.equal(isPersistedDayRecord({}), false)
  for (const key of Object.keys(DAY)) {
    const copy = { ...DAY }
    Reflect.set(copy, key, undefined)
    assert.equal(isPersistedDayRecord(copy), false, key)
  }
  for (const value of [null, [], [DAY], 'off', 'text', 3, true]) assert.equal(isPersistedDayRecord(value), false, JSON.stringify(value))
})

test('통과해야 하는 경계 값', () => {
  for (const patch of [
    { fixedCount: 0 }, { palletCount: 0 }, { count: 0 }, { dailyDistance: 0 }, { dailyDistance: 0.5 },
    { fare: '' }, { fare: 0 }, { totalFare: '1,000 원' }, { fixedRouteCounts: {} }, { fixedRouteCounts: { a: 0, b: 7 } },
    { callDetails: [] }, { callDetails: [{ loadLoc: '부산' }] }, { fuelItems: [] }, { maintItems: [] }, { miscItems: [] }, { isOff: true },
  ]) assert.equal(isPersistedDayRecord({ ...DAY, ...patch }), true, JSON.stringify(patch))
  assert.equal(isPersistedDayRecord({ isOff: true }), true)
  assert.equal(isPersistedDayRecord({ count: 1 }), true)
})

test('날짜별 읽기: 옛 "off"는 휴무로, 날짜 아닌 키·틀린 하루·객체 아님은 null', () => {
  assert.deepEqual(parsePersistedWorkDataMap({ '2026-10-01': 'off', '2026-10-02': { count: 1 } }), { '2026-10-01': { isOff: true }, '2026-10-02': { count: 1 } })
  assert.deepEqual(parsePersistedWorkDataMap({}), {})
  assert.equal(parsePersistedWorkDataMap({ 'not-a-date': { count: 1 } }), null)
  assert.equal(parsePersistedWorkDataMap({ '2026-02-30': { count: 1 } }), null)
  assert.equal(parsePersistedWorkDataMap({ '2026-10-01': { count: 1 }, '2026-10-02': { count: -1 } }), null)
  assert.equal(parsePersistedWorkDataMap({ '2026-10-01': {} }), null)
  assert.equal(parsePersistedWorkDataMap({ '2026-10-01': 'on' }), null)
  for (const value of [null, [], 'x', 3]) assert.equal(parsePersistedWorkDataMap(value), null, JSON.stringify(value))
  assert.equal(isPersistedWorkDataMap({ '2026-10-01': DAY }), true)
  assert.equal(isPersistedWorkDataMap([]), false)
})

test('칸 목록(서버 기록 합치기가 씀)은 지금 14칸·순서 그대로', () => {
  assert.deepEqual([...DAY_RECORD_KEYS], [
    'isOff', 'fixedCount', 'palletCount', 'callDetails', 'fixedRouteCounts',
    'fare', 'fixedFare', 'totalFare', 'count', 'dailyDistance',
    'fuelItems', 'maintItems', 'miscItems', 'assignedVehicleNumber',
  ])
})
