import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { singleFlight, resetSingleFlightForTests } from './singleFlight.js'

describe('singleFlight', () => {
  test('같은 key로 동시에 부르면 factory는 한 번만 실행되고 같은 Promise를 공유한다', async () => {
    resetSingleFlightForTests()
    let calls = 0
    const factory = () => { calls += 1; return Promise.resolve('result') }

    const [a, b] = await Promise.all([
      singleFlight('key-1', factory),
      singleFlight('key-1', factory),
    ])

    assert.equal(calls, 1)
    assert.equal(a, 'result')
    assert.equal(b, 'result')
  })

  test('먼저 시작한 요청이 끝난 뒤에는 같은 key로 다시 불러도 새 factory가 실행된다', async () => {
    resetSingleFlightForTests()
    let calls = 0
    const factory = () => { calls += 1; return Promise.resolve(calls) }

    const first = await singleFlight('key-2', factory)
    const second = await singleFlight('key-2', factory)

    assert.equal(first, 1)
    assert.equal(second, 2)
    assert.equal(calls, 2)
  })

  test('실패해도 in-flight 항목이 정리돼 다음 호출은 새로 실행된다', async () => {
    resetSingleFlightForTests()
    let calls = 0
    const failingFactory = () => { calls += 1; return Promise.reject(new Error('boom')) }

    await assert.rejects(() => singleFlight('key-3', failingFactory), /boom/)
    await assert.rejects(() => singleFlight('key-3', failingFactory), /boom/)

    assert.equal(calls, 2, '실패 후에는 in-flight 캐시가 남아 있으면 안 된다')
  })

  test('다른 key는 서로 독립적으로 동시에 실행된다', async () => {
    resetSingleFlightForTests()
    const calls = []
    const [a, b] = await Promise.all([
      singleFlight('key-a', () => { calls.push('a'); return Promise.resolve('A') }),
      singleFlight('key-b', () => { calls.push('b'); return Promise.resolve('B') }),
    ])
    assert.equal(a, 'A')
    assert.equal(b, 'B')
    assert.equal(calls.length, 2)
  })
})
