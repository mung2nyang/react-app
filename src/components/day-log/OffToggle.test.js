// 로드맵 75 — 콜이 있는 날을 휴무로 바꿀 때만 묻는다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { default: OffToggle } = await import('./OffToggle.jsx')

/** @param {{ isOff: boolean, callCount: number }} props @param {boolean} answer */
async function clickOff(props, answer) {
  /** @type {Array<boolean>} */
  const changes = []
  const confirmSpy = mock.method(window, 'confirm', () => answer)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { root.render(React.createElement(OffToggle, { ...props, onChange: (off) => changes.push(off) })) })
    await act(async () => { container.querySelector('button')?.click() })
    return { changes, asked: confirmSpy.mock.calls.map((call) => String(call.arguments[0])) }
  } finally {
    confirmSpy.mock.restore()
    await act(async () => { root.unmount() })
    container.remove()
  }
}

test('75-4: 콜 1건 있는 날을 휴무로 → 확인 창, 취소면 바뀌지 않음', async () => {
  const { changes, asked } = await clickOff({ isOff: false, callCount: 1 }, false)
  assert.deepEqual(changes, [])
  assert.equal(asked.length, 1)
  assert.match(asked[0], /휴무로 바꾸시겠습니까\?/)
  assert.match(asked[0], /이날 콜 1건이 있습니다\. 휴무로 바꾸면 이 콜은 합계와 미수에서 빠집니다\./)
})

test('75-5: 확인하면 휴무로 바뀜', async () => {
  const { changes } = await clickOff({ isOff: false, callCount: 2 }, true)
  assert.deepEqual(changes, [true])
})

test('75-6: 콜이 없거나 휴무를 끌 때는 묻지 않고 바로 바뀜', async () => {
  const noCalls = await clickOff({ isOff: false, callCount: 0 }, false)
  assert.deepEqual(noCalls.changes, [true])
  assert.deepEqual(noCalls.asked, [])
  const turnOn = await clickOff({ isOff: true, callCount: 3 }, false)
  assert.deepEqual(turnOn.changes, [false])
  assert.deepEqual(turnOn.asked, [])
})
