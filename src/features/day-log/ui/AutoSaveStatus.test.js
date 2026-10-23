// 로드맵 109-B 수정 — 저장 표시는 제목 옆 아이콘(저장 중·완료·실패), 화면 읽기 프로그램은 상태를 글로 읽는다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { default: AutoSaveStatus } = await import('./AutoSaveStatus.jsx')

/** @param {'idle'|'pending'|'saved'|'failed'} status */
async function renderStatus(status) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { root.render(React.createElement(AutoSaveStatus, { status })) })
    const box = container.querySelector('.autosave-status')
    return {
      role: box?.getAttribute('role'),
      icon: !!box?.querySelector('svg[aria-hidden="true"]'),
      spoken: box?.querySelector('.sr-only')?.textContent,
      failed: !!box?.classList.contains('autosave-status-failed'),
      check: !!box?.querySelector('polyline'),
    }
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
}

test('저장 중·완료·실패는 아이콘 + 안 보이는 상태 글, 평소엔 아이콘 없음', async () => {
  assert.deepEqual(await renderStatus('pending'), { role: 'status', icon: true, spoken: '저장 중', failed: false, check: false })
  assert.deepEqual(await renderStatus('saved'), { role: 'status', icon: true, spoken: '저장 완료', failed: false, check: true })
  assert.deepEqual(await renderStatus('failed'), { role: 'status', icon: true, spoken: '저장 실패', failed: true, check: false })
  assert.deepEqual(await renderStatus('idle'), { role: 'status', icon: false, spoken: '', failed: false, check: false })
})
