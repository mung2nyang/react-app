// @ts-check
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import {
  fillMessageTemplatePattern,
  getDefaultMessageTemplatePatterns,
  saveMessageTemplateSettings,
} from '../../data/sync/messageTemplates.js'

const reactActEnv = /** @type {{ IS_REACT_ACT_ENVIRONMENT?: boolean }} */ (globalThis)
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const {
  default: MessageTemplateSheet,
} = await import('./MessageTemplateSheet.jsx')

const sampleItem = {
  id: 'trp-1',
  client: '한진',
  fare: '10000',
  loadLoc: '서울',
  unloadLoc: '부산',
}

/**
 * @param {Object} [props]
 */
function mountSheet(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root, props }
}

describe('MessageTemplateSheet — 문자 양식 3종 + ②-1 설정 반영', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('기본 문구: 제목 3종 순서 + 미수금 안내 본문이 채워져 보인다', async () => {
    const { container, root } = mountSheet()
    try {
      await act(async () => {
        root.render(React.createElement(MessageTemplateSheet, {
          item: sampleItem,
          client: { id: 'c1', companyName: '한진', phone: '010-1111-2222' },
          onClose: () => {},
        }))
      })
      const buttons = [...container.querySelectorAll('.message-template-list button')]
      assert.equal(buttons.length, 3)
      assert.deepEqual(buttons.map((btn) => btn.querySelector('strong')?.textContent), [
        '미수금 안내',
        '입금 요청',
        '운행 완료',
      ])
      const expected = fillMessageTemplatePattern(getDefaultMessageTemplatePatterns()[0], {
        company: '한진',
        route: '서울 → 부산',
        fare: '10,000',
      })
      assert.equal(buttons[0]?.querySelector('span')?.textContent, expected)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('커스텀 저장 문구가 시트 미리보기에 반영된다', async () => {
    /** @type {[string, string, string]} */
    const custom = [
      '커스텀미수 {거래처} {운행구간} {운송료}',
      '커스텀입금 {운행구간} {운송료}',
      '커스텀완료 {거래처} {운행구간}',
    ]
    saveMessageTemplateSettings(custom, '내역서')
    const { container, root } = mountSheet()
    try {
      await act(async () => {
        root.render(React.createElement(MessageTemplateSheet, {
          item: sampleItem,
          client: { id: 'c1', companyName: '한진', phone: '010-1111-2222' },
          onClose: () => {},
        }))
      })
      const bodies = [...container.querySelectorAll('.message-template-list button span')]
        .map((el) => el.textContent)
      assert.equal(bodies[0], '커스텀미수 한진 서울 → 부산 10,000')
      assert.equal(bodies[1], '커스텀입금 서울 → 부산 10,000')
      assert.equal(bodies[2], '커스텀완료 한진 서울 → 부산')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('연락처 없으면 안내 메시지만 뜨고 onClose는 호출되지 않는다', async () => {
    let closeCount = 0
    /** @type {string[]} */
    const toasts = []
    const { container, root } = mountSheet()
    try {
      await act(async () => {
        root.render(React.createElement(MessageTemplateSheet, {
          item: sampleItem,
          client: { id: 'c1', companyName: '한진' },
          onClose: () => { closeCount += 1 },
          showToast: (/** @type {string} */ m) => { toasts.push(m) },
        }))
      })
      const first = /** @type {HTMLButtonElement|null} */ (container.querySelector('.message-template-list button'))
      assert.ok(first)
      await act(async () => {
        first.click()
      })
      assert.deepEqual(toasts, ['거래처에 등록된 연락처가 없습니다.'])
      assert.equal(closeCount, 0)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('바깥 누름·Esc로 닫히고 화면 읽기 "창"(로드맵 57-B 공용 껍데기)', async () => {
    const { container, root } = mountSheet()
    let closed = 0
    try {
      await act(async () => {
        root.render(React.createElement(MessageTemplateSheet, {
          item: sampleItem,
          client: { id: 'c1', companyName: '한진', phone: '010-1111-2222' },
          onClose: () => { closed += 1 },
        }))
      })
      const sheet = container.querySelector('.message-template-overlay > .message-template-sheet')
      assert.ok(sheet)
      assert.equal(sheet.getAttribute('role'), 'dialog')
      assert.equal(sheet.getAttribute('tabindex'), '-1', '공용 껍데기가 키보드 위치를 잡는다')
      await act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
      assert.equal(closed, 1)
      await act(async () => { /** @type {HTMLElement} */ (container.querySelector('.message-template-overlay')).click() })
      assert.equal(closed, 2)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })
})
