// 로드맵 60 — 차량 관리 화면의 저장·연동 해제·삭제 흐름(훅으로 옮기기 전 동작을 그대로 적음).
// 서버 요청 함수는 가짜로 바꿔 끼워 어떤 요청이 몇 번 불렸는지만 본다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

/** @type {Array<string>} */
const calls = []
/** @type {{ renamedFrom: string|null, savedNumber: string }} */
const vehicleSaveResult = { renamedFrom: null, savedNumber: '' }

mock.module('../../lib/vehicleMutations.js', {
  namedExports: {
    requestVehicleSave: async (/** @type {{ draft: { number: string } }} */ { draft }) => {
      calls.push('vehicleSave')
      return { failed: false, toast: '차량을 저장했습니다.', saved: { number: vehicleSaveResult.savedNumber || draft.number }, renamedFrom: vehicleSaveResult.renamedFrom }
    },
  },
})
mock.module('../../lib/carInviteFromDraft.js', {
  namedExports: {
    todayIsoDate: () => '2026-10-19',
    saveInviteAfterVehicle: async () => { calls.push('inviteAfterVehicle'); return null },
  },
})
mock.module('../../lib/driverUnlink.js', {
  namedExports: {
    requestDriverUnlinkAction: async () => { calls.push('unlinkRequest'); return { toast: '해제 요청을 보냈습니다.', failed: false } },
  },
})
const { commitCars } = await import('../../store/commitHelpers.js')
mock.module('../../lib/directMutationActions.js', {
  namedExports: {
    requestDriverDeletion: async (/** @type {{ drivers: Array<{ id: string }>, driverId: string }} */ { drivers, driverId }) => {
      calls.push('driverDeletion')
      return { drivers: drivers.filter((d) => d.id !== driverId), toast: '기사를 삭제했습니다.' }
    },
    requestVehicleDeletion: async (/** @type {{ ownerKey: string, cars: Array<{ id?: string }>, vehicleId: string }} */ { ownerKey, cars, vehicleId }) => {
      calls.push('vehicleDeletion')
      commitCars(ownerKey, cars.filter((car) => car.id !== vehicleId))
      return { failed: false, toast: '차량을 삭제했습니다.' }
    },
  },
})

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { MemoryRouter, useLocation } = await import('react-router-dom')
const { default: CarListPage } = await import('./CarListPage.jsx')
const { commitDrivers } = await import('../../store/commitHelpers.js')
const { beginSessionEpoch, endCloudSession } = await import('../../lib/cloudSession.js')

/** @type {{ pathname: string }} */
const seen = { pathname: '' }
function LocationProbe() {
  seen.pathname = useLocation().pathname
  return null
}

/**
 * @param {string} ownerKey
 * @param {import('react-router-dom').InitialEntry} [entry]
 */
async function render(ownerKey, entry = '/app/cars') {
  calls.length = 0
  const toasts = /** @type {Array<string>} */ ([])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [entry] },
      React.createElement(CarListPage, { ownerKey, session: { userId: ownerKey, name: '차주', phone: '' }, showToast: (/** @type {string} */ m) => toasts.push(m) }),
      React.createElement(LocationProbe)))
  })
  /** @param {string} text @param {ParentNode} [scope] */
  const button = (text, scope = container) => [...scope.querySelectorAll('button')].find((el) => el.textContent?.trim() === text)
  /** @param {HTMLElement|undefined|null} el */
  const click = async (el) => {
    assert.ok(el)
    await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
  }
  /** @param {string} number */
  const card = (number) => [...container.querySelectorAll('.management-list-card')].find((el) => el.textContent?.includes(number))
  return {
    container, toasts, button, click, card,
    async cleanup() { await act(async () => { root.unmount() }); container.remove(); endCloudSession() },
  }
}

/** @param {string} ownerKey @param {'linked'|'pending'} status */
function seedLinkedSubCar(ownerKey, status) {
  beginSessionEpoch(ownerKey, ownerKey)
  commitCars(ownerKey, [
    { id: 'car-main', number: '11가1111', type: 'main' },
    { id: 'car-sub', number: '22나2222', type: 'sub', driverName: '박기사', driverPhone: '010-1111-2222' },
  ])
  commitDrivers(ownerKey, [{ id: 'drv-1', name: '박기사', phone: '010-1111-2222', status, vehicleNumber: '22나2222', inviteCode: 'A2B3C4D5E6', startDate: '2026-10-01', supabaseId: 'l1' }])
}

test('연동 중 기사 차량을 운행일지로 바꿔 저장: 확인 창 → 해제 요청 1번, 차량은 저장 안 함, 창 닫힘', async () => {
  const ownerKey = 'flow-linked'
  seedLinkedSubCar(ownerKey, 'linked')
  const view = await render(ownerKey)
  try {
    await view.click(view.card('22나2222')?.querySelector('[title="수정"]'))
    await view.click(view.button('운행일지'))
    await view.click(view.button('저장'))
    assert.ok(view.container.textContent?.includes('이 차량의 기사 연동을 해제하시겠습니까?'), '확인 창')
    await view.click(view.button('연동 해제'))
    assert.deepEqual(calls, ['unlinkRequest'])
    assert.ok(view.toasts.includes('해제 요청을 보냈습니다.'))
    assert.equal(view.button('저장'), undefined, '창이 닫힘')
  } finally {
    await view.cleanup()
  }
})

test('초대 대기 기사 차량을 운행일지로 바꿔 저장: 확인 → 기사 삭제 뒤 차량 저장, 창 닫힘', async () => {
  const ownerKey = 'flow-pending'
  seedLinkedSubCar(ownerKey, 'pending')
  const view = await render(ownerKey)
  try {
    await view.click(view.card('22나2222')?.querySelector('[title="수정"]'))
    await view.click(view.button('운행일지'))
    await view.click(view.button('저장'))
    await view.click(view.button('연동 해제'))
    assert.deepEqual(calls, ['driverDeletion', 'vehicleSave', 'inviteAfterVehicle'])
    assert.equal(view.button('저장'), undefined, '창이 닫힘')
  } finally {
    await view.cleanup()
  }
})

test('차량 삭제: 확인 창 → 삭제 요청 1번, 목록에서 빠짐', async () => {
  const ownerKey = 'flow-delete'
  beginSessionEpoch(ownerKey, ownerKey)
  commitCars(ownerKey, [{ id: 'car-main', number: '11가1111', type: 'main' }, { id: 'car-x', number: '44라4444', type: 'sub' }])
  commitDrivers(ownerKey, [])
  const view = await render(ownerKey)
  try {
    await view.click(view.card('44라4444')?.querySelector('[title="삭제"]'))
    assert.ok(view.container.textContent?.includes('이 차량을 삭제하시겠습니까?'))
    await view.click(view.button('삭제'))
    assert.deepEqual(calls, ['vehicleDeletion'])
    assert.equal(view.card('44라4444'), undefined, '목록에서 빠짐')
    assert.equal(view.container.textContent?.includes('이 차량을 삭제하시겠습니까?'), false, '확인 창 닫힘')
  } finally {
    await view.cleanup()
  }
})

test('일지에서 열린 차량 번호를 바꿔 저장하면 그 일지 주소가 새 번호로 바뀐다', async () => {
  const ownerKey = 'flow-rename'
  beginSessionEpoch(ownerKey, ownerKey)
  commitCars(ownerKey, [{ id: 'car-main', number: '11가1111', type: 'main' }, { id: 'car-sub', number: '22나2222', type: 'sub' }])
  commitDrivers(ownerKey, [])
  vehicleSaveResult.renamedFrom = '22나2222'
  vehicleSaveResult.savedNumber = '33다3333'
  const view = await render(ownerKey, { pathname: '/app/cars', state: { fromLog: { logId: '22나2222', dateKey: '2026-10-05' } } })
  try {
    await view.click(view.card('22나2222')?.querySelector('[title="수정"]'))
    await view.click(view.button('운행일지'))
    await view.click(view.button('저장'))
    assert.deepEqual(calls, ['vehicleSave', 'inviteAfterVehicle'])
    assert.equal(seen.pathname, `/app/logs/${encodeURIComponent('33다3333')}/day/2026-10-05`)
  } finally {
    vehicleSaveResult.renamedFrom = null
    vehicleSaveResult.savedNumber = ''
    await view.cleanup()
  }
})
