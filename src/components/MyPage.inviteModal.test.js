// 마이페이지 "초대코드 입력"은 전체 화면이 아니라 마이페이지 위 팝업으로 열린다(주소 이동 없음).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: MyPage } = await import('./MyPage.jsx')

/** @param {Element|null|undefined} el */
async function click(el) {
  assert.ok(el instanceof window.HTMLElement)
  await act(async () => { el.click() })
}

/** @param {Element|null} el @param {string} value */
async function type(el, value) {
  assert.ok(el instanceof window.HTMLInputElement)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

test('초대코드 입력 버튼을 누르면 팝업이 뜨고, 4자 미만이면 연동하기가 막히며, 취소로 닫힌다', async () => {
  const opened = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(MyPage, {
        session: { userId: 'u-1', name: '기사', phone: '010-0000-0000', accountType: 'owner' },
        ownerKey: 'invite-modal-test',
        onOpen: (page) => { opened.push(page) },
        onBack: () => {},
      }))
    })
    assert.equal(container.querySelector('.invite-redeem-modal'), null, '처음에는 팝업이 없다')

    const entry = [...container.querySelectorAll('.mypage-notice-link')].find((el) => el.textContent.includes('초대코드 입력'))
    await click(entry)
    assert.ok(container.querySelector('.invite-redeem-modal'), '팝업이 열린다')
    assert.deepEqual(opened, [], '다른 화면으로 이동하지 않는다')
    assert.ok(container.textContent.includes('차주에게 전달받은 초대코드를 입력해 주세요.'))
    assert.ok(container.textContent.includes('기사님이 입력한 운행·매출 내역이 차주에게 공유됩니다.'))

    const confirm = container.querySelector('.modal-btn.confirm')
    assert.ok(confirm instanceof window.HTMLButtonElement)
    assert.equal(confirm.disabled, true, '코드가 비었으면 연동하기가 막힌다')
    await type(container.querySelector('#driverInviteCode'), '123')
    assert.equal(confirm.disabled, true, '3자는 아직 막힌다')
    await type(container.querySelector('#driverInviteCode'), '1234')
    assert.equal(confirm.disabled, false, '4자부터 열린다')

    await click(container.querySelector('.modal-btn.cancel'))
    assert.equal(container.querySelector('.invite-redeem-modal'), null, '취소로 닫힌다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
