// 로드맵 63: 아래 메뉴·← 이동이 기록을 쌓지 않게 — 메뉴끼리는 교체, 홈은 처음 기록으로 되감기.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { BrowserRouter, useNavigate } = await import('react-router-dom')
const { default: useBackToExit, EXIT_HINT } = await import('../../app/shell/useBackToExit.js')
const { chooseMove, markRewind, noteLocation, takeRewind } = await import('./historyMoves.js')

test('홈에서 다른 메뉴로는 쌓고, 메뉴·화면끼리는 교체', () => {
  assert.deepEqual(chooseMove({ from: '/app', to: '/app/calendar', idx: 1, startedAtHome: true }), { kind: 'push' })
  assert.deepEqual(chooseMove({ from: '/app/calendar', to: '/app/revenue', idx: 2, startedAtHome: true }), { kind: 'replace' })
  assert.deepEqual(chooseMove({ from: '/app/me/settings', to: '/app/me', idx: 3, startedAtHome: true }), { kind: 'replace' })
})

test('홈으로: 이번 접속을 홈에서 시작했으면 처음 기록까지 되감기, 아니면 교체', () => {
  assert.deepEqual(chooseMove({ from: '/app/revenue', to: '/app', idx: 4, startedAtHome: true }), { kind: 'rewind', steps: 4 })
  assert.deepEqual(chooseMove({ from: '/app/revenue', to: '/app', idx: 4, startedAtHome: false }), { kind: 'replace' }, '주소로 바로 들어옴')
  assert.deepEqual(chooseMove({ from: '/app/revenue', to: '/app', idx: undefined, startedAtHome: true }), { kind: 'replace' })
  assert.deepEqual(chooseMove({ from: '/app', to: '/app', idx: 1, startedAtHome: true }), { kind: 'replace' }, '이미 홈')
})

test('처음 기록(번호 0)이 홈인지 기억하고, 되감기 표시는 한 번만', () => {
  noteLocation('/app/calendar', 0)
  assert.deepEqual(chooseMove({ from: '/app/revenue', to: '/app', idx: 2 }), { kind: 'replace' })
  noteLocation('/app', 0)
  noteLocation('/app/revenue', 2)
  assert.deepEqual(chooseMove({ from: '/app/revenue', to: '/app', idx: 2 }), { kind: 'rewind', steps: 2 })
  markRewind()
  assert.equal(takeRewind(), true)
  assert.equal(takeRewind(), false)
})

test('설치 앱: 홈 되감기로 돌아오면 종료 안내 없이 붙잡기만 다시 쌓고, 그 뒤 뒤로 1번에 안내', async () => {
  Reflect.set(window, 'matchMedia', (/** @type {string} */ query) => ({ matches: query.includes('standalone') }))
  window.history.replaceState(null, '', '/app')
  /** @type {Array<string>} */
  const toasts = []
  /** @type {{ go: ReturnType<typeof useNavigate> | null }} */
  const nav = { go: null }
  function Probe() {
    useBackToExit((message) => { toasts.push(message) }, 60)
    nav.go = useNavigate()
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const idx = () => Reflect.get(window.history.state || {}, 'idx')
  const popped = () => new Promise((resolve) => { window.addEventListener('popstate', () => resolve(undefined), { once: true }) })
  try {
    await act(async () => { root.render(React.createElement(BrowserRouter, null, React.createElement(Probe))) })
    assert.equal(idx(), 1, '홈 붙잡기')
    await act(async () => { nav.go?.('/app/calendar') })
    await act(async () => { nav.go?.('/app/revenue', { replace: true }) })
    assert.equal(idx(), 2)
    await act(async () => {
      const done = popped()
      markRewind()
      nav.go?.(-2)
      await done
    })
    assert.equal(window.location.pathname, '/app')
    assert.equal(idx(), 1, '붙잡기를 다시 쌓음')
    assert.deepEqual(toasts, [], '되감기는 종료 안내가 아님')
    await act(async () => {
      const done = popped()
      window.history.back()
      await done
    })
    assert.deepEqual(toasts, [EXIT_HINT], '홈에서 뒤로 1번이면 안내')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
