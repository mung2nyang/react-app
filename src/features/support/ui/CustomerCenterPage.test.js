// @ts-check
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { stubSupabaseCallCounts, stubSupabaseMethodImpls } from '../../../testSupport/stubSupabaseClient.js'

const reactActEnv = /** @type {{ IS_REACT_ACT_ENVIRONMENT?: boolean }} */ (globalThis)
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: CustomerCenterPage } = await import('./CustomerCenterPage.jsx')
const { default: SideMenu } = await import('../../../app/shell/SideMenu.jsx')
const { beginSessionEpoch, endCloudSession } = await import('../../../data/cloud/cloudSession.ts')
const { setHydration } = await import('../../../data/store/app-store.ts')

/**
 * @param {import('../../../data/sync/syncTypes.ts').AppSession|null} session
 * @param {string} tabLabel
 */
async function openSupportTab(session, tabLabel) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(withSession(React.createElement(CustomerCenterPage, {
      onBack: () => {},
      onGoAuth: () => {},
    }), { session }))
  })
  const tab = /** @type {HTMLButtonElement|undefined} */ (
    [...container.querySelectorAll('.support-tab')].find((el) => el.textContent?.includes(tabLabel))
  )
  assert.ok(tab)
  await act(async () => {
    tab.click()
  })
  return { container, root }
}

describe('CustomerCenterPage — 고객센터 진입·FAQ·1:1 문의', () => {
  test('FAQ 탭이 기본으로 노출되고 자주 묻는 질문 카드가 보인다', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(React.createElement(CustomerCenterPage, { onBack: () => {} }))
      })
      assert.ok(container.textContent?.includes('고객센터'))
      assert.ok(container.textContent?.includes('자주 묻는 질문'))
      assert.ok(container.textContent?.includes('운행 기록은 자동으로 저장되나요?'))
      const faqTab = [...container.querySelectorAll('.support-tab')].find((el) => el.textContent === 'FAQ')
      assert.ok(faqTab?.classList.contains('active'), 'FAQ 탭이 기본 active여야 한다')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('게스트 세션이면 1:1 문의 폼을 마운트하지 않고 로그인 안내만 보인다', async () => {
    const { container, root } = await openSupportTab({ guestMode: true, name: '비회원' }, '1:1')
    try {
      assert.ok(container.textContent?.includes('로그인 후 이용해 주세요'))
      assert.equal(container.querySelector('.inquiry-form'), null)
      assert.equal(container.querySelector('textarea'), null)
      assert.ok([...container.querySelectorAll('button')].some((el) => el.textContent?.includes('로그인하러 가기')))
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('로그인 세션이면 1:1 문의 폼이 마운트된다', async () => {
    const { container, root } = await openSupportTab({ userId: 'u-cloud-1', guestMode: false, name: '테스트' }, '1:1')
    try {
      assert.ok(container.querySelector('.inquiry-form'), '로그인 세션엔 inquiry-form이 있어야 한다')
      assert.ok(container.querySelector('textarea'))
      assert.ok(container.querySelector('.app-dropdown-trigger'), '문의유형 AppDropdown 트리거가 있어야 한다')
      assert.equal(container.textContent?.includes('로그인 후 이용해 주세요'), false)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('사이드메뉴에 고객센터 항목이 있고 클릭 시 support를 고른다', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    /** @type {string[]} */
    const picked = []
    try {
      await act(async () => {
        root.render(React.createElement(SideMenu, {
          open: true,
          onClose: () => {},
          onSelect: (/** @type {string} */ page) => { picked.push(page) },
        }))
      })
      const supportBtn = /** @type {HTMLButtonElement|undefined} */ ([...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === '고객센터'))
      assert.ok(supportBtn, '사이드메뉴에 고객센터 버튼이 있어야 한다')
      await act(async () => {
        supportBtn.click()
      })
      assert.deepEqual(picked, ['support'])
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })
})

describe('CustomerCenterPage — 나의 문의·건의 확인', () => {
  test('게스트는 조회 UI 없이 로그인 안내만 보인다', async () => {
    const { container, root } = await openSupportTab({ guestMode: true, name: '비회원' }, '나의 문의')
    try {
      assert.ok(container.textContent?.includes('로그인 후 이용해 주세요'))
      assert.equal(container.querySelector('.my-inquiry-card'), null)
      assert.equal(container.textContent?.includes('아직 접수한 문의'), false)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('로그인·빈 목록이면 안내 문구가 보인다', async () => {
    beginSessionEpoch('u-empty', 'u-empty')
    setHydration({ status: 'ready', userId: 'u-empty', ownerKey: 'u-empty' })
    stubSupabaseMethodImpls.select = async () => ({ data: [], error: null })
    const { container, root } = await openSupportTab({ userId: 'u-empty', guestMode: false, name: '테스트' }, '나의 문의')
    try {
      await act(async () => { await Promise.resolve() })
      assert.ok(container.textContent?.includes('아직 접수한 문의나 건의가 없습니다'))
      assert.equal(container.querySelector('.my-inquiry-card'), null)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
      endCloudSession()
    }
  })

  test('로그인·항목이 있으면 답변 대기/완료 배지를 표시한다', async () => {
    beginSessionEpoch('u-list', 'u-list')
    setHydration({ status: 'ready', userId: 'u-list', ownerKey: 'u-list' })
    stubSupabaseMethodImpls.select = async () => ({
      data: [
        {
          id: 'inq-1',
          type: '문의',
          title: '대기 중인 문의',
          content: '내용 A',
          answer: null,
          created_at: '2026-09-05T10:00:00.000Z',
        },
        {
          id: 'inq-2',
          type: '기능 건의',
          title: '답변 받은 문의',
          content: '내용 B',
          answer: '확인했습니다.',
          created_at: '2026-09-04T10:00:00.000Z',
        },
      ],
      error: null,
    })
    const { container, root } = await openSupportTab({ userId: 'u-list', guestMode: false, name: '테스트' }, '나의 문의')
    try {
      await act(async () => { await Promise.resolve() })
      assert.equal(container.querySelectorAll('.my-inquiry-card').length, 2)
      assert.ok(container.textContent?.includes('대기 중인 문의'))
      assert.ok(container.textContent?.includes('답변 받은 문의'))
      assert.ok(container.textContent?.includes('답변 대기'))
      assert.ok(container.textContent?.includes('답변 완료'))
      assert.ok(container.textContent?.includes('확인했습니다.'))
      assert.ok(container.querySelector('.my-inquiry-status.pending'))
      assert.ok(container.querySelector('.my-inquiry-status.answered'))
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
      endCloudSession()
    }
  })
})

// 로드맵 99-C — 부품을 각자 파일로 옮기기 전 동작(문의 접수·목록 실패)을 적어 둔다.
describe('CustomerCenterPage — 문의 접수·목록 실패 알림', () => {
  /** @param {string} userId @param {string} tabLabel */
  async function openWithToasts(userId, tabLabel) {
    beginSessionEpoch(userId, userId)
    setHydration({ status: 'ready', userId, ownerKey: userId })
    /** @type {Array<string>} */
    const toasts = []
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(withToast(withSession(React.createElement(CustomerCenterPage, { onBack: () => {} }), { session: { userId, guestMode: false, name: '테스트' } }), (/** @type {string} */ m) => { toasts.push(m) }))
    })
    const tab = /** @type {HTMLButtonElement|undefined} */ ([...container.querySelectorAll('.support-tab')].find((el) => el.textContent?.includes(tabLabel)))
    assert.ok(tab)
    await act(async () => { tab.click() })
    return { container, root, toasts }
  }

  test('로그인 상태에서 문의를 접수하면 성공 알림이 뜨고 제목·내용 칸이 비워진다', async () => {
    stubSupabaseMethodImpls.insert = async () => ({ data: null, error: null })
    const before = stubSupabaseCallCounts.insert
    const { container, root, toasts } = await openWithToasts('u-submit', '1:1')
    try {
      const title = /** @type {HTMLInputElement} */ (container.querySelector('.inquiry-form input'))
      const content = /** @type {HTMLTextAreaElement} */ (container.querySelector('.inquiry-form textarea'))
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(title, '앱 문의')
        title.dispatchEvent(new window.Event('input', { bubbles: true }))
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(content, '내용입니다')
        content.dispatchEvent(new window.Event('input', { bubbles: true }))
      })
      assert.equal(title.value, '앱 문의')
      const form = container.querySelector('.inquiry-form')
      assert.ok(form)
      await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })) })
      await act(async () => { await Promise.resolve() })
      assert.equal(stubSupabaseCallCounts.insert - before, 1)
      assert.deepEqual(toasts, ['문의가 접수되었습니다.'])
      assert.equal(title.value, '')
      assert.equal(content.value, '')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
      endCloudSession()
    }
  })

  test('내 문의 목록을 못 불러오면 실패 알림과 빈 목록 안내가 보인다', async () => {
    stubSupabaseMethodImpls.select = async () => ({ data: null, error: { message: '조회 실패 흉내' } })
    const { container, root, toasts } = await openWithToasts('u-fetch-fail', '나의 문의')
    try {
      await act(async () => { await Promise.resolve() })
      assert.deepEqual(toasts, ['문의 목록을 불러오지 못했습니다.'])
      assert.ok(container.textContent?.includes('아직 접수한 문의나 건의가 없습니다'))
      assert.equal(container.querySelector('.my-inquiry-card'), null)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
      endCloudSession()
    }
  })
})

test('로드맵 23-C — initialTab myInquiries(주소 ?tab=my)면 "나의 문의/건의 확인" 탭이 처음부터 선택된다', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(withSession(React.createElement(CustomerCenterPage, { onBack: () => {}, initialTab: 'myInquiries' }), { session: { guestMode: true, name: '비회원' } }))
    })
    const active = container.querySelector('.support-tab.active')
    assert.equal(active?.textContent, '나의 문의/건의 확인')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
