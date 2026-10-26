// 로드맵 65 — 로그인 일지 서버 저장은 한 번에 하나, 도는 중에 고치면 끝난 뒤 최신 draft로 한 번 더.
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase } from '../../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers } = createFakeSupabase()
mock.module('../../../data/cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { withToast } = await import('../../../testSupport/withToast.js')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { useDayDraft } = await import('./useDayDraft.js')
const { beginSessionEpoch, endCloudSession } = await import('../../../data/cloud/cloudSession.ts')
const { setHydration } = await import('../../../data/store/app-store.ts')
const { commitCars, commitWorkData } = await import('../../../data/store/commitHelpers.ts')
const { readOwnerWorkData } = await import('../../../data/store/ownerDataHooks.ts')
const { addFailedDayLogDate, listFailedDayLogDates } = await import('../../../data/sync/failedDayLogDates.ts')
const { hasBusyDayDraft } = await import('../../../data/sync/dayDraftActivity.ts')

const DK = '2026-10-21'
const FAIL_FAST = '10월 21일 운행일지 저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

/** @param {number} ms */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 일지 저장 서버 함수(save_day_log)를 붙잡아 두는 가짜 서버. gated 수만큼 앞 호출을 붙잡고 나머지는 바로 성공.
 * @param {{ gated: number, failFirst?: boolean }} options
 */
function holdUpserts({ gated, failFirst = false }) {
  /** @type {Array<number>} */
  const fixedCounts = []
  /** @type {Array<() => void>} */
  const releases = []
  handlers.rpc = {
    save_day_log: (args) => {
      const index = fixedCounts.length
      fixedCounts.push(Number(/** @type {{ fixed_count?: number }} */ (args && typeof args === 'object' && !Array.isArray(args) ? args.p_log : {}).fixed_count))
      const result = () => {
        if (failFirst && index === 0) throw new Error('network down')
        return { data: 9000 + index, error: null }
      }
      if (index >= gated) return result()
      return new Promise((resolve) => { releases.push(() => resolve(undefined)) }).then(result)
    },
  }
  return { fixedCounts, releases }
}

/** @param {string} userId @param {string} ownerKey */
function beginLoggedIn(userId, ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'ready', userId, ownerKey })
  commitCars(ownerKey, [{ id: 'car-main', type: 'main', number: '12가3456', supabaseId: 800 }])
  commitWorkData(ownerKey, {})
}

/** @param {string} ownerKey @param {string} [dateKey] */
async function mount(ownerKey, dateKey = DK) {
  /** @type {{ current: ReturnType<typeof useDayDraft>|null }} */
  const latest = { current: null }
  /** @type {Array<string>} */
  const toasts = []
  function Harness() {
    latest.current = useDayDraft(ownerKey, dateKey)
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(withToast(React.createElement(Harness), (/** @type {string} */ message) => { toasts.push(message) })) })
  return {
    latest,
    toasts,
    /** @param {number} fixedCount */
    async edit(fixedCount) {
      await act(async () => { latest.current?.dispatch({ type: 'patchDraft', patch: { fixedCount } }) })
    },
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

test('S-1 저장 중에 고치면 두 번째 저장은 첫 저장이 끝난 뒤 최신 내용으로 1회', async () => {
  beginLoggedIn('u-s1', 'own-s1')
  const server = holdUpserts({ gated: 1 })
  const view = await mount('own-s1')
  try {
    await view.edit(1)
    await act(async () => { await wait(700) })
    await view.edit(2)
    await act(async () => { await wait(700) })
    assert.deepEqual(server.fixedCounts, [1], '첫 저장이 도는 동안 두 번째 저장을 시작하면 안 된다')
    await act(async () => { server.releases[0]?.(); await wait(50) })
    assert.deepEqual(server.fixedCounts, [1, 2])
    assert.equal(readOwnerWorkData('own-s1')[DK]?.fixedCount, 2)
    assert.equal(view.latest.current?.autoSaveStatus, 'saved')
  } finally {
    await view.unmount()
    endCloudSession()
  }
})

test('S-2 첫 저장이 끝난 직후 화면을 닫아도 마지막 수정이 저장된다', async () => {
  beginLoggedIn('u-s2', 'own-s2')
  const server = holdUpserts({ gated: 1 })
  const view = await mount('own-s2')
  await view.edit(1)
  await act(async () => { await wait(700) })
  await view.edit(2)
  await act(async () => { server.releases[0]?.(); await wait(20) })
  await view.unmount()
  await wait(50)
  assert.deepEqual(server.fixedCounts, [1, 2], '앞 저장 성공이 뒤 수정의 저장 대기를 지우면 안 된다')
  assert.equal(readOwnerWorkData('own-s2')[DK]?.fixedCount, 2)
  endCloudSession()
})

test('S-3 저장 중에 여러 번 고쳐도 끝난 뒤 저장은 1회, 내용은 마지막 것', async () => {
  beginLoggedIn('u-s3', 'own-s3')
  const server = holdUpserts({ gated: 1 })
  const view = await mount('own-s3')
  try {
    await view.edit(1)
    await act(async () => { await wait(700) })
    await view.edit(2)
    await act(async () => { await wait(700) })
    await view.edit(3)
    await act(async () => { await wait(700) })
    await act(async () => { server.releases[0]?.(); await wait(50) })
    assert.deepEqual(server.fixedCounts, [1, 3])
    assert.equal(readOwnerWorkData('own-s3')[DK]?.fixedCount, 3)
  } finally {
    await view.unmount()
    endCloudSession()
  }
})

test('S-4 첫 저장이 실패해도 뒤에 고친 내용은 이어서 저장, 실패 안내 1회', async () => {
  beginLoggedIn('u-s4', 'own-s4')
  const server = holdUpserts({ gated: 1, failFirst: true })
  const originalError = console.error
  /** @type {Array<string>} */
  const errors = []
  console.error = (...args) => {
    if (String(args[0]).includes('[commitMainDayLogToCloud]')) errors.push(String(args[0]))
    else originalError(...args)
  }
  const view = await mount('own-s4')
  try {
    await view.edit(1)
    await act(async () => { await wait(700) })
    await view.edit(2)
    await act(async () => { await wait(700) })
    await act(async () => { server.releases[0]?.(); await wait(50) })
    assert.deepEqual(server.fixedCounts, [1, 2])
    assert.deepEqual(view.toasts, [FAIL_FAST])
    assert.equal(errors.length, 1)
    assert.equal(readOwnerWorkData('own-s4')[DK]?.fixedCount, 2)
    assert.equal(view.latest.current?.autoSaveStatus, 'saved')
  } finally {
    console.error = originalError
    await view.unmount()
    endCloudSession()
  }
})

test('72-7 로그인 저장 중에는 "저장 중", 화면을 닫아도 서버 응답 전까지 남고 끝나면 빠진다', async () => {
  beginLoggedIn('u-72', 'own-72')
  const server = holdUpserts({ gated: 1 })
  const view = await mount('own-72')
  await view.edit(5)
  assert.equal(hasBusyDayDraft(), true, '0.6초 대기 중')
  await act(async () => { await wait(700) })
  assert.deepEqual(server.fixedCounts, [5])
  assert.equal(hasBusyDayDraft(), true, '서버 저장 중')
  await view.unmount()
  assert.equal(hasBusyDayDraft(), true, '화면을 닫아도 응답 전까지 남는다')
  await act(async () => { server.releases[0]?.(); await wait(50) })
  assert.equal(hasBusyDayDraft(), false)
  assert.equal(readOwnerWorkData('own-72')[DK]?.fixedCount, 5)
  endCloudSession()
})

// 로드맵 110-A — 서버 저장 실패 날짜는 휴대폰 목록에, 다음 저장 성공이나 그 날짜 일지를 열면 지운다.
test('F-1 서버 저장 실패 → 날짜가 목록에, 다음 저장 성공 → 지움', async () => {
  beginLoggedIn('u-f1', 'own-f1')
  holdUpserts({ gated: 0, failFirst: true })
  const originalError = console.error
  console.error = () => {}
  const view = await mount('own-f1')
  try {
    await view.edit(1)
    await act(async () => { await wait(700) })
    assert.deepEqual(listFailedDayLogDates('own-f1'), [{ logId: 'main', dateKey: DK }])
    await view.edit(2)
    await act(async () => { await wait(700) })
    assert.equal(view.latest.current?.autoSaveStatus, 'saved')
    assert.deepEqual(listFailedDayLogDates('own-f1'), [])
  } finally {
    console.error = originalError
    await view.unmount()
    endCloudSession()
  }
})

test('F-2 화면을 닫는 것만으로는 지우지 않는다(닫을 때 다시 저장도 실패)', async () => {
  beginLoggedIn('u-f2', 'own-f2')
  handlers.rpc = { save_day_log: () => { throw new Error('network down') } }
  const originalError = console.error
  console.error = () => {}
  try {
    const view = await mount('own-f2')
    await view.edit(1)
    await act(async () => { await wait(700) })
    await view.unmount()
    await wait(50)
    assert.deepEqual(listFailedDayLogDates('own-f2'), [{ logId: 'main', dateKey: DK }])
  } finally {
    console.error = originalError
    endCloudSession()
  }
})

test('F-3 그 날짜 일지를 열면 그 날짜만 지운다', async () => {
  beginLoggedIn('u-f3', 'own-f3')
  addFailedDayLogDate('own-f3', 'main', DK)
  addFailedDayLogDate('own-f3', 'main', '2026-10-20')
  const view = await mount('own-f3')
  try {
    assert.deepEqual(listFailedDayLogDates('own-f3'), [{ logId: 'main', dateKey: '2026-10-20' }])
  } finally {
    await view.unmount()
    endCloudSession()
  }
})
