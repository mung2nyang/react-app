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

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
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

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { BrowserRouter } = await import('react-router-dom')
const { act } = React
const { default: App } = await import('./App.jsx')
const { commitWorkData } = await import('../store/commitHelpers.js')
const { getState } = await import('../store/app-store.js')
const { readJsonKey } = await import('../store/persist.js')

async function waitUntil(predicate, { timeoutMs = 2000, stepMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- 폴링 대기라 순차 await가 맞다.
    await act(async () => { await wait(stepMs) })
  }
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
      '2026-08-05': { isOff: false, fixedCount: 2, callDetails: [], fixedRouteCounts: {} },
      '2026-08-06': { isOff: false, fixedCount: 5, callDetails: [], fixedRouteCounts: {} },
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
