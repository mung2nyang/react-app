// 로드맵 7-C-1 — 연동 중 기사 카드의 해제 영역: 요청 없음 / 내가(차주) 요청 / 기사가 요청. 거절 버튼 없음.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: DriverConnectionPage } = await import('./DriverConnectionPage.jsx')
const { commitDrivers } = await import('../store/commitHelpers.js')
const { beginSessionEpoch, endCloudSession } = await import('../lib/cloudSession.js')

/** @param {Element} card */
function buttons(card) {
  return [...card.querySelectorAll('button')].map((el) => el.textContent?.trim())
}

test('연동 중 카드 세 가지 상태: [해제 요청] / 요청 중·[요청 취소] / 기사 요청·[동의], 거절 없음', async () => {
  const ownerKey = 'owner-7c-page'
  beginSessionEpoch(ownerKey, ownerKey)
  const requestedAt = '2026-10-01T03:00:00.000Z'
  commitDrivers(ownerKey, [
    { id: 'd-none', name: '요청없음기사', status: 'linked', vehicleNumber: '11가1111', supabaseId: 'l1' },
    { id: 'd-mine', name: '내요청기사', status: 'linked', vehicleNumber: '22가2222', supabaseId: 'l2', unlinkRequestedBy: ownerKey, unlinkRequestedAt: requestedAt },
    { id: 'd-theirs', name: '기사요청기사', status: 'linked', vehicleNumber: '33가3333', supabaseId: 'l3', unlinkRequestedBy: 'driver-x', unlinkRequestedAt: requestedAt },
  ], { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(DriverConnectionPage, { ownerKey, session: { userId: ownerKey, name: '차주', phone: '' }, onBack: () => {} }))
    })
    const cards = [...container.querySelectorAll('.driver-connection-card')]
    const byName = (/** @type {string} */ name) => cards.find((card) => card.textContent?.includes(name))
    const none = byName('요청없음기사')
    const mine = byName('내요청기사')
    const theirs = byName('기사요청기사')
    assert.ok(none && mine && theirs)

    assert.ok(buttons(none).includes('해제 요청'))
    assert.equal(buttons(none).includes('연동 해제'), false, '바로 끊는 버튼은 없어야 한다')

    assert.ok(mine.textContent?.includes('해제 요청 중 — 기사 동의 대기 (10월 4일 자동 해제)'))
    assert.ok(buttons(mine).includes('요청 취소'))
    assert.equal(buttons(mine).includes('해제 요청'), false)

    assert.ok(theirs.textContent?.includes('기사가 해제를 요청했습니다 (10월 4일 자동 해제)'))
    assert.ok(buttons(theirs).includes('동의'))
    assert.equal(buttons(theirs).some((label) => label?.includes('거절')), false, '거절 버튼은 없다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
    endCloudSession()
  }
})
