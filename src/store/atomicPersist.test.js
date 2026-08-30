// Step 0-4 감사 보완 2차/3차 — 커밋 전 자체 교차검증(사용자 지시)에서 발견한 결함의
// 회귀 테스트. commitBatch가 여러 localStorage 키를 쓰는 도중 하나가 실패하면
// (용량 초과, 순환 참조로 인한 JSON.stringify 실패 등) 이미 쓴 키가 새 값으로 남고
// 나머지는 그대로인 "부분 반영" 상태가 될 수 있었다 — writeAllOrNothing이 이걸 막는다.
// 3차 보완에서 (domain, ownerKey, value) 대신 (key, value) 쌍을 직접 받도록
// 바뀌었다(도메인 값과 dirty journal 값을 같은 배열에 섞어 넣을 수 있어야 해서 —
// journal 키는 persist.js의 9개 도메인 계약 밖이라 storageKeyFor로 못 만든다).
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { writeAllOrNothing } from './atomicPersist.js'
import { readJsonKey, storageKeyFor, writeJsonKey } from './persist.js'

// Storage 전역 이름에 기대지 않고 프로토타입에서 원본 setItem을 직접 캡처한다 —
// jsdom이 항상 전역 Storage 생성자를 노출한다는 보장이 없다.
/**
 * @param {(key: string) => boolean} shouldFail
 * @param {() => void} fn
 */
function withFailingSetItem(shouldFail, fn) {
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const spy = mock.method(proto, 'setItem', function patchedSetItem(/** @type {string} */ key, /** @type {string} */ value) {
    if (shouldFail(key)) throw new Error('quota exceeded (simulated)')
    return original.call(localStorage, key, value)
  })
  try {
    fn()
  } finally {
    spy.mock.restore()
  }
}

describe('writeAllOrNothing — 전부 성공', () => {
  test('여러 키를 한 번에 쓰면 전부 반영된다', () => {
    const owner = 'atomic-ok'
    writeAllOrNothing([
      { key: storageKeyFor('cars', owner), value: [{ id: 'car-a' }] },
      { key: storageKeyFor('profile', owner), value: { name: '정상' } },
    ])
    assert.deepEqual(readJsonKey('cars', owner, []), [{ id: 'car-a' }])
    assert.deepEqual(readJsonKey('profile', owner, {}), { name: '정상' })
  })
})

describe('writeAllOrNothing — 직렬화 실패(순환 참조)는 아무것도 쓰지 않는다', () => {
  test('뒤 항목이 순환 참조여도 앞 항목이 먼저 쓰이지 않는다', () => {
    const owner = 'atomic-circular'
    writeJsonKey('cars', owner, [{ id: 'seed' }])
    const circular = {}
    circular.self = circular

    assert.throws(() => writeAllOrNothing([
      { key: storageKeyFor('cars', owner), value: [{ id: 'should-not-write' }] },
      { key: storageKeyFor('profile', owner), value: circular },
    ]))

    assert.deepEqual(readJsonKey('cars', owner, []), [{ id: 'seed' }], 'stringify 단계에서 전부 실패해야 하므로 cars도 안 바뀌어야 한다')
  })
})

describe('writeAllOrNothing — 쓰기 도중 실패는 이미 쓴 항목을 원래 값으로 되돌린다', () => {
  test('기존 값이 있던 키는 실패 후 원래 값으로 복원된다', () => {
    const owner = 'atomic-rollback'
    writeJsonKey('cars', owner, [{ id: 'original-cars' }])
    writeJsonKey('profile', owner, { name: 'original-profile' })
    const profileKey = storageKeyFor('profile', owner)

    withFailingSetItem((key) => key === profileKey, () => {
      assert.throws(
        () => writeAllOrNothing([
          { key: storageKeyFor('cars', owner), value: [{ id: 'new-cars' }] },
          { key: profileKey, value: { name: 'new-profile' } },
        ]),
        /quota exceeded/,
      )
    })

    assert.deepEqual(readJsonKey('cars', owner, []), [{ id: 'original-cars' }], 'cars는 먼저 쓰였지만 profile 실패로 원래 값으로 롤백돼야 한다')
    assert.deepEqual(readJsonKey('profile', owner, {}), { name: 'original-profile' }, 'profile은 실패했으니 원래 값 그대로 남아야 한다')
  })

  test('원래 없던(신규) 키는 실패 후 완전히 지워진다', () => {
    const owner = 'atomic-rollback-new'
    const profileKey = storageKeyFor('profile', owner)

    withFailingSetItem((key) => key === profileKey, () => {
      assert.throws(() => writeAllOrNothing([
        { key: storageKeyFor('cars', owner), value: [{ id: 'brand-new' }] },
        { key: profileKey, value: { name: 'x' } },
      ]))
    })

    assert.equal(localStorage.getItem(storageKeyFor('cars', owner)), null, '실패 전 처음 쓴 키는 원래 없었으니 롤백 후 다시 없어야 한다')
  })

  test('임의의 key(예: dirty journal 키)도 도메인 키와 함께 섞어 쓸 수 있다', () => {
    const owner = 'atomic-mixed-key'
    const journalKey = `reactPracticeDirtyJournal:${owner}`

    withFailingSetItem((key) => key === journalKey, () => {
      assert.throws(() => writeAllOrNothing([
        { key: storageKeyFor('cars', owner), value: [{ id: 'should-rollback' }] },
        { key: journalKey, value: { cars: 1 } },
      ]))
    })

    assert.equal(localStorage.getItem(storageKeyFor('cars', owner)), null, 'journal 실패 시 도메인 키도 함께 롤백돼야 한다')
    assert.equal(localStorage.getItem(journalKey), null, 'journal 자체도 안 쓰여야 한다')
  })

  test('remove 항목이 실패한 setItem 뒤에 있으면 삭제와 선행 쓰기가 함께 롤백된다', () => {
    const owner = 'atomic-remove-rollback'
    const carsKey = storageKeyFor('cars', owner)
    const logKey = `reactPracticeWorkData:${owner}:log:11가1111`
    localStorage.setItem(logKey, JSON.stringify({ '2026-08-01': { fixedCount: 1 } }))
    writeJsonKey('cars', owner, [{ id: 'keep' }])
    const failKey = storageKeyFor('profile', owner)
    withFailingSetItem((key) => key === failKey, () => {
      assert.throws(() => writeAllOrNothing([
        { key: carsKey, value: [{ id: 'new' }] },
        { key: logKey, remove: true },
        { key: failKey, value: { name: 'x' } },
      ]))
    })
    assert.deepEqual(readJsonKey('cars', owner, []), [{ id: 'keep' }])
    assert.equal(localStorage.getItem(logKey), JSON.stringify({ '2026-08-01': { fixedCount: 1 } }))
  })
})
