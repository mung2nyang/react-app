// 데이터 다운로드(B-1): 마이페이지 가로줄 아래·공지사항 위 메뉴는 차주·개인 회원만, 누르면 확인 창(내보내기만).
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

/** @param {Record<string, unknown>|null} session */
async function render(session) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(MyPage, { session, ownerKey: 'data-download-test', onOpen: () => {}, onBack: () => {} }))
  })
  const links = [...container.querySelectorAll('.mypage-notice-link')]
  return {
    container,
    labels: links.map((el) => el.textContent.trim()),
    entry: links.find((el) => el.classList.contains('mypage-notice-entry'))?.textContent.trim(),
    download: links.find((el) => el.textContent.includes('데이터 다운로드')),
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('차주·개인 회원: 가로줄 바로 아래(공지사항 위)에 데이터 다운로드, 누르면 확인 창', async () => {
  const view = await render({ userId: 'u-1', name: '차주', accountType: 'owner_driver' })
  try {
    assert.deepEqual(view.labels.slice(-2), ['데이터 다운로드', '공지사항'])
    assert.equal(view.entry, '데이터 다운로드', '가로줄은 데이터 다운로드 위에 있다')
    await act(async () => { view.download?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    assert.ok(view.container.textContent.includes('지금까지 입력한 운행·정산·차량 기록 전체를 내 기기로 다운로드합니다.'))
    assert.ok(view.container.textContent.includes('계좌번호 등 개인정보'))
    const buttons = [...view.container.querySelectorAll('.modal-btns button')].map((b) => b.textContent)
    assert.deepEqual(buttons, ['취소', '다운로드'], '가져오기 없이 내보내기만')
  } finally { await view.cleanup() }
})

test('연동 기사와 비회원에겐 데이터 다운로드가 없고, 가로줄은 공지사항 위 그대로', async () => {
  for (const session of [
    { userId: 'd-1', name: '기사', accountType: 'employed_driver', linkedOwnerId: 'o-1' },
    { name: '비회원', guestMode: true },
  ]) {
    const view = await render(session)
    try {
      assert.equal(view.download, undefined)
      assert.equal(view.entry, '공지사항')
    } finally { await view.cleanup() }
  }
})
