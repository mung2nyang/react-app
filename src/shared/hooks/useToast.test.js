// 로드맵 59-I1 — 알림 함수는 공급자에서 꺼내 쓴다. 공급자 밖에선 오류 없이 아무 일 안 함.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { ToastProvider, useToast } = await import('./useToast.js')

/** @param {import('react').ReactNode} element */
async function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  await act(async () => { root.unmount() })
  container.remove()
}

/** @param {{ message: string }} props */
function Shout({ message }) {
  const showToast = useToast()
  React.useEffect(() => { showToast(message) }, [showToast, message])
  return null
}

test('공급자 안에선 넘긴 함수가 불린다', async () => {
  /** @type {Array<string>} */
  const toasts = []
  await render(React.createElement(ToastProvider, { value: (/** @type {string} */ m) => { toasts.push(m) } }, React.createElement(Shout, { message: '저장했습니다.' })))
  assert.deepEqual(toasts, ['저장했습니다.'])
})

test('공급자 밖에선 오류 없이 아무 일 안 한다', async () => {
  await render(React.createElement(Shout, { message: '아무도 안 받음' }))
})
