// 4차 재작업(사용자 지시 5번) — 실제 <BrowserRouter> + <App/>을 jsdom에 렌더링해서
// "로그인 계정이 라우트를 이동해도 그 경로에 머물고 restoreSessionOnBoot()이
// 재실행되지 않는지"를 검증한다. 순수 함수 추출 테스트로는 이 회귀(브라우저에서
// 실측으로만 드러났던 버그)를 못 잡는다고 판단해, 이 파일 하나를 위해 최소한의
// JSX 렌더 인프라(jsxLoaderHook.mjs, esbuild 트랜스파일)를 도입했다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { clientRowsFor, createFakeSupabase, vehicleRowsFor, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, callCounts, emptyOkHandlers } = createFakeSupabase()

// 재감사 2차(FAIL 지적) — "Supabase 호출 0회"를 말로만 보증하지 않고 직접 잰다.
// callCounts는 { "테이블.메서드": 횟수 } 맵이라, 이 시점까지의 총 호출 수를 스냅샷
// 떠 두면 이후 어떤 테이블·메서드가 불려도(어느 하나만 확인하는 게 아니라) 놓치지
// 않는다.
function totalSupabaseCalls() {
  return Object.values(callCounts).reduce((sum, n) => sum + n, 0)
}
fakeSupabase.auth.getSession = async () => ({
  data: { session: { user: { id: 'user-boot-nav', user_metadata: {}, phone: null } } },
  error: null,
})
mock.module('../supabaseClient.js', {
  namedExports: {
    supabase: fakeSupabase,
    phoneToFakeEmail: (phone) => `${phone}@runlog-user.com`,
    getSupabaseAuthErrorMessage: (error) => error?.message || '',
    // AuthPage.jsx가 정적으로 import하지만(모든 라우트가 한 <Routes> 트리에
    // 선언돼 있어 이 모듈 자체는 항상 로드된다) 이 테스트는 인증 화면을 안
    // 쓰므로 실제로 호출되지 않는다 — 존재만 하면 된다.
    signInWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    signUpWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    ensureProfileRow: async () => {},
  },
})

resetHandlers()
Object.assign(handlers, emptyOkHandlers())
handlers.profiles.select = () => ({ data: { id: 'user-boot-nav', name: '테스트 사용자', settings: {} }, error: null })
// 재감사 2차(FAIL 지적 5번) — 이 파일의 여러 테스트가 commitClients/commitCars로
// supabaseId 없는 항목을 store에 넣고, 그 뒤 다른 편집(예: 일지 입력)이 debounce된
// scheduleCloudSync를 예약하면 syncQueue.js의 syncAll이 "관계없는 도메인까지 전부"
// 동기화한다(dirty 여부와 무관 — 도메인별로 안 나뉜다). emptyOkHandlers()는
// clients/vehicles의 insert에 기본 핸들러가 없어 `{data:null}`이 되고, syncClients/
// syncVehicles가 `data.id`를 읽다 TypeError로 죽어서 "클라우드 동기화 실패" 콘솔
// 에러가 매번 새어 나왔다 — 테스트 자체는 그 값을 안 쓰지만 로그가 지저분했다.
// 실제 있을 법한 응답(가짜 id)을 기본값으로 채워서 이 배경 실패를 원천 차단한다.
handlers.clients.insert = () => ({ data: { id: `fake-client-${Math.random().toString(36).slice(2, 8)}` }, error: null })
handlers.vehicles.insert = () => ({ data: { id: `fake-vehicle-${Math.random().toString(36).slice(2, 8)}` }, error: null })
handlers.daily_logs = {
  upsert: () => ({ data: { id: 9000 }, error: null }),
}

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
  registerPendingDayWrite, getPendingDayWrite,
} = await import('../lib/pendingWorkDataWrites.js')
const { isDurableWriteBroken, hasUnsafeRegistration, getUnsafeRegistrationPatch, clearUnsafeRegistrationFailure } = await import('../lib/durableWriteGuard.js')
const { hasDirty } = await import('../lib/dirtyJournal.js')
const { flushCloudSync } = await import('../lib/syncQueue.js')
test.afterEach(async () => {
  const leftover = [...liveRoots]
  liveRoots.clear()
  for (const leftoverRoot of leftover) {
    await act(async () => { leftoverRoot.unmount() })
  }
  // 슬라이스 C: seedMainCar 등이 덮어쓴 vehicles/clients select를 빈 서버로 원복해
  // 다음 테스트가 유출된 서버 행을 보지 않게 한다(이 파일은 handlers를 매 테스트
  // 초기화하지 않는다).
  handlers.vehicles.select = () => ({ data: [], error: null })
  handlers.clients.select = () => ({ data: [], error: null })
  // 예약된 600ms 클라우드 동기화가 다음 테스트의 Supabase 카운트를 오염시키지 않게
  // 디바운스를 즉시 비운다. App이 이미 실제 syncQueue를 붙잡은 뒤에는 mock.module이
  // 횟수를 못 센다 — 횟수 spy는 pendingWorkDataWritesSyncSpy.test.js가 맡는다.
  await flushCloudSync()
})
const { getState, subscribe } = await import('../store/app-store.js')
const { readJsonKey, storageKeyFor } = await import('../store/persist.js')
const { todayWorkLogSelection } = await import('../domain/calendar.js')
const { normalizeSettings } = await import('../domain/practiceSettings.js')

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

// 재감사 6차(FAIL 지적 3번) — readJsonKey('workData', ownerKey, {})와
// getState().workLogs[ownerKey]?.main?.[dateKey]는 각각 fallback 인자/app-store.js의
// 기존 workLogs 타입(Record<string, Record<string, object>>, 이번 라운드에서 손대지
// 않은 기존 결정) 때문에 TS7053이 난다. 이번 라운드에 새로 추가한 테스트만 이
// 헬퍼로 우회한다.
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

// 재감사 7차(FAIL 지적 3번) — 실패 주입 테스트가 유발하는 console.error를 그냥
// 화면에 흘려 보내지만 말고 정확한 메시지·횟수를 직접 Assert한다. 원래
// console.error로 항상 그대로 전달한다(call-through) — 절대 숨기지 않는다. 그래야
// React act 경고 같은 이 함수가 모르는 다른 진단이 여기 묻혀서 사라지지 않는다.
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

// 재감사 5차(FAIL 지적 3번) — 예전엔 폴링 루프 한 스텝(wait(stepMs))마다 act()를
// 따로 열고 닫았다. act()가 "지금 렌더 중"이라고 보는 구간은 그 act() 콜백의
// Promise가 아직 안 끝난 동안뿐이라, 한 스텝이 끝나고 다음 스텝의 act()가 다시
// 열리기 직전의 짧은 틈(매크로태스크 사이)에 배경 타이머(디바운스 커밋, retry
// 인터벌 등)의 콜백이 끼어들면 그 상태 갱신은 act() 바깥으로 샜다 — 실측(npm test
// 출력에 "not wrapped in act" 경고로 확인). 이제는 전체 폴링 루프(모든 스텝의
// wait 포함) 자체를 act() 콜백 하나로 감싼다 — act()가 "acting" 상태를 폴링이
// 끝날 때까지 끊김 없이 유지하므로, 그 사이 어느 시점에 배경 코드가 상태를
// 갱신해도 act() 밖으로 새지 않는다.
async function waitUntil(predicate, { timeoutMs = 2000, stepMs = 20 } = {}) {
  await act(async () => {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop -- 폴링 대기라 순차 await가 맞다.
      await wait(stepMs)
    }
  })
}

// React 컨트롤드 input에 값을 넣고 실제 onChange를 타게 하려면, React가 추적하는
// value setter를 우회해서 네이티브 setter로 값을 바꾼 뒤 input 이벤트를 직접
// 디스패치해야 한다(jsdom + React 테스트에서 흔히 쓰는 방식).
function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

/**
 * querySelector는 Element|null이라 value를 바로 읽으면 TS2339가 난다.
 * 재감사 14차 — 13차 신규 테스트는 이 헬퍼로 HTMLInputElement로 좁힌 뒤에만 value를 본다.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLInputElement}
 */
function requireHtmlInput(root, selector) {
  const el = root.querySelector(selector)
  if (!(el instanceof window.HTMLInputElement)) throw new Error(`HTMLInputElement가 필요합니다: ${selector}`)
  return /** @type {HTMLInputElement} */ (el)
}

function captureDailyLogUpserts() {
  /** @type {Array<{ work_date?: string, fixed_count?: number }>} */
  const rows = []
  const previous = handlers.daily_logs
  handlers.daily_logs = {
    ...(previous || {}),
    upsert: (/** @type {{ work_date?: string, fixed_count?: number }} */ row) => {
      rows.push(row)
      return { data: { id: 9001 }, error: null }
    },
  }
  return {
    rows,
    /** @param {string} dateKey */
    forDate(dateKey) {
      return rows.filter((row) => row.work_date === dateKey)
    },
    restore() {
      if (previous) handlers.daily_logs = previous
      else delete handlers.daily_logs
    },
  }
}

test('사용자 지시 5번 — 로그인 계정이 라우트를 이동해도 그 경로에 머물고 부트가 재실행되지 않는다', async () => {
  window.history.pushState({}, '', '/')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })

    await waitUntil(() => window.location.pathname === '/app')
    assert.equal(window.location.pathname, '/app', '부트 복원 후 /app에 도착해야 한다')
    const bootProfileCalls = countOf('profiles', 'select')
    assert.ok(bootProfileCalls >= 1, '부트 중 profiles 조회가 최소 1번은 나가야 한다')

    const myPageButton = Array.from(container.querySelectorAll('button'))
      .find((btn) => btn.textContent.includes('마이페이지'))
    assert.ok(myPageButton, '하단 탭에서 마이페이지 버튼을 찾아야 한다')

    await act(async () => {
      myPageButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.equal(window.location.pathname, '/app/me', '클릭 직후에는 /app/me로 이동해야 한다')

    // 버그가 있었다면 이 대기 중에 restoreSessionOnBoot()이 다시 돌고 goHome()이
    // /app으로 강제로 되돌린다 — 넉넉히 기다려도 그런 일이 없어야 한다.
    await act(async () => { await wait(600) })

    assert.equal(window.location.pathname, '/app/me', '라우트 이동 후 시간이 지나도 그 경로에 그대로 머물러야 한다(부트 재실행으로 /app에 되돌아가면 안 된다)')
    assert.equal(countOf('profiles', 'select'), bootProfileCalls, 'restoreSessionOnBoot()이 라우트 전환으로 재실행되면 안 된다(profiles 조회 횟수가 늘면 안 된다)')
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})

// Step 5(달력 홈 재작성) 재감사 4번 — App.jsx의 부트 세션 복원 수정: 이미 /app(또는
// /onboarding) 경로로 진입해 있었으면 goHome()으로 쿼리를 지우지 않는다. 로그인 상태로
// 새로고침해도 달력 월 쿼리(?y=&m=)가 그대로 남아야 완료 조건 "새로고침 후 같은 달"이
// 실제로 성립한다(게스트는 restoreSessionOnBoot()이 null이라 이 경로를 안 타서 이
// 회귀로 드러나지 않았다 — 그래서 로그인 부트를 그대로 재현해야 한다).
test('재감사 4번 — 로그인 세션 복원 상태로 /app?y=2026&m=6을 렌더하면 pathname과 search가 그대로 보존된다', async () => {
  window.history.pushState({}, '', '/app?y=2026&m=6')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })

    // booting이 끝나면(= "불러오는 중..." 안내가 사라지면) 부트 복원이 이미
    // goHome()을 부를지 말지 결정한 뒤다.
    await waitUntil(() => !container.textContent.includes('불러오는 중'))
    await act(async () => { await wait(50) })

    assert.equal(window.location.pathname, '/app', '로그인 상태에서도 /app 경로에 있어야 한다')
    assert.equal(window.location.search, '?y=2026&m=6', '부트 복원이 달력 월 쿼리를 지우면 안 된다(고쳤던 버그)')
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})

// 재감사 9차(FAIL 지적 4번) — 모양은 `YYYY-MM-DD`지만 실존하지 않는 달력 날짜
// (`2026-02-30`)로 `/app/day/:date`에 직접 진입하면, DayLogPage를 렌더하거나
// 저장하는 대신 안전하게 `/app`으로 replace해야 한다. 순수 함수(parseDateKeySelection)
// 테스트만으로는 실제 라우팅 경로가 안전하다고 주장할 수 없어 실제 `<App/>`으로
// 확인한다.
test('재감사 9차 FAIL 지적 4번 — 존재하지 않는 달력 날짜로 /app/day/2026-02-30에 진입하면 DayLogPage가 렌더되지 않고 /app으로 replace된다', async () => {
  const ownerKey = 'user-boot-nav'
  window.history.pushState({}, '', '/app/day/2026-02-30')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => window.location.pathname === '/app', { timeoutMs: 3000 })

    assert.equal(window.location.pathname, '/app', '잘못된 달력 날짜는 /app으로 replace돼야 한다')
    assert.equal(container.querySelector('#modalFixedCountInput'), null, 'DayLogPage(일지 입력 화면)가 렌더되면 안 된다')
    assert.equal(committedRecord(ownerKey, '2026-02-30'), undefined, '존재하지 않는 날짜로는 아무 것도 저장되면 안 된다')
    assert.equal(readWorkData(ownerKey)['2026-02-30'], undefined, 'localStorage에도 저장되면 안 된다')
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})

// Step 5(달력 홈 재작성) 재감사 4번 — MainPageRoute가 이제 useState(() => loadWorkData(...))
// 로컬 스냅샷 대신 store를 직접 구독한다(useOwnerWorkData). 마운트 후 store에 외부에서
// 값이 커밋돼도 CalendarPage/WorkLogPage가 그 값을 봐야 하고, saveDay는 그 최신 store
// workData를 기준으로 커밋해서 함께 있던 다른 날짜를 지우면 안 된다.
test('재감사 4번 — store 구독: 마운트 후 외부에서 커밋한 workData를 CalendarPage/WorkLogPage가 보고, 한 날짜 편집이 다른 날짜를 지우지 않는다', async () => {
  // calendarViewDate: URL `m`은 0-based. 8월 일지를 보려면 오늘 달(9월)이 아니라 고정 월로 들어간다.
  window.history.pushState({}, '', '/app?y=2026&m=7')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)
  const ownerKey = 'user-boot-nav'

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => window.location.pathname === '/app')
    await waitUntil(() => !container.textContent.includes('불러오는 중'))
    await act(async () => { await wait(50) }) // 부트 초기화(initializeOwnerFromPersist)가 끝날 시간을 준다.

    // 마운트가 끝난 "뒤"에 store에 B를 외부에서 커밋한다 — 예전 아키텍처
    // (useState(() => loadWorkData(...)) 로컬 스냅샷)라면 마운트 시점에 딱 한 번만
    // 읽으므로 이 갱신을 절대 못 본다.
    const B = {
      '2026-08-05': { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
      '2026-08-06': { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
    }
    await act(async () => { commitWorkData(ownerKey, B, { syncToCloud: false }) })

    const cell6 = Array.from(container.querySelectorAll('button.date-cell'))
      .find((btn) => btn.querySelector('.cell-date-text')?.textContent === '6' && !btn.disabled)
    assert.ok(cell6, '8월 6일 셀을 찾아야 한다')
    assert.ok(
      cell6.textContent.includes('5회'),
      '마운트 후 외부에서 store에 커밋한 B(5회)가 달력에 이미 반영돼 있어야 한다(store 구독 증거) — 실제 텍스트: ' + cell6.textContent,
    )

    await act(async () => {
      cell6.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app/day/2026-08-06')

    const countInput = requireHtmlInput(container, '#modalFixedCountInput')
    assert.ok(countInput, '일지의 운행 횟수 입력을 찾아야 한다')
    assert.equal(countInput.value, '5', 'WorkLogPage가 store의 최신값(B, 5회)을 받아야 한다 — 로컬 스냅샷의 예전(빈) 값이 아니다')

    // 이 날짜(8/6)만 3회로 고친다 — 8/5는 손대지 않는다.
    await act(async () => { setNativeInputValue(countInput, '3') })

    await waitUntil(() => getState().workLogs[ownerKey]?.main?.['2026-08-06']?.fixedCount === 3)

    const storeData = getState().workLogs[ownerKey]?.main
    assert.equal(storeData?.['2026-08-06']?.fixedCount, 3, '편집한 8/6은 store에서 3으로 바뀌어야 한다')
    assert.equal(storeData?.['2026-08-05']?.fixedCount, 2, '건드리지 않은 8/5가 store에서 유실되면 안 된다')

    const persisted = readWorkData(ownerKey)
    assert.equal(persisted?.['2026-08-06']?.fixedCount, 3, 'localStorage도 store와 같은 값(8/6=3)이어야 한다')
    assert.equal(persisted?.['2026-08-05']?.fixedCount, 2, 'localStorage에서도 8/5가 유실되면 안 된다')

    // 편집이 예약한 클라우드 동기화 디바운스가 다음 테스트로 새지 않게 넉넉히 기다린다.
    await act(async () => { await wait(650) })
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})

// Step 6(일지 재작성) 완료 조건 — "입력 → 즉시 화면 반영, 디바운스 후 localStorage,
// 빈 날 삭제, 언마운트 flush". useDayDraft.js가 실제로 이 계약을 지키는지 DayLogPage를
// 실제로 렌더해서 확인한다(순수 함수 테스트로는 디바운스/언마운트 타이밍을 못 잡는다).
test('Step 6 — 일지 디바운스 커밋 + 언마운트 flush + 빈 날 삭제', async () => {
  window.history.pushState({}, '', '/app/day/2026-08-10')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-10'

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    const countInput = requireHtmlInput(container, '#modalFixedCountInput')
    await act(async () => { setNativeInputValue(countInput, '4') })

    // 화면(입력값)은 즉시 반영되지만, store/localStorage는 디바운스가 끝나기 전까지
    // 아직 그대로여야 한다 — "입력 → 즉시 화면 반영, 디바운스 후 localStorage".
    assert.equal(countInput.value, '4', '입력값은 즉시 화면에 반영돼야 한다')
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined, '디바운스가 끝나기 전에는 store에 아직 반영되면 안 된다')
    assert.equal(readWorkData(ownerKey)[dateKey], undefined, '디바운스가 끝나기 전에는 localStorage에도 아직 반영되면 안 된다')

    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount === 4, { timeoutMs: 2000 })
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 4, '디바운스가 끝나면 localStorage도 store와 같은 값이어야 한다')

    // 새 값(7)을 입력한 직후, 디바운스가 끝나기 전에 화면을 닫는다 — 언마운트
    // flush가 이 마지막 편집을 유실 없이 커밋해야 한다.
    await act(async () => { setNativeInputValue(countInput, '7') })
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 4, '아직 디바운스 전이라 store는 이전 값(4)이어야 한다')

    const backButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '뒤로가기')
    assert.ok(backButton, '일지의 뒤로가기 버튼을 찾아야 한다')
    await act(async () => {
      backButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app')

    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount, 7, '언마운트(뒤로가기) 시점에 밀린 편집(7)이 즉시 flush돼야 한다')
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 7, 'localStorage에도 flush된 값이 반영돼야 한다')

    // 같은 날짜를 다시 열어서 flush된 값이 실제로 왕복되는지 확인한다.
    await act(async () => {
      window.history.pushState({}, '', `/app/day/${dateKey}`)
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    assert.equal(requireHtmlInput(container, '#modalFixedCountInput').value, '7', '재진입 시 flush된 값(7)을 그대로 보여줘야 한다')

    // 값을 0으로 비우면(빈 날) 디바운스가 끝난 뒤 그 날짜 키 자체가 store/localStorage에서 사라져야 한다.
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '0') })
    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateKey] === undefined, { timeoutMs: 2000 })
    assert.equal(readWorkData(ownerKey)[dateKey], undefined, '빈 날은 localStorage에서도 키 자체가 지워져야 한다')
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})

// Step 6 재감사 FAIL 지적 1번 — react-router는 같은 Route(day/:date) 안에서 date
// 파라미터만 바뀌면 MainPageRoute/DayLogPage를 언마운트하지 않고 재사용한다.
// useDayDraft의 draft는 "마운트 시 한 번만" 초기화되므로, key 없이는 A의 draft가
// B로 넘어와 그대로 남고, 이미 걸려 있던 디바운스 타이머가 B의 dateKey로 A의
// 데이터를 커밋해 버리는 데이터 오염이 생겼다 — 실제 경로(하단 "일일운행" 탭으로
// 과거 일지 → 오늘 날짜 직행)로 재현하고, MainPageRoute.jsx의 key={ownerKey:dateKey}
// 수정으로 고쳤는지 확인한다.
test('재감사 FAIL 지적 1번 — 과거 일지에서 "일일운행" 탭으로 오늘 날짜로 이동해도 A의 draft가 B를 덮지 않고, A의 밀린 편집은 A에만 flush된다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateA = '2026-08-01'
  const { dateKey: dateB } = todayWorkLogSelection()
  window.history.pushState({}, '', '/app')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  try {
    await act(async () => {
      seedMainCar(ownerKey)
      commitWorkData(ownerKey, {
        [dateA]: { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
        [dateB]: { isOff: false, fixedCount: 6, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
      }, { syncToCloud: false })
      const main = getState().workLogs[ownerKey]?.main || {}
      handlers.daily_logs = {
        ...(handlers.daily_logs || {}),
        select: () => ({
          data: Object.keys(main).map((work_date) => ({
            work_date, vehicle_id: 501, is_off: false, fixed_count: main[work_date]?.fixedCount || 0, raw: main[work_date] || {},
          })),
          error: null,
        }),
      }
    })
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => window.location.pathname === '/app')
    await act(async () => { await wait(50) })

    await act(async () => {
      window.history.pushState({}, '', `/app/day/${dateA}`)
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    assert.equal(requireHtmlInput(container, '#modalFixedCountInput').value, '2', 'A는 자기 원래 값(2)으로 열려야 한다')

    // A를 9로 고치되, 디바운스(600ms)가 끝나기 전에 즉시 "일일운행" 탭으로 이동한다.
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '9') })

    const workTab = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent.includes('일일운행'))
    assert.ok(workTab, '"일일운행" 하단 탭을 찾아야 한다')
    await act(async () => {
      workTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === `/app/day/${dateB}`)
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    assert.equal(requireHtmlInput(container, '#modalFixedCountInput').value, '6', 'B는 자기 원래 값(6)으로 떠야 한다 — A의 draft(9)가 새어 들어오면 안 된다')

    // A에 걸려 있던 편집(9)은 언마운트(key 교체) flush로 A에만 정확히 반영돼야 한다.
    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateA]?.fixedCount === 9, { timeoutMs: 2000 })
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateA]?.fixedCount, 9, 'A에 걸려 있던 편집은 A에 flush돼야 한다')
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateB]?.fixedCount, 6, 'B는 원래 값 그대로여야 한다 — A의 값(9)으로 덮이면 안 된다')

    // B의 디바운스 창(600ms)이 완전히 지나도 A로 덮이지 않는지 재확인 — B는 아무 것도
    // 안 건드렸으니애초에 디바운스가 걸릴 일도 없지만, 혹시 남아 있던 타이머가 있다면
    // 여기서 드러난다.
    await act(async () => { await wait(700) })
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateB]?.fixedCount, 6, '시간이 더 지나도 B가 A(9)로 덮이면 안 된다')
    assert.equal(readWorkData(ownerKey)[dateB]?.fixedCount, 6, 'localStorage에서도 B는 그대로여야 한다')
    assert.equal(readWorkData(ownerKey)[dateA]?.fixedCount, 9, 'localStorage에서도 A는 flush된 값이어야 한다')
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})

// Step 6 재감사 FAIL 지적 8번 — draft/store 참조 분리(structuredClone). 콜상세의
// payments 배열·commissionSnapshot 객체 같은 중첩 값이 draft로 복제될 때(로드)와
// store로 커밋될 때(저장) 둘 다 깊이 복제되는지 확인한다. callDetails 자체를
// 건드리지 않는 편집(fixedCount만 변경)으로 커밋을 유발해서, "손대지 않은 콜상세의
// 중첩 값까지 커밋마다 새 참조가 되는지"를 본다 — structuredClone을 하나라도
// 빼면(얕은 복제로 되돌리면) 이 테스트는 실패한다(참조가 같아진다).
test('재감사 FAIL 지적 8번 — 커밋마다 콜상세의 중첩 payments/commissionSnapshot이 store에서 새 참조로 바뀐다(draft와 참조 공유 안 함)', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-16'
  window.history.pushState({}, '', '/app')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  try {
    await act(async () => {
      seedMainCar(ownerKey)
      commitWorkData(ownerKey, {
        [dateKey]: {
          isOff: false,
          fixedCount: 1,
          callDetails: [{
            id: 'c1', fare: '10,000', client: '한진',
            payments: [{ id: 'p1', amount: 5000, paidAt: '2026-08-01T00:00:00.000Z', note: '' }],
            commissionSnapshot: { enabled: true, type: 'percent', value: '10' },
          }],
          fixedRouteCounts: {},
        },
      }, { syncToCloud: false })
      handlers.daily_logs = {
        ...(handlers.daily_logs || {}),
        select: () => ({
          data: [{
            work_date: dateKey, vehicle_id: 501, is_off: false, fixed_count: 1,
            raw: getState().workLogs[ownerKey]?.main?.[dateKey] || {},
          }],
          error: null,
        }),
      }
      handlers.transport_details = {
        ...(handlers.transport_details || {}),
        select: () => ({
          data: [{
            work_date: dateKey,
            sequence: 0,
            raw: {
              id: 'c1', fare: '10,000', client: '한진',
              payments: [{ id: 'p1', amount: 5000, paidAt: '2026-08-01T00:00:00.000Z', note: '' }],
              commissionSnapshot: { enabled: true, type: 'percent', value: '10' },
            },
          }],
          error: null,
        }),
      }
    })
    await act(async () => {
      window.history.pushState({}, '', `/app/day/${dateKey}`)
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    const before = getState().workLogs[ownerKey].main[dateKey].callDetails[0]

    // callDetails는 전혀 건드리지 않는 편집(fixedCount만) — draft.callDetails 자체는
    // 재할당되지 않는데도, 커밋 시점의 structuredClone 때문에 store에 새로 반영되는
    // callDetails[0]과 그 중첩 값은 매번 새 객체여야 한다.
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '3') })
    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount === 3, { timeoutMs: 2000 })

    const after = getState().workLogs[ownerKey].main[dateKey].callDetails[0]
    assert.notEqual(after, before, 'callDetails[0] 자체가 새 참조여야 한다')
    assert.notEqual(after.payments, before.payments, 'payments 배열이 draft/store 사이에서 같은 참조로 남으면 안 된다')
    assert.notEqual(after.commissionSnapshot, before.commissionSnapshot, 'commissionSnapshot 객체가 같은 참조로 남으면 안 된다')
    assert.deepEqual(after.payments, before.payments, '참조만 다르고 값 자체는 그대로 보존돼야 한다')
    assert.deepEqual(after.commissionSnapshot, before.commissionSnapshot, '참조만 다르고 값 자체는 그대로 보존돼야 한다')
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})

// Step 6 재감사 FAIL 지적 4번 — palletVisible이 settings.clients(항상 비어 있음)가
// 아니라 실제 clients prop을 보게 고쳤는지 확인한다. 고정노선 연결(fixedRouteLinked)
// + 파렛트(palletOn) 켜진 거래처가 있으면 파렛트 섹션이 실제로 뜨고, 입력값이
// 디바운스 저장·재진입 후에도 유지되는지까지 본다.
test('재감사 FAIL 지적 4번 — 고정노선+파렛트 거래처가 있으면 파렛트 섹션이 뜨고, 저장·재진입 후에도 값이 유지된다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-17'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  try {
    await act(async () => {
      seedPalletClient(ownerKey)
      seedMainCar(ownerKey)
    })
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    const palletInput = requireHtmlInput(container, '#modalPalletCount')
    assert.ok(palletInput, '고정노선 연결 + palletOn 거래처가 있으면 파렛트 입력이 보여야 한다')

    await act(async () => { setNativeInputValue(palletInput, '5') })
    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateKey]?.palletCount === 5, { timeoutMs: 2000 })
    assert.equal(readWorkData(ownerKey)[dateKey]?.palletCount, 5, 'localStorage에도 반영돼야 한다')

    await act(async () => {
      window.history.pushState({}, '', '/app')
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    await waitUntil(() => window.location.pathname === '/app')
    await act(async () => {
      window.history.pushState({}, '', `/app/day/${dateKey}`)
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    await waitUntil(() => !!container.querySelector('#modalPalletCount'))
    assert.equal(requireHtmlInput(container, '#modalPalletCount').value, '5', '재진입 시 저장된 파렛트 값을 그대로 보여줘야 한다')

    // palletCount 커밋(syncToCloud 기본값 true)이 예약한 클라우드 동기화 디바운스가
    // 다음 테스트로 새지 않게 기다린다(재감사 2차 — 테스트 격리).
    await act(async () => { await wait(650) })
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})


// 재감사 5차(FAIL 지적 1번, P0) — useDayDraft.commitNow의 "직접 커밋 성공" 경로에도
// 같은 authoritative-residual-fallback 계약이 적용됐는지, 큐 재시도 경로가 아니라
// 실제 컴포넌트를 통해 확인한다. stale durable A(이전 세션에서 실패해 남아 있던
// 편집)가 있는 상태로 화면에 들어가 최신 편집 C를 저장하면, workData 커밋 자체는
// 성공하지만 durable에서 A를 지우는 cleanup 쓰기만 실패할 수 있다 — 이때 patch 없이
// owner/date만 넘기면 store엔 이미 C가 있는데 큐만 stale A로 되돌아갈 수 있었다
// (직접 트레이스로 확인, useDayDraft.js:131-138 주석 참고). C가 fallback에
// authoritative residual로 남아, 복구 후 재시도해도 A로 되돌아가지 않아야 한다.
test('재감사 5차 FAIL 지적 1번 — useDayDraft 직접 커밋 성공 후 cleanup만 실패해도 최신값이 유지되고, 복구 후 재시도해도 stale durable A로 되돌아가지 않는다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-26'
  // 이전 세션에서 실패해 durable에 stale하게 남아 있던 편집(A)을 미리 심어 둔다 —
  // 컴포넌트를 거치지 않고 직접 등록해 "화면을 열기 전부터 이미 큐에 있던" 상태를
  // 재현한다.
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} })

  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const durableKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  // durable 키는 처음부터 끝까지 막아 둔다 — hydrate/부트는 workData/settings 등
  // 다른 키만 쓰고 이 durable 전용 키는 건드리지 않으니 안전하다. 여기서 막지
  // 않으면 providers.jsx의 "attach 즉시 1회 재시도"가 마운트 직후 stale A를 곧바로
  // 처리해서 durable을 스스로 비워 버리고, 그러면 뒤이은 내 편집(C)의 cleanup은
  // "지울 stale 항목이 애초에 없어서" 실패할 수조차 없어 이 테스트가 무의미해진다
  // (실측 확인 — 처음엔 부트 이후에만 막았다가 이 문제로 실패를 봤다).
  let durableBlocked = true
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (durableBlocked && key === durableKey) throw new Error('quota exceeded (durable journal, simulated)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    assert.equal(requireHtmlInput(container, '#modalFixedCountInput').value, '1', 'stale durable A(fixedCount=1)가 store 위에 덮여 보여야 한다')
    assert.deepEqual(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 1, '마운트 직후에도 stale A가 그대로(durable이든 residual fallback이든) pending에 남아 있어야 한다')

    // durable cleanup 쓰기는 계속 막혀 있다(workData 쓰기는 그대로 성공) — 직접 편집(C)을 저장한다.
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '7') })
    await waitUntil(() => committedRecord(ownerKey, dateKey)?.fixedCount === 7, { timeoutMs: 2000 })

    // 직접 커밋(C, fixedCount=7)은 store/localStorage에 성공적으로 반영됐어야 한다.
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 7, '직접 커밋 C는 store에 성공적으로 반영돼야 한다')
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 7, 'localStorage에도 C가 반영돼야 한다')
    // durable cleanup이 실패했으니 C가 authoritative residual로 fallback에 남아야
    // 한다 — stale A(1)로 되돌아가면 안 된다.
    assert.equal(getPendingDayWrite(ownerKey, dateKey)?.fixedCount, 7, 'cleanup 실패 후에도 pending은 C(최신)여야 한다 — stale A로 되돌아가면 안 된다')
    assert.equal(pendingDayWriteCount(), 1, '같은 owner/date 키(stale durable A + residual fallback C)는 1건으로 계산돼야 한다')
    assert.equal(isDurableWriteBroken(), true, 'cleanup 실패로 residual이 남았으니 broken이어야 한다')

    // storage가 복구된 뒤 재시도(백그라운드 재시도를 흉내낸다)해도 C가 유지돼야 한다.
    // 재감사 5차(FAIL 지적 3번) — retryPendingDayWrites()가 store를 커밋해 구독 중인
    // 컴포넌트(AppShell 등)를 갱신시키니 act()로 감싼다.
    durableBlocked = false
    await act(async () => { retryPendingDayWrites() })
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 7, '복구 후 재시도해도 store는 계속 C여야 한다(A로 되돌아가면 안 된다)')
    assert.equal(pendingDayWriteCount(), 0, '완전히 정리됐으니 최종 pending count는 0이어야 한다')
    assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined)

    await waitUntil(() => !hasDirty(ownerKey), { timeoutMs: 5000 })
  } finally {
    spy.mock.restore()
    await unmountTracked(root)
    container.remove()
  }
})

/**
 * 슬라이스 E: 로그인 세션에서 clients는 LS에 미러되지 않으므로(commitBatch memory-only),
 * seedMainCar처럼 가짜 서버도 이 거래처를 돌려줘야 hydrate가 빈 배열로 지우지 않는다.
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
  handlers.clients.select = () => ({ data: clientRowsFor(clients), error: null })
  commitSettings(ownerKey, normalizeSettings({ fixedOn: true }), { syncToCloud: false })
}

/** daily_logs upsert가 실제로 나가려면 메인 차량 supabaseId가 필요하다. */
/** @param {string} ownerKey */
function seedMainCar(ownerKey) {
  const cars = [
    /** @type {import('../domain/financeTypes.js').CarLike} */ ({ id: 'car-main', type: 'main', number: '12가3456', supabaseId: 501 }),
  ]
  commitCars(ownerKey, cars, { syncToCloud: false })
  // 슬라이스 C: hydrate가 빈 배열을 "삭제됨"으로 보므로, 시드한 supabaseId 차량을
  // 가짜 서버도 돌려줘야 hydrate가 지우지 않는다. afterEach에서 select를 원복한다.
  handlers.vehicles.select = () => ({ data: vehicleRowsFor(cars), error: null })
}

// callDetail 표시 3케이스는 CallDetailList.test.js(컴포넌트 단위)로 검증한다.
// App 통합 경로는 hydrate+commitSettings 조합에서 OOM이 나서 이 파일에서는 제외했다.

// Step 6 재감사 FAIL 지적 6번 — 콜상세 인라인 패널과 정비/주유/기타 인라인 패널이
// 동시에 DOM에 존재하면 안 된다(InlineSheet는 열려 있을 때만 실제 폼 컴포넌트를
// 렌더한다 — 닫힌 쪽은 폼 컨텐츠 자체가 DOM에서 사라져야 한다).
test('재감사 FAIL 지적 6번 — 콜상세 폼을 열면 비용 폼이 닫히고, 비용 폼을 열면 콜상세 폼이 닫힌다(두 폼이 동시에 DOM에 없다)', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-19'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  try {
    await act(async () => {
      commitSettings(ownerKey, normalizeSettings({ fixedOn: true, callDetail: true }), { syncToCloud: false })
    })
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    await act(async () => {
      commitSettings(ownerKey, normalizeSettings({ fixedOn: true, callDetail: true }), { syncToCloud: false })
    })

    const openCallBtn = container.querySelector('.call-detail-section .compact-add-btn')
    assert.ok(openCallBtn, '콜상세 섹션의 "+ 추가" 버튼을 찾아야 한다')
    await act(async () => {
      openCallBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.ok(container.querySelector('.call-detail-modal-content'), '콜상세 폼이 DOM에 있어야 한다')
    const callSheet = container.querySelector('.call-detail-inline-host')
    assert.ok(callSheet?.classList.contains('is-visible'))
    assert.equal(callSheet?.getAttribute('aria-hidden'), 'false')
    assert.equal(callSheet?.hasAttribute('hidden'), false)
    assert.equal(container.querySelector('.maint-fuel-select-inline'), null, '비용 선택 패널은 아직 DOM에 없어야 한다')

    for (const label of ['+ 정비 추가', '+ 주유 추가', '+ 기타 추가']) {
      const kindBtn = Array.from(container.querySelectorAll('button')).find((btn) => (btn.textContent || '').includes(label))
      assert.ok(kindBtn, label)
      await act(async () => { kindBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
      const expenseSheet = container.querySelector('.maint-fuel-inline-host')
      assert.ok(expenseSheet?.classList.contains('is-visible'), `${label} 시트가 열려야 한다`)
      assert.equal(expenseSheet?.getAttribute('aria-hidden'), 'false')
      assert.equal(container.querySelector('.call-detail-modal-content'), null, `${label} 후 콜 폼은 닫혀야 한다`)
      assert.ok(container.querySelector('#expenseCost'), `${label} 비용 입력이 보여야 한다`)
    }

    const openExpenseBtn = container.querySelector('.maint-section .compact-add-btn')
    assert.ok(openExpenseBtn, '비용 섹션의 "+ 추가" 버튼을 찾아야 한다')
    await act(async () => {
      openExpenseBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.ok(container.querySelector('.maint-fuel-select-inline'), '비용 선택 패널이 DOM에 있어야 한다')
    assert.equal(container.querySelector('.call-detail-modal-content'), null, '비용 폼을 열면 콜상세 폼은 DOM에서 사라져야 한다(동시 존재 금지)')
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})


// Step 6 재감사 2차(FAIL 지적 2번) — useExpenseForm이 마운트 시 한 번만 expenses를
// 스냅샷 떠서, 그 사이(다른 탭·hydrate·동시 조작 등으로) store에 반영된 항목을 다음
// save()가 그 스냅샷 기준으로 통째로 덮어써 지워 버렸다. 재현: e1을 seed하고 화면을
// 연 뒤, "화면이 모르는 사이" e2를 store에 추가로 커밋하고, 그다음 화면에서 새
// 항목(e3)을 저장했을 때 e2가 살아남는지 확인한다.
test('재감사 2차 FAIL 지적 2번 — 비용 저장이 그 사이 store에 추가된 다른 비용을 덮어쓰지 않는다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-21'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  try {
    const e1 = { id: 'e1', kind: 'maint', date: dateKey, name: '오일', category: '엔진/미션', payment: '카드', cost: 10000 }
    await act(async () => { commitExpenses(ownerKey, [e1], { syncToCloud: false }) })

    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('.maint-section'))

    // 화면이 모르는 사이(외부 경로로) e2가 store에 들어온다 — 다른 탭/hydrate를 흉내낸다.
    const e2 = { id: 'e2', kind: 'misc', date: dateKey, name: '주차비', category: '주차비', payment: '카드', cost: 3000 }
    await act(async () => { commitExpenses(ownerKey, [e1, e2], { syncToCloud: false }) })

    const addMaintBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent.includes('+ 정비 추가'))
    assert.ok(addMaintBtn, '"+ 정비 추가" 버튼을 찾아야 한다')
    await act(async () => { addMaintBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })

    const nameInput = container.querySelector('#expenseName')
    assert.ok(nameInput, '정비 항목명 입력을 찾아야 한다')
    await act(async () => { setNativeInputValue(nameInput, '타이어 교체') })
    const costInput = container.querySelector('#expenseCost')
    await act(async () => { setNativeInputValue(costInput, '20000') })

    const saveBtn = Array.from(container.querySelectorAll('.modal-btn.confirm')).find((btn) => btn.textContent === '저장')
    assert.ok(saveBtn, '저장 버튼을 찾아야 한다')
    await act(async () => { saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })

    await waitUntil(() => (getState().expenses[ownerKey] || []).some((item) => item.name === '타이어 교체'))
    const stored = getState().expenses[ownerKey] || []
    assert.equal(stored.length, 3, `e1, e2(화면이 모르던 것), 신규 항목까지 3건이어야 한다 — 실제: ${JSON.stringify(stored)}`)
    assert.ok(stored.some((item) => item.id === 'e1'), 'e1이 남아 있어야 한다')
    assert.ok(stored.some((item) => item.id === 'e2'), '화면이 모르는 사이 추가된 e2가 저장 후에도 살아남아야 한다(덮어쓰기 금지)')
    assert.ok(stored.some((item) => item.name === '타이어 교체'), '새로 입력한 항목도 저장돼야 한다')

    // 이 저장이 예약한 클라우드 동기화 디바운스(600ms)가 다음 테스트로 새지 않게
    // 넉넉히 기다린다 — 재감사 2차에서 이걸 빼먹어서, 뒤이은 persistent quota
    // 테스트의 "Supabase 호출 0회" 계측에 이 테스트의 지연된 동기화가 섞여 들어가는
    // 격리 실패가 실제로 있었다(재현: 13 !== 12).
    await act(async () => { await wait(650) })
  } finally {
    await unmountTracked(root)
    container.remove()
  }
})








test('슬라이스 D — 로그인 클라우드 일지: 서버 upsert 실패는 Fail-Fast(저장 실패 상태 + 네트워크 토스트)이고 durable 큐에 새 항목이 없다. 복구 후 재편집이 서버·Store로 수렴한다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-10-02'
  window.history.pushState({}, '', '/app/day/' + dateKey)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)

  // 서버 실패는 transport_details 쓰기를 던지게 해서 낸다(commitMainDayLogToCloud가
  // daily_logs upsert 다음에 transport_details를 교체하다 실패 → Fail-Fast).
  let serverShouldFail = false
  const prevDailyLogs = handlers.daily_logs
  const prevTransport = handlers.transport_details
  handlers.daily_logs = {
    ...(prevDailyLogs || {}),
    select: () => ({ data: [{ work_date: dateKey, vehicle_id: 501, is_off: false, fixed_count: 2, raw: { palletCount: 0, fixedRouteCounts: {} } }], error: null }),
  }
  handlers.transport_details = {
    delete: () => {
      if (serverShouldFail) throw new Error('transport_details down (simulated)')
      return { data: [{ id: 1 }], error: null }
    },
  }
  const dailyLogs = captureDailyLogUpserts()
  const errSpy = spyConsoleError('[commitMainDayLogToCloud] 일지 저장 실패:')

  try {
    await act(async () => {
      seedPalletClient(ownerKey)
      seedMainCar(ownerKey)
      commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} } }, { syncToCloud: false })
    })
    await act(async () => { root.render(React.createElement(BrowserRouter, null, React.createElement(App))) })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    await waitUntil(() => committedRecord(ownerKey, dateKey)?.fixedCount === 2, { timeoutMs: 3000 })

    serverShouldFail = true
    await act(async () => { setNativeInputValue(requireHtmlInput(container, '#modalFixedCountInput'), '8') })
    await waitUntil(() => (container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패'), { timeoutMs: 2000 })

    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, '실패 시 Store는 저장 전 값(2)')
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 2, '실패 시 localStorage도 저장 전 값')
    assert.equal(pendingDayWriteCount(), 0, '로그인 Fail-Fast는 durable 큐에 새 항목을 넣지 않는다')
    assert.equal(getPendingDayWrite(ownerKey, dateKey), undefined)
    assert.equal(hasUnsafeRegistration(ownerKey, dateKey), false)
    const toastText = container.querySelector('.toast-message')?.textContent || ''
    assert.match(toastText, /네트워크 상태를 확인해 주세요/)
    assert.equal(toastText.includes('저장 공간'), false, '로그인 원격 실패에 quota 문구를 쓰면 안 된다')
    assert.equal((container.querySelector('.autosave-status')?.textContent || '').includes('저장됨'), false)
    assert.equal(errSpy.count(), 1)

    serverShouldFail = false
    const upsertsBefore = dailyLogs.forDate(dateKey).length
    await act(async () => { setNativeInputValue(requireHtmlInput(container, '#modalFixedCountInput'), '9') })
    await waitUntil(() => committedRecord(ownerKey, dateKey)?.fixedCount === 9, { timeoutMs: 2000 })
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 9)
    assert.equal(dailyLogs.forDate(dateKey).length > upsertsBefore, true, '재편집이 그 날짜 daily_logs upsert를 냈어야 한다')
    assert.equal(pendingDayWriteCount(), 0)
    assert.equal(errSpy.count(), 1, '복구 성공 뒤 console.error가 늘면 안 된다')
    await waitUntil(() => !hasDirty(ownerKey), { timeoutMs: 5000 })
  } finally {
    errSpy.restore()
    dailyLogs.restore()
    handlers.daily_logs = prevDailyLogs
    if (prevTransport) handlers.transport_details = prevTransport
    else delete handlers.transport_details
    if (liveRoots.has(root)) { await unmountTracked(root); container.remove() }
    await flushCloudSync()
  }
})

test('슬라이스 D — 로그인 클라우드 일지: 서버 저장은 성공했지만 로컬 persist가 quota로 막히면 Fail-Fast 상태만, durable/tombstone은 안 쌓인다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-10-03'
  window.history.pushState({}, '', '/app/day/' + dateKey)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)
  const prevDailyLogs = handlers.daily_logs
  handlers.daily_logs = { ...(prevDailyLogs || {}), select: () => ({ data: [{ work_date: dateKey, vehicle_id: 501, is_off: false, fixed_count: 2, raw: { palletCount: 0, fixedRouteCounts: {} } }], error: null }) }
  const dailyLogs = captureDailyLogUpserts()

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  const tombstoneKey = storageKeyFor('workDataDeletedDates', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated, slice D login)')
    return originalSetItem.call(this, key, value)
  })
  const errSpy = spyConsoleError('[commitMainDayLogToCloud] 일지 저장 실패:')

  try {
    await act(async () => {
      seedPalletClient(ownerKey)
      seedMainCar(ownerKey)
      commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} } }, { syncToCloud: false })
    })
    await act(async () => { root.render(React.createElement(BrowserRouter, null, React.createElement(App))) })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    await waitUntil(() => committedRecord(ownerKey, dateKey)?.fixedCount === 2, { timeoutMs: 3000 })

    const tombstoneRawBefore = localStorage.getItem(tombstoneKey)
    const upsertsBefore = dailyLogs.forDate(dateKey).length
    shouldFail = true
    await act(async () => { setNativeInputValue(requireHtmlInput(container, '#modalFixedCountInput'), '8') })
    await waitUntil(() => committedRecord(ownerKey, dateKey)?.fixedCount === 8, { timeoutMs: 2000 })

    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 8, '슬라이스 E: 로그인 일지는 workData LS를 안 쓰므로 quota와 무관하게 서버 성공 후 Store가 갱신된다')
    assert.equal(pendingDayWriteCount(), 0, 'durable 큐에 새 항목이 없어야 한다')
    assert.equal(hasUnsafeRegistration(ownerKey, dateKey), false)
    assert.equal(localStorage.getItem(tombstoneKey), tombstoneRawBefore, '새 tombstone을 만들면 안 된다')
    assert.equal(dailyLogs.forDate(dateKey).length, upsertsBefore + 1, '서버 daily_logs upsert는 나갔다')
    assert.equal(errSpy.count(), 0)

    await act(async () => { setNativeInputValue(requireHtmlInput(container, '#modalFixedCountInput'), '9') })
    await waitUntil(() => committedRecord(ownerKey, dateKey)?.fixedCount === 9, { timeoutMs: 2000 })
    assert.equal(pendingDayWriteCount(), 0)
    assert.equal(errSpy.count(), 0)
  } finally {
    errSpy.restore()
    spy.mock.restore()
    shouldFail = false
    dailyLogs.restore()
    handlers.daily_logs = prevDailyLogs
    if (liveRoots.has(root)) { await unmountTracked(root); container.remove() }
    await flushCloudSync()
  }
})
