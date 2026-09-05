// @ts-check
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const reactActEnv = /** @type {{ IS_REACT_ACT_ENVIRONMENT?: boolean }} */ (globalThis)
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: CustomerCenterPage } = await import('./CustomerCenterPage.jsx')
const { default: SideMenu } = await import('./SideMenu.jsx')

describe('CustomerCenterPage — 고객센터 진입·FAQ 탭', () => {
  test('FAQ 탭이 기본으로 노출되고 자주 묻는 질문 카드가 보인다', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(React.createElement(CustomerCenterPage, { onBack: () => {} }))
      })
      assert.ok(container.textContent?.includes('고객센터'))
      assert.ok(container.textContent?.includes('자주 묻는 질문'))
      assert.ok(container.textContent?.includes('운행 기록은 자동으로 저장되나요?'))
      const faqTab = [...container.querySelectorAll('.support-tab')].find((el) => el.textContent === 'FAQ')
      assert.ok(faqTab?.classList.contains('active'), 'FAQ 탭이 기본 active여야 한다')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('1:1 문의 탭은 placeholder만 보이고 문의 저장 UI는 없다', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(React.createElement(CustomerCenterPage, { onBack: () => {} }))
      })
      const inquiryTab = /** @type {HTMLButtonElement|undefined} */ ([...container.querySelectorAll('.support-tab')].find((el) => el.textContent?.includes('1:1')))
      assert.ok(inquiryTab)
      await act(async () => {
        inquiryTab.click()
      })
      assert.ok(container.textContent?.includes('다음 업데이트에서 추가'))
      assert.equal(container.querySelector('.inquiry-form'), null)
      assert.equal(container.querySelector('textarea'), null)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('사이드메뉴에 고객센터 항목이 있고 클릭 시 support를 고른다', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    /** @type {string[]} */
    const picked = []
    try {
      await act(async () => {
        root.render(React.createElement(SideMenu, {
          open: true,
          onClose: () => {},
          onSelect: (/** @type {string} */ page) => { picked.push(page) },
        }))
      })
      const supportBtn = /** @type {HTMLButtonElement|undefined} */ ([...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === '고객센터'))
      assert.ok(supportBtn, '사이드메뉴에 고객센터 버튼이 있어야 한다')
      await act(async () => {
        supportBtn.click()
      })
      assert.deepEqual(picked, ['support'])
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })
})
