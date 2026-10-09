// @ts-check
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)
import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { default: DriverConnectionPage } = await import('./DriverConnectionPage.jsx')
const { commitDrivers } = await import('../store/commitHelpers.js')
const { beginSessionEpoch, endCloudSession } = await import('../lib/cloudSession.js')

test('로그인 초대는 수동 연동 버튼 없이 수정·취소만, 비회원 수동 연동은 유지', async () => {
  const ownerKey = 'security-driver-page'
  beginSessionEpoch(ownerKey, ownerKey)
  commitDrivers(ownerKey, [{ id: 'pending-link', supabaseId: 'server-link', name: '시험기사',
    status: 'pending', inviteCode: '123456', vehicleNumber: '시험차량' }], { syncToCloud: false })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props = { ownerKey, onBack: () => {} }
  const findButton = (/** @type {string} */ label) =>
    [...container.querySelectorAll('button')].find((button) => button.textContent === label)
  resetStubSupabaseCallCounts()
  try {
    await React.act(async () => {
      root.render(React.createElement(DriverConnectionPage, {
        ...props, session: { userId: ownerKey, name: '차주', phone: '' },
      }))
    })
    assert.equal(Boolean(findButton('연동 완료')), false, '차주가 기사 동의 없이 연동시키는 버튼은 없어야 함')
    assert.ok(findButton('초대 수정'))
    assert.ok(findButton('초대 취소'))
    assert.ok(container.textContent?.includes('초대 코드 123456'))
    assert.equal(stubSupabaseCallCounts.update, 0)
    endCloudSession()
    await React.act(async () => {
      root.render(React.createElement(DriverConnectionPage, { ...props, session: null }))
    })
    const manual = findButton('연동 완료')
    assert.ok(manual, '비회원용 로컬 동작은 유지')
    await React.act(async () => { manual.click() })
    assert.ok(findButton('기사 관리'), '비회원 클릭은 실제로 로컬 연동 상태를 바꾼다')
    assert.equal(Boolean(findButton('연동 완료')), false)
    assert.equal(stubSupabaseCallCounts.update, 0, '비회원 클릭은 서버에 쓰지 않는다')
  } finally {
    await React.act(async () => { root.unmount() })
    container.remove()
    endCloudSession()
    localStorage.clear()
    resetStubSupabaseCallCounts()
  }
})
