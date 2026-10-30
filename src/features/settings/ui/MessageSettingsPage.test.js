// 문자 문구 설정: 빈 칸 표시, 저장·복원은 계정 설정에(로그인은 서버 저장 성공 뒤에만).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

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
const { withSession } = await import('../../../testSupport/withSession.js')
const { default: MessageSettingsPage } = await import('./MessageSettingsPage.jsx')
const { beginSessionEpoch } = await import('../../../data/cloud/cloudSession.ts')
const { setHydration } = await import('../../../data/store/app-store.ts')
const { commitSettings } = await import('../../../data/store/commitHelpers.ts')
const { readOwnerSettings } = await import('../../../data/store/ownerDataHooks.ts')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { getDefaultMessageTemplatePatterns, getDefaultReportShareMessagePattern } = await import('../../../data/sync/messageTemplates.ts')
const { SERVER_SAVE_FAIL } = await import('../../../shared/utils/failureMessages.js')

/** @typedef {import('../../../domain/jsonTypes.ts').JsonValue} JsonValue */

const SAVED = /** @type {[string, string, string]} */ (['미수 {거래처}', '입금 {운송료}', '완료 {운행구간}'])

/**
 * 로그인 계정을 준비하고 profiles 저장을 가로챈다(보낸 settings를 모음).
 * @param {string} ownerKey @param {{ fail?: boolean }} [options]
 */
function loginWithServer(ownerKey, { fail = false } = {}) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(ownerKey, ownerKey)
  setHydration({ status: 'ready', userId: ownerKey, ownerKey })
  /** @type {Array<JsonValue>} */
  const sent = []
  handlers.profiles = {
    upsert: async (row) => {
      sent.push(row && typeof row === 'object' && !Array.isArray(row) ? row.settings ?? null : null)
      return fail ? { data: null, error: { message: 'profiles down' } } : { data: null, error: null }
    },
  }
  return sent
}

/**
 * @param {string} ownerKey @param {Array<string>} toasts
 */
async function mount(ownerKey, toasts) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const page = withSession(React.createElement(MessageSettingsPage, {}), { ownerKey })
  await act(async () => { root.render(withToast(page, (/** @type {string} */ m) => { toasts.push(m) })) })
  const box = (/** @type {string} */ id) => /** @type {HTMLTextAreaElement} */ (container.querySelector(`#${id}`))
  return {
    box,
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

/** @param {string} label */
async function click(label) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent === label)
  assert.ok(button, `${label} 버튼`)
  await act(async () => { button.click() })
}

/** React 제어 입력에 값을 넣고 input 이벤트를 보낸다. @param {HTMLTextAreaElement} input @param {string} value */
async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
}

test('입금 요청 문자를 비우고 저장 → 그 칸만 표시·문구·커서, 알림 없음, 채우면 사라짐', async () => {
  /** @type {Array<string>} */
  const toasts = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(withToast(React.createElement(MessageSettingsPage, {}), (/** @type {string} */ m) => { toasts.push(m) })) })
  try {
    const box = /** @type {HTMLTextAreaElement} */ (container.querySelector('#msgPaymentRequest'))
    await typeInto(box, '  ')
    await click('저장')
    assert.deepEqual(toasts, [])
    assert.equal(box.getAttribute('aria-invalid'), 'true')
    assert.equal(container.querySelector('#msgPaymentRequest-error')?.textContent, '문구를 입력해 주세요.')
    assert.equal(document.activeElement, box)
    assert.equal(container.querySelectorAll('[aria-invalid="true"]').length, 1)
    await typeInto(box, '입금 부탁드립니다.')
    assert.equal(box.getAttribute('aria-invalid'), null)
    await click('저장')
    assert.deepEqual(toasts, ['문자 문구를 저장했습니다.'])
    assert.equal(readOwnerSettings('guest').messageTemplates?.[1], '입금 부탁드립니다.', '비회원은 앱 설정에')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('로그인: 첫 값은 계정 설정 문구, [저장]은 서버에 보낸 뒤 앱 설정에, 휴대폰 옛 키는 안 씀', async () => {
  const ownerKey = 'msg-save'
  const sent = loginWithServer(ownerKey)
  commitSettings(ownerKey, normalizeSettings({ messageTemplates: SAVED, reportShareMessage: '내역 {거래처}' }))
  /** @type {Array<string>} */
  const toasts = []
  const page = await mount(ownerKey, toasts)
  try {
    assert.equal(page.box('msgUnpaid').value, SAVED[0])
    assert.equal(page.box('msgReportShare').value, '내역 {거래처}')
    await typeInto(page.box('msgTripComplete'), '  완료했습니다 ')
    await click('저장')
    assert.deepEqual(toasts, ['문자 문구를 저장했습니다.'])
    const expected = [SAVED[0], SAVED[1], '완료했습니다']
    assert.deepEqual(/** @type {{ messageTemplates?: JsonValue }} */ (sent[0]).messageTemplates, expected, '서버에 보낸 설정')
    assert.deepEqual(readOwnerSettings(ownerKey).messageTemplates, expected)
    assert.equal(localStorage.getItem('messageTemplateCustomBodies'), null)
    assert.equal(localStorage.getItem('reportShareMessagePattern'), null)
  } finally { await page.unmount() }
})

test('로그인 저장 실패: 공용 실패 문구, 앱 설정 그대로, 입력한 글 그대로', async () => {
  const ownerKey = 'msg-fail'
  loginWithServer(ownerKey, { fail: true })
  commitSettings(ownerKey, normalizeSettings({ messageTemplates: SAVED }))
  /** @type {Array<string>} */
  const toasts = []
  const page = await mount(ownerKey, toasts)
  try {
    await typeInto(page.box('msgUnpaid'), '새 문구')
    await click('저장')
    assert.deepEqual(toasts, [SERVER_SAVE_FAIL])
    assert.deepEqual(readOwnerSettings(ownerKey).messageTemplates, SAVED)
    assert.equal(page.box('msgUnpaid').value, '새 문구')
    await click('기본 문구로 복원')
    assert.deepEqual(toasts, [SERVER_SAVE_FAIL, SERVER_SAVE_FAIL], '복원 실패도 같은 문구')
    assert.equal(page.box('msgUnpaid').value, '새 문구', '복원 실패면 칸 그대로')
  } finally { await page.unmount() }
})

test('로그인 [기본 문구로 복원]: 두 칸을 뺀 설정을 서버에 보내고, 성공 뒤 칸을 기본 문구로', async () => {
  const ownerKey = 'msg-reset'
  const sent = loginWithServer(ownerKey)
  commitSettings(ownerKey, normalizeSettings({ messageTemplates: SAVED, reportShareMessage: '내역 {거래처}', timeOn: true }))
  /** @type {Array<string>} */
  const toasts = []
  const page = await mount(ownerKey, toasts)
  try {
    await click('기본 문구로 복원')
    assert.deepEqual(toasts, ['기본 문구로 복원했습니다.'])
    const server = /** @type {{ [key: string]: JsonValue }} */ (sent[0])
    assert.equal('messageTemplates' in server, false)
    assert.equal('reportShareMessage' in server, false)
    assert.equal(server.timeOn, true, '다른 설정은 그대로')
    assert.equal(readOwnerSettings(ownerKey).messageTemplates, undefined)
    assert.equal(page.box('msgPaymentRequest').value, getDefaultMessageTemplatePatterns()[1])
    assert.equal(page.box('msgReportShare').value, getDefaultReportShareMessagePattern())
  } finally { await page.unmount() }
})
