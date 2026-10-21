// 로드맵 8 — 입력 칸이 있는 창 6곳은 바깥(회색 영역)을 눌러도 안 닫히고 취소 버튼으로만 닫힌다. 입력 없는 확인 창은 바깥 클릭으로 닫힌다(대조).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { withSession } = await import('../testSupport/withSession.js')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: CarFormModal } = await import('../features/cars/ui/CarFormModal.jsx')
const { default: ClientFormModal } = await import('../features/clients/ui/ClientFormModal.jsx')
const { default: ExpenseFormModal } = await import('../features/expenses/ui/ExpenseFormModal.jsx')
const { default: DriverFormModal } = await import('../features/drivers/ui/DriverFormModal.jsx')
const { default: TaxInvoiceDraftModal } = await import('../features/documents/ui/TaxInvoiceDraftModal.jsx')
const { default: ConfirmModal } = await import('../shared/ui/ConfirmModal.jsx')
const { default: InviteRedeemModal } = await import('../features/account/ui/InviteRedeemModal.jsx')
const { default: FixedRouteClientModal } = await import('../features/settings/ui/FixedRouteClientModal.jsx')

/** @type {import('../features/cars/ui/CarFormModal.jsx').CarFormDraft} */
const CAR_DRAFT = {
  number: '12가3456', tonnage: '', type: 'sub', driverName: '', driverPhone: '',
  driverPayMode: 'revenue', driverSalaryAmount: '', commEnabled: false, commType: 'percent', commission: '',
  driverIncomeType: 'business', insuranceOn: false, withholdingOn: false, expenseRate: '', insuranceRate: '',
  inviteCode: '', inviteStartDate: '', inviteDriverId: null, connectMode: 'log',
}

/**
 * @typedef {{ name: string, element: (close: () => void) => import('react').ReactElement }} ModalCase
 */

/** @type {Array<ModalCase>} */
const INPUT_MODALS = [
  { name: '차량', element: (close) => React.createElement(CarFormModal, { draft: CAR_DRAFT, setDraft: () => {}, editingId: null, onCancel: close, onSave: () => {}, cloud: false, drivers: [] }) },
  { name: '거래처', element: (close) => React.createElement(ClientFormModal, { draft: { companyName: '한빛물류' }, setDraft: () => {}, editingId: null, onCancel: close, onSave: () => {} }) },
  { name: '정비·주유·기타', element: (close) => React.createElement(ExpenseFormModal, { draft: { kind: 'maint', date: '2026-10-01' }, kindLabel: '정비', onChange: () => {}, onClose: close, onSave: () => {} }) },
  { name: '기사 초대', element: (close) => React.createElement(DriverFormModal, { draft: { name: '기사', phone: '', inviteCode: '123456', vehicleNumber: '', startDate: '', endDate: '' }, setDraft: () => {}, editingId: null, drivers: [], assignableCars: [], onCancel: close, onSave: () => {} }) },
  { name: '초대코드 입력', element: (close) => withSession(React.createElement(InviteRedeemModal, { onClose: close, onLinked: () => {} }), { session: null }) },
  { name: '세금계산서 작성', element: (close) => React.createElement(TaxInvoiceDraftModal, { modalItem: { id: 'inv-1', clientName: '한빛물류' }, flowMeta: { label: '매출 발행', partyHeading: '공급받는 자' }, onChange: () => {}, onCancel: close, onSave: () => {} }) },
]

/** @param {(close: () => void) => import('react').ReactElement} element */
async function mount(element) {
  let closed = 0
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element(() => { closed += 1 })) })
  return {
    container,
    closedCount: () => closed,
    cleanup: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

/** @param {Element|null} el */
async function click(el) {
  assert.ok(el instanceof window.HTMLElement)
  await act(async () => { el.click() })
}

for (const modal of INPUT_MODALS) {
  test(`${modal.name} 창: 바깥 클릭으로는 안 닫히고 취소 버튼으로 닫힌다`, async () => {
    const view = await mount(modal.element)
    try {
      await click(view.container.querySelector('.modal-overlay'))
      assert.equal(view.closedCount(), 0, '바깥 클릭으로 닫히면 입력이 날아간다')
      await click(view.container.querySelector('.modal-btn.cancel'))
      assert.equal(view.closedCount(), 1)
    } finally {
      await view.cleanup()
    }
  })
}

// 로드맵 57-B — 입력 창은 공용 껍데기(화면 읽기 "창")를 쓰고, 컴퓨터 Esc 키로도 안 닫힌다(보리 결정).
for (const modal of INPUT_MODALS) {
  test(`${modal.name} 창: 화면 읽기 "창" 표시, Esc로도 안 닫힌다`, async () => {
    const view = await mount(modal.element)
    try {
      const box = view.container.querySelector('.modal-overlay > [role="dialog"]')
      assert.ok(box, '공용 껍데기의 창 상자가 있어야 한다')
      assert.equal(box.getAttribute('aria-modal'), 'true')
      await act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
      assert.equal(view.closedCount(), 0, 'Esc로 닫히면 입력이 날아간다')
    } finally {
      await view.cleanup()
    }
  })
}

test('고정 노선 거래처 창(화면 맨 바깥에 그려짐): 바깥 누름·Esc로 안 닫히고 취소로 닫힌다, 화면 읽기 "창"', async () => {
  const view = await mount((close) => withSession(React.createElement(FixedRouteClientModal, { clients: [], candidates: [], linked: null, onClose: close }), { ownerKey: 'guest' }))
  try {
    const box = document.querySelector('.modal-overlay > .fixed-route-client-modal')
    assert.ok(box, '공용 껍데기의 창 상자가 있어야 한다')
    assert.equal(box.getAttribute('role'), 'dialog')
    await click(document.querySelector('.modal-overlay'))
    await act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    assert.equal(view.closedCount(), 0)
    await click(box.querySelector('.modal-btn.cancel'))
    assert.equal(view.closedCount(), 1)
  } finally {
    await view.cleanup()
  }
})

test('입력 없는 확인 창은 바깥 클릭으로 닫힌다(그대로)', async () => {
  const view = await mount((close) => React.createElement(ConfirmModal, { message: '삭제할까요?', onCancel: close, onConfirm: () => {} }))
  try {
    await click(view.container.querySelector('.modal-overlay'))
    assert.equal(view.closedCount(), 1)
  } finally {
    await view.cleanup()
  }
})
