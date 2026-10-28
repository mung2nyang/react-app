// 첫 설정 마지막 단계 저장 중에 [완료하기]·[건너뛰기]를 또 눌러도 저장은 한 번만.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: OnboardingPage } = await import('./OnboardingPage.jsx')

/** @param {HTMLElement} container @param {string} text */
function button(container, text) {
  const found = /** @type {HTMLButtonElement|undefined} */ ([...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === text))
  assert.ok(found, text)
  return found
}

/** React 제어 입력에 값을 넣고 input 이벤트를 보낸다. @param {HTMLInputElement} input @param {string} value */
async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
}

test('마지막 단계에서 [완료하기] 두 번·[건너뛰기]를 눌러도 저장은 1번, [완료하기]는 "저장 중…"으로 잠김', async () => {
  /** @type {Array<() => void>} */
  const releases = []
  let finishes = 0
  const onFinish = () => { finishes += 1; return new Promise((resolve) => { releases.push(() => resolve(undefined)) }) }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(OnboardingPage, { onFinish })) })
  try {
    for (let i = 0; i < 3; i += 1) await act(async () => { button(container, '건너뛰기 >').click() })
    await typeInto(/** @type {HTMLInputElement} */ (container.querySelector('#onboardingCarNumber')), '12가3456')
    const finish = button(container, '완료하기')
    const skip = button(container, '건너뛰기 >')
    await act(async () => { finish.click() })
    await act(async () => { finish.click() })
    await act(async () => { skip.click() })
    assert.equal(finishes, 1)
    assert.equal(finish.textContent?.trim(), '저장 중…')
    assert.equal(finish.disabled, true)
    assert.equal(skip.disabled, true)
  } finally {
    await act(async () => { releases.splice(0).forEach((done) => done()) })
    await act(async () => { root.unmount() })
    container.remove()
  }
})
