// 로드맵 67-A — 1,000줄씩 끝까지 이어 받는다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PAGE_SIZE, fetchAllRows } from './fetchAllRows.js'

/**
 * 서버처럼 range로 잘라 주는 가짜 쿼리. errorAtCall번째 요청이면 오류.
 * @param {number} total @param {number} [errorAtCall]
 */
function fakeTable(total, errorAtCall = -1) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  /** @type {Array<[number, number]>} */
  const calls = []
  const buildQuery = () => ({
    /** @param {number} from @param {number} to */
    range: (from, to) => {
      calls.push([from, to])
      if (calls.length === errorAtCall) return Promise.resolve({ data: null, error: { message: 'page down' } })
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
    },
  })
  return { buildQuery, calls }
}

test('P-1 2,500줄 → 3번 요청, 2,500줄 모두 순서대로', async () => {
  const table = fakeTable(2500)
  const { data, error } = await fetchAllRows(table.buildQuery)
  assert.equal(error, null)
  assert.equal(data?.length, 2500)
  assert.deepEqual(data?.slice(998, 1002).map((row) => row.id), [998, 999, 1000, 1001])
  assert.deepEqual(table.calls, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('P-2 정확히 1,000줄 → 2번 요청(두 번째 0줄)로 끝', async () => {
  const table = fakeTable(PAGE_SIZE)
  const { data } = await fetchAllRows(table.buildQuery)
  assert.equal(data?.length, 1000)
  assert.equal(table.calls.length, 2)
})

test('P-3 두 번째 묶음 오류 → 받은 것 버리고 오류만', async () => {
  const table = fakeTable(2500, 2)
  const result = await fetchAllRows(table.buildQuery)
  assert.deepEqual(result, { data: null, error: { message: 'page down' } })
})

test('P-4 1,000줄 미만 → 1번 요청(지금과 같음)', async () => {
  const table = fakeTable(37)
  const { data } = await fetchAllRows(table.buildQuery)
  assert.equal(data?.length, 37)
  assert.equal(table.calls.length, 1)
})
