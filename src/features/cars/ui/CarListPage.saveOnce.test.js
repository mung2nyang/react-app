// 차량 창 [저장]·연동 해제·삭제를 처리 중에 또 눌러도 서버 요청은 한 번만 간다.
// 서버 요청 함수는 가짜로 바꿔 끼워, 풀어 주기 전까지 끝나지 않게 붙잡는다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

/** @type {Array<string>} */
const calls = []
/** @type {Array<() => void>} */
const releases = []
/** 다음 요청을 실패로 돌려줄지. */
const plan = { failNext: false }

/** 풀어 줄 때까지 기다린 뒤 결과를 돌려준다. @template T @param {string} name @param {(failed: boolean) => T} result @returns {Promise<T>} */
function held(name, result) {
  calls.push(name)
  const failed = plan.failNext
  plan.failNext = false
  return new Promise((resolve) => { releases.push(() => resolve(result(failed))) })
}

mock.module('../../../data/sync/vehicleMutations.ts', {
  namedExports: {
    requestVehicleSave: (/** @type {{ draft: { number: string } }} */ { draft }) => held('vehicleSave', (failed) => (failed
      ? { failed: true, toast: '저장에 실패했습니다.' }
      : { failed: false, toast: '차량을 저장했습니다.', saved: { number: draft.number }, renamedFrom: null })),
  },
})
mock.module('../api/carInviteFromDraft.js', {
  namedExports: {
    todayIsoDate: () => '2026-10-28',
    saveInviteAfterVehicle: async () => null,
  },
})
mock.module('../../../data/sync/driverUnlink.ts', {
  namedExports: {
    requestDriverUnlinkAction: () => held('unlinkRequest', () => ({ toast: '해제 요청을 보냈습니다.', failed: false })),
  },
})
mock.module('../../../data/sync/directMutationActions.ts', {
  namedExports: {
    requestDriverDeletion: async (/** @type {{ drivers: Array<{ id: string }> }} */ { drivers }) => ({ drivers, toast: '' }),
    requestVehicleDeletion: () => held('vehicleDeletion', () => ({ failed: false, toast: '차량을 삭제했습니다.' })),
  },
})

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { MemoryRouter } = await import('react-router-dom')
const { default: CarListPage } = await import('./CarListPage.jsx')
const { commitCars, commitDrivers } = await import('../../../data/store/commitHelpers.ts')
const { beginSessionEpoch, endCloudSession } = await import('../../../data/cloud/cloudSession.ts')

const settle = () => act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })

/** @param {string} ownerKey @param {Array<import('../../../domain/financeTypes.ts').CarLike>} cars @param {Array<import('../../../domain/driverTypes.ts').DriverRecord>} [drivers] */
async function render(ownerKey, cars, drivers = []) {
  calls.length = 0
  releases.length = 0
  plan.failNext = false
  beginSessionEpoch(ownerKey, ownerKey)
  commitCars(ownerKey, cars)
  commitDrivers(ownerKey, drivers)
  const toasts = /** @type {Array<string>} */ ([])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(withToast(React.createElement(MemoryRouter, { initialEntries: ['/app/cars'] },
      withSession(React.createElement(CarListPage, {}), { ownerKey, session: { userId: ownerKey, name: '차주', phone: '' } })),
    (/** @type {string} */ m) => toasts.push(m)))
  })
  /** @param {string} text */
  const button = (text) => /** @type {HTMLButtonElement|undefined} */ ([...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === text))
  /** @param {Element|undefined|null} el */
  const click = async (el) => {
    assert.ok(el)
    await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await settle()
  }
  /** 붙잡아 둔 요청을 모두 풀어 준다. */
  const releaseAll = async () => {
    await act(async () => { releases.splice(0).forEach((release) => release()) })
    await settle()
  }
  /** @param {string} number */
  const card = (number) => [...container.querySelectorAll('.management-list-card')].find((el) => el.textContent?.includes(number))
  return {
    container, toasts, button, click, releaseAll, card,
    async cleanup() { await releaseAll(); await act(async () => { root.unmount() }); container.remove(); endCloudSession() },
  }
}

/** React 제어 입력에 값을 넣고 input 이벤트를 보낸다. @param {HTMLInputElement} input @param {string} value */
async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
}

/** @param {Awaited<ReturnType<typeof render>>} view @param {string} number */
async function openNewCar(view, number) {
  await view.click(view.button('+ 추가'))
  await typeInto(/** @type {HTMLInputElement} */ (view.container.querySelector('#newCarNumber')), number)
}

test('새 차량 [저장]을 저장 중에 또 눌러도 저장 요청은 한 번, 버튼은 "저장 중…"으로 잠김', async () => {
  const view = await render('once-save', [])
  try {
    await openNewCar(view, '55마5555')
    const save = view.button('저장')
    await view.click(save)
    await view.click(save)
    assert.deepEqual([...calls], ['vehicleSave'])
    const locked = view.button('저장 중…')
    assert.ok(locked, '저장 중 표시')
    assert.equal(locked.disabled, true)
    await view.releaseAll()
    assert.equal(view.button('저장'), undefined, '저장 끝나면 창 닫힘')
    assert.ok(view.toasts.includes('차량을 저장했습니다.'))
  } finally { await view.cleanup() }
})

test('저장이 실패하면 창 그대로, 잠금이 풀려 다시 저장하면 요청이 한 번 더', async () => {
  const view = await render('once-save-fail', [])
  try {
    await openNewCar(view, '66바6666')
    plan.failNext = true
    await view.click(view.button('저장'))
    await view.releaseAll()
    assert.ok(view.toasts.includes('저장에 실패했습니다.'))
    const save = view.button('저장')
    assert.ok(save, '창 그대로')
    assert.equal(save.disabled, false)
    await view.click(save)
    assert.deepEqual([...calls], ['vehicleSave', 'vehicleSave'])
  } finally { await view.cleanup() }
})

test('삭제 확인 창 [삭제]를 처리 중에 또 눌러도 삭제 요청은 한 번', async () => {
  const view = await render('once-delete', [{ id: 'car-main', number: '11가1111', type: 'main' }, { id: 'car-x', number: '44라4444', type: 'sub' }])
  try {
    await view.click(view.card('44라4444')?.querySelector('[title="삭제"]'))
    const confirm = view.button('삭제')
    await view.click(confirm)
    await view.click(confirm)
    assert.deepEqual([...calls], ['vehicleDeletion'])
  } finally { await view.cleanup() }
})

test('연동 해제 확인 창 [연동 해제]를 처리 중에 또 눌러도 해제 요청은 한 번', async () => {
  const view = await render('once-unlink',
    [{ id: 'car-main', number: '11가1111', type: 'main' }, { id: 'car-sub', number: '22나2222', type: 'sub', driverName: '박기사', driverPhone: '010-1111-2222' }],
    [{ id: 'drv-1', name: '박기사', phone: '010-1111-2222', status: 'linked', vehicleNumber: '22나2222', inviteCode: 'A2B3C4D5E6', startDate: '2026-10-01', supabaseId: 'l1' }])
  try {
    await view.click(view.card('22나2222')?.querySelector('[title="수정"]'))
    await view.click(view.button('운행일지'))
    await view.click(view.button('저장'))
    const confirm = view.button('연동 해제')
    await view.click(confirm)
    await view.click(confirm)
    assert.deepEqual([...calls], ['unlinkRequest'])
  } finally { await view.cleanup() }
})
