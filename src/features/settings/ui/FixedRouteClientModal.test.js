// 로드맵 82-C — 고정 노선 거래처 창: 거래처를 안 고르고 저장하면 고르는 단추에 빨간 표시·칸 아래 문구·커서.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: FixedRouteClientModal } = await import('./FixedRouteClientModal.jsx')

test('거래처를 안 고르고 저장 → 단추 표시·문구·커서, 알림 없음, 고르면 사라짐', async () => {
  /** @type {Array<string>} */
  const toasts = []
  const candidates = [{ id: 'c1', companyName: '한진' }]
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(FixedRouteClientModal, {
      ownerKey: 'owner-82c', clients: candidates, candidates, linked: null, onClose() {}, showToast: (/** @type {string} */ m) => { toasts.push(m) },
    }))
  })
  try {
    const saveButton = [...document.querySelectorAll('button')].find((item) => item.textContent === '저장')
    assert.ok(saveButton)
    await act(async () => { saveButton.click() })
    const trigger = /** @type {HTMLButtonElement} */ (document.querySelector('#fixedRouteClientSelect'))
    assert.deepEqual(toasts, [])
    assert.equal(trigger.getAttribute('aria-invalid'), 'true')
    assert.equal(trigger.getAttribute('aria-describedby'), 'fixedRouteClientSelect-error')
    assert.equal(document.querySelector('#fixedRouteClientSelect-error')?.textContent, '거래처를 선택해 주세요.')
    assert.equal(document.activeElement, trigger)
    await act(async () => { trigger.click() })
    const option = [...document.querySelectorAll('[role="option"]')].find((el) => el.textContent?.trim() === '한진')
    assert.ok(option instanceof window.HTMLElement)
    await act(async () => { option.click() })
    assert.equal(trigger.getAttribute('aria-invalid'), null)
    assert.equal(!!document.querySelector('#fixedRouteClientSelect-error'), false)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
