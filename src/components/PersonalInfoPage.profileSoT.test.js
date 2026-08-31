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
const { default: PersonalInfoPage } = await import('./PersonalInfoPage.jsx')
const { default: MyPage } = await import('./MyPage.jsx')
const { commitProfile } = await import('../store/commitHelpers.js')
const { EMPTY_PROFILE } = await import('../lib/profile.js')

test('프로필을 커밋하면 개인정보 화면이 리마운트 없이 상호를 갱신한다', async () => {
  const ownerKey = 'sot-profile-page'
  commitProfile(ownerKey, { ...EMPTY_PROFILE, bizName: '예전상호' }, { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(PersonalInfoPage, { ownerKey, session: null, onBack: () => {} }))
    })
    const input = container.querySelector('#bizName')
    assert.ok(input, '사업자명 입력이 있어야 한다')
    assert.equal(input.value, '예전상호')

    await act(async () => {
      commitProfile(ownerKey, { ...EMPTY_PROFILE, bizName: '새상호' }, { syncToCloud: false })
    })
    assert.equal(
      input.value,
      '새상호',
      'loadProfile 스냅샷이면 리마운트 없이 상호가 안 바뀐다',
    )
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('프로필을 커밋하면 마이페이지 이름이 리마운트 없이 바뀐다', async () => {
  const ownerKey = 'sot-profile-mypage'
  commitProfile(ownerKey, { ...EMPTY_PROFILE, name: '이전이름' }, { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(MyPage, {
        ownerKey,
        session: { name: '비회원' },
        onOpen: () => {},
        onBack: () => {},
      }))
    })
    assert.equal(container.querySelector('.mypage-user-name')?.textContent, '이전이름')

    await act(async () => {
      commitProfile(ownerKey, { ...EMPTY_PROFILE, name: '다음이름' }, { syncToCloud: false })
    })
    assert.equal(
      container.querySelector('.mypage-user-name')?.textContent,
      '다음이름',
      'loadProfile 스냅샷이면 리마운트 없이 이름이 안 바뀐다',
    )
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
