// 로드맵 110-A — 로그인 일지 저장 실패 날짜 목록(휴대폰, 계정별, 날짜만).
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { addFailedDayLogDate, listFailedDayLogDates, removeFailedDayLogDate, subscribeFailedDayLogDates } from './failedDayLogDates.ts'

const KEY = 'drivelogFailedDayLogDates'
beforeEach(() => { localStorage.removeItem(KEY) })

test('더하기는 한 번만, 지우기는 그 차량·날짜만', () => {
  addFailedDayLogDate('own-a', 'main', '2026-10-22')
  addFailedDayLogDate('own-a', 'main', '2026-10-22')
  addFailedDayLogDate('own-a', '34나5678', '2026-10-22')
  addFailedDayLogDate('own-a', 'main', '2026-10-23')
  assert.deepEqual(listFailedDayLogDates('own-a'), [
    { logId: 'main', dateKey: '2026-10-22' },
    { logId: '34나5678', dateKey: '2026-10-22' },
    { logId: 'main', dateKey: '2026-10-23' },
  ])
  removeFailedDayLogDate('own-a', 'main', '2026-10-22')
  assert.deepEqual(listFailedDayLogDates('own-a'), [
    { logId: '34나5678', dateKey: '2026-10-22' },
    { logId: 'main', dateKey: '2026-10-23' },
  ])
})

test('계정마다 따로, 휴대폰에 남아 다시 읽어도 그대로', () => {
  addFailedDayLogDate('own-a', 'main', '2026-10-22')
  addFailedDayLogDate('own-b', 'main', '2026-10-21')
  assert.deepEqual(listFailedDayLogDates('own-b'), [{ logId: 'main', dateKey: '2026-10-21' }])
  assert.deepEqual(JSON.parse(localStorage.getItem(KEY) || '{}'), {
    'own-a': [{ logId: 'main', dateKey: '2026-10-22' }],
    'own-b': [{ logId: 'main', dateKey: '2026-10-21' }],
  })
})

test('깨진 값은 그 항목·목록만 무시', () => {
  localStorage.setItem(KEY, JSON.stringify({
    'own-a': [{ logId: 'main', dateKey: '2026-10-22' }, { logId: 'main', dateKey: '2026-02-30' }, { logId: 3, dateKey: '2026-10-22' }, null, 'x'],
    'own-b': 'not-array',
  }))
  assert.deepEqual(listFailedDayLogDates('own-a'), [{ logId: 'main', dateKey: '2026-10-22' }])
  assert.deepEqual(listFailedDayLogDates('own-b'), [])
  localStorage.setItem(KEY, '{')
  assert.deepEqual(listFailedDayLogDates('own-a'), [])
  localStorage.setItem(KEY, '[1]')
  assert.deepEqual(listFailedDayLogDates('own-a'), [])
})

test('휴대폰 저장소를 못 써도 던지지 않는다', () => {
  const getItem = mock.method(Object.getPrototypeOf(localStorage), 'getItem', () => { throw new Error('막힘') })
  const setItem = mock.method(Object.getPrototypeOf(localStorage), 'setItem', () => { throw new Error('막힘') })
  try {
    assert.doesNotThrow(() => addFailedDayLogDate('own-a', 'main', '2026-10-22'))
    assert.doesNotThrow(() => removeFailedDayLogDate('own-a', 'main', '2026-10-22'))
    assert.deepEqual(listFailedDayLogDates('own-a'), [])
  } finally {
    getItem.mock.restore()
    setItem.mock.restore()
  }
})

test('바뀔 때만 구독자를 부르고, 해제하면 안 부른다', () => {
  let calls = 0
  const stop = subscribeFailedDayLogDates(() => { calls += 1 })
  addFailedDayLogDate('own-a', 'main', '2026-10-22')
  addFailedDayLogDate('own-a', 'main', '2026-10-22')
  removeFailedDayLogDate('own-a', 'main', '2026-10-21')
  removeFailedDayLogDate('own-a', 'main', '2026-10-22')
  assert.equal(calls, 2)
  stop()
  addFailedDayLogDate('own-a', 'main', '2026-10-23')
  assert.equal(calls, 2)
})
