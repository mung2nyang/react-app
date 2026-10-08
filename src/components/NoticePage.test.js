// 문구 정리 1: 공지사항 임시 글 삭제 — 공지가 없으면 안내 문구만 보인다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: NoticePage } = await import('./NoticePage.jsx')

test('공지가 없으면 "등록된 공지사항이 없습니다."만 보이고 임시 글·소개 문구는 없다', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(NoticePage)) })
  try {
    assert.equal(container.querySelector('.notice-page .empty-state')?.textContent, '등록된 공지사항이 없습니다.')
    assert.equal(container.querySelectorAll('.faq-item').length, 0)
    assert.ok(!container.textContent?.includes('새로운 소식을 확인하세요'))
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
