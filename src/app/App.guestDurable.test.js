// 슬라이스 E(2026-09-01): App.test.js 로그인 하네스 durable/quota 통합 12건 → 게스트 전용.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, emptyOkHandlers, callCounts } = createFakeSupabase()

function totalSupabaseCalls() {
  return Object.values(callCounts).reduce((sum, n) => sum + n, 0)
}

fakeSupabase.auth.getSession = async () => ({ data: { session: null }, error: null })
mock.module('../supabaseClient.js', {
  namedExports: {
    supabase: fakeSupabase,
    phoneToFakeEmail: (phone) => `${phone}@runlog-user.com`,
    getSupabaseAuthErrorMessage: (error) => error?.message || '',
    signInWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    signUpWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    ensureProfileRow: async () => {},
  },
})

Object.assign(handlers, emptyOkHandlers())
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const liveRoots = new Set()
function createTrackedRoot(container) {
  const root = createRoot(container)
  liveRoots.add(root)
  return root
}
async function unmountTracked(root) {
  liveRoots.delete(root)
  await act(async () => { root.unmount() })
}
const { BrowserRouter } = await import('react-router-dom')
const { default: App } = await import('./App.jsx')
const { commitCars, commitClients, commitExpenses, commitSettings, commitWorkData } = await import('../store/commitHelpers.js')
const {
  hasPendingDayWrites, pendingDayWriteCount, retryPendingDayWrites,
  getPendingDayWrite,
} = await import('../lib/pendingWorkDataWrites.js')
const { isDurableWriteBroken, hasUnsafeRegistration, getUnsafeRegistrationPatch, clearUnsafeRegistrationFailure } = await import('../lib/durableWriteGuard.js')
const { hasDirty, clearDirty } = await import('../lib/dirtyJournal.js')
const { flushCloudSync } = await import('../lib/syncQueue.js')
const { endCloudSession } = await import('../lib/cloudSession.js')
const { durableKey } = await import('../lib/durableStorage.js')
const { clearGuestModePersisted } = await import('./guestSessionPersist.js')
const { getState, subscribe } = await import('../store/app-store.js')
const { readJsonKey, storageKeyFor } = await import('../store/persist.js')
const { normalizeSettings } = await import('../domain/practiceSettings.js')

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

/** @param {string} ownerKey @returns {Record<string, DayRecordLike>} */
function readWorkData(ownerKey) {
  const main = getState().workLogs[ownerKey]?.main
  if (main && typeof main === 'object') return /** @type {Record<string, DayRecordLike>} */ (main)
  return readJsonKey('workData', ownerKey, /** @type {Record<string, DayRecordLike>} */ ({}))
}
/** @param {string} ownerKey @param {string} dateKey @returns {DayRecordLike|undefined} */
function committedRecord(ownerKey, dateKey) {
  const main = getState().workLogs[ownerKey]?.main
  return main ? (/** @type {Record<string, DayRecordLike>} */ (main))[dateKey] : undefined
}

/** @param {string} expectedFirstArg */
function spyConsoleError(expectedFirstArg) {
  const original = console.error
  let count = 0
  const spy = mock.method(console, 'error', /** @param {Array<string|Error>} args */ function patchedConsoleError(...args) {
    if (args[0] === expectedFirstArg) count += 1
    return original.apply(console, args)
  })
  return { count: () => count, restore: () => spy.mock.restore() }
}

async function waitUntil(predicate, { timeoutMs = 2000, stepMs = 20 } = {}) {
  let ok = false
  await act(async () => {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline) {
      await wait(stepMs)
    }
    ok = predicate()
  })
  if (!ok) throw new Error('waitUntil timeout')
}

/** 디바운스(600ms) 커밋이 act 안에서 끝나도록 기다린다. */
async function waitDebounceCommit() {
  await act(async () => { await wait(700) })
}

/**
 * @param {ParentNode} container
 * @param {() => boolean} [extra]
 */
async function waitForAutosaveFailed(container, extra) {
  await waitDebounceCommit()
  await waitUntil(
    () => (container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패')
      && (!extra || extra()),
    { timeoutMs: 3000 },
  )
}

async function waitForDurableBroken() {
  await waitDebounceCommit()
  await waitUntil(() => isDurableWriteBroken(), { timeoutMs: 3000 })
}

/** 게스트는 scheduleCloudSync no-op이라 dirty가 자동으로 안 지워진다 — 테스트 격리용. */
function settleGuestDirty(ownerKey) {
  clearDirty(ownerKey)
}

function setNativeInputValue(input, value) {
  if (!(input instanceof window.HTMLInputElement)) throw new Error('HTMLInputElement가 필요합니다')
  const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  desc?.set?.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  input.dispatchEvent(new window.Event('change', { bubbles: true }))
}

/** @param {ParentNode} root @param {string} selector @returns {HTMLInputElement} */
function requireHtmlInput(root, selector) {
  const el = root.querySelector(selector)
  if (!(el instanceof window.HTMLInputElement)) throw new Error(`HTMLInputElement가 필요합니다: ${selector}`)
  return el
}

/**
 * @param {HTMLElement} container
 * @param {import('react-dom/client').Root} root
 * @param {string} dateKey
 * @param {() => void} [beforeGuest]
 */
async function setupGuestDayLog(container, root, dateKey, beforeGuest) {
  window.history.pushState({}, '', '/auth')
  if (beforeGuest) await act(async () => { beforeGuest() })
  await act(async () => {
    root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
  })
  await waitUntil(() => !!container.querySelector('.auth-guest-btn'), { timeoutMs: 5000 })
  const guestBtn = container.querySelector('.auth-guest-btn')
  assert.ok(guestBtn, '비회원으로 시작하기 버튼')
  await act(async () => {
    guestBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await waitUntil(() => window.location.pathname === '/app', { timeoutMs: 8000 })
  await act(async () => {
    window.history.pushState({}, '', `/app/day/${dateKey}`)
    window.dispatchEvent(new window.PopStateEvent('popstate'))
  })
  await waitUntil(
    () => !!container.querySelector('#modalFixedCountInput')
      || !!container.querySelector('#modalPalletCount')
      || !!container.querySelector('.maint-section'),
    { timeoutMs: 8000 },
  )
}

test.afterEach(async () => {
  const leftover = [...liveRoots]
  liveRoots.clear()
  for (const leftoverRoot of leftover) {
    await act(async () => { leftoverRoot.unmount() })
  }
  endCloudSession()
  clearGuestModePersisted()
  commitCars('guest', [], { syncToCloud: false })
  commitClients('guest', [], { syncToCloud: false })
  localStorage.removeItem(storageKeyFor('cars', 'guest'))
  localStorage.removeItem(storageKeyFor('clients', 'guest'))
  localStorage.removeItem(storageKeyFor('workData', 'guest'))
  localStorage.removeItem(storageKeyFor('expenses', 'guest'))
  localStorage.removeItem(`reactPracticeDurablePendingWrites:guest`)
  clearDirty('guest')
  await flushCloudSync()
})

// 재감사 4차(FAIL 지적 3번) — durable 기록 자체가 실패한 상태(durableWriteGuard.js가
// broken)에서, DayLogPage 헤더 "뒤로가기"뿐 아니라 BottomNav/SideMenu/로그아웃 같은
// 실제 전역 이동 경로도 확인 없이 진행되면 안 된다. workData 커밋과 durable
// 큐(pendingWorkDataWrites.js)의 durable 기록 둘 다 실패하게 만들어(진짜 "이 편집이
// 메모리 fallback에만 있다"는 상태) 재현한다.
function forceDurableWriteBroken(ownerKey) {
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const durableKeyName = durableKey(ownerKey)
  const workDataKey = storageKeyFor('workData', ownerKey)
  return mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === workDataKey || key === durableKeyName) throw new Error('quota exceeded (simulated, durable journal itself)')
    return original.call(this, key, value)
  })
}

/**
 * @param {string} ownerKey
 */
function seedPalletClient(ownerKey) {
  const clients = [
    /** @type {import('../domain/clientTypes.js').ClientLike} */ ({
      id: 'c1', companyName: '한진', fixedRouteLinked: true, palletOn: true,
      palletPrice: '10,000', fixedUnitPrice: '250,000', supabaseId: 601,
    }),
  ]
  commitClients(ownerKey, clients, { syncToCloud: false })
  commitSettings(ownerKey, normalizeSettings({ fixedOn: true }), { syncToCloud: false })
}

/** @returns {Event} */
function fireBeforeUnload() {
  const beforeUnloadEvent = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(beforeUnloadEvent)
  return beforeUnloadEvent
}

/** @param {ParentNode} container @param {string} text */
function findButtonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).find((btn) => (btn.textContent || '').includes(text))
}

test('재감사 3차 FAIL 지적 2번 — 재진입 시 durable pending patch가 store 위에 덮이고, 먼저 실패한 fixedCount와 나중에 편집한 palletCount가 모두 보존된다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-08-24'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  // 부트/hydrate가 끝나기 전에 이 플래그를 켜면 hydrate 자신의 replaceOwnerState
  // 쓰기까지 막혀 hydration.status가 'failed'로 굳어 버리고, 그 뒤로는
  // isHydrationReady()가 계속 false라 이 테스트의 나머지 어떤 커밋도 클라우드 동기화를
  // 예약하지 못한다 — 다른 quota 테스트들처럼 반드시 부트가 끝난 뒤에만 켠다.
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await setupGuestDayLog(container, root, dateKey, () => { seedPalletClient(ownerKey) })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    // 재감사 7차(FAIL 지적 3번) — 이 아래에서 useDayDraft.js가 실패할 때마다 정확히
    // 이 메시지로 console.error를 부른다. 숫자까지 직접 Assert한다(그냥 화면에
    // 흘려 보내지 않는다).
    const errSpy = spyConsoleError('일지 자동 저장 실패:')
    shouldFail = true
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '5') })
    await waitForAutosaveFailed(container)
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined, 'quota가 막혀 있으니 아직 store에 반영되면 안 된다')
    assert.equal(pendingDayWriteCount() > 0, true, '실패한 편집이 durable 큐에 남아야 한다')
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')

    // 화면을 나갔다(언마운트 flush도 quota가 여전히 막혀 있어 실패) 같은 날짜로 재진입한다 —
    // <App/> 전체를 다시 마운트하면 세션/hydrate epoch가 다시 올라가 버리므로(다른
    // 재진입 테스트들과 달리 이 테스트는 그 사이에 성공 커밋까지 하므로 실제로
    // 문제가 됐다), 다른 재진입 테스트들과 같은 in-app 라우팅(pushState/popstate)만 쓴다.
    await act(async () => {
      window.history.pushState({}, '', '/app')
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    await waitUntil(() => window.location.pathname === '/app')
    await act(async () => {
      window.history.pushState({}, '', `/app/day/${dateKey}`)
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    assert.equal(errSpy.count(), 2, '언마운트 flush도 여전히 막혀 있어 한 번 더(총 2번) 로깅돼야 한다')

    assert.equal(
      requireHtmlInput(container, '#modalFixedCountInput').value, '5',
      '재진입 시 durable 큐의 pending patch(fixedCount=5)가 store의 오래된 값(없음) 위에 덮여 보여야 한다',
    )

    // 이제 공간이 확보됐다고 가정하고, 다른 필드(palletCount)를 편집해 저장을 성공시킨다.
    errSpy.restore()
    shouldFail = false
    await act(async () => { setNativeInputValue(container.querySelector('#modalPalletCount'), '3') })
    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateKey]?.palletCount === 3, { timeoutMs: 2000 })

    assert.equal(
      getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 5,
      '먼저 실패했던 fixedCount(5)가 나중 성공 커밋에도 그대로 남아 있어야 한다(버려지면 안 된다)',
    )
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.palletCount, 3, '나중에 편집한 palletCount(3)도 반영돼야 한다')
    assert.equal(pendingDayWriteCount(), 0, '성공했으니 durable 큐에서 지워져야 한다')

    // 예약된 클라우드 동기화가 완전히 끝나 dirty journal이 비워질 때까지 기다린다 —
    // 고정 시간만큼만 자면(재감사 2차의 "테스트 격리" 교훈) 이 테스트처럼 신규 거래처
    // insert까지 낀 긴 syncAll 사슬에서는 다음 테스트의 부트-hydrate가 "아직 dirty"를
    // 보고 또 한 번 동기화를 트리거해 그 호출이 다음 테스트의 측정 구간으로 샐 수 있다.
    settleGuestDirty(ownerKey)
  } finally {
    spy.mock.restore()
    await unmountTracked(root)
    container.remove()
  }
})

test('재감사 4차 FAIL 지적 3번 — durable 기록이 깨진 상태에서 BottomNav 탭 전환은 확인 없이 진행되지 않는다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-08-27'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  // 부트/hydrate가 끝나기 전에 workData 쓰기를 막으면 hydrate 자신의
  // replaceOwnerState 쓰기까지 막혀 hydration.status가 'failed'로 굳고, 그 뒤로는
  // scheduleCloudSync가 계속 아무 것도 안 해서 dirty가 영영 안 지워진다(실측 확인 —
  // 다른 quota 테스트들과 같은 이유) — 반드시 부트가 끝난 뒤에만 스파이를 심는다.
  const confirmSpy = mock.method(window, 'confirm', () => false)
  let spy

  try {
    await setupGuestDayLog(container, root, dateKey)
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    spy = forceDurableWriteBroken(ownerKey)
    const errSpy = spyConsoleError('일지 자동 저장 실패:')

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '7') })
    await waitForDurableBroken()
    assert.equal(isDurableWriteBroken(), true, 'workData 커밋과 durable 기록이 둘 다 실패했으니 broken이어야 한다')
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')

    const homeTab = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent.includes('홈'))
    assert.ok(homeTab, '하단탭 "홈" 버튼을 찾아야 한다')
    await act(async () => {
      homeTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    assert.equal(confirmSpy.mock.callCount(), 1, 'confirm으로 사용자에게 물어봤어야 한다')
    assert.equal(window.location.pathname, `/app/day/${dateKey}`, 'confirm에서 취소했으니 실제로 이동하면 안 된다')
    // 취소했으니 DayLogPage가 언마운트되지 않는다 — 추가 로깅이 없어야 한다.
    assert.equal(errSpy.count(), 1, 'confirm 취소로 이동이 안 일어났으니 추가로 로깅되면 안 된다')
    errSpy.restore()
  } finally {
    confirmSpy.mock.restore()
    spy.mock.restore()
    // 공간이 풀렸다고 가정하고 fallback에 남은 편집을 정리한다 — 안 하면 이 owner의
    // durable 큐가 broken인 채로 다음 테스트로 새어(재감사 2차의 "테스트 격리" 교훈과
    // 같은 이유) 배경 재시도가 다음 테스트의 Supabase 호출 수 계측을 흔든다.
    // 재감사 5차(FAIL 지적 3번) — retryPendingDayWrites()가 store를 커밋해 이미 홈으로
    // 이동해 구독 중인 CalendarPage/AppShell을 갱신시키니 act()로 감싼다.
    await act(async () => { retryPendingDayWrites() })
    settleGuestDirty(ownerKey)
    await unmountTracked(root)
    container.remove()
  }
})

test('재감사 4차 FAIL 지적 3번 — confirm에서 "그래도 이동"을 선택하면 BottomNav 전환이 실제로 진행된다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-08-28'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const confirmSpy = mock.method(window, 'confirm', () => true)
  let spy

  try {
    await setupGuestDayLog(container, root, dateKey)
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    spy = forceDurableWriteBroken(ownerKey)
    const errSpy = spyConsoleError('일지 자동 저장 실패:')

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '8') })
    await waitForDurableBroken()
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')

    const homeTab = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent.includes('홈'))
    await act(async () => {
      homeTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    assert.equal(confirmSpy.mock.callCount(), 1)
    assert.equal(window.location.pathname, '/app', 'confirm에서 "그래도 이동"을 선택했으니 실제로 이동해야 한다')
    // 화면을 나가도 durable 큐(fallback)는 컴포넌트 생애주기와 무관한 모듈 전역
    // 상태라 그대로 남는다 — "전역 이동을 막지 않을 durable 큐 자체는 안전하게
    // 유지된다"는 계약(popstate처럼 진짜로 막을 수 없는 경로와 동일하게 적용된다).
    assert.equal(isDurableWriteBroken(), true, '이동 후에도 fallback 편집은 유실되지 않고 broken 상태 그대로 남아야 한다')
    // 이동으로 DayLogPage가 언마운트되고, hasPendingRef가 여전히 true라 언마운트
    // flush가 한 번 더 시도한다 — spy가 아직 안 풀렸으니 그 시도도 똑같이 실패해
    // 총 2번 로깅돼야 한다.
    assert.equal(errSpy.count(), 2, '이동으로 인한 언마운트 flush도 여전히 막혀 있어 한 번 더(총 2번) 로깅돼야 한다')
    errSpy.restore()
  } finally {
    confirmSpy.mock.restore()
    spy.mock.restore()
    // 재감사 5차(FAIL 지적 3번) — retryPendingDayWrites()가 store를 커밋해 이미 홈으로
    // 이동해 구독 중인 CalendarPage/AppShell을 갱신시키니 act()로 감싼다.
    await act(async () => { retryPendingDayWrites() }) // 다음 테스트로 broken 상태가 안 새게 정리한다.
    settleGuestDirty(ownerKey)
    await unmountTracked(root)
    container.remove()
  }
})

test('재감사 4차 FAIL 지적 3번 — 브라우저 back(popstate)은 막을 수 없지만, 그 이후에도 fallback은 안전하게 남고 beforeunload는 계속 경고한다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-08-29'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  let spy

  try {
    await setupGuestDayLog(container, root, dateKey)
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    spy = forceDurableWriteBroken(ownerKey)
    const errSpy = spyConsoleError('일지 자동 저장 실패:')

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '9') })
    await waitForDurableBroken()
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')

    // 물리 뒤로가기를 흉내낸다 — popstate는 취소 불가라 confirm 없이 그냥 진행된다.
    await act(async () => {
      window.history.pushState({}, '', '/app')
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    await waitUntil(() => window.location.pathname === '/app')

    assert.equal(isDurableWriteBroken(), true, 'popstate 이동 후에도 fallback 편집(모듈 전역 상태)은 그대로 남아야 한다')
    // popstate로 DayLogPage가 언마운트되고, hasPendingRef가 여전히 true라 언마운트
    // flush가 한 번 더 시도한다 — spy가 아직 안 풀렸으니 그 시도도 똑같이 실패해
    // 총 2번 로깅돼야 한다.
    assert.equal(errSpy.count(), 2, 'popstate로 인한 언마운트 flush도 여전히 막혀 있어 한 번 더(총 2번) 로깅돼야 한다')

    // pendingWriteRetryListeners.js가 App 마운트 시 등록한 실제 beforeunload
    // 리스너(PendingWriteRetryBridge)에 진짜 네이티브 이벤트를 쏴서, popstate로
    // 이동한 뒤에도 여전히 경고하는지 확인한다.
    const beforeUnloadEvent = new window.Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnloadEvent)
    assert.equal(beforeUnloadEvent.defaultPrevented, true, 'popstate로 이동한 뒤에도 beforeunload는 여전히 막아야 한다(fallback이 안 사라졌으므로)')
    errSpy.restore()
  } finally {
    spy.mock.restore()
    // 재감사 5차(FAIL 지적 3번) — retryPendingDayWrites()가 store를 커밋해 이미 홈으로
    // 이동해 구독 중인 CalendarPage/AppShell을 갱신시키니 act()로 감싼다.
    await act(async () => { retryPendingDayWrites() }) // 다음 테스트로 broken 상태가 안 새게 정리한다.
    settleGuestDirty(ownerKey)
    await unmountTracked(root)
    container.remove()
  }
})

test('재감사 FAIL 지적 9번 — 자동 저장 quota 초과: store/localStorage 불변, 거짓 저장됨 없음, 실패 토스트, 이후 언마운트 재시도로 유실되지 않는다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-08-20'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await setupGuestDayLog(container, root, dateKey)
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    // 재감사 7차(FAIL 지적 3번) — 이 실패로 정확히 몇 번 console.error가 나는지 직접 Assert한다.
    const errSpy = spyConsoleError('일지 자동 저장 실패:')
    shouldFail = true
    // 재감사 2차(FAIL 지적) — "notify 0회 / Supabase 호출 0회"를 말로만 보증하지
    // 않고 직접 센다. notifyCount는 이 실패한 커밋 시도 도중 store 구독자가 몇 번
    // 불렸는지, supabaseCallsBefore는 그 직전까지의 누적 Supabase 호출 총수다.
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const supabaseCallsBefore = totalSupabaseCalls()
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '4') })
    await waitForAutosaveFailed(container)
    unsubscribe()
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')
    assert.ok(
      container.querySelector('.autosave-status').textContent.includes('저장 실패'),
      '자동 저장 실패가 화면에 표시돼야 한다(거짓 "저장됨"이 아니라)',
    )
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined, '실패한 쓰기는 store에 전혀 반영되면 안 된다')
    assert.equal(readWorkData(ownerKey)[dateKey], undefined, '실패한 쓰기는 localStorage에도 전혀 반영되면 안 된다')
    assert.equal(notifyCount, 0, 'writeAllOrNothing이 던지면 commitBatch의 notify()에 도달하면 안 된다 — 구독자가 한 번도 안 불려야 한다')
    assert.equal(totalSupabaseCalls(), supabaseCallsBefore, 'notify() 뒤에 있는 scheduleCloudSync()까지 못 갔으니 Supabase 호출이 늘면 안 된다')

    const toastText = container.querySelector('.toast-message')?.textContent || ''
    assert.ok(toastText.includes('저장'), `실패 토스트가 떠야 한다 — 실제: "${toastText}"`)

    // quota 압박이 풀렸다고 가정하고 화면을 나간다 — 언마운트 flush가 마지막
    // 편집(4)을 유실 없이 재시도해야 한다.
    shouldFail = false
    const backButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '뒤로가기')
    assert.ok(backButton, '뒤로가기 버튼을 찾아야 한다')
    await act(async () => {
      backButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app')

    assert.equal(
      getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 4,
      '실패했던 편집(4)이 언마운트 시 재시도로 결국 store에 반영돼야 한다(유실되면 안 된다)',
    )
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 4, 'localStorage에도 반영돼야 한다')
    // shouldFail을 재시도 전에 이미 false로 풀어 뒀으니 언마운트 flush는 성공한다
    // — 추가 로깅 없이 그대로 1이어야 한다.
    assert.equal(errSpy.count(), 1, '복구 후 언마운트 flush는 성공했으니 추가로 로깅되면 안 된다')
    errSpy.restore()
  } finally {
    spy.mock.restore()
    await unmountTracked(root)
    container.remove()
  }
})

test('재감사 3차 FAIL 지적 5번 — 비용 저장 quota 초과: store/localStorage 불변, notify 0회, Supabase 0회, 실패 토스트, 모달(draft) 유지', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-08-22'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const e1 = { id: 'e1-save-quota', kind: 'maint', date: dateKey, name: '오일', category: '엔진/미션', payment: '카드', cost: 10000 }

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('expenses', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await setupGuestDayLog(container, root, dateKey, () => {
      commitExpenses(ownerKey, [e1], { syncToCloud: false })
    })
    await waitUntil(() => !!container.querySelector('.maint-section'))

    const addMaintBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent.includes('+ 정비 추가'))
    assert.ok(addMaintBtn, '"+ 정비 추가" 버튼을 찾아야 한다')
    await act(async () => { addMaintBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
    await act(async () => { setNativeInputValue(container.querySelector('#expenseName'), '타이어 교체') })
    await act(async () => { setNativeInputValue(container.querySelector('#expenseCost'), '20000') })

    shouldFail = true
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const supabaseCallsBefore = totalSupabaseCalls()
    const errSpy = spyConsoleError('비용 저장 실패:')

    const saveBtn = Array.from(container.querySelectorAll('.modal-btn.confirm')).find((btn) => btn.textContent === '저장')
    assert.ok(saveBtn, '저장 버튼을 찾아야 한다')
    await act(async () => { saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
    unsubscribe()

    assert.deepEqual(getState().expenses[ownerKey], [e1], '실패한 저장은 store에 전혀 반영되면 안 된다(e1만 그대로)')
    assert.deepEqual(readJsonKey('expenses', ownerKey, []), [e1], '실패한 저장은 localStorage에도 전혀 반영되면 안 된다')
    assert.equal(notifyCount, 0, 'writeAllOrNothing이 던지면 commitBatch의 notify()에 도달하면 안 된다')
    assert.equal(totalSupabaseCalls(), supabaseCallsBefore, 'notify() 이후의 scheduleCloudSync까지 못 갔으니 Supabase 호출이 늘면 안 된다')
    assert.equal(errSpy.count(), 1, '저장 시도 1회로 정확히 1번 로깅돼야 한다')
    errSpy.restore()

    const toastText = container.querySelector('.toast-message')?.textContent || ''
    assert.ok(toastText.includes('저장하지 못했'), `실패 토스트가 떠야 한다 — 실제: "${toastText}"`)

    assert.ok(container.querySelector('#expenseName'), '모달이 안 닫혀야 한다(draft가 유실되면 안 된다)')
    assert.equal(container.querySelector('#expenseName').value, '타이어 교체', '입력하던 draft 값이 그대로 남아 있어야 한다')
  } finally {
    spy.mock.restore()
    await unmountTracked(root)
    container.remove()
  }
})

test('재감사 3차 FAIL 지적 5번 — 비용 삭제 quota 초과: store/localStorage 불변, notify 0회, Supabase 0회, 실패 토스트, 기존 행 유지', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-08-23'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const e1 = { id: 'e1-del-quota', kind: 'maint', date: dateKey, name: '오일', category: '엔진/미션', payment: '카드', cost: 10000 }

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('expenses', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await setupGuestDayLog(container, root, dateKey, () => {
      commitExpenses(ownerKey, [e1], { syncToCloud: false })
    })
    await waitUntil(() => !!container.querySelector('.maint-section'))

    const deleteBtn = container.querySelector('.action-icon-btn.del')
    assert.ok(deleteBtn, 'e1의 삭제 버튼을 찾아야 한다')

    shouldFail = true
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const supabaseCallsBefore = totalSupabaseCalls()
    const errSpy = spyConsoleError('비용 삭제 실패:')

    await act(async () => { deleteBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
    unsubscribe()

    assert.deepEqual(getState().expenses[ownerKey], [e1], '실패한 삭제는 store에서 전혀 지워지면 안 된다(e1이 그대로 남아야 한다)')
    assert.deepEqual(readJsonKey('expenses', ownerKey, []), [e1], '실패한 삭제는 localStorage에서도 전혀 지워지면 안 된다')
    assert.equal(notifyCount, 0, 'writeAllOrNothing이 던지면 notify()에 도달하면 안 된다')
    assert.equal(totalSupabaseCalls(), supabaseCallsBefore, 'Supabase 호출이 늘면 안 된다')
    assert.equal(errSpy.count(), 1, '삭제 시도 1회로 정확히 1번 로깅돼야 한다')
    errSpy.restore()

    const toastText = container.querySelector('.toast-message')?.textContent || ''
    assert.ok(toastText.includes('삭제하지 못했'), `실패 토스트가 떠야 한다 — 실제: "${toastText}"`)
    assert.ok(container.textContent.includes('오일'), '기존 항목(e1)이 화면에서 사라지면 안 된다')
  } finally {
    spy.mock.restore()
    await unmountTracked(root)
    container.remove()
  }
})

test('재감사 2차 FAIL 지적 — persistent quota + 라우트 이동에도 draft가 영구 유실되지 않고, 여유가 생기면 재시도로 반영된다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-08-22'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated, persistent)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await setupGuestDayLog(container, root, dateKey)
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    // 재감사 7차(FAIL 지적 3번) — 최초 실패 + 언마운트 시점의 마지막 재시도 실패,
    // 정확히 2번 로깅돼야 한다.
    const errSpy = spyConsoleError('일지 자동 저장 실패:')
    shouldFail = true
    // 재감사 2차(FAIL 지적) — notify/Supabase 호출을 직접 센다. 실패한 첫 시도부터
    // 언마운트 시점의 두 번째(마지막) 재시도까지 전부 포함해서, quota가 막혀 있는
    // 동안은 단 한 번도 notify/Supabase 호출이 없어야 한다.
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const supabaseCallsBefore = totalSupabaseCalls()
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '4') })
    await waitForAutosaveFailed(container)

    // quota는 계속 막혀 있는 채로(shouldFail 그대로 true) 화면을 나간다 — 언마운트
    // 시점의 마지막 재시도(useDayDraft.js)도 실패해야 진짜 "persistent" 재현이다.
    const backButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '뒤로가기')
    assert.ok(backButton, '뒤로가기 버튼을 찾아야 한다')
    await act(async () => {
      backButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app')
    unsubscribe()

    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined, 'quota가 여전히 막혀 있으니 store에는 아직 없어야 한다')
    assert.equal(readWorkData(ownerKey)[dateKey], undefined, 'localStorage에도 아직 없어야 한다')
    assert.equal(hasPendingDayWrites(), true, '컴포넌트가 사라진 뒤에도 실패한 편집이 전역 재시도 큐에 남아 있어야 한다(영구 유실 아님)')
    assert.equal(notifyCount, 0, '실패한 시도(최초+언마운트 재시도) 두 번 다 notify에 도달하면 안 된다')
    assert.equal(totalSupabaseCalls(), supabaseCallsBefore, 'quota가 막혀 있는 동안은 Supabase 호출이 늘면 안 된다')
    assert.equal(errSpy.count(), 2, '최초 실패 + 언마운트 재시도 실패, 정확히 2번 로깅돼야 한다')

    // quota 압박이 풀렸다고 가정한다 — online 이벤트가 PendingWriteRetryBridge를
    // 통해 재시도를 유발해야 한다(컴포넌트는 이미 언마운트된 지 오래다).
    shouldFail = false
    await act(async () => {
      window.dispatchEvent(new window.Event('online'))
    })

    assert.equal(pendingDayWriteCount(), 0, '재시도가 성공하면 전역 큐에서 완전히 지워져야 한다(다른 큐 항목도 없어야 한다)')
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 4, '결국 store에 반영돼야 한다 — 유실되지 않았다는 최종 증거')
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 4, 'localStorage에도 반영돼야 한다')
    assert.equal(errSpy.count(), 2, '복구 후 재시도는 성공했으니 추가로 로깅되면 안 된다')
    errSpy.restore()
  } finally {
    spy.mock.restore()
    await unmountTracked(root)
    container.remove()
  }
})

test('재감사 10차 FAIL 지적 1·2·3번(A) — 레거시 payments가 있는 일지에서 workData만 quota로 막혀도 durable에 안전하게 남고, 복구 후 최신 편집과 기존 payments가 모두 보존된다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-09-25'
  const legacyPayments = [{ amount: '1,000' }, { amount: 1000, note: '' }]
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  const workDataKey = failKey
  const durableStorageKey = durableKey(ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated, legacy payments)')
    return originalSetItem.call(this, key, value)
  })
  const confirmSpy = mock.method(window, 'confirm', () => false)
  let errSpy
  let unsubscribe
  let unsubscribe2

  try {
    await setupGuestDayLog(container, root, dateKey, () => {
      seedPalletClient(ownerKey)
      commitWorkData(ownerKey, {
        [dateKey]: {
          isOff: false,
          fixedCount: 2,
          palletCount: 0,
          callDetails: [{ id: 'trp-legacy-1', fare: '10,000', client: '한진', payments: legacyPayments }],
          fixedRouteCounts: {},
        },
      }, { syncToCloud: false })
    })
    await waitUntil(() => !!container.querySelector('#modalPalletCount'))
    assert.equal(requireHtmlInput(container, '#modalFixedCountInput').value, '2', '기존 fixedCount(2)가 그대로 보여야 한다')

    const storeBefore = structuredClone(committedRecord(ownerKey, dateKey))
    const workDataRawBefore = localStorage.getItem(workDataKey)
    const durableRawBefore = localStorage.getItem(durableStorageKey)
    errSpy = spyConsoleError('일지 자동 저장 실패:')
    let notifyCount = 0
    unsubscribe = subscribe(() => { notifyCount += 1 })
    const supabaseCallsBefore = totalSupabaseCalls()
    const dirtyBeforeFail = hasDirty(ownerKey)
    shouldFail = true

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '9') })
    await act(async () => { setNativeInputValue(container.querySelector('#modalPalletCount'), '4') })
    await waitForAutosaveFailed(container, () => getPendingDayWrite(ownerKey, dateKey)?.palletCount === 4)

    const pendingAfterFail = getPendingDayWrite(ownerKey, dateKey)
    assert.equal(pendingAfterFail?.fixedCount, 9, '실패한 편집(9)이 durable에 접수돼야 한다')
    assert.equal(pendingAfterFail?.palletCount, 4, '실패한 편집의 palletCount(4)도 durable에 접수돼야 한다')
    assert.deepEqual(
      pendingAfterFail?.callDetails?.[0]?.payments, legacyPayments,
      '건드리지 않은 기존 레거시 payments가 patch 안에 그대로 보존돼야 한다',
    )
    assert.equal(pendingDayWriteCount(), 1, '같은 owner/date는 논리 키 1건으로 세야 한다')
    assert.equal(isDurableWriteBroken(), false, 'durable 기록 자체는 성공했으니 broken이면 안 된다')
    assert.equal(hasUnsafeRegistration(ownerKey, dateKey), false, '접수가 성공했으니 unsafe registration이면 안 된다')
    assert.match(localStorage.getItem(durableStorageKey) || '', /"fixedCount":9/)
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, 'store는 작업 전 fixedCount(2)여야 한다')
    assert.equal(committedRecord(ownerKey, dateKey)?.palletCount, 0, 'store는 작업 전 palletCount(0)여야 한다')
    assert.deepEqual(committedRecord(ownerKey, dateKey), storeBefore, 'Store 전체가 작업 전 값이어야 한다')
    assert.equal(localStorage.getItem(workDataKey), workDataRawBefore, 'workData localStorage 원문이 바뀌면 안 된다')
    assert.notEqual(localStorage.getItem(durableStorageKey), durableRawBefore, 'durable 원문은 접수 후 바뀌어야 한다')
    assert.equal(notifyCount, 0, '실패한 시도는 notify에 도달하면 안 된다')
    assert.equal(hasDirty(ownerKey), dirtyBeforeFail, '실패한 시도는 클라우드 동기화를 예약하면 안 된다')
    assert.equal(totalSupabaseCalls(), supabaseCallsBefore, '실패한 시도는 Supabase 호출로 이어지면 안 된다')
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')
    assert.ok((container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패'), '실패 UI가 화면에 표시돼야 한다')
    assert.equal((container.querySelector('.autosave-status')?.textContent || '').includes('저장됨'), false, '성공 문구가 보이면 안 된다')
    assert.match(container.querySelector('.toast-message')?.textContent || '', /자동 저장에 실패/)
    unsubscribe()

    const beforeUnloadEvent = fireBeforeUnload()
    assert.equal(beforeUnloadEvent.defaultPrevented, false, 'durable이 정상이면 beforeunload를 막으면 안 된다')

    const backButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '뒤로가기')
    assert.ok(backButton, '헤더 닫기(뒤로가기)를 찾아야 한다')
    await act(async () => {
      backButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app')
    assert.equal(confirmSpy.mock.callCount(), 0, 'durable이 정상이면 헤더 닫기에 confirm이 뜨면 안 된다')
    assert.equal(errSpy.count(), 2, '언마운트 flush도 막혀 있어 한 번 더 로깅돼야 한다')
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 9, '화면을 나가도 durable 편집은 남아야 한다')

    const menuButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '메뉴')
    assert.ok(menuButton, '달력 헤더 메뉴 버튼을 찾아야 한다')
    await act(async () => {
      menuButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const carsItem = findButtonByText(container, '차량 관리')
    assert.ok(carsItem, 'SideMenu 차량 관리를 찾아야 한다')
    await act(async () => {
      carsItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app/cars')
    assert.equal(confirmSpy.mock.callCount(), 0, 'durable이 정상이면 SideMenu 이동에도 confirm이 뜨면 안 된다')

    const homeTab = findButtonByText(container, '홈')
    assert.ok(homeTab, '하단탭 홈을 찾아야 한다')
    await act(async () => {
      homeTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app')
    assert.equal(confirmSpy.mock.callCount(), 0, 'durable이 정상이면 BottomNav 이동에도 confirm이 뜨면 안 된다')
    assert.equal(shouldFail, true, '실패 단계가 끝나기 전에 quota 플래그를 풀면 안 된다')

    let notifyCount2 = 0
    unsubscribe2 = subscribe(() => { notifyCount2 += 1 })
    const supabaseCallsBeforeRecover = totalSupabaseCalls()
    shouldFail = false
    await act(async () => { retryPendingDayWrites() })

    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 9, '복구 후 재시도로 fixedCount(9)가 반영돼야 한다')
    assert.equal(committedRecord(ownerKey, dateKey)?.palletCount, 4, '복구 후 재시도로 palletCount(4)가 반영돼야 한다')
    assert.deepEqual(committedRecord(ownerKey, dateKey)?.callDetails?.[0]?.payments, legacyPayments, '기존 레거시 payments가 최종 커밋에 보존돼야 한다')
    assert.deepEqual(readWorkData(ownerKey)[dateKey]?.callDetails?.[0]?.payments, legacyPayments, 'localStorage에도 기존 payments가 보존돼야 한다')
    assert.equal(pendingDayWriteCount(), 0, '성공했으니 전역 큐에서 지워져야 한다')
    assert.equal(hasUnsafeRegistration(ownerKey, dateKey), false, '복구 후 unsafe가 남아 있으면 안 된다')
    assert.equal(isDurableWriteBroken(), false, '복구 후에는 broken이 아니어야 한다')
    assert.equal(notifyCount2, 1, '성공한 재시도 커밋은 notify를 정확히 한 번만 불러야 한다')
    assert.equal(errSpy.count(), 2, '복구 후 성공한 재시도는 추가로 로깅되면 안 된다')
    assert.equal(totalSupabaseCalls(), supabaseCallsBeforeRecover, '게스트는 Supabase 호출이 없어야 한다')
    settleGuestDirty(ownerKey)
    const notifyAfterRetry = notifyCount2
    const errAfterRetry = errSpy.count()
    const supabaseAfterRetry = totalSupabaseCalls()
    const storeAfterRetry = structuredClone(committedRecord(ownerKey, dateKey))
    const workDataAfterRetry = localStorage.getItem(workDataKey)
    await unmountTracked(root)
    container.remove()
    await act(async () => { await wait(80) })
    assert.equal(notifyCount2, notifyAfterRetry, '언마운트가 성공 커밋을 한 번 더 하면 안 된다')
    assert.equal(errSpy.count(), errAfterRetry, '언마운트 후 실패 로그가 늘면 안 된다')
    assert.equal(totalSupabaseCalls(), supabaseAfterRetry, '언마운트 후 Supabase 호출이 늘면 안 된다')
    assert.deepEqual(committedRecord(ownerKey, dateKey), storeAfterRetry, '언마운트 후 Store가 또 바뀌면 안 된다')
    assert.equal(localStorage.getItem(workDataKey), workDataAfterRetry, '언마운트 후 workData localStorage가 또 바뀌면 안 된다')
    assert.equal(hasDirty(ownerKey), false, '언마운트 후 추가 scheduleCloudSync가 있으면 dirty가 다시 선다')
  } finally {
    unsubscribe?.()
    unsubscribe2?.()
    errSpy?.restore()
    confirmSpy.mock.restore()
    spy.mock.restore()
    shouldFail = false
    await act(async () => { retryPendingDayWrites() })
    if (liveRoots.has(root)) {
      await unmountTracked(root)
      container.remove()
    }
    await flushCloudSync()
  }
})

test('재감사 10차 FAIL 지적 1·2·3번(B) — 레거시 payments가 있는 일지에서 durable 기록까지 막히면 이동이 확인 없이 진행되지 않고, 복구 후 최신 편집과 기존 payments가 모두 보존된다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-09-26'
  const legacyPayments = [{ amount: '1,000' }, { amount: 1000, note: '' }]
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const confirmSpy = mock.method(window, 'confirm', () => false)
  let spy
  let spyRestored = false
  let errSpy
  let unsubscribe
  let unsubscribe2

  try {
    await setupGuestDayLog(container, root, dateKey, () => {
      seedPalletClient(ownerKey)
      commitWorkData(ownerKey, {
        [dateKey]: {
          isOff: false,
          fixedCount: 2,
          palletCount: 0,
          callDetails: [{ id: 'trp-legacy-2', fare: '10,000', client: '한진', payments: legacyPayments }],
          fixedRouteCounts: {},
        },
      }, { syncToCloud: false })
    })
    await waitUntil(() => !!container.querySelector('#modalPalletCount'))
    const storeBefore = structuredClone(committedRecord(ownerKey, dateKey))
    const workDataRawBefore = localStorage.getItem(storageKeyFor('workData', ownerKey))
    const durableRawBefore = localStorage.getItem(durableKey(ownerKey))
    spy = forceDurableWriteBroken(ownerKey)
    errSpy = spyConsoleError('일지 자동 저장 실패:')
    let notifyCount = 0
    unsubscribe = subscribe(() => { notifyCount += 1 })
    const supabaseCallsBefore = totalSupabaseCalls()
    const dirtyBeforeFail = hasDirty(ownerKey)

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '11') })
    await act(async () => { setNativeInputValue(container.querySelector('#modalPalletCount'), '4') })
    await waitDebounceCommit()
    await waitUntil(() => isDurableWriteBroken() && getPendingDayWrite(ownerKey, dateKey)?.palletCount === 4, { timeoutMs: 3000 })

    assert.equal(isDurableWriteBroken(), true, 'workData 커밋과 durable 기록이 둘 다 실패했으니 broken이어야 한다')
    assert.equal(hasUnsafeRegistration(ownerKey, dateKey), false, 'fallback 접수 성공이므로 unsafe registration이면 안 된다')
    const pendingAfterFail = getPendingDayWrite(ownerKey, dateKey)
    assert.equal(pendingAfterFail?.fixedCount, 11, '실패했어도 최신 편집(11)이 fallback에 남아 있어야 한다')
    assert.equal(pendingAfterFail?.palletCount, 4, '실패했어도 palletCount(4)가 fallback에 남아 있어야 한다')
    assert.deepEqual(pendingAfterFail?.callDetails?.[0]?.payments, legacyPayments, '기존 레거시 payments도 fallback에 함께 보존돼야 한다')
    assert.equal(pendingDayWriteCount(), 1, 'fallback 항목은 논리 키 1건이다')
    assert.equal(localStorage.getItem(durableKey(ownerKey)), durableRawBefore, 'durable 원문은 쓰기 실패로 작업 전과 같아야 한다')
    assert.equal(localStorage.getItem(storageKeyFor('workData', ownerKey)), workDataRawBefore, 'workData localStorage 원문이 바뀌면 안 된다')
    assert.deepEqual(committedRecord(ownerKey, dateKey), storeBefore, 'Store는 작업 전 값이어야 한다')
    assert.equal(notifyCount, 0, '실패한 시도는 notify에 도달하면 안 된다')
    assert.equal(hasDirty(ownerKey), dirtyBeforeFail, '실패한 시도는 클라우드 동기화를 예약하면 안 된다')
    assert.equal(totalSupabaseCalls(), supabaseCallsBefore, '실패한 시도는 Supabase 호출로 이어지면 안 된다')
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')
    assert.ok((container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패'), '실패 UI가 표시돼야 한다')
    assert.match(container.querySelector('.toast-message')?.textContent || '', /자동 저장에 실패/)
    unsubscribe()

    const beforeUnloadEvent = fireBeforeUnload()
    assert.equal(beforeUnloadEvent.defaultPrevented, true, 'broken이면 beforeunload를 막아야 한다')

    const backButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '뒤로가기')
    assert.ok(backButton, '헤더 닫기를 찾아야 한다')
    await act(async () => {
      backButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.equal(confirmSpy.mock.callCount(), 1, '헤더 닫기는 confirm 없이 진행되면 안 된다')
    assert.equal(window.location.pathname, `/app/day/${dateKey}`, 'confirm 취소 후 헤더 닫기로 이동하면 안 된다')

    const homeTab = findButtonByText(container, '홈')
    assert.ok(homeTab, '하단탭 홈을 찾아야 한다')
    await act(async () => {
      homeTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.equal(confirmSpy.mock.callCount(), 2, 'BottomNav도 confirm 없이 진행되면 안 된다')
    assert.equal(window.location.pathname, `/app/day/${dateKey}`, 'BottomNav 취소 후에도 일지에 남아야 한다')

    const menuButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '메뉴')
    assert.ok(menuButton, '일지 헤더 메뉴 버튼을 찾아야 한다')
    await act(async () => {
      menuButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const carsItem = findButtonByText(container, '차량 관리')
    assert.ok(carsItem, 'SideMenu 차량 관리를 찾아야 한다')
    await act(async () => {
      carsItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.equal(confirmSpy.mock.callCount(), 3, 'SideMenu도 confirm 없이 진행되면 안 된다')
    assert.equal(window.location.pathname, `/app/day/${dateKey}`, 'SideMenu 취소 후에도 일지에 남아야 한다')
    assert.equal(errSpy.count(), 1, '이동이 취소됐으니 추가로 로깅되면 안 된다')
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 11, '이동 방어 중에도 fallback 편집이 유지돼야 한다')

    spy.mock.restore()
    spyRestored = true
    let notifyCount2 = 0
    unsubscribe2 = subscribe(() => { notifyCount2 += 1 })
    const supabaseCallsBeforeRecover = totalSupabaseCalls()
    await act(async () => { retryPendingDayWrites() })

    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 11, '복구 후 재시도로 최신 편집(11)이 store에 반영돼야 한다')
    assert.equal(committedRecord(ownerKey, dateKey)?.palletCount, 4, '복구 후 palletCount(4)도 반영돼야 한다')
    assert.deepEqual(committedRecord(ownerKey, dateKey)?.callDetails?.[0]?.payments, legacyPayments, '기존 레거시 payments도 최종 커밋에 보존돼야 한다')
    assert.deepEqual(readWorkData(ownerKey)[dateKey]?.callDetails?.[0]?.payments, legacyPayments, 'localStorage에도 기존 payments가 보존돼야 한다')
    assert.equal(pendingDayWriteCount(), 0, '완전히 정리됐으니 전역 큐는 비어야 한다')
    assert.equal(isDurableWriteBroken(), false, '복구 후에는 broken이 아니어야 한다')
    assert.equal(notifyCount2, 1, '성공한 재시도는 notify를 정확히 한 번만 불러야 한다')
    assert.equal(totalSupabaseCalls(), supabaseCallsBeforeRecover, '게스트는 Supabase 호출이 없어야 한다')
    settleGuestDirty(ownerKey)
    const notifyAfterRetry = notifyCount2
    const errAfterRetry = errSpy.count()
    const supabaseAfterRetry = totalSupabaseCalls()
    const storeAfterRetry = structuredClone(committedRecord(ownerKey, dateKey))
    const workDataAfterRetry = localStorage.getItem(storageKeyFor('workData', ownerKey))
    await unmountTracked(root)
    container.remove()
    await act(async () => { await wait(80) })
    assert.equal(notifyCount2, notifyAfterRetry, '언마운트가 성공 커밋을 한 번 더 하면 안 된다')
    assert.equal(errSpy.count(), errAfterRetry, '언마운트 후 실패 로그가 늘면 안 된다')
    assert.equal(totalSupabaseCalls(), supabaseAfterRetry, '언마운트 후 Supabase 호출이 늘면 안 된다')
    assert.deepEqual(committedRecord(ownerKey, dateKey), storeAfterRetry, '언마운트 후 Store가 또 바뀌면 안 된다')
    assert.equal(localStorage.getItem(storageKeyFor('workData', ownerKey)), workDataAfterRetry, '언마운트 후 workData localStorage가 또 바뀌면 안 된다')
    assert.equal(hasDirty(ownerKey), false, '언마운트 후 추가 scheduleCloudSync가 있으면 dirty가 다시 선다')
  } finally {
    unsubscribe?.()
    unsubscribe2?.()
    errSpy?.restore()
    confirmSpy.mock.restore()
    if (!spyRestored && spy) spy.mock.restore()
    await act(async () => { retryPendingDayWrites() })
    if (liveRoots.has(root)) {
      await unmountTracked(root)
      container.remove()
    }
    await flushCloudSync()
  }
})

test('재감사 11차 — confirm으로 이동을 허용한 뒤 재진입해도 unsafe EffectivePatch가 화면에 복원된다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-09-27'
  const rejectedPayments = [{ amount: 'oops' }]
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated, unsafe overlay)')
    return originalSetItem.call(this, key, value)
  })
  const confirmSpy = mock.method(window, 'confirm', () => true)
  let errSpy

  try {
    await setupGuestDayLog(container, root, dateKey, () => {
      seedPalletClient(ownerKey)
      commitWorkData(ownerKey, {
        [dateKey]: {
          isOff: false,
          fixedCount: 2,
          palletCount: 0,
          callDetails: [{ id: 'trp-unsafe-1', fare: '10,000', client: '한진', payments: rejectedPayments }],
          fixedRouteCounts: {},
        },
      }, { syncToCloud: false })
    })
    await waitUntil(() => !!container.querySelector('#modalPalletCount'))
    errSpy = spyConsoleError('일지 자동 저장 실패:')
    shouldFail = true
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '9') })
    await act(async () => { setNativeInputValue(container.querySelector('#modalPalletCount'), '4') })
    await waitDebounceCommit()
    await waitUntil(() => hasUnsafeRegistration(ownerKey, dateKey) && getUnsafeRegistrationPatch(ownerKey, dateKey)?.fixedCount === 9, { timeoutMs: 3000 })

    assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined, '계약 위반 patch는 durable/fallback에 들어가면 안 된다')
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, 'Store는 작업 전 값이어야 한다')
    assert.equal(isDurableWriteBroken(), true)

    const backButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '뒤로가기')
    assert.ok(backButton)
    await act(async () => {
      backButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app')
    assert.equal(confirmSpy.mock.callCount(), 1, 'broken이면 헤더 닫기에 confirm이 떠야 한다')
    assert.equal(getUnsafeRegistrationPatch(ownerKey, dateKey)?.fixedCount, 9, '이동을 허용해도 unsafe patch를 지우면 안 된다')

    await act(async () => {
      window.history.pushState({}, '', `/app/day/${dateKey}`)
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    await waitUntil(() => container.querySelector('#modalFixedCountInput')?.value === '9', { timeoutMs: 3000 })
    assert.equal(container.querySelector('#modalPalletCount')?.value, '4', '재진입 화면이 unsafe patch의 palletCount를 보여야 한다')
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, '재진입만으로 Store가 커밋되면 안 된다')
    assert.equal(hasUnsafeRegistration(ownerKey, dateKey), true, '아직 안전한 큐/커밋이 없으니 unsafe가 남아 있어야 한다')
  } finally {
    errSpy?.restore()
    confirmSpy.mock.restore()
    spy.mock.restore()
    clearUnsafeRegistrationFailure(ownerKey, dateKey)
    await unmountTracked(root)
    container.remove()
    await flushCloudSync()
  }
})

test('재감사 12차 — persistent quota 실패 후 마운트 중 retry 성공은 UI를 저장됨으로 바꾸고, 이동·언마운트 뒤 커밋이 늘지 않는다', async () => {
  const ownerKey = 'guest'
  const dateKey = '2026-09-30'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated, mounted retry)')
    return originalSetItem.call(this, key, value)
  })
  let errSpy
  /** @type {(() => void)|undefined} */
  let unsubscribe

  try {
    await setupGuestDayLog(container, root, dateKey, () => {
      seedPalletClient(ownerKey)
      commitWorkData(ownerKey, {
        [dateKey]: {
          isOff: false,
          fixedCount: 2,
          palletCount: 0,
          callDetails: [{ id: 'trp-mounted-retry', fare: '10,000', client: '한진', payments: [{ amount: '1,000' }] }],
          fixedRouteCounts: {},
        },
      }, { syncToCloud: false })
    })
    await waitUntil(() => !!container.querySelector('#modalPalletCount'))
    errSpy = spyConsoleError('일지 자동 저장 실패:')
    shouldFail = true
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '8') })
    await act(async () => { setNativeInputValue(container.querySelector('#modalPalletCount'), '3') })
    await waitForAutosaveFailed(container, () => getPendingDayWrite(ownerKey, dateKey)?.fixedCount === 8)
    assert.ok((container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패'))

    let notifyCount = 0
    unsubscribe = subscribe(() => { notifyCount += 1 })
    const supabaseBeforeRetry = totalSupabaseCalls()
    shouldFail = false
    await act(async () => { retryPendingDayWrites() })
    await waitDebounceCommit()
    await waitUntil(() => (container.querySelector('.autosave-status')?.textContent || '').includes('저장됨'), { timeoutMs: 3000 })
    assert.ok((container.querySelector('.autosave-status')?.textContent || '').includes('저장됨'), '마운트 중 retry 성공은 실패 UI를 저장됨으로 바꿔야 한다')
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 8)
    assert.equal(committedRecord(ownerKey, dateKey)?.palletCount, 3)
    assert.equal(pendingDayWriteCount(), 0)
    assert.equal(notifyCount, 1, 'retry 성공 커밋은 notify를 1회만 불러야 한다')
    assert.equal(totalSupabaseCalls(), supabaseBeforeRetry, '게스트는 Supabase 호출이 없어야 한다')
    settleGuestDirty(ownerKey)
    const notifyAfterRetry = notifyCount
    const errAfterRetry = errSpy.count()
    const supabaseAfterRetry = totalSupabaseCalls()
    const storeAfterRetry = structuredClone(committedRecord(ownerKey, dateKey))
    const workDataAfterRetry = localStorage.getItem(failKey)

    const backButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '뒤로가기')
    assert.ok(backButton)
    await act(async () => {
      backButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app')
    await act(async () => { await wait(80) })
    assert.equal(notifyCount, notifyAfterRetry, '페이지 이동이 중복 commitNow를 돌리면 안 된다')
    assert.equal(errSpy.count(), errAfterRetry)
    assert.deepEqual(committedRecord(ownerKey, dateKey), storeAfterRetry)

    await unmountTracked(root)
    container.remove()
    await act(async () => { await wait(80) })
    assert.equal(notifyCount, notifyAfterRetry, '언마운트 후 notify가 늘면 안 된다')
    assert.equal(errSpy.count(), errAfterRetry)
    assert.equal(totalSupabaseCalls(), supabaseAfterRetry, '언마운트 후 Supabase 호출이 늘면 안 된다')
    assert.deepEqual(committedRecord(ownerKey, dateKey), storeAfterRetry)
    assert.equal(localStorage.getItem(failKey), workDataAfterRetry)
    assert.equal(hasDirty(ownerKey), false)
  } finally {
    unsubscribe?.()
    errSpy?.restore()
    spy.mock.restore()
    shouldFail = false
    await act(async () => { retryPendingDayWrites() })
    if (liveRoots.has(root)) {
      await unmountTracked(root)
      container.remove()
    }
    await flushCloudSync()
  }
})
