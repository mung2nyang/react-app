// 로드맵 44 — 거래처 한 달치 입금 완료 전에 확인 창: 취소면 저장 0회, 확인이면 저장 1회, 문구에 건수·금액.
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

let persistCalls = 0
mock.module('../../../data/sync/ownerFinance.ts', {
  namedExports: {
    markMonthlyReceivablesPaid: (/** @type {object} */ work) => work,
    patchWorkLog: () => ({}),
    persistReceivableWorkDataChange: async () => { persistCalls += 1; return { ok: true } },
  },
})

const { register } = await import('node:module')
const { pathToFileURL } = await import('node:url')
register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { useReceivablesActions } = await import('./useReceivablesActions.js')

const SETTINGS = { paymentOn: true, cars: [], clients: [] }
const WORK = {
  main: {
    '2026-10-01': { callDetails: [{ id: 'a', client: '한진', fare: 300000 }, { id: 'b', client: '한진', fare: 0 }] },
    '2026-10-02': { callDetails: [{ id: 'c', client: '한진', fare: 150000 }, { id: 'd', client: '대한', fare: 99000 }] },
  },
}

/** @param {boolean} answer */
async function runPayGroup(answer) {
  /** @type {Array<{ message: string, options?: { confirmLabel?: string, danger?: boolean, message?: string } }>} */
  const asked = []
  /** @type {{ payGroup?: (client: string, month: string, stay: boolean) => Promise<boolean> }} */
  const captured = {}
  function Harness() {
    const actions = useReceivablesActions({
      ownerKey: 'owner-44',
      workDataByLogId: WORK,
      settings: SETTINGS,
      confirm: async (message, options) => { asked.push({ message, options }); return answer },
    })
    captured.payGroup = actions.payGroup
    return null
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness)) })
  assert.ok(captured.payGroup)
  /** @type {boolean} */
  let result = false
  await act(async () => { result = await captured.payGroup('한진', '2026-10', false) })
  await act(async () => { root.unmount() })
  return { asked, result }
}

beforeEach(() => { persistCalls = 0 })

test('취소면 아무것도 저장하지 않는다', async () => {
  const { asked, result } = await runPayGroup(false)
  assert.equal(asked.length, 1)
  assert.equal(persistCalls, 0)
  assert.equal(result, false)
})

test('입금 완료를 누르면 저장 1회', async () => {
  const { result } = await runPayGroup(true)
  assert.equal(persistCalls, 1)
  assert.equal(result, true)
})

test('문구에 거래처·달·건수(0원 제외)·금액, 버튼은 [입금 완료]', async () => {
  const { asked } = await runPayGroup(false)
  assert.equal(asked[0].message, '한진의 10월 미수금을 모두 입금 완료로 처리할까요?')
  assert.equal(asked[0].options?.message, '미수 2건, 450,000원입니다. 취소하려면 각 건을 하나씩 처리해야 합니다.')
  assert.equal(asked[0].options?.confirmLabel, '입금 완료')
  assert.equal(asked[0].options?.danger, undefined)
})

test('로드맵 82-C — 부분 입금액이 남은 금액보다 크면 저장 없이 입금액 칸 문구, 고치면 사라짐', async () => {
  /** @type {{ actions?: ReturnType<typeof useReceivablesActions> }} */
  const captured = {}
  function Harness() {
    captured.actions = useReceivablesActions({ ownerKey: 'owner-82c', workDataByLogId: WORK, settings: SETTINGS, confirm: async () => true })
    return null
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness)) })
  const item = /** @type {import('../../../domain/financeReceivables.ts').ReceivableItemLike} */ ({ logId: 'main', dateKey: '2026-10-01', detailId: 'a', remainingAmount: 300000 })
  await act(async () => { captured.actions?.setPartialKey('main|a'); captured.actions?.setPartialAmount('400,000') })
  await act(async () => { captured.actions?.confirmPartial(item) })
  assert.equal(persistCalls, 0)
  assert.equal(captured.actions?.partialProblem?.message, '남은 금액보다 큰 금액은 입력할 수 없습니다.')
  await act(async () => { captured.actions?.setPartialAmount('100,000') })
  assert.equal(captured.actions?.partialProblem, null)
  await act(async () => { captured.actions?.confirmPartial(item) })
  assert.equal(persistCalls, 1)
  await act(async () => { root.unmount() })
})
