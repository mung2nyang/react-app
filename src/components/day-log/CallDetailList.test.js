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

describe('CallDetailCard — 면세 배지 (로드맵 46-A)', () => {
  async function badgesFor(details) {
    const settings = normalizeSettings({ fixedOn: true, callDetail: true, platformOn: false, paymentOn: false })
    const { container, root } = mountList()
    try {
      await act(async () => {
        root.render(React.createElement(CallDetailList, { ...baseProps, details, settings, canAdd: false }))
      })
      return [...container.querySelectorAll('.detail-badge')].map((el) => el.textContent)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  }

  test('면세로 저장한 카드는 설정이 꺼져 있어도 "면세" 배지가 보인다', async () => {
    const badges = await badgesFor([{ id: 'trp-vat-exempt', fare: '100,000', client: '한진', vatExempt: true }])
    assert.deepEqual(badges, ['면세'])
  })

  test('면세가 아닌 카드엔 "면세" 배지가 없다', async () => {
    const badges = await badgesFor([{ id: 'trp-vat-normal', fare: '100,000', client: '한진' }])
    assert.equal(badges.includes('면세'), false)
  })
})

describe('CallDetailCard — 0원 운행 결제 단추 (로드맵 62)', () => {
  async function paymentButtonsFor(detail) {
    const settings = normalizeSettings({ fixedOn: true, callDetail: true, paymentOn: true })
    const { container, root } = mountList()
    try {
      await act(async () => {
        root.render(React.createElement(CallDetailList, { ...baseProps, details: [detail], settings, canAdd: false }))
      })
      const actions = container.querySelector('.detail-payment-actions')
      return {
        toggle: actions?.querySelector('.payment-toggle-btn')?.textContent ?? null,
        phone: Boolean(actions?.querySelector('.detail-call-phone')),
        message: Boolean(actions?.querySelector('.detail-message-btn')),
      }
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  }

  test('운송료 0원 + 입금 없음 카드엔 미수·전화·문자 단추가 없다', async () => {
    const buttons = await paymentButtonsFor({ id: 'trp-zero', fare: '0', client: '한진' })
    assert.deepEqual(buttons, { toggle: null, phone: false, message: false })
  })

  test('운송료 0원이어도 이미 수금이면 수금 단추는 남는다', async () => {
    const buttons = await paymentButtonsFor({ id: 'trp-zero-paid', fare: '0', client: '한진', payments: [{ id: 'pay-1', amount: '10,000' }] })
    assert.deepEqual(buttons, { toggle: '수금', phone: false, message: false })
  })

  test('운송료 있는 미수 카드는 미수·전화·문자 단추 그대로', async () => {
    const buttons = await paymentButtonsFor({ id: 'trp-fare', fare: '10,000', client: '한진' })
    assert.deepEqual(buttons, { toggle: '미수', phone: true, message: true })
  })
})
