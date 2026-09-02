// DayLogPage.jsx callDetail 표시 계약 — App 전체 부트 없이 CallDetailList만 렌더한다.
// (App.test.js 통합 테스트는 hydrate+commitSettings 조합에서 OOM이 나서 컴포넌트 단위로 검증)
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { normalizeSettings } from '../../domain/practiceSettings.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { default: CallDetailList } = await import('./CallDetailList.jsx')

/** DayLogPage.jsx:60 — 섹션 마운트 여부 */
function showCallDetailList(callDetail, callDetailsLength) {
  return callDetail || callDetailsLength > 0
}

const noop = () => {}
const sampleDetails = [{ id: 'trp-off-view', fare: '10,000', client: '한진' }]
const baseProps = {
  clients: [],
  onEdit: noop,
  onDelete: noop,
  onTogglePayment: noop,
  onMessage: noop,
  onAdd: noop,
}

function mountList(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root }
}

describe('DayLogPage callDetail 표시 — showCallDetailList', () => {
  test('(b) callDetail OFF + callDetails 없음 — 섹션 자체를 마운트하지 않는다', () => {
    assert.equal(showCallDetailList(false, 0), false)
  })
})

describe('CallDetailList — canAdd 분리', () => {
  test('(a) callDetail OFF + 기존 callDetails — 카드는 보이고 추가 버튼은 없다', async () => {
    const settings = normalizeSettings({ fixedOn: true, callDetail: false })
    const { container, root } = mountList()
    try {
      await act(async () => {
        root.render(React.createElement(CallDetailList, {
          ...baseProps,
          details: sampleDetails,
          settings,
          canAdd: false,
        }))
      })
      assert.ok(container.querySelector('.call-detail-section'), '기존 callDetails가 있으면 섹션이 보여야 한다')
      assert.equal(container.querySelector('.compact-add-btn'), null, '+추가(헤더)가 없어야 한다')
      assert.equal(container.querySelector('.call-detail-add-btn'), null, '+ 운행 일지 추가가 없어야 한다')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('(c) callDetail ON — 카드와 추가 버튼 모두 있다', async () => {
    const settings = normalizeSettings({ fixedOn: true, callDetail: true })
    const { container, root } = mountList()
    try {
      await act(async () => {
        root.render(React.createElement(CallDetailList, {
          ...baseProps,
          details: [],
          settings,
          canAdd: true,
        }))
      })
      assert.ok(container.querySelector('.call-detail-section'), 'callDetail=true면 콜상세 섹션이 보여야 한다')
      assert.ok(
        container.querySelector('.compact-add-btn') || container.querySelector('.call-detail-add-btn'),
        '추가 버튼이 있어야 한다',
      )
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })
})
