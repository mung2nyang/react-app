// 로드맵 18-A: 화면 이동 종류(들어감·뒤로·탭·없음) 판단 + 이동 때 겉 상자에 효과 이름이 붙는지.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { BrowserRouter, useNavigate } = await import('react-router-dom')
const { default: usePageTransition, decidePageTransition, isTabSpot } = await import('./usePageTransition.js')

/** @param {string} pathname @param {boolean} tab */
const spot = (pathname, tab) => ({ pathname, tab })

test('판단: 새 화면 = 들어감, 뒤로 = 뒤로, 탭끼리 = 서서히, 첫 진입·같은 주소 = 없음', () => {
  assert.equal(decidePageTransition({ prev: spot('/app/me', true), next: spot('/app/notice', false), navigationType: 'PUSH' }), 'forward')
  assert.equal(decidePageTransition({ prev: spot('/app/notice', false), next: spot('/app/me', true), navigationType: 'POP' }), 'back')
  assert.equal(decidePageTransition({ prev: spot('/app', true), next: spot('/app/revenue', true), navigationType: 'PUSH' }), 'fade')
  assert.equal(decidePageTransition({ prev: spot('/app/day/2026-10-08', false), next: spot('/app', true), navigationType: 'REPLACE' }), 'fade', '교체 이동')
  assert.equal(decidePageTransition({ prev: null, next: spot('/app', true), navigationType: 'POP' }), 'none', '첫 진입')
  assert.equal(decidePageTransition({ prev: spot('/app', true), next: spot('/app', true), navigationType: 'PUSH' }), 'none', '보던 달만 바뀜·17번 붙잡기 기록')
})

test('탭 화면: 홈·매출·마이페이지, 하단 "일일운행"으로 연 일지만', () => {
  assert.equal(isTabSpot('/app', null), true)
  assert.equal(isTabSpot('/app/me', undefined), true)
  assert.equal(isTabSpot('/app/day/2026-10-08', { from: 'bottomNav' }), true)
  assert.equal(isTabSpot('/app/day/2026-10-08', { from: 'calendar' }), false, '달력에서 연 일지')
  assert.equal(isTabSpot('/app/notice', null), false)
})

test('화면 이동 때 겉 상자에 맞는 효과 이름이 붙고, 같은 주소 이동이면 안 붙음', async () => {
  window.history.replaceState(null, '', '/app/me')
  /** @type {{ current: ((to: string, options?: { state?: object }) => void) | null }} */
  const go = { current: null }
  function Probe() {
    const boxRef = usePageTransition()
    const navigate = useNavigate()
    go.current = (to, options) => { navigate(to, options) }
    return React.createElement('div', { ref: boxRef, id: 'box' })
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const box = () => /** @type {HTMLElement} */ (container.querySelector('#box'))
  const move = async (/** @type {string} */ to) => { await act(async () => { go.current?.(to) }) }
  // 뒤로가기는 브라우저가 늦게 처리할 수 있어 정해진 시간 대신 주소가 바뀔 때까지 기다림.
  const back = async (/** @type {string} */ path) => {
    await act(async () => {
      window.history.back()
      for (let i = 0; i < 100 && window.location.pathname + window.location.search !== path; i += 1) await new Promise((resolve) => { setTimeout(resolve, 10) })
    })
  }
  try {
    await act(async () => { root.render(React.createElement(BrowserRouter, null, React.createElement(Probe))) })
    assert.equal(box().className, '', '첫 진입은 효과 없음')
    await move('/app/notice')
    assert.equal(box().className, 'page-enter-forward')
    await move('/app/notice?tab=1')
    assert.equal(box().className, 'page-enter-forward', '같은 주소면 그대로(새로 안 붙음)')
    await back('/app/notice')
    await back('/app/me')
    assert.equal(window.location.pathname, '/app/me')
    assert.equal(box().className, 'page-enter-back')
    await move('/app')
    assert.equal(box().className, 'page-enter-fade', '탭끼리')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
