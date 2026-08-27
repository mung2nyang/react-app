import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildMutationOp,
  buildTombstoneOp,
  getPendingMutation,
  getPendingOps,
  hasPendingOps,
  isTombstoned,
  mergeOutboxOp,
  outboxStorageKey,
  planOutboxAppend,
  readOutbox,
  removeOutboxOp,
} from './mutationOutbox.js'
import { writeAllOrNothing } from '../store/atomicPersist.js'

function seed(ownerKey, op) {
  const { key, value } = planOutboxAppend(ownerKey, op)
  writeAllOrNothing([{ key, value }])
  return op
}

describe('outboxStorageKey / readOutbox', () => {
  test('빈 owner는 빈 배열을 돌려준다', () => {
    assert.deepEqual(readOutbox('outbox-empty-owner'), [])
  })
  test('저장 키는 owner별로 다르다', () => {
    assert.notEqual(outboxStorageKey('a'), outboxStorageKey('b'))
  })
})

describe('mergeOutboxOp — 순수 병합 규칙', () => {
  test('같은 리소스에 대한 mutation은 최신 것으로 교체된다(latest wins)', () => {
    const first = buildMutationOp({ ownerKey: 'o', userId: 'u', resourceType: 'driverLink', resourceId: 'd1', operation: 'updateStatus', payload: { status: 'linked' }, sessionEpoch: 1 })
    const second = buildMutationOp({ ownerKey: 'o', userId: 'u', resourceType: 'driverLink', resourceId: 'd1', operation: 'updateStatus', payload: { status: 'pending' }, sessionEpoch: 1 })
    const merged = mergeOutboxOp([first], second)
    assert.equal(merged.length, 1)
    assert.equal(merged[0].id, second.id)
    assert.equal(merged[0].payload.status, 'pending')
  })

  test('tombstone은 같은 리소스의 이전 mutation을 전부 대체한다(삭제가 우선)', () => {
    const statusChange = buildMutationOp({ ownerKey: 'o', userId: 'u', resourceType: 'driverLink', resourceId: 'd1', operation: 'updateStatus', payload: { status: 'linked' }, sessionEpoch: 1 })
    const del = buildTombstoneOp({ ownerKey: 'o', userId: 'u', resourceType: 'driverLink', resourceId: 'd1', operation: 'delete', sessionEpoch: 1 })
    const merged = mergeOutboxOp([statusChange], del)
    assert.equal(merged.length, 1)
    assert.equal(merged[0].kind, 'tombstone')
  })

  test('이미 tombstone이 대기 중인 리소스에 새 mutation이 들어오면 무시한다(삭제가 더 강한 의도)', () => {
    const del = buildTombstoneOp({ ownerKey: 'o', userId: 'u', resourceType: 'driverLink', resourceId: 'd1', operation: 'delete', sessionEpoch: 1 })
    const lateStatusChange = buildMutationOp({ ownerKey: 'o', userId: 'u', resourceType: 'driverLink', resourceId: 'd1', operation: 'updateStatus', payload: { status: 'linked' }, sessionEpoch: 1 })
    const merged = mergeOutboxOp([del], lateStatusChange)
    assert.equal(merged.length, 1)
    assert.equal(merged[0].kind, 'tombstone')
  })

  test('다른 리소스의 작업은 서로 영향을 주지 않는다', () => {
    const opA = buildTombstoneOp({ ownerKey: 'o', userId: 'u', resourceType: 'vehicle', resourceId: 'v1', operation: 'delete', sessionEpoch: 1 })
    const opB = buildTombstoneOp({ ownerKey: 'o', userId: 'u', resourceType: 'vehicle', resourceId: 'v2', operation: 'delete', sessionEpoch: 1 })
    const merged = mergeOutboxOp([opA], opB)
    assert.equal(merged.length, 2)
  })
})

describe('planOutboxAppend — 계산만 하고 쓰지 않는다', () => {
  test('planOutboxAppend를 호출한 것만으로는 localStorage가 안 바뀐다', () => {
    const ownerKey = 'outbox-plan-only'
    const op = buildTombstoneOp({ ownerKey, userId: 'u', resourceType: 'vehicle', resourceId: 'v1', operation: 'delete', sessionEpoch: 1 })
    planOutboxAppend(ownerKey, op)
    assert.deepEqual(readOutbox(ownerKey), [], '실제 쓰기(writeAllOrNothing)를 호출부가 하기 전엔 저장되면 안 된다')
  })
})

describe('getPendingOps / hasPendingOps / isTombstoned / getPendingMutation', () => {
  test('작업을 저장하면 조회 함수들이 그 값을 반영한다', () => {
    const ownerKey = 'outbox-queries'
    assert.equal(hasPendingOps(ownerKey), false)
    const op = seed(ownerKey, buildTombstoneOp({ ownerKey, userId: 'u', resourceType: 'vehicle', resourceId: 'v9', operation: 'delete', sessionEpoch: 1 }))
    assert.equal(hasPendingOps(ownerKey), true)
    assert.equal(getPendingOps(ownerKey).length, 1)
    assert.equal(isTombstoned(ownerKey, 'vehicle', 'v9'), true)
    assert.equal(isTombstoned(ownerKey, 'vehicle', 'other'), false)
    assert.equal(isTombstoned(ownerKey, 'client', 'v9'), false, 'resourceType이 다르면 매치하면 안 된다')

    removeOutboxOp(ownerKey, op.id)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(isTombstoned(ownerKey, 'vehicle', 'v9'), false)
  })

  test('getPendingMutation은 tombstone이 아닌 작업만 돌려준다', () => {
    const ownerKey = 'outbox-pending-mutation'
    seed(ownerKey, buildMutationOp({ ownerKey, userId: 'u', resourceType: 'driverLink', resourceId: 'd1', operation: 'updateStatus', payload: { status: 'linked' }, sessionEpoch: 1 }))
    const pending = getPendingMutation(ownerKey, 'driverLink', 'd1')
    assert.equal(pending?.operation, 'updateStatus')
    assert.equal(getPendingMutation(ownerKey, 'driverLink', 'nope'), null)
  })

  test('resourceId가 없으면(빈 문자열/undefined) 항상 false/null — 잘못된 전역 매치 방지', () => {
    assert.equal(isTombstoned('any-owner', 'vehicle', ''), false)
    assert.equal(isTombstoned('any-owner', 'vehicle', undefined), false)
    assert.equal(getPendingMutation('any-owner', 'vehicle', ''), null)
  })
})
