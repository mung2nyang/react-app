// 로드맵 101-B — 두 화면이 같이 쓰는 saveExpenseDraft·deleteExpense: 최신 목록을 다시 읽어 고치고, 알림 문구를 돌려준다.
import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const { saveExpenseDraft, deleteExpense } = await import('./expensesSave.ts')
const { commitExpenses } = await import('../store/commitHelpers.ts')
const { getState } = await import('../store/app-store.ts')
const { readJsonKey, storageKeyFor } = await import('../store/persist.ts')
const { DEVICE_SAVE_FAIL } = await import('../../shared/utils/failureMessages.js')

const e1 = { id: 'e1', kind: /** @type {'maint'} */ ('maint'), date: '2026-08-01', name: '오일', category: '엔진/미션', payment: '카드', cost: 10000 }

/** 기기 저장소에 지출 키를 쓸 때만 실패시킨다. @param {string} ownerKey */
function failExpenseWrites(ownerKey) {
  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('expenses', ownerKey)
  return mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === failKey) throw new Error('quota exceeded (simulated)')
    return originalSetItem.call(this, key, value)
  })
}

/** console.error 중 앞말이 같은 것만 센다. @param {string} prefix */
function spyConsoleError(prefix) {
  let count = 0
  const spy = mock.method(console, 'error', /** @param {Array<string|Error>} args */ (...args) => { if (args[0] === prefix) count += 1 })
  return { count: () => count, restore: () => spy.mock.restore() }
}

test('저장 전 검사에 걸리면 검사 문구를 돌려주고 저장소는 그대로', async () => {
  const ownerKey = 'exp-draft-check'
  commitExpenses(ownerKey, [e1])
  const message = await saveExpenseDraft(ownerKey, { kind: 'maint', date: '2026-08-02' }, null)
  assert.equal(message, '항목명 또는 비용을 입력해 주세요.')
  assert.deepEqual(getState().expenses[ownerKey], [e1])
})

test('저장 성공이면 null, 최신 목록에 더해 저장소와 기기에 반영', async () => {
  const ownerKey = 'exp-draft-save'
  commitExpenses(ownerKey, [e1])
  const message = await saveExpenseDraft(ownerKey, { kind: 'maint', date: '2026-08-02', name: '타이어', cost: 20000 }, null)
  assert.equal(message, null)
  const saved = getState().expenses[ownerKey]
  assert.equal(saved.length, 2)
  assert.deepEqual(saved[0], e1)
  assert.equal(saved[1].name, '타이어')
  assert.deepEqual(readJsonKey('expenses', ownerKey, []), JSON.parse(JSON.stringify(saved)))
})

test('고치기는 같은 번호의 내역만 바꾼다', async () => {
  const ownerKey = 'exp-draft-edit'
  commitExpenses(ownerKey, [e1])
  const message = await saveExpenseDraft(ownerKey, { kind: 'maint', date: '2026-08-01', name: '오일 교환', cost: 12000 }, 'e1')
  assert.equal(message, null)
  const saved = getState().expenses[ownerKey]
  assert.equal(saved.length, 1)
  assert.equal(saved[0].id, 'e1')
  assert.equal(saved[0].name, '오일 교환')
  assert.equal(saved[0].cost, 12000)
})

test('저장 실패면 실패 문구, 콘솔 앞말 "비용 저장 실패:", 저장소 그대로', async () => {
  const ownerKey = 'exp-draft-save-fail'
  commitExpenses(ownerKey, [e1])
  const spy = failExpenseWrites(ownerKey)
  const errSpy = spyConsoleError('비용 저장 실패:')
  try {
    const message = await saveExpenseDraft(ownerKey, { kind: 'maint', date: '2026-08-02', name: '타이어', cost: 20000 }, null)
    assert.equal(message, DEVICE_SAVE_FAIL)
    assert.equal(errSpy.count(), 1)
  } finally {
    errSpy.restore()
    spy.mock.restore()
  }
  assert.deepEqual(getState().expenses[ownerKey], [e1])
  assert.deepEqual(readJsonKey('expenses', ownerKey, []), [e1])
})

test('삭제 성공이면 null, 그 내역만 빠짐', async () => {
  const ownerKey = 'exp-draft-delete'
  const e2 = { ...e1, id: 'e2', name: '필터' }
  commitExpenses(ownerKey, [e1, e2])
  const message = await deleteExpense(ownerKey, 'e1')
  assert.equal(message, null)
  assert.deepEqual(getState().expenses[ownerKey], [e2])
})

test('삭제 실패면 실패 문구, 콘솔 앞말 "비용 삭제 실패:", 저장소 그대로', async () => {
  const ownerKey = 'exp-draft-delete-fail'
  commitExpenses(ownerKey, [e1])
  const spy = failExpenseWrites(ownerKey)
  const errSpy = spyConsoleError('비용 삭제 실패:')
  try {
    const message = await deleteExpense(ownerKey, 'e1')
    assert.equal(message, DEVICE_SAVE_FAIL)
    assert.equal(errSpy.count(), 1)
  } finally {
    errSpy.restore()
    spy.mock.restore()
  }
  assert.deepEqual(getState().expenses[ownerKey], [e1])
})
