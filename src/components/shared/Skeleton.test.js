// 로드맵 18-D: 뼈대 — 막대 줄 수·화면 뼈대 모양·"불러오는 중" 상태 알림.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { SkeletonLines, PageSkeleton } = await import('./Skeleton.jsx')

/** @param {import('react').ReactElement} element */
async function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  return {
    container,
    cleanup: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('SkeletonLines: 지정한 줄 수만큼 막대 + 상태 알림·읽기용 문구', async () => {
  const view = await render(React.createElement(SkeletonLines, { lines: 3, label: '문의 목록 불러오는 중' }))
  try {
    const box = view.container.querySelector('[role="status"]')
    assert.ok(box, '상태 알림이 있어야 한다')
    assert.equal(box?.getAttribute('aria-busy'), 'true')
    assert.equal(view.container.querySelectorAll('.skeleton-bar').length, 3)
    assert.equal(view.container.querySelector('.skeleton-sr')?.textContent, '문의 목록 불러오는 중')
  } finally {
    await view.cleanup()
  }
})

test('SkeletonLines: 기본 2줄·기본 문구', async () => {
  const view = await render(React.createElement(SkeletonLines))
  try {
    assert.equal(view.container.querySelectorAll('.skeleton-bar').length, 2)
    assert.equal(view.container.querySelector('.skeleton-sr')?.textContent, '불러오는 중')
  } finally {
    await view.cleanup()
  }
})

test('PageSkeleton: 주소 없으면 공용 — 제목 막대 1 + 카드 틀 3 + 상태 알림', async () => {
  const view = await render(React.createElement(PageSkeleton))
  try {
    assert.ok(view.container.querySelector('.page-skeleton[role="status"][data-shape="common"]'))
    assert.equal(view.container.querySelectorAll('.skeleton-title').length, 1)
    assert.equal(view.container.querySelectorAll('.skeleton-card.skeleton-group').length, 3)
    assert.equal(view.container.querySelector('.settings-header'), null, '공용 뼈대엔 머리줄 없음')
    assert.equal(view.container.querySelector('.skeleton-sr')?.textContent, '불러오는 중')
  } finally {
    await view.cleanup()
  }
})

test('PageSkeleton: 마이페이지 — 진짜 머리줄 + 개인정보 카드 틀 + 바로가기 6칸 + 목록 3줄, 메뉴 버튼 동작', async () => {
  let opened = 0
  const view = await render(React.createElement(PageSkeleton, { path: '/app/me/', onOpenMenu: () => { opened += 1 } }))
  try {
    assert.ok(view.container.querySelector('.page-skeleton[data-shape="me"]'))
    assert.equal(view.container.querySelector('.settings-title')?.textContent, '마이페이지')
    assert.equal(view.container.querySelectorAll('.skeleton-profile').length, 1)
    assert.equal(view.container.querySelectorAll('.skeleton-shortcut').length, 6)
    assert.equal(view.container.querySelectorAll('.skeleton-list-row').length, 3)
    assert.equal(view.container.querySelectorAll('.skeleton-group').length, 0)
    const menu = view.container.querySelector('.top-menu-btn')
    await act(async () => { menu?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    assert.equal(opened, 1)
  } finally {
    await view.cleanup()
  }
})

test('PageSkeleton: 매출 — 진짜 머리줄 + 위쪽 카드 틀 + 요약 카드 틀 2', async () => {
  const view = await render(React.createElement(PageSkeleton, { path: '/app/revenue' }))
  try {
    assert.ok(view.container.querySelector('.page-skeleton[data-shape="revenue"]'))
    assert.equal(view.container.querySelector('.settings-title')?.textContent, '매출')
    assert.equal(view.container.querySelectorAll('.skeleton-revenue-top').length, 1)
    assert.equal(view.container.querySelectorAll('.skeleton-revenue-top .skeleton-tab').length, 2)
    assert.equal(view.container.querySelectorAll('.skeleton-summary').length, 2)
  } finally {
    await view.cleanup()
  }
})

test('PageSkeleton: 다른 화면 주소는 공용 모양', async () => {
  const view = await render(React.createElement(PageSkeleton, { path: '/app/cars' }))
  try {
    assert.ok(view.container.querySelector('.page-skeleton[data-shape="common"]'))
    assert.equal(view.container.querySelectorAll('.skeleton-group').length, 3)
  } finally {
    await view.cleanup()
  }
})
