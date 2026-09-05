// @ts-check
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const reactActEnv = /** @type {{ IS_REACT_ACT_ENVIRONMENT?: boolean }} */ (globalThis)
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter } = await import('react-router-dom')
const { act } = React

const { default: MyPage } = await import('./MyPage.jsx')
const { default: SideMenu } = await import('./SideMenu.jsx')
const { default: CarListPage } = await import('./cars/CarListPage.jsx')
const { commitBatch } = await import('../store/app-store.js')

describe('Step 9 ② 1차: 계정별 화면 권한 정리 UI 검증', () => {
  test('마이페이지: "차주" / "소속 기사" 역할 뱃지가 렌더되지 않는다', async () => {
    const ownerKey = 'test-mypage-no-role-badge'
    commitBatch([
      { domain: 'profile', ownerKey, value: { name: '홍길동' } },
      { domain: 'drivers', ownerKey, value: [{ id: 'd1', name: '기사1', status: 'linked' }] },
    ], { syncToCloud: false })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      // 1) 소속 기사 세션
      await act(async () => {
        root.render(
          React.createElement(MyPage, {
            ownerKey,
            session: /** @type {any} */ ({ accountType: 'employed_driver', name: '홍길동' }),
            onOpen: () => {},
            onBack: () => {},
          }),
        )
      })

      assert.equal(container.querySelector('.mypage-role-pill'), null)
      assert.equal(container.textContent?.includes('소속 기사'), false)

      // 2) 차주 세션
      await act(async () => {
        root.render(
          React.createElement(MyPage, {
            ownerKey,
            session: /** @type {any} */ ({ accountType: 'owner_driver', name: '홍길동' }),
            onOpen: () => {},
            onBack: () => {},
          }),
        )
      })

      assert.equal(container.querySelector('.mypage-role-pill'), null)
      assert.equal(container.textContent?.includes('차주'), false)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('SideMenu: 정적 "기사 연동 관리" 버튼이 삭제되었고, 동적 연동 기사 목록은 유지된다', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    let selectedPage = ''
    let openedLinkedDriverId = ''

    try {
      await act(async () => {
        root.render(
          React.createElement(SideMenu, {
            open: true,
            onClose: () => {},
            onSelect: (page) => { selectedPage = page },
            linkedDriverItems: [
              { linkId: 'link-123', driverName: '이소속' },
            ],
            onOpenLinkedDriver: (id) => { openedLinkedDriverId = id },
          }),
        )
      })

      const buttons = Array.from(container.querySelectorAll('button'))
      const buttonTexts = buttons.map((b) => b.textContent?.trim() || '')

      // 1) "기사 연동 관리" 텍스트 버튼이 없어야 함
      const hasDriverConnectionBtn = buttonTexts.some((txt) => txt === '기사 연동 관리' || txt.includes('기사 연동 관리'))
      assert.equal(hasDriverConnectionBtn, false, 'SideMenu에 기사 연동 관리 버튼이 없어야 한다')

      // 2) 동적 연동 기사 목록("이소속 기사 관리")은 유지되어야 함
      const linkedDriverBtn = buttons.find((b) => b.textContent?.includes('이소속 기사 관리'))
      assert.ok(linkedDriverBtn, '동적 연동 기사 목록 버튼이 존재해야 한다')

      linkedDriverBtn?.click()
      assert.equal(openedLinkedDriverId, 'link-123')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('CarListPage: 소속기사 세션에선 "수정"/"삭제"/"+추가"가 없고, 차주 세션에선 존재한다', async () => {
    const ownerKey = 'test-cars-employed-readonly'
    const carFixture = { id: 'car-1', number: '12가3456', type: 'main' }
    commitBatch([
      { domain: 'cars', ownerKey, value: [carFixture] },
    ], { syncToCloud: false })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      // 1) 소속기사 세션
      await act(async () => {
        root.render(
          React.createElement(MemoryRouter, null,
            React.createElement(CarListPage, {
              ownerKey,
              session: /** @type {any} */ ({ accountType: 'employed_driver' }),
              onBack: () => {},
            }),
          ),
        )
      })

      assert.equal(container.querySelectorAll('.car-action-btns').length, 0, '소속기사 세션에선 액션 버튼 영역이 없어야 한다')
      assert.equal(container.querySelector('.management-add-fab'), null, '소속기사 세션에선 +추가 버튼이 없어야 한다')
      const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim())
      assert.equal(buttons.includes('수정'), false)
      assert.equal(buttons.includes('삭제'), false)

      // 2) 차주 세션
      await act(async () => {
        root.render(
          React.createElement(MemoryRouter, null,
            React.createElement(CarListPage, {
              ownerKey,
              session: /** @type {any} */ ({ accountType: 'owner_driver' }),
              onBack: () => {},
            }),
          ),
        )
      })

      assert.equal(container.querySelectorAll('.car-action-btns').length, 1, '차주 세션에선 액션 버튼 영역이 있어야 한다')
      assert.ok(container.querySelector('.management-add-fab'), '차주 세션에선 +추가 버튼이 있어야 한다')
      const ownerButtons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim())
      assert.ok(ownerButtons.includes('수정'))
      assert.ok(ownerButtons.includes('삭제'))
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })
})
