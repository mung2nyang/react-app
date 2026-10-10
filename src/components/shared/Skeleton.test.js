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

test('PageSkeleton: 제목 막대 1 + 얇은 막대 묶음 3 + 상태 알림', async () => {
  const view = await render(React.createElement(PageSkeleton))
  try {
    assert.ok(view.container.querySelector('.page-skeleton[role="status"]'))
    assert.equal(view.container.querySelectorAll('.skeleton-title').length, 1)
    assert.equal(view.container.querySelectorAll('.skeleton-group').length, 3)
    assert.equal(view.container.querySelectorAll('.skeleton-card').length, 0)
    assert.equal(view.container.querySelector('.skeleton-sr')?.textContent, '불러오는 중')
  } finally {
    await view.cleanup()
  }
})
