// D-0 착수지시서 검증 — 값 선택 시 onChange 호출, 외부 클릭 시 닫힘,
// 뷰포트 우측 초과 시 메뉴가 왼쪽으로 당겨지는지 확인 (CalendarCell.test.js 인프라 재사용).
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
const { default: TemporalInput } = await import('./TemporalInput.jsx')

function mountTarget() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root }
}

/** @param {HTMLElement} container @param {string} text */
function clickOption(container, text) {
  const options = [...document.body.querySelectorAll('.app-temporal-option')]
  const option = options.find((el) => el.textContent === text)
  assert.ok(option, `옵션 "${text}"을 찾지 못했다`)
  option.click()
}

test('D-0: 날짜 — 연/월 클릭은 onChange를 안 부르고, 일 클릭에서만 커밋+닫힘', async () => {
  const { container, root } = mountTarget()
  const calls = []
  try {
    await act(async () => {
      root.render(React.createElement(TemporalInput, {
        type: 'date', id: 'd1', value: '2026-09-14', onChange: (e) => calls.push(e.target.value),
      }))
    })
    await act(async () => { container.querySelector('.app-temporal-trigger').click() })
    await act(async () => { clickOption(container, '2026년') })
    assert.equal(calls.length, 0, '연도 클릭만으로는 onChange가 호출되면 안 된다')
    await act(async () => { clickOption(container, '20일') })
    assert.deepEqual(calls, ['2026-09-20'])
    assert.equal(container.querySelector('.app-temporal-trigger').getAttribute('aria-expanded'), 'false')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('D-0: 시간 — 시 클릭은 커밋하되 메뉴 유지, 분 클릭에서 최종 커밋+닫힘', async () => {
  const { container, root } = mountTarget()
  const calls = []
  try {
    await act(async () => {
      root.render(React.createElement(TemporalInput, {
        type: 'time', id: 't1', value: '09:05', onChange: (e) => calls.push(e.target.value),
      }))
    })
    await act(async () => { container.querySelector('.app-temporal-trigger').click() })
    await act(async () => { clickOption(container, '10시') })
    assert.deepEqual(calls, ['10:05'])
    assert.equal(container.querySelector('.app-temporal-trigger').getAttribute('aria-expanded'), 'true', '시 선택만으론 안 닫혀야 한다')
    await act(async () => { clickOption(container, '30분') })
    assert.deepEqual(calls, ['10:05', '10:30'])
    assert.equal(container.querySelector('.app-temporal-trigger').getAttribute('aria-expanded'), 'false')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('D-0: 메뉴 바깥을 클릭하면 닫힌다', async () => {
  const { container, root } = mountTarget()
  try {
    await act(async () => {
      root.render(React.createElement(TemporalInput, { type: 'date', id: 'd2', value: '', onChange: () => {} }))
    })
    await act(async () => { container.querySelector('.app-temporal-trigger').click() })
    assert.equal(container.querySelector('.app-temporal-trigger').getAttribute('aria-expanded'), 'true')
    await act(async () => {
      document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
    })
    assert.equal(container.querySelector('.app-temporal-trigger').getAttribute('aria-expanded'), 'false')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('D-0: 트리거가 뷰포트 우측 끝을 넘어가면 메뉴가 왼쪽으로 당겨진다', async () => {
  const { container, root } = mountTarget()
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect
  const originalClientWidth = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'clientWidth')
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('app-temporal-trigger')) {
      return { left: 300, right: 380, bottom: 40, top: 20, width: 80, height: 20 }
    }
    return originalRect.call(this)
  }
  Object.defineProperty(window.document.documentElement, 'clientWidth', { value: 320, configurable: true })
  try {
    await act(async () => {
      root.render(React.createElement(TemporalInput, { type: 'date', id: 'd3', value: '', onChange: () => {} }))
    })
    await act(async () => { container.querySelector('.app-temporal-trigger').click() })
    const menu = document.body.querySelector('.app-temporal-menu')
    assert.ok(menu, '메뉴가 열리지 않았다')
    // availableRight = 320-8=312, rect.right(380) > 312 → left = max(8, 312-80) = 232
    assert.equal(menu.style.left, '232px')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
    window.HTMLElement.prototype.getBoundingClientRect = originalRect
    if (originalClientWidth) Object.defineProperty(window.document.documentElement, 'clientWidth', originalClientWidth)
  }
})

/** @param {object} props */
async function openMenu(props) {
  const { container, root } = mountTarget()
  const calls = /** @type {Array<string>} */ ([])
  await act(async () => {
    root.render(React.createElement(TemporalInput, { id: 'c1', onChange: (/** @type {{ target: { value: string } }} */ e) => calls.push(e.target.value), ...props }))
  })
  await act(async () => { container.querySelector('.app-temporal-trigger').click() })
  return {
    container, calls,
    clearButton: () => document.body.querySelector('.app-temporal-clear'),
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('지우기 칸: 값이 있으면 창에 [지우기], 누르면 빈 값으로 바꾸고 닫힘', async () => {
  const view = await openMenu({ type: 'time', value: '09:00', clearable: true })
  try {
    const button = view.clearButton()
    assert.ok(button, '[지우기] 단추')
    assert.equal(button.textContent, '지우기')
    await act(async () => { button.click() })
    assert.deepEqual(view.calls, [''])
    assert.equal(view.container.querySelector('.app-temporal-trigger').getAttribute('aria-expanded'), 'false')
  } finally {
    await view.cleanup()
  }
})

test('지우기 칸이어도 값이 없으면 [지우기] 없음, 지우기 칸이 아니면 값이 있어도 없음', async () => {
  for (const props of [{ type: 'date', value: '', clearable: true }, { type: 'date', value: '2026-09-14' }]) {
    const view = await openMenu(props)
    try {
      assert.ok(document.body.querySelector('.app-temporal-menu'), '창은 열림')
      assert.equal(view.clearButton(), null)
    } finally {
      await view.cleanup()
    }
  }
})
