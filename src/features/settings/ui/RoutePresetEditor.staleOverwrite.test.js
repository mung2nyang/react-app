// 노선·횟수 버튼을 빨리 이어서 고쳐도 앞 변경이 되돌아가지 않는다.
// 로그인이면 서버 저장이 끝나야 화면 설정이 바뀌므로, 화면은 옛 설정 그대로 두고 실제 저장 창구(savePracticeSettings)로 저장한다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers } = createFakeSupabase()
mock.module('../../../data/cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: RoutePresetEditor } = await import('./RoutePresetEditor.jsx')
const { default: RunCountChips } = await import('./RunCountChips.jsx')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { savePracticeSettings } = await import('../../../data/sync/settingsSave.ts')
const { beginSessionEpoch, endCloudSession } = await import('../../../data/cloud/cloudSession.ts')
const { setHydration } = await import('../../../data/store/app-store.ts')
const { commitSettings } = await import('../../../data/store/commitHelpers.ts')
const { readOwnerSettings } = await import('../../../data/store/ownerDataHooks.ts')

/**
 * 로그인 계정에 설정을 넣고, 옛 설정을 받은 화면을 그린다. 서버 저장(프로필 행 upsert)은 20ms 걸린다.
 * @param {string} ownerKey @param {import('../../../domain/financeTypes.ts').FinanceSettings} raw @param {typeof RoutePresetEditor | typeof RunCountChips} Component
 */
async function mountStale(ownerKey, raw, Component) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  handlers.profiles = { ...handlers.profiles, upsert: async () => { await wait(20); return { data: null, error: null } } }
  beginSessionEpoch(ownerKey, ownerKey)
  setHydration({ status: 'ready', userId: ownerKey, ownerKey })
  const settings = normalizeSettings(raw)
  commitSettings(ownerKey, settings)
  /** @type {Array<Promise<import('../../../domain/financeTypes.ts').FinanceSettings>>} */
  const saves = []
  /** @param {import('../../../data/sync/settingsSave.ts').SettingsPatch} patch */
  const save = (patch) => { saves.push(savePracticeSettings(ownerKey, patch)) }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Component, { scope: 'main', settings, onPatch: save })) })
  return {
    container,
    save,
    settled: () => Promise.all(saves),
    cleanup: async () => {
      await act(async () => { root.unmount() })
      container.remove()
      endCloudSession()
    },
  }
}

/** @param {HTMLElement} container @param {string} label */
function button(container, label) {
  const found = /** @type {HTMLButtonElement|null} */ (container.querySelector(`button[aria-label="${label}"]`))
  assert.ok(found, label)
  return found
}

/** @param {Element} el @param {string} type */
function fire(el, type) {
  el.dispatchEvent(new window.Event(type, { bubbles: true }))
}

/** @param {HTMLElement} container @param {number} index */
function chip(container, index) {
  const el = /** @type {HTMLInputElement|undefined} */ (container.querySelectorAll('.run-count-preset-chip')[index])
  assert.ok(el)
  return el
}

/** 칩을 짧게 눌러 고치고 칸을 벗어난다. @param {HTMLElement} container @param {number} index @param {string} value */
async function editChip(container, index, value) {
  await act(async () => { fire(chip(container, index), 'pointerdown'); fire(chip(container, index), 'pointerup') })
  const target = chip(container, index)
  target.value = value
  await act(async () => { target.blur() })
}

/** React 제어 입력에 값을 넣고 input 이벤트를 보낸다. @param {HTMLInputElement} input @param {string} value */
async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
}

const twoRoutes = {
  fixedOn: true, fixedRouteOn: true, runCountToggle: true,
  fixedRoutePresets: [{ id: 'route-a', loadLoc: '부산', unloadLoc: '대구' }, { id: 'route-b', loadLoc: '평택', unloadLoc: '용인' }],
}

/** @param {string} ownerKey */
function routeLabels(ownerKey) {
  return (readOwnerSettings(ownerKey).fixedRoutePresets || []).map((route) => `${route.loadLoc} → ${route.unloadLoc}`)
}

test('노선 A를 지우고 바로 B를 지우면 둘 다 지워진 채로 남는다', async () => {
  const ownerKey = 'stale-route-remove'
  const view = await mountStale(ownerKey, twoRoutes, RoutePresetEditor)
  try {
    await act(async () => { button(view.container, '부산 → 대구 노선 삭제').click() })
    await act(async () => { button(view.container, '평택 → 용인 노선 삭제').click() })
    await view.settled()
    assert.deepEqual(routeLabels(ownerKey), [], '지운 노선이 되살아나면 안 됨')
  } finally { await view.cleanup() }
})

test('스위치를 끈 뒤 바로 노선을 지워도 스위치가 되돌아가지 않는다', async () => {
  const ownerKey = 'stale-route-switch'
  const view = await mountStale(ownerKey, twoRoutes, RoutePresetEditor)
  try {
    view.save({ runCountToggle: false })
    await act(async () => { button(view.container, '부산 → 대구 노선 삭제').click() })
    await view.settled()
    assert.equal(readOwnerSettings(ownerKey).runCountToggle, false)
    assert.deepEqual(routeLabels(ownerKey), ['평택 → 용인'])
  } finally { await view.cleanup() }
})

test('[추가]를 빨리 두 번 누르면 노선 둘 다 추가된다', async () => {
  const ownerKey = 'stale-route-add'
  const view = await mountStale(ownerKey, { fixedOn: true, fixedRouteOn: true }, RoutePresetEditor)
  try {
    const load = /** @type {HTMLInputElement} */ (view.container.querySelector('#routePresetLoad-main'))
    const unload = /** @type {HTMLInputElement} */ (view.container.querySelector('#routePresetUnload-main'))
    const add = /** @type {HTMLButtonElement} */ ([...view.container.querySelectorAll('button')].find((item) => item.textContent === '추가'))
    await typeInto(load, '부산'); await typeInto(unload, '대구')
    await act(async () => { add.click() })
    await typeInto(load, '평택'); await typeInto(unload, '용인')
    await act(async () => { add.click() })
    await view.settled()
    assert.deepEqual(routeLabels(ownerKey), ['부산 → 대구', '평택 → 용인'])
  } finally { await view.cleanup() }
})

test('횟수 버튼 두 칸을 연달아 고치면 둘 다 남는다', async () => {
  const ownerKey = 'stale-chip-edit'
  const view = await mountStale(ownerKey, { fixedOn: true, runCountToggle: true, runCountPresets: [1, 2, 3] }, RunCountChips)
  try {
    await editChip(view.container, 0, '7')
    await editChip(view.container, 1, '8')
    await view.settled()
    assert.deepEqual(readOwnerSettings(ownerKey).runCountPresets, [7, 8, 3])
  } finally { await view.cleanup() }
})

test('횟수 버튼을 지운 직후 다른 칸을 고쳐도 그 칸이 바뀐다', async () => {
  const ownerKey = 'stale-chip-remove-edit'
  const view = await mountStale(ownerKey, { fixedOn: true, runCountToggle: true, runCountPresets: [1, 2, 3] }, RunCountChips)
  try {
    fire(chip(view.container, 0), 'pointerdown')
    await act(async () => { await wait(700) })
    const confirm = /** @type {HTMLButtonElement|null} */ (view.container.querySelector('.modal-btn.confirm'))
    assert.ok(confirm)
    await act(async () => { confirm.click() })
    await editChip(view.container, 1, '9')
    await view.settled()
    assert.deepEqual(readOwnerSettings(ownerKey).runCountPresets, [9, 3])
  } finally { await view.cleanup() }
})

test('[+]를 빨리 두 번 누르면 횟수 버튼 둘 다 추가된다', async () => {
  const ownerKey = 'stale-chip-add'
  const view = await mountStale(ownerKey, { fixedOn: true, runCountToggle: true, runCountPresets: [1, 2, 3] }, RunCountChips)
  try {
    await act(async () => { button(view.container, '횟수 버튼 추가').click() })
    await act(async () => { button(view.container, '횟수 버튼 추가').click() })
    await view.settled()
    assert.deepEqual(readOwnerSettings(ownerKey).runCountPresets, [1, 2, 3, 4, 5])
  } finally { await view.cleanup() }
})
