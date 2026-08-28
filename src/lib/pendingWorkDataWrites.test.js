// 재감사 3차(FAIL 지적 2번) — durable(localStorage 기반) 큐를 실측한다: 등록 즉시
// localStorage에 반영되는지, "모듈 재시작 후"(이 프로세스에서는 registerPendingDayWrite를
// 거치지 않고 localStorage에 직접 써 넣어 흉내낸다 — 실제 하드 새로고침 뒤 모듈이
// 다시 로드되는 것과 똑같이, 이 모듈은 항상 localStorage를 그때그때 다시 읽는다)에도
// 복구되는지, owner가 서로 섞이지 않는지, durable 기록 자체가 실패하면
// durableWriteGuard가 정확히 반응하는지를 확인한다.
import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const {
  registerPendingDayWrite, clearPendingDayWrite, getPendingDayWrite,
  hasPendingDayWrites, hasUnsafePendingWrites, pendingDayWriteCount, retryPendingDayWrites,
} = await import('./pendingWorkDataWrites.js')
const { isDurableWriteBroken } = await import('./durableWriteGuard.js')
const { getState, subscribe } = await import('../store/app-store.js')
const { readJsonKey } = await import('../store/persist.js')
const { commitWorkData } = await import('../store/commitHelpers.js')
const { hasDirty } = await import('./dirtyJournal.js')

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

/** @param {string} ownerKey */
function durableRaw(ownerKey) {
  return JSON.parse(localStorage.getItem(`reactPracticeDurablePendingWrites:${ownerKey}`) || '{}')
}

// 재감사 6차(FAIL 지적 3번) — readWorkData(ownerKey)는 fallback 인자
// {}로부터 반환 타입을 Record<string, DayRecordLike>가 아니라 {}(빈 객체 타입)로
// 추론해서, 그 결과를 [dateKey]로 인덱싱할 때마다 TS7053이 났다. fallback을 실제
// 모양(Record<string, DayRecordLike>)으로 명시해 한 곳에서만 고친다.
/** @param {string} ownerKey @returns {Record<string, DayRecordLike>} */
function readWorkData(ownerKey) {
  return readJsonKey('workData', ownerKey, /** @type {Record<string, DayRecordLike>} */ ({}))
}

// app-store.js의 workLogs는 `Record<string, Record<string, object>>`로 선언돼 있어(그
// 파일 자체의 기존 결정, 이번 라운드에서 손대지 않았다) `.main?.[dateKey]`를 그대로
// 인덱싱하면 TS7053이 난다 — 이 파일에서 새로 추가한 테스트만 이 헬퍼로 우회한다.
/** @param {string} ownerKey @param {string} dateKey @returns {DayRecordLike|undefined} */
function committedRecord(ownerKey, dateKey) {
  const main = getState().workLogs[ownerKey]?.main
  return main ? (/** @type {Record<string, DayRecordLike>} */ (main))[dateKey] : undefined
}

test('등록 즉시 localStorage(durable)에 반영된다', () => {
  const ownerKey = 'pw-durable-basic'
  const patch = { isOff: false, fixedCount: 3, palletCount: 0, callDetails: [], fixedRouteCounts: {} }
  registerPendingDayWrite(ownerKey, '2026-08-01', patch)
  assert.deepEqual(durableRaw(ownerKey)['2026-08-01'], { isOff: false, fixedCount: 3, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  assert.equal(getPendingDayWrite(ownerKey, '2026-08-01')?.fixedCount, 3)
  clearPendingDayWrite(ownerKey, '2026-08-01', patch)
})

test('"모듈 재시작 후" 복구 — registerPendingDayWrite를 거치지 않고 localStorage에 직접 있던 값도 그대로 읽고 재시도한다', () => {
  const ownerKey = 'pw-hard-reload'
  const dateKey = '2026-08-02'
  // 실제 하드 새로고침 뒤라면 메모리 Map은 비어 있고 localStorage만 남는다 —
  // registerPendingDayWrite를 아예 부르지 않고 durable 키에 직접 써서 그 상태를 흉내낸다.
  localStorage.setItem(`reactPracticeDurablePendingWrites:${ownerKey}`, JSON.stringify({ [dateKey]: { isOff: false, fixedCount: 4, palletCount: 0, callDetails: [], fixedRouteCounts: {} } }))

  assert.equal(hasPendingDayWrites(), true)
  assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 4)

  retryPendingDayWrites()
  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 4, '복구된 durable 항목이 store에 반영돼야 한다')
  assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 4)
  assert.deepEqual(durableRaw(ownerKey), {}, '성공했으니 durable 큐에서 지워져야 한다')
})

test('owner 전환 — 서로 다른 owner의 durable 큐는 섞이지 않는다', () => {
  const ownerA = 'pw-owner-a'
  const ownerB = 'pw-owner-b'
  registerPendingDayWrite(ownerA, '2026-08-03', { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  registerPendingDayWrite(ownerB, '2026-08-04', { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} })

  assert.equal(pendingDayWriteCount() >= 2, true)
  retryPendingDayWrites()

  assert.equal(getState().workLogs[ownerA]?.main?.['2026-08-03']?.fixedCount, 1)
  assert.equal(getState().workLogs[ownerB]?.main?.['2026-08-04']?.fixedCount, 2)
  assert.deepEqual(durableRaw(ownerA), {}, 'A owner의 큐만 A의 커밋으로 지워져야 한다')
  assert.deepEqual(durableRaw(ownerB), {}, 'B owner의 큐도 B의 커밋으로 각자 지워져야 한다(서로 안 섞인다)')
})

test('재시도가 실패하면(store 커밋 자체가 실패) 큐에 그대로 남는다', () => {
  const ownerKey = 'pw-retry-fail'
  const dateKey = '2026-08-05'
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} })

  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === `reactPracticeWorkData:${ownerKey}`) throw new Error('quota exceeded (simulated)')
    return original.call(this, key, value)
  })
  try {
    retryPendingDayWrites()
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined, '실패했으니 store에 반영되면 안 된다')
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 5, '실패했으니 큐에 그대로 남아야 한다')
  } finally {
    spy.mock.restore()
  }
  retryPendingDayWrites() // 공간이 풀렸다고 가정하고 재시도해 정리한다
  assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined)
})

test('onSettled 콜백은 durable 저장소가 아니라 메모리에만 있고, 재시도 성공 시 정확히 한 번 불린다', () => {
  const ownerKey = 'pw-onsettled'
  const dateKey = '2026-08-06'
  /** @type {Array<boolean>} */
  const calls = []
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 6, palletCount: 0, callDetails: [], fixedRouteCounts: {} }, (ok) => calls.push(ok))

  assert.equal(JSON.stringify(durableRaw(ownerKey)).includes('function'), false, 'onSettled 콜백이 durable JSON에 직렬화되면 안 된다')

  retryPendingDayWrites()
  assert.deepEqual(calls, [true])
})

// 재감사 4차(FAIL 지적 1번) — retryPendingDayWrites가 durable과 fallback을 각각
// 별도 배열에 넣고 둘 다 순회하면, 같은 owner/date가 "오래된 durable 항목(A)"과
// "그 뒤 durable 기록 자체가 실패해 fallback으로 떨어진 더 최신 항목(B)" 두 개로
// 동시에 큐에 남아 있을 때, A를 먼저 커밋해 성공시키고 그 clearPendingDayWrite가
// 아직 시도조차 안 한 B의 fallback까지 지워 버려 B가 통째로 사라졌다(실측 확인).
test('재감사 4차 FAIL 지적 1번 — 오래된 durable(A) 성공 후 최신 fallback(B) 실패 시 B가 사라지지 않는다', () => {
  const ownerKey = 'pw-coexist-a-b'
  const dateKey = '2026-08-09'

  // A: 이미 durable에 성공적으로 등록됐다(오래된 값).
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  assert.deepEqual(durableRaw(ownerKey)[dateKey], { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })

  // B: 그 뒤 같은 날짜를 다시 편집했는데, 이번엔 durable 기록 자체가 실패해서
  // fallback에만 남는다(durable의 A는 그대로 stale 상태로 남는다 — registerPendingDayWrite의
  // catch 분기는 durable을 건드리지 않는다).
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const durableKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === durableKey) throw new Error('quota exceeded (simulated, durable journal itself)')
    return original.call(this, key, value)
  })
  try {
    registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 2, palletCount: 9, callDetails: [], fixedRouteCounts: {} })
  } finally {
    spy.mock.restore()
  }
  // 선행 조건: durable엔 여전히 A(오래된 값)가 남아 있고, fallback엔 B(최신 값)가 있다.
  assert.deepEqual(durableRaw(ownerKey)[dateKey], { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} }, 'durable엔 여전히 A가 stale하게 남아 있어야 한다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 2, '읽기는 이미 fallback(B, 최신)을 우선해야 한다')

  // 이제 재시도한다 — 동일 owner/date는 정확히 한 번만 시도해야 하고(재시도 한 번만),
  // 그 한 번은 반드시 최신값 B여야 한다.
  const workDataKey = `reactPracticeWorkData:${ownerKey}`
  let workDataWriteCount = 0
  const commitSpy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === workDataKey) workDataWriteCount += 1
    return original.call(this, key, value)
  })
  try {
    retryPendingDayWrites()
  } finally {
    commitSpy.mock.restore()
  }

  assert.equal(workDataWriteCount, 1, '같은 owner/date를 두 번 재시도하면 안 된다(동일 키 dedup)')
  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 2, '최종 커밋은 최신값 B(fixedCount:2)여야 한다')
  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.palletCount, 9, 'B의 palletCount도 반영돼야 한다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined, '성공했으니 큐(durable+fallback 양쪽)에서 지워져야 한다')
})

// 위와 같은 선행 조건(durable=A, fallback=B)에서 이번엔 유일한 커밋 시도(B)가 실패하는
// 경우 — B가 반드시 큐에 그대로 남아야 하고(사라지면 안 된다), store는 그 시도 전
// 상태(이 테스트에서는 아무 것도 커밋된 적이 없으니 그대로 비어 있음)를 유지해야 한다.
test('재감사 4차 FAIL 지적 1번 — durable(A)+fallback(B) 상태에서 유일한 커밋 시도가 실패하면 B가 큐에 그대로 남는다', () => {
  const ownerKey = 'pw-coexist-fail'
  const dateKey = '2026-08-10'
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })

  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const durableKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  const workDataKey = `reactPracticeWorkData:${ownerKey}`
  let shouldFailDurable = true
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFailDurable && key === durableKey) throw new Error('quota exceeded (durable, simulated)')
    if (key === workDataKey) throw new Error('quota exceeded (workData, simulated)')
    return original.call(this, key, value)
  })
  try {
    registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 2, palletCount: 9, callDetails: [], fixedRouteCounts: {} })
    shouldFailDurable = false
    retryPendingDayWrites() // 유일한 시도(B) — workData 쓰기가 실패하도록 막아 뒀다.
  } finally {
    spy.mock.restore()
  }

  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined, '실패했으니 store는 그대로여야 한다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 2, '실패한 effective patch(B)가 큐에 그대로 남아야 한다(사라지면 안 된다)')
  assert.equal(getPendingDayWrite(ownerKey, dateKey)?.palletCount, 9)

  retryPendingDayWrites() // 공간이 풀렸다고 가정하고 정리한다.
  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 2)
})

test('durable 기록 자체가 실패하면 durableWriteGuard가 broken으로 바뀌고, 이번 세션 메모리 fallback으로는 여전히 재시도할 수 있다', () => {
  const ownerKey = 'pw-durable-broken'
  const dateKey = '2026-08-07'
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === `reactPracticeDurablePendingWrites:${ownerKey}`) throw new Error('quota exceeded (simulated, durable journal itself)')
    return original.call(this, key, value)
  })

  try {
    registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 7, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
    assert.equal(isDurableWriteBroken(), true, 'durable 기록이 실패했으니 가드가 broken이어야 한다')
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 7, 'durable엔 못 썼어도 이번 세션 메모리 fallback으로는 읽혀야 한다')
  } finally {
    spy.mock.restore()
  }

  retryPendingDayWrites()
  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 7, '공간이 다시 생긴 뒤 재시도하면 fallback 항목도 정상 커밋돼야 한다')
  assert.equal(isDurableWriteBroken(), false, '이후 정상적인 durable 기록(다른 등록)이 성공하면 다시 healthy로 돌아와야 한다')
})

// 재감사 4차(FAIL 지적 2번) — 예전 durableWriteGuard.js는 전역 boolean 하나라, owner B의
// durable 쓰기가 성공하면 markDurableWriteHealthy()가 owner A의 fallback이 아직
// 남아 있는데도 전체를 healthy로 되돌렸다. 이제는 fallback.size를 직접 보므로(item
// 2의 fallback.size > 0 방식) A의 fallback이 남아 있는 한 B가 아무리 성공해도
// broken은 계속 true여야 한다.
test('재감사 4차 FAIL 지적 2번 — owner A의 fallback이 남아 있으면 owner B의 durable 저장이 성공해도 broken은 true다', () => {
  const ownerA = 'pw-guard-owner-a'
  const ownerB = 'pw-guard-owner-b'
  const dateKey = '2026-08-11'
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const durableKeyA = `reactPracticeDurablePendingWrites:${ownerA}`

  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === durableKeyA) throw new Error('quota exceeded (simulated, owner A durable journal)')
    return original.call(this, key, value)
  })
  try {
    registerPendingDayWrite(ownerA, dateKey, { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  } finally {
    spy.mock.restore()
  }
  assert.equal(isDurableWriteBroken(), true, 'A의 durable 저장이 실패했으니 broken이어야 한다')

  // owner B는 durable 저장이 완전히 정상적으로 성공한다.
  registerPendingDayWrite(ownerB, dateKey, { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  assert.deepEqual(durableRaw(ownerB)[dateKey], { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} }, 'B는 정상적으로 durable에 저장돼야 한다')

  assert.equal(isDurableWriteBroken(), true, 'B가 성공해도 A의 fallback이 아직 남아 있으니 broken은 계속 true여야 한다(예전엔 여기서 false로 잘못 돌아갔다)')

  // A까지 정리되고 나서야(fallback이 완전히 비고 나서야) healthy로 돌아온다.
  retryPendingDayWrites()
  assert.equal(getPendingDayWrite(ownerA, dateKey), undefined, 'A도 결국 커밋돼 큐에서 지워져야 한다')
  assert.equal(isDurableWriteBroken(), false, '모든 owner의 fallback이 비었으니 이제야 healthy여야 한다')
})

// 한 항목이 성공적으로 처리된 뒤에도(clearPendingDayWrite) 다른 fallback이 남아
// 있으면 beforeunload 경고가 계속 유지돼야 한다 — durableWriteGuard.guardBeforeUnload를
// 직접 통해 확인한다(app.test.js의 통합 테스트와 상호보완).
test('재감사 4차 FAIL 지적 2번 — 한 항목 성공 처리 후에도 다른 fallback이 남으면 beforeunload 경고가 유지된다', async () => {
  const { guardBeforeUnload } = await import('./durableWriteGuard.js')
  const ownerA = 'pw-guard-beforeunload-a'
  const ownerB = 'pw-guard-beforeunload-b'
  const dateKey = '2026-08-12'
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const durableKeyA = `reactPracticeDurablePendingWrites:${ownerA}`
  const durableKeyB = `reactPracticeDurablePendingWrites:${ownerB}`

  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === durableKeyA || key === durableKeyB) throw new Error('quota exceeded (simulated)')
    return original.call(this, key, value)
  })
  const patchA = { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} }
  try {
    registerPendingDayWrite(ownerA, dateKey, patchA)
    registerPendingDayWrite(ownerB, dateKey, { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  } finally {
    spy.mock.restore()
  }

  const eventA = { prevented: false, preventDefault() { this.prevented = true }, returnValue: false }
  guardBeforeUnload(eventA)
  assert.equal(eventA.prevented, true, '두 owner 다 fallback이 있으니 경고해야 한다')

  // A만 처리되고 B는 여전히 fallback에 남는다(B의 durable 재시도는 아직 안 됨 — retry
  // 전체를 부르지 않고 A만 직접 clearPendingDayWrite로 정리해, "한 항목만 끝났을 때"를
  // 정확히 재현한다).
  const { clearPendingDayWrite: clear } = await import('./pendingWorkDataWrites.js')
  clear(ownerA, dateKey, patchA)

  const eventAfterA = { prevented: false, preventDefault() { this.prevented = true }, returnValue: false }
  guardBeforeUnload(eventAfterA)
  assert.equal(eventAfterA.prevented, true, 'A는 정리됐어도 B의 fallback이 남아 있으니 여전히 경고해야 한다')

  retryPendingDayWrites() // 정리
})

// 재감사 5차(FAIL 지적 1번, P0) — durable(A, stale) + fallback(B, 최신) 상태에서 B의
// workData 커밋 자체는 성공했는데, durable 큐에서 A를 지우는 cleanup 쓰기만 실패하면
// (예전엔) clearPendingDayWrite가 fallback의 B까지 무조건 지워서, 다음 재시도가
// durable에 남은 stale A로 store를 덮어써 버렸다(실측 확인, 데이터 유실). 이제는
// cleanup 실패 시 B를 "authoritative residual"로 fallback에 그대로 남겨 다음 조회/
// 재시도가 항상 B를 본다. 사용자가 요구한 a~j 시나리오를 문자 그대로 하나씩 확인한다.
test('재감사 5차 FAIL 지적 1번 — durable cleanup 쓰기만 실패해도 최신 fallback(B)이 유실되지 않고, 복구 후 재시도해도 A로 되돌아가지 않는다', () => {
  const ownerKey = 'pw-cleanup-fail-residual'
  const dateKey = '2026-08-13'
  /** @type {Array<boolean>} */
  const calls = []

  // a. durable A + fallback B — durable에 A를 정상 등록한 뒤, durable 쓰기만 막은 채로
  //    B를 다시 등록해 durable엔 A가 stale하게, fallback엔 B가 남게 만든다.
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  assert.deepEqual(durableRaw(ownerKey)[dateKey], { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })

  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const durableKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  // durable 키는 등록부터 cleanup 시도까지 계속 막아 두고, workData 키는 정상적으로
  // 쓰이게 둔다 — "workData 커밋은 성공, durable cleanup만 실패"를 정확히 재현한다.
  let durableBlocked = true
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (durableBlocked && key === durableKey) throw new Error('quota exceeded (durable journal, simulated)')
    return original.call(this, key, value)
  })

  const patchB = { isOff: false, fixedCount: 2, palletCount: 9, callDetails: [], fixedRouteCounts: {} }
  try {
    registerPendingDayWrite(ownerKey, dateKey, patchB, (ok) => calls.push(ok))
    assert.deepEqual(durableRaw(ownerKey)[dateKey], { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} }, 'durable엔 여전히 stale A가 남아 있어야 한다')
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 2, 'fallback의 B가 조회에서 우선해야 한다')

    // b, c. 재시도 — workData 커밋(B)은 성공하지만, durable에서 A를 지우는 cleanup
    // 쓰기는 계속 막혀 있어 실패한다.
    retryPendingDayWrites()

    // d. Store/localStorage는 B여야 한다.
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, 'store는 B로 커밋돼야 한다')
    assert.equal(committedRecord(ownerKey, dateKey)?.palletCount, 9)
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 2, 'localStorage도 B여야 한다')

    // e. pending effective patch도 B여야 한다(A로 되돌아가면 안 된다).
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 2, 'cleanup이 실패했어도 pending은 여전히 B(최신)여야 한다 — A로 되돌아가면 안 된다')
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.palletCount, 9)

    // f. pendingDayWriteCount()는 1이어야 한다(durable의 stale A와 fallback의 residual B는
    //    같은 owner/date 키이니 1건으로 계산돼야 한다).
    assert.equal(pendingDayWriteCount(), 1, '같은 owner/date 키는 1건으로 계산돼야 한다')

    // g. isDurableWriteBroken()은 true여야 한다(fallback에 residual이 남아 있으니).
    assert.equal(isDurableWriteBroken(), true, 'cleanup 실패로 fallback에 B가 residual로 남았으니 broken이어야 한다')

    // 논리적 pending이 아직 완전히 정리되지 않았으니 onSettled는 한 번도 불리면 안 된다.
    assert.deepEqual(calls, [], 'cleanup이 실패한 동안엔 onSettled가 불리면 안 된다')

    // h. storage가 복구된 뒤 다시 retry한다.
    durableBlocked = false
    retryPendingDayWrites()
  } finally {
    spy.mock.restore()
  }

  // i. Store/localStorage가 끝까지 B이며, 복구 후 재시도해도 A로 되돌아가지 않는다.
  assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, '복구 후 재시도해도 store는 계속 B여야 한다(A로 되돌아가면 안 된다)')
  assert.equal(committedRecord(ownerKey, dateKey)?.palletCount, 9)
  assert.deepEqual(durableRaw(ownerKey), {}, '이제는 durable에서도 stale A가 완전히 정리돼야 한다')

  // j. 최종 pending count는 0이어야 한다.
  assert.equal(pendingDayWriteCount(), 0, '완전히 정리됐으니 최종 pending count는 0이어야 한다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined)

  // onSettled는 cleanup이 실제로 성공한 이 시점에 정확히 한 번만 불려야 한다.
  assert.deepEqual(calls, [true], 'onSettled는 논리적 pending이 실제로 정리된 이 시점에 정확히 한 번만 불려야 한다')
})

// 재감사 6차(FAIL 지적 1번) — 위 5차 테스트는 durable "쓰기"(cleanup의 삭제 쓰기)
// 실패만 다뤘다. 이번엔 durable "읽기"(getItem) 자체가 실패하는 경우 — 예전엔
// readDurable이 읽기 실패도 `{}`와 똑같이 취급해서, registerPendingDayWrite/
// clearPendingDayWrite가 "durable이 원래 비어 있다"고 착각하고 그 빈 객체 위에
// 새 값 하나만 있는 객체를 통째로 덮어썼다 — 실제로 있던 다른 날짜 원문이 파괴될
// 수 있었다. 사용자가 지정한 시나리오 A를 문자 그대로 확인한다.
test('재감사 6차 FAIL 지적 1번 — 시나리오 A: cleanup 시 durable getItem 자체가 실패해도 최신 fallback(B)이 유실되지 않고, 복구 후 재시도해도 A로 되돌아가지 않는다', () => {
  const ownerKey = 'pw-durable-getitem-fail'
  const dateKey = '2026-08-14'
  /** @type {Array<boolean>} */
  const calls = []

  // durable A + fallback B — 5차 테스트와 같은 방법(durable setItem만 막아서)으로
  // 만든다. registerPendingDayWrite(A)는 정상, registerPendingDayWrite(B)는 durable
  // 쓰기만 막혀 fallback으로 떨어진다.
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const originalGetItem = proto.getItem
  const durableKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  let durableWriteBlocked = true
  const setSpy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (durableWriteBlocked && key === durableKey) throw new Error('quota exceeded (durable journal, simulated)')
    return originalSetItem.call(this, key, value)
  })

  const patchB = { isOff: false, fixedCount: 2, palletCount: 9, callDetails: [], fixedRouteCounts: {} }
  try {
    registerPendingDayWrite(ownerKey, dateKey, patchB, (ok) => calls.push(ok))
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 2, 'fallback의 B가 조회에서 우선해야 한다')
  } finally {
    setSpy.mock.restore()
  }

  // 이제 durable getItem을 막되, "cleanup 시에만" 실패하도록 첫 호출(재감사
  // 8차(FAIL 지적 2번) 이후 computeEffectivePendingEntries가 retry 진입 시점에
  // 한 번 먼저 읽는 호출)은 통과시키고 두 번째 호출부터(clearPendingDayWrite
  // 자신의 재확인 읽기)만 막는다 — 안 그러면 이 owner가 진입 단계부터
  // unreadableOwners에 들어가 fallback까지 통째로 건너뛰어서, "커밋 자체는 성공,
  // cleanup만 실패"라는 이 테스트의 전제 자체가 성립하지 않는다.
  let durableReadBlocked = true
  let durableReadCallCount = 0
  const getSpy = mock.method(proto, 'getItem', /** @this {Storage} @param {string} key */ function patchedGetItem(key) {
    if (key === durableKey) {
      durableReadCallCount += 1
      if (durableReadBlocked && durableReadCallCount > 1) throw new Error('storage access denied (simulated, durable getItem)')
    }
    return originalGetItem.call(this, key)
  })

  try {
    retryPendingDayWrites()

    // Store/localStorage는 B — workData 커밋 자체는 durable getItem과 무관하게 성공했어야 한다.
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, 'workData 커밋은 durable 읽기와 무관하게 성공해야 한다')
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 2)

    // pending은 B, count 1, broken true, callback 0회 — cleanup이 읽기 실패로
    // 정리되지 않았으니 아직 논리적으로 안 끝났다.
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 2, 'durable getItem이 실패해도 pending은 B여야 한다')
    assert.equal(pendingDayWriteCount(), 1, 'B가 fallback에 이미 반영돼 있으니 읽기 실패 owner를 이중으로 세면 안 된다')
    assert.equal(isDurableWriteBroken(), true, 'cleanup이 읽기 실패로 안 끝났으니 broken이어야 한다')
    assert.deepEqual(calls, [], 'cleanup이 안 끝났으니 onSettled가 불리면 안 된다')

    // 읽기가 복구된 뒤 다시 retry한다.
    durableReadBlocked = false
    retryPendingDayWrites()
  } finally {
    getSpy.mock.restore()
  }

  // Store/localStorage가 끝까지 B이며 A로 되돌아가지 않는다.
  assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, '복구 후 재시도해도 store는 계속 B여야 한다')
  assert.equal(pendingDayWriteCount(), 0, '완전히 정리됐으니 최종 pending count는 0이어야 한다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined)
  assert.deepEqual(calls, [true], 'onSettled는 cleanup이 실제로 성공한 이 시점에 정확히 한 번만 불려야 한다')
})

// 재감사 6차(FAIL 지적 1번) — 시나리오 B: 같은 owner의 durable에 이미 서로 다른
// 날짜 2개(A, X)가 들어 있는 상태에서, 세 번째 날짜(B)를 신규 등록하는 도중에만
// durable 읽기가 실패하면 — 예전엔 그 실패를 "durable이 비어 있다"로 착각하고
// `{ [dateKeyB]: patchB }` 하나만 있는 객체로 durable 전체를 덮어써서 A와 X의
// 원문이 통째로 사라졌다. 이제는 읽기 실패 시 durable에 아예 쓰기를 시도하지
// 않으므로 A/X 원문이 바이트 단위로 그대로 남아야 한다.
test('재감사 6차 FAIL 지적 1번 — 시나리오 B: 신규 날짜 등록 중 durable 읽기만 실패해도 기존 날짜(A/X) 원문이 파괴되지 않고, 복구 후 셋 다 유실 없이 처리된다', () => {
  const ownerKey = 'pw-durable-getitem-fail-existing'
  const dateA = '2026-08-15'
  const dateX = '2026-08-16'
  const dateB = '2026-08-17'

  registerPendingDayWrite(ownerKey, dateA, { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  registerPendingDayWrite(ownerKey, dateX, { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  const durableBefore = durableRaw(ownerKey)
  assert.deepEqual(Object.keys(durableBefore).sort(), [dateA, dateX])

  const proto = Object.getPrototypeOf(localStorage)
  const originalGetItem = proto.getItem
  const durableKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  const getSpy = mock.method(proto, 'getItem', /** @this {Storage} @param {string} key */ function patchedGetItem(key) {
    if (key === durableKey) throw new Error('storage access denied (simulated, durable getItem)')
    return originalGetItem.call(this, key)
  })

  const patchB = { isOff: false, fixedCount: 9, palletCount: 0, callDetails: [], fixedRouteCounts: {} }
  try {
    registerPendingDayWrite(ownerKey, dateB, patchB)
    assert.equal(getPendingDayWrite(ownerKey, dateB)?.fixedCount, 9, 'B는 읽기 실패 중에도 fallback을 통해 즉시 조회 가능해야 한다')
  } finally {
    getSpy.mock.restore()
  }

  // 복구 후: A/X 원문이 durable에 바이트 단위로 그대로 남아 있어야 한다(파괴 안 됨).
  assert.deepEqual(durableRaw(ownerKey), durableBefore, '읽기 실패 중 등록이 기존 A/X durable 원문을 건드리면 안 된다')

  retryPendingDayWrites()

  // A/X/B 전부 유실 없이 store에 반영돼야 한다.
  assert.equal(committedRecord(ownerKey, dateA)?.fixedCount, 1, 'A가 유실되면 안 된다')
  assert.equal(committedRecord(ownerKey, dateX)?.fixedCount, 5, 'X가 유실되면 안 된다')
  assert.equal(committedRecord(ownerKey, dateB)?.fixedCount, 9, 'B도 반영돼야 한다')
  assert.equal(pendingDayWriteCount(), 0, '셋 다 정리됐으니 최종 count는 0이어야 한다')
})

// 재감사 6차(FAIL 지적 2번, "가능하면") — durable에 저장된 문자열 자체가 깨진(JSON
// 파싱 불가) malformed 상태도 "빈 큐"로 간주해 그 위에 새 값 하나만 있는 객체를
// 파괴적으로 덮어쓰면 안 된다.
test('재감사 6차 FAIL 지적 1번 — malformed durable JSON은 빈 큐로 간주되지 않고, 그 위에 파괴적으로 덮어쓰지 않는다', () => {
  const ownerKey = 'pw-durable-malformed-json'
  const dateKey = '2026-08-18'
  const durableKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  const garbage = '{ this is not valid json'
  localStorage.setItem(durableKey, garbage)

  const patch = { isOff: false, fixedCount: 4, palletCount: 0, callDetails: [], fixedRouteCounts: {} }
  registerPendingDayWrite(ownerKey, dateKey, patch)

  // malformed JSON 원문이 그대로 남아 있어야 한다 — `{ [dateKey]: patch }` 하나만
  // 있는 정상 JSON으로 덮어썼다면 이 assert가 실패한다(예전 결함 재현 지점).
  assert.equal(localStorage.getItem(durableKey), garbage, 'malformed durable 원문을 파괴적으로 덮어쓰면 안 된다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 4, '신규 patch는 fallback을 통해 조회 가능해야 한다')
  assert.equal(isDurableWriteBroken(), true, 'malformed durable은 읽기 실패로 취급돼 broken이어야 한다')

  // "복구"(다른 정상 경로가 이 키를 valid JSON으로 다시 썼다고 가정)한 뒤 재시도하면
  // 정상적으로 정리돼야 한다.
  localStorage.setItem(durableKey, '{}')
  retryPendingDayWrites()
  assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 4, '복구 후 재시도로 patch가 정상 반영돼야 한다')
  assert.equal(pendingDayWriteCount(), 0)
})

/** @returns {number} */
function totalStubSupabaseCalls() {
  return Object.values(stubSupabaseCallCounts).reduce((sum, n) => sum + n, 0)
}

// 재감사 7차(FAIL 지적 1번, P0) — JSON 문법 자체는 정상이지만 내부 patch가 실제
// PendingPatch 계약을 어기는 경우(`{ "2026-08-31": [] }` 등)를 재현한다. 예전
// readDurable은 최상위가 객체인지만 보고 내부 값을 검증 없이 Record<string,
// PendingPatch>로 단언해서, saveDayRecord가 배열/null/문자열/숫자/불완전 객체를
// 유효한 patch로 오인해 기존 일지를 지워 버렸다(실측). 사용자가 지정한 9가지
// malformed patch 각각에 대해 "기존 일지 유지 + durable 원문 유지 + tombstone
// 불변 + notify 0회 + sync 예약 0회 + 원격 호출 0회 + broken=true"를 전부 확인한다.
// 재감사 8차(FAIL 지적 1번, P0) — 완성된 Effective Patch(5개 필드 전부)가 아니라
// 부분 patch(필드 일부만)도 이전엔 "PATCH_KEYS 중 하나만 있으면 통과"라서 정상
// pending으로 오인됐다. 사용자가 지정한 두 정확한 재현(`{isOff:false}` 단독,
// `{fixedCount:1}` 단독)과, 완성된 patch에서 필수 필드가 정확히 하나씩만 빠진
// 5가지 경우를 전부 명시적으로 나열한다(제네릭 필드-삭제 헬퍼는 동적 키 삭제에
// any/unknown 우회가 필요해져서 쓰지 않았다).
const MALFORMED_PATCH_CASES = /** @type {const} */ ([
  ['배열([])', []],
  ['null', null],
  ['문자열', 'oops'],
  ['숫자', 42],
  ['빈 객체({})', {}],
  // fixedCount는 실제 PendingPatch 계약상 number|string 둘 다 허용이라(입력 폼이
  // 문자열로 넘길 수 있다), 문자열이 아니라 boolean처럼 계약 밖의 타입으로 어긋낸다.
  ['fixedCount 타입 오류', { fixedCount: true }],
  ['callDetails가 배열이 아님', { fixedCount: 1, callDetails: 'nope' }],
  ['callDetails 내부 항목이 잘못된 객체', { fixedCount: 1, callDetails: [{ fare: {} }] }],
  ['fixedRouteCounts 값이 숫자가 아님', { fixedCount: 1, fixedRouteCounts: { r1: 'nope' } }],
  ['isOff만 있는 부분 patch(사용자 지정 재현)', { isOff: false }],
  ['fixedCount만 있는 부분 patch(사용자 지정 재현)', { fixedCount: 1 }],
  ['필수 필드 isOff 누락', { fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} }],
  ['필수 필드 fixedCount 누락', { isOff: false, palletCount: 0, callDetails: [], fixedRouteCounts: {} }],
  ['필수 필드 palletCount 누락', { isOff: false, fixedCount: 1, callDetails: [], fixedRouteCounts: {} }],
  ['필수 필드 callDetails 누락', { isOff: false, fixedCount: 1, palletCount: 0, fixedRouteCounts: {} }],
  ['필수 필드 fixedRouteCounts 누락', { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [] }],
])

MALFORMED_PATCH_CASES.forEach(([label, malformedValue], index) => {
  test(`재감사 7차 FAIL 지적 1번(P0) — durable patch 스키마 위반(${label})은 정상 pending으로 통과하지 않고 기존 일지를 보존한다`, () => {
    const ownerKey = `pw-schema-case-${index}`
    const dateKey = '2026-09-01'
    const durKey = `reactPracticeDurablePendingWrites:${ownerKey}`

    // 기존 정상 일지(fixedCount:5)를 미리 심는다 — 사용자가 지정한 정확한 재현 조건.
    commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} } }, { syncToCloud: false })
    localStorage.setItem(durKey, JSON.stringify({ [dateKey]: malformedValue }))

    const storeBefore = JSON.stringify(getState().workLogs[ownerKey])
    const localBefore = JSON.stringify(readWorkData(ownerKey))
    const durableBefore = localStorage.getItem(durKey)
    const tombstoneBefore = JSON.stringify(readJsonKey('workDataDeletedDates', ownerKey, []))
    const dirtyBefore = hasDirty(ownerKey)
    resetStubSupabaseCallCounts()
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })

    retryPendingDayWrites()
    unsubscribe()

    assert.equal(JSON.stringify(getState().workLogs[ownerKey]), storeBefore, `[${label}] Store의 기존 일지가 그대로 유지돼야 한다`)
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 5, `[${label}] 기존 fixedCount:5가 지워지면 안 된다`)
    assert.equal(JSON.stringify(readWorkData(ownerKey)), localBefore, `[${label}] localStorage도 그대로 유지돼야 한다`)
    assert.equal(localStorage.getItem(durKey), durableBefore, `[${label}] durable 원문이 파괴적으로 덮어써지면 안 된다`)
    assert.equal(JSON.stringify(readJsonKey('workDataDeletedDates', ownerKey, [])), tombstoneBefore, `[${label}] tombstone이 변하면 안 된다`)
    assert.equal(hasDirty(ownerKey), dirtyBefore, `[${label}] sync 예약(dirty journal)이 새로 생기면 안 된다`)
    assert.equal(notifyCount, 0, `[${label}] Store notify가 0회여야 한다`)
    assert.equal(totalStubSupabaseCalls(), 0, `[${label}] 원격 호출이 0회여야 한다`)
    assert.equal(isDurableWriteBroken(), true, `[${label}] 스키마 위반은 읽기 실패로 취급돼 broken이어야 한다`)
    assert.equal(hasPendingDayWrites(), true, `[${label}] "pending 없음"으로 거짓 판정하면 안 된다`)
  })
})

// 재감사 8차(FAIL 지적 3번) — dateKey가 `/^\d{4}-\d{2}-\d{2}$/` 모양만 맞으면(존재하지
// 않는 달력 날짜라도) 통과했다. `2026-99-99`/`2026-02-30`/`2026-02-29`(2026은 윤년이
// 아니다)는 전부 거부돼야 하고, `2028-02-29`(2028은 윤년)/`2026-12-31`은 정상 허용돼야
// 한다.
const VALID_PATCH_FOR_DATEKEY_TEST = { isOff: false, fixedCount: 9, palletCount: 0, callDetails: [], fixedRouteCounts: {} }

;['2026-99-99', '2026-02-30', '2026-02-29'].forEach((badDateKey, index) => {
  test(`재감사 8차 FAIL 지적 3번 — 존재하지 않는 달력 날짜(${badDateKey})는 dateKey로 거부되고 기존 일지를 보존한다`, () => {
    const ownerKey = `pw-datekey-reject-${index}`
    const dateKey = '2026-09-02' // 기존 정상 일지가 있는 진짜 날짜.
    const durKey = `reactPracticeDurablePendingWrites:${ownerKey}`

    commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} } }, { syncToCloud: false })
    // 같은 durable 객체에 진짜 날짜(dateKey)와 잘못된 달력 날짜(badDateKey)를 함께
    // 넣는다 — owner 단위 격리 계약대로, 하나라도 잘못되면 그 owner 전체가 읽기
    // 실패로 취급돼야 한다(진짜 날짜 항목도 함께 보존/보류된다).
    localStorage.setItem(durKey, JSON.stringify({ [dateKey]: VALID_PATCH_FOR_DATEKEY_TEST, [badDateKey]: VALID_PATCH_FOR_DATEKEY_TEST }))

    const storeBefore = JSON.stringify(getState().workLogs[ownerKey])
    const durableBefore = localStorage.getItem(durKey)
    const tombstoneBefore = JSON.stringify(readJsonKey('workDataDeletedDates', ownerKey, []))
    const dirtyBefore = hasDirty(ownerKey)
    resetStubSupabaseCallCounts()
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })

    retryPendingDayWrites()
    unsubscribe()

    assert.equal(JSON.stringify(getState().workLogs[ownerKey]), storeBefore, `[${badDateKey}] Store가 그대로 유지돼야 한다`)
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 5, `[${badDateKey}] 진짜 날짜의 기존 일지도 지워지면 안 된다`)
    assert.equal(localStorage.getItem(durKey), durableBefore, `[${badDateKey}] durable 원문이 그대로 보존돼야 한다`)
    assert.equal(JSON.stringify(readJsonKey('workDataDeletedDates', ownerKey, [])), tombstoneBefore, `[${badDateKey}] tombstone이 변하면 안 된다`)
    assert.equal(hasDirty(ownerKey), dirtyBefore, `[${badDateKey}] sync 예약이 새로 생기면 안 된다`)
    assert.equal(notifyCount, 0, `[${badDateKey}] notify가 0회여야 한다`)
    assert.equal(totalStubSupabaseCalls(), 0, `[${badDateKey}] 원격 호출이 0회여야 한다`)
    assert.equal(isDurableWriteBroken(), true, `[${badDateKey}] 잘못된 dateKey는 읽기 실패로 취급돼 broken이어야 한다`)
  })
})

;['2028-02-29', '2026-12-31'].forEach((goodDateKey, index) => {
  test(`재감사 8차 FAIL 지적 3번 — 실제 존재하는 달력 날짜(${goodDateKey})는 dateKey로 정상 허용된다`, () => {
    const ownerKey = `pw-datekey-accept-${index}`
    const durKey = `reactPracticeDurablePendingWrites:${ownerKey}`
    localStorage.setItem(durKey, JSON.stringify({ [goodDateKey]: VALID_PATCH_FOR_DATEKEY_TEST }))

    retryPendingDayWrites()

    assert.equal(committedRecord(ownerKey, goodDateKey)?.fixedCount, 9, `[${goodDateKey}] 정상 허용된 dateKey는 실제로 커밋돼야 한다`)
    assert.deepEqual(durableRaw(ownerKey), {}, `[${goodDateKey}] 정상 처리됐으니 durable 큐에서 지워져야 한다`)
  })
})

// 재감사 7차(FAIL 지적 2번) — localStorage.length/localStorage.key() 열거 자체가
// 실패할 수 있다(브라우저 storage 전체가 막힌 극단 상황). 이걸 "owner가 하나도
// 없다"로 오인하면 실제로 있는 durable 큐를 통째로 못 본 채 "pending 없음"으로
// 거짓 판정하고, retry가 부분적으로만 처리를 시도하다 상태를 어중간하게 바꿀 위험도
// 있다 — 열거 실패 시 retry는 아무 상태도 안 바꾸고, hasUnsafePendingWrites/
// hasPendingDayWrites는 보수적으로 true, guardBeforeUnload는 예외 없이 이동을
// 차단해야 한다(사용자가 지정한 key() 실패 주입 시나리오를 그대로 확인한다).
test('재감사 7차 FAIL 지적 2번 — localStorage.key() 열거 자체가 실패해도 retry는 상태를 안 바꾸고, guardBeforeUnload는 throw 없이 이동을 차단한다', async () => {
  const { guardBeforeUnload } = await import('./durableWriteGuard.js')
  const ownerKey = 'pw-enum-key-fail'
  const dateKey = '2026-09-06'
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 7, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  assert.deepEqual(durableRaw(ownerKey)[dateKey], { isOff: false, fixedCount: 7, palletCount: 0, callDetails: [], fixedRouteCounts: {} })

  const proto = Object.getPrototypeOf(localStorage)
  const keySpy = mock.method(proto, 'key', function patchedKey() {
    throw new Error('storage access denied (simulated, key() enumeration)')
  })

  try {
    assert.equal(hasUnsafePendingWrites(), true, '열거 실패는 보수적으로 안전하지 않다고 판단해야 한다')
    assert.equal(hasPendingDayWrites(), true, '열거 실패를 "pending 없음"으로 거짓 판정하면 안 된다')

    const storeBefore = JSON.stringify(getState().workLogs[ownerKey])
    const durableBefore = durableRaw(ownerKey)
    retryPendingDayWrites()
    assert.equal(JSON.stringify(getState().workLogs[ownerKey]), storeBefore, '열거 실패 시 retry는 store를 전혀 바꾸면 안 된다')
    assert.deepEqual(durableRaw(ownerKey), durableBefore, '열거 실패 시 retry는 durable 원문도 전혀 바꾸면 안 된다')
    assert.equal(pendingDayWriteCount() > 0, true, '열거 실패 중에도 count가 0으로 거짓 판정되면 안 된다')

    const event = { prevented: false, preventDefault() { this.prevented = true }, returnValue: false }
    assert.doesNotThrow(() => guardBeforeUnload(event), 'guardBeforeUnload가 열거 실패로 예외를 누출하면 안 된다')
    assert.equal(event.prevented, true, '열거 실패 상태에서도 이동을 차단해야 한다')
  } finally {
    keySpy.mock.restore()
  }

  // 복구 후 정리 — 다음 테스트로 이 owner의 큐가 새지 않게 한다.
  retryPendingDayWrites()
  assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined)
})

// 재감사 8차(FAIL 지적 2번) — computeEffectivePendingEntries가 unreadableOwners를
// 돌려주는데도 retryPendingDayWrites는 그걸 무시하고 fallback을 그대로 커밋했다.
// 사용자가 지정한 정확한 시나리오(기존 Store fixedCount:5 + durable 원문
// { date: [] }(손상) + 같은 owner/date의 최신 fallback B)를 그대로 재현한다.
test('재감사 8차 FAIL 지적 2번 — 손상된 durable owner와 최신 fallback이 공존하면 retry가 그 owner를 통째로 건너뛰고, 명시적 복구 후에만 B가 정리된다', () => {
  const ownerKey = 'pw-corrupt-owner-with-fallback'
  const dateKey = '2026-09-07'
  const durKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  /** @type {Array<boolean>} */
  const calls = []

  // 기존 Store fixedCount:5.
  commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} } }, { syncToCloud: false })
  // durable 원문이 손상돼 있다({ date: [] }).
  localStorage.setItem(durKey, JSON.stringify({ [dateKey]: [] }))
  // 같은 owner/date의 최신 fallback B — durable 읽기가 이미 손상돼 있으니
  // registerPendingDayWrite는 자동으로 fallback에만 남긴다(durable 원문은 안 건드림).
  const patchB = { isOff: false, fixedCount: 9, palletCount: 2, callDetails: [], fixedRouteCounts: {} }
  registerPendingDayWrite(ownerKey, dateKey, patchB, (ok) => calls.push(ok))
  assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 9, 'fallback B가 조회에서 우선해야 한다')

  const storeBefore = JSON.stringify(getState().workLogs[ownerKey])
  const localBefore = JSON.stringify(readWorkData(ownerKey))
  const durableBefore = localStorage.getItem(durKey)
  const tombstoneBefore = JSON.stringify(readJsonKey('workDataDeletedDates', ownerKey, []))
  const dirtyBefore = hasDirty(ownerKey)
  const countBefore = pendingDayWriteCount()
  resetStubSupabaseCallCounts()
  let notifyCount = 0
  const unsubscribe = subscribe(() => { notifyCount += 1 })

  // 손상 상태에서 retry — 이 owner는 통째로 건너뛰어야 한다.
  retryPendingDayWrites()
  unsubscribe()

  assert.equal(JSON.stringify(getState().workLogs[ownerKey]), storeBefore, 'Store의 기존 fixedCount:5가 그대로 유지돼야 한다')
  assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 5, '기존 fixedCount:5가 지워지거나 B로 덮이면 안 된다')
  assert.equal(JSON.stringify(readWorkData(ownerKey)), localBefore, 'localStorage도 그대로 유지돼야 한다')
  assert.equal(localStorage.getItem(durKey), durableBefore, 'durable 원문이 바이트 단위로 그대로 유지돼야 한다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 9, 'fallback B는 조회에서 여전히 그대로 남아 있어야 한다')
  assert.equal(JSON.stringify(readJsonKey('workDataDeletedDates', ownerKey, [])), tombstoneBefore, 'tombstone이 변하면 안 된다')
  assert.equal(hasDirty(ownerKey), dirtyBefore, 'sync 예약(dirty journal)이 새로 생기면 안 된다')
  assert.equal(notifyCount, 0, 'Store notify가 0회여야 한다')
  assert.equal(totalStubSupabaseCalls(), 0, '원격 호출이 0회여야 한다')
  assert.equal(isDurableWriteBroken(), true, '손상된 owner가 있으니 broken이어야 한다')
  assert.equal(pendingDayWriteCount(), countBefore, 'pending 논리 키 count는 retry 전후로 그대로여야 한다')
  assert.deepEqual(calls, [], '커밋 자체가 시도되지 않았으니 onSettled가 불리면 안 된다')

  // 명시적 복구 단계 — durable 원문을 정상 빈 큐로 복구한 뒤에만 재시도한다.
  localStorage.setItem(durKey, '{}')
  retryPendingDayWrites()

  assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 9, '복구 후 재시도로 B가 정확히 한 번 커밋돼야 한다')
  assert.equal(committedRecord(ownerKey, dateKey)?.palletCount, 2)
  // 재감사 7차의 malformed-schema 케이스들이 각자 다른 owner로 의도적으로 손상
  // 상태를 남겨 두므로(그 자체가 그 테스트들의 검증 대상) pendingDayWriteCount()는
  // 이 파일 전체 기준 전역 카운트다 — 절대값 0이 아니라, 이 owner 하나가 정리되며
  // countBefore 대비 정확히 1 줄었는지로 확인한다.
  assert.equal(pendingDayWriteCount(), countBefore - 1, '이 owner가 정리되며 전역 count가 정확히 1 줄어야 한다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined)
  assert.deepEqual(calls, [true], 'onSettled는 복구 후 정리가 실제로 끝난 이 시점에 정확히 한 번만 불려야 한다')
})

// 재감사 9차(FAIL 지적 3번) — registerPendingDayWrite는 readDurable에서만 검증하지
// 말고, durable/fallback/callback을 건드리기 전에 dateKey/patch를 스스로 먼저
// 검증해야 한다. 잘못된 입력을 받았을 때 기존 durable/fallback/callback을
// 덮어쓰지 않고, Store/localStorage도 안 바뀌고, 결과를 명시적으로(false) 반환해야
// 한다.
test('재감사 9차 FAIL 지적 3번 — registerPendingDayWrite가 잘못된 dateKey/patch를 받으면 기존 상태를 전혀 건드리지 않고 false를 돌려준다', () => {
  const ownerKey = 'pw-register-input-validation'
  const dateKeyGood = '2026-09-15'
  /** @type {Array<boolean>} */
  const calls = []
  const goodPatch = { isOff: false, fixedCount: 3, palletCount: 0, callDetails: [], fixedRouteCounts: {} }
  // 기존 정상 항목을 하나 미리 등록해 둔다 — 잘못된 입력이 이걸 덮어쓰면 안 된다.
  const registeredOk = registerPendingDayWrite(ownerKey, dateKeyGood, goodPatch, (ok) => calls.push(ok))
  assert.equal(registeredOk, true, '정상 입력은 true를 돌려줘야 한다')
  const durableBefore = durableRaw(ownerKey)

  // 잘못된 dateKey(모양은 맞지만 실존하지 않는 달력 날짜).
  const r1 = registerPendingDayWrite(ownerKey, '2026-02-30', goodPatch, () => { throw new Error('불려지면 안 됨') })
  assert.equal(r1, false, '잘못된 dateKey는 false를 돌려줘야 한다')
  assert.deepEqual(durableRaw(ownerKey), durableBefore, '잘못된 dateKey는 기존 durable 원문을 전혀 건드리면 안 된다')
  assert.equal(getPendingDayWrite(ownerKey, dateKeyGood)?.fixedCount, 3, '기존 정상 항목이 그대로 남아 있어야 한다')

  // 잘못된 patch(필수 필드 누락) — 실존하는 dateKey를 써도 patch가 계약을 어기면
  // 여전히 거부돼야 한다.
  const incompletePatch = /** @type {import('./pendingWorkDataWritesTypes.js').EffectivePatch} */ ({ isOff: false })
  const r2 = registerPendingDayWrite(ownerKey, '2026-09-16', incompletePatch, () => { throw new Error('불려지면 안 됨') })
  assert.equal(r2, false, '잘못된 patch는 false를 돌려줘야 한다')
  assert.deepEqual(durableRaw(ownerKey), durableBefore, '잘못된 patch도 기존 durable 원문을 전혀 건드리면 안 된다')
  assert.equal(getPendingDayWrite(ownerKey, '2026-09-16'), undefined, '거부된 항목은 조회되면 안 된다')

  // Store/localStorage는 애초에 이 함수가 안 건드리는 대상이지만, 명시적으로 재확인한다.
  assert.equal(getState().workLogs[ownerKey], undefined, 'registerPendingDayWrite는 Store를 건드리면 안 된다')

  // 정상 항목의 callback은 여전히 살아 있어야 한다(잘못된 등록이 콜백을 덮어쓰지 않음).
  retryPendingDayWrites()
  assert.deepEqual(calls, [true], '기존 정상 항목의 callback만 정확히 한 번 불려야 한다(거부된 두 등록의 throw하는 콜백은 절대 안 불림)')
})

// 재감사 10차(FAIL 지적 1번, P0) — 9차의 isValidPayment는 id/amount를 필수·amount를
// 숫자 전용으로 강제해서, domain/callDetail.js의 실제 Payment 타입(전부 optional,
// amount는 string|number)과 financeCore.js의 getDetailPaymentSummary(통화 문자열
// amount를 parseCurrencyValue로 그대로 계산)가 실제로 허용·계산하는 레거시 값
// (id 없음, amount가 통화 문자열)을 검증기가 거절해 버렸다 — 실제로 존재하고
// 정상 작동하는 데이터가 durable을 못 지나가는 회귀였다. id 없는 payment와 통화
// 문자열 amount를 가진 payment가 섞인 콜상세도 정상 pending으로 커밋되는지 확인한다.
test('재감사 10차 FAIL 지적 1번(P0) — id 없는 레거시 payment와 통화 문자열 amount를 가진 콜상세도 정상적으로 커밋된다', () => {
  const ownerKey = 'pw-legacy-payment-accept'
  const dateKey = '2026-09-20'
  const patch = {
    isOff: false,
    fixedCount: 2,
    palletCount: 0,
    callDetails: [{
      id: 'trp_legacy_1',
      fare: '10,000',
      // id 없는 레거시 payment(backfillCallDetailIds는 payments[] 항목의 id는
      // 채우지 않는다) + 통화 문자열 amount.
      payments: [{ amount: '1,000' }, { amount: 1000, note: '' }],
    }],
    fixedRouteCounts: {},
  }
  const registered = registerPendingDayWrite(ownerKey, dateKey, patch)
  assert.equal(registered, true, 'id 없는 레거시 payment/통화 문자열 amount도 정상 접수돼야 한다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 2, '접수 직후 조회에서도 그대로 보여야 한다')

  retryPendingDayWrites()

  assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, '레거시 payment 모양이 있어도 정상 커밋돼야 한다')
  assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined, '정상 처리됐으니 이 owner/date는 큐에서 지워져야 한다')
})
