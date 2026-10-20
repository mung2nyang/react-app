import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { dayLogReducer, initDayLogState } from './day-log-reducer.js'

describe('initDayLogState — store record을 로컬 draft로 복제', () => {
  test('record가 없으면(신규 날짜) 빈 draft', () => {
    const state = initDayLogState(undefined)
    assert.deepEqual(state.draft, { isOff: false, fixedCount: 0, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
    assert.equal(state.editingCallId, null)
    assert.equal(state.callFormOpen, false)
  })

  test('record 값을 그대로 옮기되 배열/객체는 새 참조로 복제한다(참조 공유 버그 방지)', () => {
    const callDetails = [{ id: 'a', fare: '1000' }]
    const fixedRouteCounts = { r1: 2 }
    const record = { isOff: false, fixedCount: 3, palletCount: 1, callDetails, fixedRouteCounts }
    const state = initDayLogState(record)
    assert.deepEqual(state.draft.callDetails, callDetails)
    assert.notEqual(state.draft.callDetails, callDetails, 'callDetails는 새 배열이어야 한다')
    assert.deepEqual(state.draft.fixedRouteCounts, fixedRouteCounts)
    assert.notEqual(state.draft.fixedRouteCounts, fixedRouteCounts, 'fixedRouteCounts는 새 객체여야 한다')
  })

  test('재감사(FAIL 지적 3번) — initDayLogState는 더 이상 id를 스스로 만들지 않는다', () => {
    // id 없는 레거시 콜상세를 영구 id로 채우는 책임은 domain/day-record.js의
    // backfillCallDetailIds(→ day-record.test.js)로 옮겼다 — useDayDraft.js가
    // 마운트 시 그 함수로 미리 채운 레코드만 initDayLogState에 넘긴다. 이 함수 자신은
    // "이미 있는 값을 그대로 옮기기만" 해야 한다 — 예전처럼 매번 다른 임시 id를
    // 즉석에서 만들면(store에 반영 안 됨) 새로고침·삭제·재정렬마다 id가 흔들렸다.
    const state = initDayLogState({ callDetails: [{ fare: '1000' }] })
    assert.equal(state.draft.callDetails[0].id, undefined, 'initDayLogState가 스스로 id를 만들면 안 된다')
  })

  test('휴무면 fixedCount/palletCount를 0으로 정규화한다', () => {
    const state = initDayLogState({ isOff: true, fixedCount: 5, palletCount: 2 })
    assert.equal(state.draft.fixedCount, 0)
    assert.equal(state.draft.palletCount, 0)
  })
})

describe('dayLogReducer — patchDraft/openCallForm/closeCallForm', () => {
  test('patchDraft는 draft만 얕게 병합하고 나머지 state는 그대로다', () => {
    const state = initDayLogState(undefined)
    const next = dayLogReducer(state, { type: 'patchDraft', patch: { fixedCount: 4 } })
    assert.equal(next.draft.fixedCount, 4)
    assert.equal(next.draft.isOff, false)
    assert.equal(next.editingCallId, null)
    assert.equal(next.callFormOpen, false)
    assert.notEqual(next, state)
    assert.notEqual(next.draft, state.draft)
  })

  test('openCallForm(id)은 콜상세 폼을 열고 editingCallId를 그 id로 둔다', () => {
    const state = initDayLogState(undefined)
    const next = dayLogReducer(state, { type: 'openCallForm', id: 'call-1' })
    assert.equal(next.callFormOpen, true)
    assert.equal(next.editingCallId, 'call-1')
  })

  test('openCallForm(null)은 신규 입력(수정 아님)으로 연다', () => {
    const state = initDayLogState(undefined)
    const next = dayLogReducer(state, { type: 'openCallForm', id: null })
    assert.equal(next.callFormOpen, true)
    assert.equal(next.editingCallId, null)
  })

  test('closeCallForm은 폼을 닫고 editingCallId를 비운다 — draft는 손대지 않는다', () => {
    let state = initDayLogState(undefined)
    state = dayLogReducer(state, { type: 'patchDraft', patch: { fixedCount: 7 } })
    state = dayLogReducer(state, { type: 'openCallForm', id: 'x' })
    const next = dayLogReducer(state, { type: 'closeCallForm' })
    assert.equal(next.callFormOpen, false)
    assert.equal(next.editingCallId, null)
    assert.equal(next.draft.fixedCount, 7)
  })

  test('알 수 없는 action은 state를 그대로(같은 참조) 돌려준다', () => {
    // 이 파일은 // @ts-check 대상이 아니다(다른 도메인 테스트 파일들과 같은 관례) —
    // 여기서는 리듀서의 런타임 방어(default 분기)만 확인하면 되고, 잘못된 action
    // 모양을 타입으로 굳이 흉내 낼 필요가 없다.
    const state = initDayLogState(undefined)
    const next = dayLogReducer(state, { type: 'unknown' })
    assert.equal(next, state)
  })
})
