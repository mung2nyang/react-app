// 로드맵 10-A: 사이드메뉴는 지금 테마의 배너 그림 하나만 넣는다(숨긴 그림도 브라우저가 내려받으므로 둘 다 넣지 않음).
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
const { default: SideMenu } = await import('./SideMenu.jsx')

/** @param {'dark'|'light'} theme */
async function bannerSources(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(SideMenu, { open: true, onClose: () => {}, onSelect: () => {} })) })
  const sources = [...container.querySelectorAll('.side-menu-header img')].map((img) => img.getAttribute('src'))
  await act(async () => { root.unmount() })
  container.remove()
  document.documentElement.removeAttribute('data-theme')
  return sources
}

test('라이트 테마: 라이트 배너 하나만', async () => {
  const sources = await bannerSources('light')
  assert.equal(sources.length, 1)
  assert.match(String(sources[0]), /banner_image_Light\.png$/)
})

test('다크 테마: 다크 배너 하나만', async () => {
  const sources = await bannerSources('dark')
  assert.equal(sources.length, 1)
  assert.match(String(sources[0]), /banner_image_dark\.png$/)
})
