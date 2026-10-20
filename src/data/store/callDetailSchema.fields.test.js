// 콜 상세 한 건 검사(24칸·수수료·입금 항목)의 통과/거부를 칸마다 못 박는다 — 검사 코드를 라이브러리로 바꿔도 결과가 같아야 한다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALLOWED_CALL_DETAIL_KEYS, isPersistedCallDetail, isValidCallDetail } from './callDetailSchema.js'

/** @typedef {import('../sync/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

const CALL = {
  id: 'call-1', loadLoc: '부산', unloadLoc: '대구', fare: '300,000', client: '한진', clientId: 'c-1',
  commissionSnapshot: { enabled: true, type: 'percent', value: '10' },
  remarks: '메모', vatExempt: false, paymentStatus: 'partial',
  payments: [{ id: 'p-1', amount: 100000, paidAt: '2026-10-17', note: '일부' }],
  paymentDueDate: '2026-10-31', workDate: '2026-10-17', distanceType: 'round', linkedLoadIndex: '0',
  departureTime: '09:00', arrivalTime: '12:00', platform: '화물맨', cargoTonnage: '5', receipt: 'r-1',
  startOdometer: '1000', endOdometer: '1100', distanceKm: '100', insuranceFee: '1,000원',
}
/** 칸마다 틀린 값 — 손으로 적는다. @type {Array<[string, JsonValue]>} */
const CALL_BAD = [
  ['id', 1], ['id', ''], ['loadLoc', 1], ['unloadLoc', null], ['fare', 'abc'], ['fare', -1], ['fare', 1.5], ['fare', '1,00'],
  ['client', 1], ['clientId', 1], ['commissionSnapshot', null], ['commissionSnapshot', []], ['remarks', 1],
  ['vatExempt', 'no'], ['paymentStatus', 1], ['payments', {}], ['payments', 'x'], ['payments', [null]], ['payments', [[]]],
  ['payments', [{ amount: 'abc' }]], ['payments', [{ id: 1 }]], ['payments', [{ paidAt: 1 }]], ['payments', [{ note: 1 }]],
  ['payments', [{ junk: 1 }]], ['paymentDueDate', 1], ['workDate', 1], ['distanceType', 1], ['linkedLoadIndex', 0],
  ['departureTime', 1], ['arrivalTime', 1], ['platform', 1], ['cargoTonnage', -1], ['cargoTonnage', Number.NaN],
  ['cargoTonnage', Number.POSITIVE_INFINITY], ['cargoTonnage', true], ['receipt', 1], ['startOdometer', 1000],
  ['endOdometer', 1], ['distanceKm', 100], ['insuranceFee', '-1'], ['insuranceFee', true],
]

test('24칸 모두 올바르면 통과(두 검사 모두)', () => {
  assert.equal(isPersistedCallDetail(CALL), true)
  assert.equal(isValidCallDetail(CALL), true)
})

test('칸마다 틀린 종류면 거부', () => {
  for (const [key, value] of CALL_BAD) assert.equal(isPersistedCallDetail({ ...CALL, [key]: value }), false, `${key}=${JSON.stringify(value)}`)
})

test('모르는 칸, 값이 비어 있는 칸, 객체가 아니면 거부', () => {
  assert.equal(isPersistedCallDetail({ ...CALL, junk: 1 }), false)
  for (const key of Object.keys(CALL)) {
    const copy = { ...CALL }
    Reflect.set(copy, key, undefined)
    assert.equal(isPersistedCallDetail(copy), false, key)
  }
  for (const value of [null, [], [CALL], 'text', 3, true]) assert.equal(isPersistedCallDetail(value), false, JSON.stringify(value))
})

test('빈 콜은 거부, id 없는 옛 콜은 저장 기록에선 통과·대기 기록에선 거부', () => {
  assert.equal(isPersistedCallDetail({}), false)
  assert.equal(isPersistedCallDetail({ loadLoc: '부산' }), true)
  assert.equal(isValidCallDetail({ loadLoc: '부산' }), false)
  assert.equal(isValidCallDetail({ id: '', loadLoc: '부산' }), false)
  assert.equal(isValidCallDetail({ id: 'x' }), true)
})

test('통과해야 하는 경계 값', () => {
  for (const patch of [
    { clientId: null }, { cargoTonnage: 0 }, { cargoTonnage: 2.5 }, { cargoTonnage: '' }, { fare: '' }, { fare: 0 },
    { fare: '1000' }, { fare: '1,000 원' }, { insuranceFee: '' }, { payments: [] }, { payments: [{}] },
    { payments: [{ amount: '1,000' }] }, { vatExempt: true },
  ]) assert.equal(isPersistedCallDetail({ ...CALL, ...patch }), true, JSON.stringify(patch))
})

test('수수료 기록: type·value 꼭 있음(null은 통과), enabled 꼭 켜기/끄기, 모르는 칸 거부', () => {
  /** @param {JsonValue} snapshot */
  const check = (snapshot) => isPersistedCallDetail({ ...CALL, commissionSnapshot: snapshot })
  assert.equal(check({ enabled: false, type: null, value: null }), true)
  assert.equal(check({ enabled: true, type: 'direct', value: 5000 }), true)
  assert.equal(check({ enabled: true, type: 'direct', value: Number.NaN }), true, '숫자면 NaN도 받음(지금 코드 그대로)')
  assert.equal(check({ enabled: true, type: 'percent' }), false, 'value 빠짐')
  assert.equal(check({ enabled: true, value: '10' }), false, 'type 빠짐')
  assert.equal(check({ type: 'percent', value: '10' }), false, 'enabled 빠짐')
  assert.equal(check({ enabled: 'y', type: null, value: null }), false)
  assert.equal(check({ enabled: true, type: 1, value: null }), false)
  assert.equal(check({ enabled: true, type: null, value: true }), false)
  assert.equal(check({ enabled: true, type: null, value: null, junk: 1 }), false)
  assert.equal(check({}), false)
})

test('칸 목록(서버 기록 합치기가 씀)은 지금 24칸·순서 그대로', () => {
  assert.deepEqual([...ALLOWED_CALL_DETAIL_KEYS], [
    'id', 'loadLoc', 'unloadLoc', 'fare', 'client', 'clientId', 'commissionSnapshot',
    'remarks', 'vatExempt', 'paymentStatus', 'payments', 'paymentDueDate', 'workDate',
    'distanceType', 'linkedLoadIndex', 'departureTime', 'arrivalTime', 'platform',
    'cargoTonnage', 'receipt', 'startOdometer', 'endOdometer', 'distanceKm', 'insuranceFee',
  ])
})
