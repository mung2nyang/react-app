// 재감사 3차(FAIL 지적 1번) — saveWorkDataWithTombstoneCheck(useDayDraft.js/
// pendingWorkDataWrites.js가 실제로 쓰는 커밋 경로)가 "빈 날 삭제 -> tombstone 기록"과
// "삭제 대기 중이던 날짜에 재입력 -> tombstone 해제"를 정확히 workData 커밋과 같은
// 원자적 트랜잭션(commitBatch)으로 묶는지, 그리고 평범한 편집(삭제도 재입력도
// 아닌)에서는 tombstone 도메인을 건드리지 않는지를 실측한다.
import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const { saveWorkDataWithTombstoneCheck, saveWorkData } = await import('./workData.js')
const { getState, subscribe } = await import('../store/app-store.js')
const { readJsonKey } = await import('../store/persist.js')
const { commitWorkDataDeletedDates } = await import('../store/commitHelpers.js')

test('날짜가 실제로 지워지면(있었는데 없어짐) workData 커밋과 같은 트랜잭션에 tombstone을 기록한다', () => {
  const ownerKey = 'wd-tombstone-delete'
  const dateKey = '2026-08-10'
  const previous = { [dateKey]: { isOff: false, fixedCount: 3, callDetails: [] } }
  const next = {}

  let notifyCount = 0
  const unsubscribe = subscribe(() => { notifyCount += 1 })
  saveWorkDataWithTombstoneCheck(ownerKey, dateKey, previous, next)
  unsubscribe()

  assert.equal(notifyCount, 1, 'workData+tombstone 두 도메인을 한 commitBatch로 묶었으니 notify는 정확히 한 번이어야 한다')
  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined, '삭제된 날짜는 store에 없어야 한다')
  assert.ok(dateKey in getState().workDataDeletedDates[ownerKey], 'tombstone이 같은 커밋에 기록돼야 한다')
  assert.ok(dateKey in readJsonKey('workDataDeletedDates', ownerKey, {}), 'localStorage에도 반영돼야 한다')
})

test('삭제 대기 중이던 날짜에 재입력이 들어오면(tombstone 있었는데 다시 값이 생김) 같은 트랜잭션에서 tombstone을 지운다', () => {
  const ownerKey = 'wd-tombstone-revive'
  const dateKey = '2026-08-11'
  commitWorkDataDeletedDates(ownerKey, { [dateKey]: '2026-08-01T00:00:00.000Z' }, { syncToCloud: false })

  const previous = {} // 화면 입장에선 지워진 채였다
  const next = { [dateKey]: { isOff: false, fixedCount: 2, callDetails: [] } }
  saveWorkDataWithTombstoneCheck(ownerKey, dateKey, previous, next)

  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 2, '재입력된 값이 store에 반영돼야 한다')
  assert.equal(dateKey in getState().workDataDeletedDates[ownerKey], false, '되살아난 날짜의 tombstone은 지워져야 한다 — 안 지우면 나중에 syncDeletedWorkDates가 방금 되살린 데이터를 지운다')
})

test('평범한 편집(삭제도 재입력도 아님)은 tombstone 도메인을 전혀 건드리지 않는다', () => {
  const ownerKey = 'wd-tombstone-noop'
  const dateKey = '2026-08-12'
  const previous = { [dateKey]: { isOff: false, fixedCount: 3, callDetails: [] } }
  const next = { [dateKey]: { isOff: false, fixedCount: 5, callDetails: [] } }

  let notifyCount = 0
  const unsubscribe = subscribe(() => { notifyCount += 1 })
  saveWorkDataWithTombstoneCheck(ownerKey, dateKey, previous, next)
  unsubscribe()

  assert.equal(notifyCount, 1)
  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 5)
  assert.equal(getState().workDataDeletedDates[ownerKey], undefined, '이 owner는 tombstone 도메인 자체를 커밋한 적이 없어야 한다')
  assert.equal(readJsonKey('workDataDeletedDates', ownerKey, null), null, 'localStorage에도 tombstone 키가 안 생겨야 한다')
})

test('원자성 — workData 커밋 자체가 실패하면(quota) tombstone도 전혀 반영되지 않는다', () => {
  const ownerKey = 'wd-tombstone-atomic-fail'
  const dateKey = '2026-08-13'
  const previous = { [dateKey]: { isOff: false, fixedCount: 3, callDetails: [] } }
  const next = {}

  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const spy = mock.method(proto, 'setItem', function patchedSetItem(key, value) {
    if (key.startsWith('reactPracticeWorkData:')) throw new Error('quota exceeded (simulated)')
    return original.call(this, key, value)
  })

  try {
    assert.throws(() => saveWorkDataWithTombstoneCheck(ownerKey, dateKey, previous, next))
    assert.equal(getState().workDataDeletedDates[ownerKey], undefined, 'workData 쪽이 실패했으면 tombstone도 반영되면 안 된다(원자적)')
    assert.equal(readJsonKey('workDataDeletedDates', ownerKey, null), null)
  } finally {
    spy.mock.restore()
  }
})

test('saveWorkData(일반 저장)는 여전히 그대로 동작한다(회귀 방지)', () => {
  const ownerKey = 'wd-plain-save'
  saveWorkData(ownerKey, { '2026-08-14': { isOff: false, fixedCount: 1, callDetails: [] } })
  assert.equal(getState().workLogs[ownerKey]?.main?.['2026-08-14']?.fixedCount, 1)
})
