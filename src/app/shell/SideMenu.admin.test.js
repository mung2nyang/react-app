// 로드맵 23-B — 옆 메뉴 "관리자"는 isAdmin일 때만 "설정" 칸 "고객센터" 다음에 보인다.
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
const { default: SideMenu } = await import('./SideMenu.jsx')

/** @param {boolean|undefined} isAdmin */
async function mount(isAdmin) {
  const selected = []
  let closed = 0
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(SideMenu, {
      open: true,
      onClose: () => { closed += 1 },
      onSelect: (page) => { selected.push(page) },
      isAdmin,
    }))
  })
  const labels = [...container.querySelectorAll('.settings-section .dropdown-item')].map((el) => el.textContent.trim())
  return {
    container, labels, selected,
    closedCount: () => closed,
    cleanup: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('isAdmin이면 "고객센터" 다음 "관리자", 누르면 admin으로 가고 메뉴가 닫힌다', async () => {
  const view = await mount(true)
  try {
    assert.deepEqual(view.labels, ['개인정보', '앱 설정', '고객센터', '관리자'])
    const admin = [...view.container.querySelectorAll('.dropdown-item')].find((el) => el.textContent.trim() === '관리자')
    await act(async () => { admin.click() })
    assert.deepEqual(view.selected, ['admin'])
    assert.equal(view.closedCount(), 1)
  } finally { await view.cleanup() }
})

test('isAdmin이 아니거나 안 넘기면 "관리자"가 없다', async () => {
  for (const isAdmin of [false, undefined]) {
    const view = await mount(isAdmin)
    try {
      assert.deepEqual(view.labels, ['개인정보', '앱 설정', '고객센터'])
    } finally { await view.cleanup() }
  }
})
