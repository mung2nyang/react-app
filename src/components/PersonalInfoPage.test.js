// @ts-check
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'

const reactActEnv = /** @type {{ IS_REACT_ACT_ENVIRONMENT?: boolean }} */ (globalThis)
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true

/** @type {{ ok: boolean, toast: string }} */
let withdrawResult = { ok: true, toast: '탈퇴가 완료되었습니다.' }
let withdrawCalls = 0

mock.module('../lib/accountWithdrawal.js', {
  namedExports: {
    requestAccountWithdrawal: async () => {
      withdrawCalls += 1
      return withdrawResult
    },
  },
})

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: PersonalInfoPage } = await import('./PersonalInfoPage.jsx')

/** @param {ParentNode} root @param {string} text */
function findButtonByText(root, text) {
  return /** @type {HTMLButtonElement|undefined} */ (
    [...root.querySelectorAll('button')].find((el) => el.textContent?.trim() === text)
  )
}

/**
 * @param {import('../lib/outboxTypes.js').AppSession|null} session
 * @param {{ onGoAuth?: () => void, showToast?: (m: string) => void }} [handlers]
 */
async function renderPage(session, handlers = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(PersonalInfoPage, {
      ownerKey: session?.userId || 'guest',
      session,
      onBack: () => {},
      onGoAuth: handlers.onGoAuth || (() => {}),
      showToast: handlers.showToast || (() => {}),
    }))
  })
  return { container, root }
}

describe('PersonalInfoPage — 회원 탈퇴', () => {
  test('게스트 세션엔 탈퇴 버튼이 없다', async () => {
    const { container, root } = await renderPage({ guestMode: true, name: '비회원' })
    try {
      assert.equal(container.querySelector('.withdraw-link'), null)
      assert.equal(findButtonByText(container, '회원 탈퇴'), undefined)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('로그인 세션엔 탈퇴 버튼이 있고 2단계 확인 후 성공 시 onGoAuth를 호출한다', async () => {
    withdrawCalls = 0
    withdrawResult = { ok: true, toast: '탈퇴가 완료되었습니다.' }
    /** @type {string[]} */
    const toasts = []
    let goAuthCalls = 0
    const { container, root } = await renderPage(
      { userId: 'u-withdraw', guestMode: false, name: '홍길동' },
      {
        onGoAuth: () => { goAuthCalls += 1 },
        showToast: (m) => { toasts.push(m) },
      },
    )
    try {
      const withdrawBtn = container.querySelector('.withdraw-link')
      assert.ok(withdrawBtn, '로그인 세션엔 탈퇴 링크가 있어야 한다')
      await act(async () => { /** @type {HTMLButtonElement} */ (withdrawBtn).click() })
      assert.ok(container.textContent?.includes('정말 탈퇴하시겠습니까'))
      await act(async () => { findButtonByText(container, '다음')?.click() })
      assert.ok(container.textContent?.includes('한 번 더 확인해 주세요'))
      await act(async () => { findButtonByText(container, '탈퇴')?.click() })
      await act(async () => { await Promise.resolve() })
      assert.equal(withdrawCalls, 1)
      assert.equal(goAuthCalls, 1)
      assert.deepEqual(toasts, ['탈퇴가 완료되었습니다.'])
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('RPC 실패 시 onGoAuth를 호출하지 않는다', async () => {
    withdrawCalls = 0
    withdrawResult = { ok: false, toast: '탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }
    /** @type {string[]} */
    const toasts = []
    let goAuthCalls = 0
    const { container, root } = await renderPage(
      { userId: 'u-withdraw-fail', guestMode: false, name: '홍길동' },
      {
        onGoAuth: () => { goAuthCalls += 1 },
        showToast: (m) => { toasts.push(m) },
      },
    )
    try {
      await act(async () => { container.querySelector('.withdraw-link')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
      await act(async () => { findButtonByText(container, '다음')?.click() })
      await act(async () => { findButtonByText(container, '탈퇴')?.click() })
      await act(async () => { await Promise.resolve() })
      assert.equal(withdrawCalls, 1)
      assert.equal(goAuthCalls, 0)
      assert.equal(toasts.length, 1)
      assert.ok(toasts[0].includes('오류') || toasts[0].includes('실패') || toasts[0].includes('탈퇴'))
      assert.ok(container.querySelector('.withdraw-link'), '실패 후에도 탈퇴 링크가 남아야 한다')
      assert.ok(container.textContent?.includes('로그아웃'), '실패 후에도 로그인 계정 UI가 남아야 한다')
      assert.ok(container.textContent?.includes('로그인 상태와 계정 연결 관리'))
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })
})

describe('PersonalInfoPage — 성명 칸(로드맵 16)', () => {
  test('저장된 성명이 없으면 칸은 비어 있고, 가입 이름은 예시 글자로만 보인다', async () => {
    const { container, root } = await renderPage({ guestMode: true, name: '가입이름' })
    try {
      const input = /** @type {HTMLInputElement} */ (container.querySelector('#userName'))
      assert.equal(input.value, '', '가입 이름이 칸 값으로 다시 채워지면 안 된다')
      assert.equal(input.placeholder, '가입이름')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('가입 이름이 없으면 예시 글자는 "성명을 입력하세요"', async () => {
    const { container, root } = await renderPage({ guestMode: true, name: '비회원' })
    try {
      const input = /** @type {HTMLInputElement} */ (container.querySelector('#userName'))
      assert.equal(input.value, '')
      assert.equal(input.placeholder, '성명을 입력하세요')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })
})
