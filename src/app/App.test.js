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
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

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
  exports: {
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

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { BrowserRouter } = await import('react-router-dom')
const { act } = React
const { default: App } = await import('./App.jsx')
const { commitClients, commitExpenses, commitSettings, commitWorkData } = await import('../store/commitHelpers.js')
const {
  hasPendingDayWrites, pendingDayWriteCount, retryPendingDayWrites,
  registerPendingDayWrite, getPendingDayWrite,
} = await import('../lib/pendingWorkDataWrites.js')
const { isDurableWriteBroken } = await import('../lib/durableWriteGuard.js')
const { hasDirty } = await import('../lib/dirtyJournal.js')
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

test('사용자 지시 5번 — 로그인 계정이 라우트를 이동해도 그 경로에 머물고 부트가 재실행되지 않는다', async () => {
  window.history.pushState({}, '', '/')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

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
    await act(async () => { root.unmount() })
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
  const root = createRoot(container)

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
    await act(async () => { root.unmount() })
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
  const root = createRoot(container)

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
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// Step 5(달력 홈 재작성) 재감사 4번 — MainPageRoute가 이제 useState(() => loadWorkData(...))
// 로컬 스냅샷 대신 store를 직접 구독한다(useOwnerWorkData). 마운트 후 store에 외부에서
// 값이 커밋돼도 CalendarPage/WorkLogPage가 그 값을 봐야 하고, saveDay는 그 최신 store
// workData를 기준으로 커밋해서 함께 있던 다른 날짜를 지우면 안 된다.
test('재감사 4번 — store 구독: 마운트 후 외부에서 커밋한 workData를 CalendarPage/WorkLogPage가 보고, 한 날짜 편집이 다른 날짜를 지우지 않는다', async () => {
  window.history.pushState({}, '', '/app')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const ownerKey = 'user-boot-nav'

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => window.location.pathname === '/app')
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

    const countInput = container.querySelector('#modalFixedCountInput')
    assert.ok(countInput, '일지의 운행 횟수 입력을 찾아야 한다')
    assert.equal(countInput.value, '5', 'WorkLogPage가 store의 최신값(B, 5회)을 받아야 한다 — 로컬 스냅샷의 예전(빈) 값이 아니다')

    // 이 날짜(8/6)만 3회로 고친다 — 8/5는 손대지 않는다.
    await act(async () => { setNativeInputValue(countInput, '3') })

    await waitUntil(() => getState().workLogs[ownerKey]?.main?.['2026-08-06']?.fixedCount === 3)

    const storeData = getState().workLogs[ownerKey]?.main
    assert.equal(storeData?.['2026-08-06']?.fixedCount, 3, '편집한 8/6은 store에서 3으로 바뀌어야 한다')
    assert.equal(storeData?.['2026-08-05']?.fixedCount, 2, '건드리지 않은 8/5가 store에서 유실되면 안 된다')

    const persisted = readJsonKey('workData', ownerKey, {})
    assert.equal(persisted?.['2026-08-06']?.fixedCount, 3, 'localStorage도 store와 같은 값(8/6=3)이어야 한다')
    assert.equal(persisted?.['2026-08-05']?.fixedCount, 2, 'localStorage에서도 8/5가 유실되면 안 된다')

    // 편집이 예약한 클라우드 동기화 디바운스가 다음 테스트로 새지 않게 넉넉히 기다린다.
    await act(async () => { await wait(650) })
  } finally {
    await act(async () => { root.unmount() })
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
  const root = createRoot(container)
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-10'

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    const countInput = container.querySelector('#modalFixedCountInput')
    await act(async () => { setNativeInputValue(countInput, '4') })

    // 화면(입력값)은 즉시 반영되지만, store/localStorage는 디바운스가 끝나기 전까지
    // 아직 그대로여야 한다 — "입력 → 즉시 화면 반영, 디바운스 후 localStorage".
    assert.equal(countInput.value, '4', '입력값은 즉시 화면에 반영돼야 한다')
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined, '디바운스가 끝나기 전에는 store에 아직 반영되면 안 된다')
    assert.equal(readJsonKey('workData', ownerKey, {})[dateKey], undefined, '디바운스가 끝나기 전에는 localStorage에도 아직 반영되면 안 된다')

    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateKey]?.fixedCount === 4, { timeoutMs: 2000 })
    assert.equal(readJsonKey('workData', ownerKey, {})[dateKey]?.fixedCount, 4, '디바운스가 끝나면 localStorage도 store와 같은 값이어야 한다')

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
    assert.equal(readJsonKey('workData', ownerKey, {})[dateKey]?.fixedCount, 7, 'localStorage에도 flush된 값이 반영돼야 한다')

    // 같은 날짜를 다시 열어서 flush된 값이 실제로 왕복되는지 확인한다.
    await act(async () => {
      window.history.pushState({}, '', `/app/day/${dateKey}`)
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    assert.equal(container.querySelector('#modalFixedCountInput').value, '7', '재진입 시 flush된 값(7)을 그대로 보여줘야 한다')

    // 값을 0으로 비우면(빈 날) 디바운스가 끝난 뒤 그 날짜 키 자체가 store/localStorage에서 사라져야 한다.
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '0') })
    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateKey] === undefined, { timeoutMs: 2000 })
    assert.equal(readJsonKey('workData', ownerKey, {})[dateKey], undefined, '빈 날은 localStorage에서도 키 자체가 지워져야 한다')
  } finally {
    await act(async () => { root.unmount() })
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
  const root = createRoot(container)

  try {
    await act(async () => {
      commitWorkData(ownerKey, {
        [dateA]: { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
        [dateB]: { isOff: false, fixedCount: 6, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
      }, { syncToCloud: false })
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
    assert.equal(container.querySelector('#modalFixedCountInput').value, '2', 'A는 자기 원래 값(2)으로 열려야 한다')

    // A를 9로 고치되, 디바운스(600ms)가 끝나기 전에 즉시 "일일운행" 탭으로 이동한다.
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '9') })

    const workTab = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent.includes('일일운행'))
    assert.ok(workTab, '"일일운행" 하단 탭을 찾아야 한다')
    await act(async () => {
      workTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === `/app/day/${dateB}`)
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    assert.equal(container.querySelector('#modalFixedCountInput').value, '6', 'B는 자기 원래 값(6)으로 떠야 한다 — A의 draft(9)가 새어 들어오면 안 된다')

    // A에 걸려 있던 편집(9)은 언마운트(key 교체) flush로 A에만 정확히 반영돼야 한다.
    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateA]?.fixedCount === 9, { timeoutMs: 2000 })
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateA]?.fixedCount, 9, 'A에 걸려 있던 편집은 A에 flush돼야 한다')
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateB]?.fixedCount, 6, 'B는 원래 값 그대로여야 한다 — A의 값(9)으로 덮이면 안 된다')

    // B의 디바운스 창(600ms)이 완전히 지나도 A로 덮이지 않는지 재확인 — B는 아무 것도
    // 안 건드렸으니애초에 디바운스가 걸릴 일도 없지만, 혹시 남아 있던 타이머가 있다면
    // 여기서 드러난다.
    await act(async () => { await wait(700) })
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateB]?.fixedCount, 6, '시간이 더 지나도 B가 A(9)로 덮이면 안 된다')
    assert.equal(readJsonKey('workData', ownerKey, {})[dateB]?.fixedCount, 6, 'localStorage에서도 B는 그대로여야 한다')
    assert.equal(readJsonKey('workData', ownerKey, {})[dateA]?.fixedCount, 9, 'localStorage에서도 A는 flush된 값이어야 한다')
  } finally {
    await act(async () => { root.unmount() })
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
  const root = createRoot(container)

  try {
    await act(async () => {
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
    })
    const before = getState().workLogs[ownerKey].main[dateKey].callDetails[0]

    await act(async () => {
      window.history.pushState({}, '', `/app/day/${dateKey}`)
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

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
    await act(async () => { root.unmount() })
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
  const root = createRoot(container)

  try {
    await act(async () => {
      commitClients(ownerKey, [
        { id: 'c1', companyName: '한진', fixedRouteLinked: true, palletOn: true, palletPrice: '10,000', fixedUnitPrice: '250,000' },
      ], { syncToCloud: false })
      commitSettings(ownerKey, normalizeSettings({ fixedOn: true }), { syncToCloud: false })
    })
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    const palletInput = container.querySelector('#modalPalletCount')
    assert.ok(palletInput, '고정노선 연결 + palletOn 거래처가 있으면 파렛트 입력이 보여야 한다')

    await act(async () => { setNativeInputValue(palletInput, '5') })
    await waitUntil(() => getState().workLogs[ownerKey]?.main?.[dateKey]?.palletCount === 5, { timeoutMs: 2000 })
    assert.equal(readJsonKey('workData', ownerKey, {})[dateKey]?.palletCount, 5, 'localStorage에도 반영돼야 한다')

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
    assert.equal(container.querySelector('#modalPalletCount').value, '5', '재진입 시 저장된 파렛트 값을 그대로 보여줘야 한다')

    // palletCount 커밋(syncToCloud 기본값 true)이 예약한 클라우드 동기화 디바운스가
    // 다음 테스트로 새지 않게 기다린다(재감사 2차 — 테스트 격리).
    await act(async () => { await wait(650) })
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// 재감사 3차(FAIL 지적 2번) — quota 실패로 fixedCount 편집이 durable 큐에 남은 채로
// 화면을 나갔다 같은 날짜로 재진입하면, store 위에 그 pending patch가 덮여서 입력에
// 그대로 보여야 한다(재진입 시 overlay). 그 상태에서 다른 필드(palletCount)를 편집해
// 저장이 성공하면, 먼저 실패했던 fixedCount와 나중에 편집한 palletCount가 "둘 다"
// 최종 커밋에 반영돼야 한다 — 재진입 시 store의 오래된 값 기준으로만 커밋해서
// 먼저 실패한 편집을 통째로 버리면 안 된다는 요구사항의 실측.
test('재감사 3차 FAIL 지적 2번 — 재진입 시 durable pending patch가 store 위에 덮이고, 먼저 실패한 fixedCount와 나중에 편집한 palletCount가 모두 보존된다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-24'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

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
    await act(async () => {
      commitClients(ownerKey, [
        { id: 'c1', companyName: '한진', fixedRouteLinked: true, palletOn: true, palletPrice: '10,000', fixedUnitPrice: '250,000' },
      ], { syncToCloud: false })
      commitSettings(ownerKey, normalizeSettings({ fixedOn: true }), { syncToCloud: false })
    })
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    // 재감사 7차(FAIL 지적 3번) — 이 아래에서 useDayDraft.js가 실패할 때마다 정확히
    // 이 메시지로 console.error를 부른다. 숫자까지 직접 Assert한다(그냥 화면에
    // 흘려 보내지 않는다).
    const errSpy = spyConsoleError('일지 자동 저장 실패:')
    shouldFail = true
    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '5') })
    await waitUntil(
      () => (container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패'),
      { timeoutMs: 2000 },
    )
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
      container.querySelector('#modalFixedCountInput').value, '5',
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
    await waitUntil(() => !hasDirty(ownerKey), { timeoutMs: 5000 })
  } finally {
    spy.mock.restore()
    await act(async () => { root.unmount() })
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
  const root = createRoot(container)

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
    assert.equal(container.querySelector('#modalFixedCountInput').value, '1', 'stale durable A(fixedCount=1)가 store 위에 덮여 보여야 한다')
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
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// 재감사 4차(FAIL 지적 3번) — durable 기록 자체가 실패한 상태(durableWriteGuard.js가
// broken)에서, DayLogPage 헤더 "뒤로가기"뿐 아니라 BottomNav/SideMenu/로그아웃 같은
// 실제 전역 이동 경로도 확인 없이 진행되면 안 된다. workData 커밋과 durable
// 큐(pendingWorkDataWrites.js)의 durable 기록 둘 다 실패하게 만들어(진짜 "이 편집이
// 메모리 fallback에만 있다"는 상태) 재현한다.
function forceDurableWriteBroken(ownerKey) {
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const durableKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  const workDataKey = storageKeyFor('workData', ownerKey)
  return mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === workDataKey || key === durableKey) throw new Error('quota exceeded (simulated, durable journal itself)')
    return original.call(this, key, value)
  })
}

test('재감사 4차 FAIL 지적 3번 — durable 기록이 깨진 상태에서 BottomNav 탭 전환은 확인 없이 진행되지 않는다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-27'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  // 부트/hydrate가 끝나기 전에 workData 쓰기를 막으면 hydrate 자신의
  // replaceOwnerState 쓰기까지 막혀 hydration.status가 'failed'로 굳고, 그 뒤로는
  // scheduleCloudSync가 계속 아무 것도 안 해서 dirty가 영영 안 지워진다(실측 확인 —
  // 다른 quota 테스트들과 같은 이유) — 반드시 부트가 끝난 뒤에만 스파이를 심는다.
  const confirmSpy = mock.method(window, 'confirm', () => false)
  let spy

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    spy = forceDurableWriteBroken(ownerKey)
    const errSpy = spyConsoleError('일지 자동 저장 실패:')

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '7') })
    await waitUntil(() => isDurableWriteBroken(), { timeoutMs: 2000 })
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
    await waitUntil(() => !hasDirty(ownerKey), { timeoutMs: 5000 })
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('재감사 4차 FAIL 지적 3번 — confirm에서 "그래도 이동"을 선택하면 BottomNav 전환이 실제로 진행된다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-28'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const confirmSpy = mock.method(window, 'confirm', () => true)
  let spy

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    spy = forceDurableWriteBroken(ownerKey)
    const errSpy = spyConsoleError('일지 자동 저장 실패:')

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '8') })
    await waitUntil(() => isDurableWriteBroken(), { timeoutMs: 2000 })
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
    await waitUntil(() => !hasDirty(ownerKey), { timeoutMs: 5000 })
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// react-router의 <BrowserRouter>는 popstate(브라우저 물리 "뒤로가기")를 취소할 수 없다
// (표준 popstate 이벤트는 cancelable이 아니다 — preventDefault가 동작하지 않는다).
// 그래서 이 경로는 "이동 자체를 막는" 계약이 아니라 "이동해도 fallback이 안전하게
// 남고, 새로고침/탭 종료 전에는 반드시 beforeunload로 경고된다"는 계약으로 명시한다
// (재감사 4차 FAIL 지적 3번 — 전역 이동을 막지 않을 설계라면 이 계약을 테스트·문서에
// 명시하라는 지시).
test('재감사 4차 FAIL 지적 3번 — 브라우저 back(popstate)은 막을 수 없지만, 그 이후에도 fallback은 안전하게 남고 beforeunload는 계속 경고한다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-29'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  let spy

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    spy = forceDurableWriteBroken(ownerKey)
    const errSpy = spyConsoleError('일지 자동 저장 실패:')

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '9') })
    await waitUntil(() => isDurableWriteBroken(), { timeoutMs: 2000 })
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
    await waitUntil(() => !hasDirty(ownerKey), { timeoutMs: 5000 })
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// Step 6 재감사 FAIL 지적 5번 — settings.callDetail이 꺼져 있으면 콜상세 섹션 전체가
// 안 보이고, 켜면 보여야 한다. useOwnerSettings가 store를 직접 구독하므로 리마운트
// 없이도 설정을 바꾸는 즉시 반영돼야 한다(리렌더만으로 충분).
test('재감사 FAIL 지적 5번 — settings.callDetail이 꺼지면 콜상세 섹션이 숨고, 켜면 다시 보인다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-18'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  try {
    await act(async () => {
      commitSettings(ownerKey, normalizeSettings({ fixedOn: true, callDetail: false }), { syncToCloud: false })
    })
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    assert.equal(container.querySelector('.call-detail-section'), null, 'callDetail=false면 콜상세 섹션이 없어야 한다')

    await act(async () => {
      commitSettings(ownerKey, normalizeSettings({ fixedOn: true, callDetail: true }), { syncToCloud: false })
    })
    assert.ok(container.querySelector('.call-detail-section'), 'callDetail=true로 바꾸면 리마운트 없이도 콜상세 섹션이 보여야 한다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// Step 6 재감사 FAIL 지적 6번 — 콜상세 인라인 패널과 정비/주유/기타 인라인 패널이
// 동시에 DOM에 존재하면 안 된다(InlineSheet는 열려 있을 때만 실제 폼 컴포넌트를
// 렌더한다 — 닫힌 쪽은 폼 컨텐츠 자체가 DOM에서 사라져야 한다).
test('재감사 FAIL 지적 6번 — 콜상세 폼을 열면 비용 폼이 닫히고, 비용 폼을 열면 콜상세 폼이 닫힌다(두 폼이 동시에 DOM에 없다)', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-19'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  try {
    await act(async () => {
      commitSettings(ownerKey, normalizeSettings({ fixedOn: true, callDetail: true }), { syncToCloud: false })
    })
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))

    const openCallBtn = container.querySelector('.call-detail-section .compact-add-btn')
    assert.ok(openCallBtn, '콜상세 섹션의 "+ 추가" 버튼을 찾아야 한다')
    await act(async () => {
      openCallBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.ok(container.querySelector('.call-detail-modal-content'), '콜상세 폼이 DOM에 있어야 한다')
    assert.equal(container.querySelector('.maint-fuel-select-inline'), null, '비용 선택 패널은 아직 DOM에 없어야 한다')

    const openExpenseBtn = container.querySelector('.maint-section .compact-add-btn')
    assert.ok(openExpenseBtn, '비용 섹션의 "+ 추가" 버튼을 찾아야 한다')
    await act(async () => {
      openExpenseBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.ok(container.querySelector('.maint-fuel-select-inline'), '비용 선택 패널이 DOM에 있어야 한다')
    assert.equal(container.querySelector('.call-detail-modal-content'), null, '비용 폼을 열면 콜상세 폼은 DOM에서 사라져야 한다(동시 존재 금지)')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// Step 6 재감사 FAIL 지적 9번 — 자동 저장이 localStorage quota 초과로 실패하면:
// (1) store/localStorage 불변 (2) UI가 거짓 "저장됨"이 되지 않고 실패 상태/토스트를
// 보여준다 (3) pending 편집을 조용히 버리지 않는다 — quota 압박이 풀린 뒤 화면을
// 나가면(언마운트 flush) 그 편집이 결국 반영돼야 한다.
test('재감사 FAIL 지적 9번 — 자동 저장 quota 초과: store/localStorage 불변, 거짓 저장됨 없음, 실패 토스트, 이후 언마운트 재시도로 유실되지 않는다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-20'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
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

    await waitUntil(
      () => (container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패'),
      { timeoutMs: 2000 },
    )
    unsubscribe()
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')
    assert.ok(
      container.querySelector('.autosave-status').textContent.includes('저장 실패'),
      '자동 저장 실패가 화면에 표시돼야 한다(거짓 "저장됨"이 아니라)',
    )
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined, '실패한 쓰기는 store에 전혀 반영되면 안 된다')
    assert.equal(readJsonKey('workData', ownerKey, {})[dateKey], undefined, '실패한 쓰기는 localStorage에도 전혀 반영되면 안 된다')
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
    assert.equal(readJsonKey('workData', ownerKey, {})[dateKey]?.fixedCount, 4, 'localStorage에도 반영돼야 한다')
    // shouldFail을 재시도 전에 이미 false로 풀어 뒀으니 언마운트 flush는 성공한다
    // — 추가 로깅 없이 그대로 1이어야 한다.
    assert.equal(errSpy.count(), 1, '복구 후 언마운트 flush는 성공했으니 추가로 로깅되면 안 된다')
    errSpy.restore()
  } finally {
    spy.mock.restore()
    await act(async () => { root.unmount() })
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
  const root = createRoot(container)

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

    const stored = readJsonKey('expenses', ownerKey, [])
    assert.equal(stored.length, 3, `e1, e2(화면이 모르던 것), 신규 항목까지 3건이어야 한다 — 실제: ${JSON.stringify(stored)}`)
    assert.ok(stored.some((item) => item.id === 'e1'), 'e1이 남아 있어야 한다')
    assert.ok(stored.some((item) => item.id === 'e2'), '화면이 모르는 사이 추가된 e2가 저장 후에도 살아남아야 한다(덮어쓰기 금지)')
    assert.ok(stored.some((item) => item.name === '타이어 교체'), '새로 입력한 항목도 저장돼야 한다')
    assert.deepEqual(getState().expenses[ownerKey], stored, 'store와 localStorage가 같은 값이어야 한다')

    // 이 저장이 예약한 클라우드 동기화 디바운스(600ms)가 다음 테스트로 새지 않게
    // 넉넉히 기다린다 — 재감사 2차에서 이걸 빼먹어서, 뒤이은 persistent quota
    // 테스트의 "Supabase 호출 0회" 계측에 이 테스트의 지연된 동기화가 섞여 들어가는
    // 격리 실패가 실제로 있었다(재현: 13 !== 12).
    await act(async () => { await wait(650) })
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// 재감사 3차(FAIL 지적 5번) — 비용 저장/삭제도 day-log 자동 저장(위 FAIL 지적 9번
// 테스트)과 같은 방식으로 quota 실패를 실측한다: 실제 Storage.setItem을 실패로
// 주입하고 store/localStorage 불변, notify 0회, Supabase 호출 0회, 실패 토스트,
// draft(모달이 안 닫힘)까지 전부 확인한다. useExpenseForm.js의 save()/remove()는
// 이미 try/catch로 이 계약을 지키게 짜여 있지만, 지금까지는 그걸 실측하는 테스트가
// 없었다(재감사 2차 FAIL 지적 2번 테스트는 "덮어쓰기 방지"만 다뤘다).
test('재감사 3차 FAIL 지적 5번 — 비용 저장 quota 초과: store/localStorage 불변, notify 0회, Supabase 0회, 실패 토스트, 모달(draft) 유지', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-22'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const e1 = { id: 'e1-save-quota', kind: 'maint', date: dateKey, name: '오일', category: '엔진/미션', payment: '카드', cost: 10000 }
  await act(async () => { commitExpenses(ownerKey, [e1], { syncToCloud: false }) })

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('expenses', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
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
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('재감사 3차 FAIL 지적 5번 — 비용 삭제 quota 초과: store/localStorage 불변, notify 0회, Supabase 0회, 실패 토스트, 기존 행 유지', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-23'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const e1 = { id: 'e1-del-quota', kind: 'maint', date: dateKey, name: '오일', category: '엔진/미션', payment: '카드', cost: 10000 }
  await act(async () => { commitExpenses(ownerKey, [e1], { syncToCloud: false }) })

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('expenses', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
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
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// Step 6 재감사 2차(FAIL 지적) — quota가 "한 번만"이 아니라 계속(persistent) 막혀
// 있는 상태에서 라우트 이동(언마운트)까지 하면, useDayDraft.js의 마지막 재시도조차
// 실패해서 draftRef가 컴포넌트와 함께 사라져 그 편집을 영구히 잃을 수 있었다.
// 재현: quota를 계속 실패하게 두고 입력 → 실패 확인 → 그 상태 그대로 뒤로가기(언마운트,
// 마지막 재시도도 실패) → 그래도 lib/pendingWorkDataWrites.js의 전역 큐에 남아 있는지
// (=컴포넌트가 사라져도 안 사라짐) 확인 → quota가 풀렸다고 가정하고 online 이벤트를
// 쏘면(App.jsx가 마운트하는 PendingWriteRetryBridge) 결국 반영되는지 확인한다.
test('재감사 2차 FAIL 지적 — persistent quota + 라우트 이동에도 draft가 영구 유실되지 않고, 여유가 생기면 재시도로 반영된다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-22'
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated, persistent)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
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
    await waitUntil(
      () => (container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패'),
      { timeoutMs: 2000 },
    )

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
    assert.equal(readJsonKey('workData', ownerKey, {})[dateKey], undefined, 'localStorage에도 아직 없어야 한다')
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
    assert.equal(readJsonKey('workData', ownerKey, {})[dateKey]?.fixedCount, 4, 'localStorage에도 반영돼야 한다')
    assert.equal(errSpy.count(), 2, '복구 후 재시도는 성공했으니 추가로 로깅되면 안 된다')
    errSpy.restore()
  } finally {
    spy.mock.restore()
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// 재감사 10차(FAIL 지적 1·2·3번) — 이 파일의 다른 quota 테스트들과 달리, 기존
// 일지에 id 없는 레거시 payment(문자열 "1,000"과 숫자 1000 amount가 섞인)가 이미
// 있는 상태에서 quota 실패를 겪는다. 9차가 남긴 실제 P0: callDetailSchema.js의
// isValidPayment가 너무 엄격했다면(id 필수·amount 숫자 전용), useDayDraft.js의
// 자동 저장 catch 블록이 durable/fallback에 보존하려고 만드는 patch 자체가
// registerPendingDayWrite의 자체 검증(재감사 9차)에서 "계약 위반"으로 거부돼 false를
// 받는다 — 그 순간 이 최신 편집은 durable에도 fallback에도 전혀 안 남는다. 이
// 테스트는 그 연결고리를 실제 <App/> 렌더로 증명한다: (A) workData만 막히고
// durable은 정상이면 편집이 durable에 안전하게 남고, 복구 후 재시도하면 최신 편집과
// 기존 레거시 payments가 둘 다 보존된다.
test('재감사 10차 FAIL 지적 1·2·3번(A) — 레거시 payments가 있는 일지에서 workData만 quota로 막혀도 durable에 안전하게 남고, 복구 후 최신 편집과 기존 payments가 모두 보존된다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-29'
  const legacyPayments = [{ amount: '1,000' }, { amount: 1000, note: '' }]
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated, legacy payments)')
    return originalSetItem.call(this, key, value)
  })

  try {
    await act(async () => {
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
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    assert.equal(container.querySelector('#modalFixedCountInput').value, '2', '기존 fixedCount(2)가 그대로 보여야 한다')

    const errSpy = spyConsoleError('일지 자동 저장 실패:')
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const supabaseCallsBefore = totalSupabaseCalls()
    shouldFail = true

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '9') })
    await waitUntil(
      () => (container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패'),
      { timeoutMs: 2000 },
    )

    // 1) register 결과: 레거시 payments가 있어도 접수돼야 한다(9차의 과도하게 엄격한
    // isValidPayment였다면 여기서 거부돼 pending에 아무 것도 안 남는다).
    const pendingAfterFail = getPendingDayWrite(ownerKey, dateKey)
    assert.equal(pendingAfterFail?.fixedCount, 9, '실패한 편집(9)이 durable/fallback에 접수돼야 한다')
    assert.deepEqual(
      pendingAfterFail?.callDetails?.[0]?.payments, legacyPayments,
      '건드리지 않은 기존 레거시 payments(문자열·숫자 amount, id 없음)가 patch 안에 그대로 보존돼야 한다',
    )
    assert.equal(pendingDayWriteCount() > 0, true, '실패한 편집이 전역 큐에 남아야 한다')
    // 2) durable은 정상(workData만 막았다)이므로 durableWriteGuard가 broken이면 안 된다
    // — fallback(메모리 전용)도 unsafeUnregistered(등록 자체 거부)도 없어야 한다.
    assert.equal(isDurableWriteBroken(), false, 'durable 기록 자체는 성공했으니 broken이면 안 된다')
    // 3) store/localStorage는 실패한 편집으로 바뀌면 안 된다.
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, 'quota가 막혀 있으니 store는 여전히 기존 값(2)이어야 한다')
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 2, 'localStorage도 여전히 기존 값(2)이어야 한다')
    assert.equal(notifyCount, 0, '실패한 시도는 notify에 도달하면 안 된다')
    assert.equal(totalSupabaseCalls(), supabaseCallsBefore, '실패한 시도는 Supabase 호출로 이어지면 안 된다')
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')
    assert.ok(
      (container.querySelector('.autosave-status')?.textContent || '').includes('저장 실패'),
      '실패 UI가 화면에 표시돼야 한다',
    )
    unsubscribe()

    // 이어서 다른 필드(palletCount)도 편집한다 — 먼저 실패한 fixedCount(9)와 나중
    // 편집(palletCount)이 모두 최종 커밋에 반영돼야 한다(기존 3차 계약의 재확인).
    await act(async () => { setNativeInputValue(container.querySelector('#modalPalletCount'), '4') })

    let notifyCount2 = 0
    const unsubscribe2 = subscribe(() => { notifyCount2 += 1 })
    const supabaseCallsBeforeRecover = totalSupabaseCalls()
    shouldFail = false
    // 새 편집(palletCount)의 디바운스 커밋이 이번엔 성공해야 한다.
    await waitUntil(() => committedRecord(ownerKey, dateKey)?.palletCount === 4, { timeoutMs: 2000 })
    unsubscribe2()

    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 9, '먼저 실패했던 fixedCount(9)가 나중 성공 커밋에도 그대로 남아야 한다')
    assert.equal(committedRecord(ownerKey, dateKey)?.palletCount, 4, '나중에 편집한 palletCount(4)도 반영돼야 한다')
    assert.deepEqual(
      committedRecord(ownerKey, dateKey)?.callDetails?.[0]?.payments, legacyPayments,
      '전혀 건드리지 않은 기존 레거시 payments가 최종 커밋에도 그대로 보존돼야 한다',
    )
    assert.deepEqual(readWorkData(ownerKey)[dateKey]?.callDetails?.[0]?.payments, legacyPayments, 'localStorage에도 기존 payments가 그대로 보존돼야 한다')
    assert.equal(pendingDayWriteCount(), 0, '성공했으니 전역 큐에서 지워져야 한다')
    assert.equal(isDurableWriteBroken(), false, '복구 후에는 broken이 아니어야 한다')
    assert.equal(notifyCount2, 1, '성공한 커밋은 notify를 정확히 한 번만 불러야 한다')
    assert.equal(totalSupabaseCalls() > supabaseCallsBeforeRecover, true, '성공한 커밋은 클라우드 동기화를 예약해 Supabase 호출로 이어져야 한다')
    assert.equal(errSpy.count(), 1, '복구 후 성공한 커밋은 추가로 로깅되면 안 된다')
    errSpy.restore()

    await waitUntil(() => !hasDirty(ownerKey), { timeoutMs: 5000 })
  } finally {
    spy.mock.restore()
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// 재감사 10차(FAIL 지적 1·2·3번, B) — 같은 레거시 payments 전제에서 이번엔 durable
// 기록 자체도 막는다(workData + durable 키 둘 다) — forceDurableWriteBroken. 이때는
// 편집이 메모리 전용 fallback에만 남고 durableWriteGuard가 broken이 돼, 전역 이동이
// confirm 없이는 진행되지 않아야 한다. 확인 후에도 편집과 기존 payments가 유실되지
// 않고, 복구 후 재시도로 둘 다 최종 반영돼야 한다.
test('재감사 10차 FAIL 지적 1·2·3번(B) — 레거시 payments가 있는 일지에서 durable 기록까지 막히면 이동이 확인 없이 진행되지 않고, 복구 후 최신 편집과 기존 payments가 모두 보존된다', async () => {
  const ownerKey = 'user-boot-nav'
  const dateKey = '2026-08-30'
  const legacyPayments = [{ amount: '1,000' }, { amount: 1000, note: '' }]
  window.history.pushState({}, '', `/app/day/${dateKey}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const confirmSpy = mock.method(window, 'confirm', () => false)
  let spy
  let spyRestored = false

  try {
    await act(async () => {
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
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
    spy = forceDurableWriteBroken(ownerKey)
    const errSpy = spyConsoleError('일지 자동 저장 실패:')

    await act(async () => { setNativeInputValue(container.querySelector('#modalFixedCountInput'), '11') })
    await waitUntil(() => isDurableWriteBroken(), { timeoutMs: 2000 })

    assert.equal(isDurableWriteBroken(), true, 'workData 커밋과 durable 기록이 둘 다 실패했으니 broken이어야 한다')
    const pendingAfterFail = getPendingDayWrite(ownerKey, dateKey)
    assert.equal(pendingAfterFail?.fixedCount, 11, '실패했어도 최신 편집(11)이 fallback에 남아 있어야 한다(조용히 유실되면 안 된다)')
    assert.deepEqual(
      pendingAfterFail?.callDetails?.[0]?.payments, legacyPayments,
      '기존 레거시 payments도 fallback에 함께 보존돼야 한다',
    )
    assert.equal(errSpy.count(), 1, '디바운스 커밋 실패로 정확히 1번 로깅돼야 한다')

    // 전역 이동(BottomNav "홈")을 시도한다 — confirm 없이는 진행되면 안 된다.
    const homeTab = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent.includes('홈'))
    assert.ok(homeTab, '하단탭 "홈" 버튼을 찾아야 한다')
    await act(async () => {
      homeTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.equal(confirmSpy.mock.callCount(), 1, 'confirm으로 사용자에게 물어봤어야 한다')
    assert.equal(window.location.pathname, `/app/day/${dateKey}`, 'confirm에서 취소했으니 실제로 이동하면 안 된다')
    assert.equal(errSpy.count(), 1, '이동이 취소됐으니 추가로 로깅되면 안 된다')

    // 공간이 풀렸다고 가정하고 복구한다 — 전역 재시도로 fallback의 최신 편집과
    // 기존 payments가 둘 다 최종 반영돼야 한다.
    spy.mock.restore()
    spyRestored = true
    await act(async () => { retryPendingDayWrites() })

    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 11, '복구 후 재시도로 최신 편집(11)이 store에 반영돼야 한다')
    assert.deepEqual(
      committedRecord(ownerKey, dateKey)?.callDetails?.[0]?.payments, legacyPayments,
      '기존 레거시 payments도 최종 커밋에 그대로 보존돼야 한다',
    )
    assert.deepEqual(readWorkData(ownerKey)[dateKey]?.callDetails?.[0]?.payments, legacyPayments, 'localStorage에도 기존 payments가 보존돼야 한다')
    assert.equal(pendingDayWriteCount(), 0, '완전히 정리됐으니 전역 큐는 비어야 한다')
    assert.equal(isDurableWriteBroken(), false, '복구 후에는 broken이 아니어야 한다')
    errSpy.restore()

    await waitUntil(() => !hasDirty(ownerKey), { timeoutMs: 5000 })
  } finally {
    confirmSpy.mock.restore()
    if (!spyRestored) spy.mock.restore()
    await act(async () => { root.unmount() })
    container.remove()
  }
})
