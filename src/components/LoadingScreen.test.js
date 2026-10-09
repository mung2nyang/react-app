// 10-L: 로딩 표시 "🚚 운행일지 ● ● ●"(index.html과 같은 클래스), 테마를 바꾸면 다음 첫 로딩 화면 색용 lastTheme을 기억.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: LoadingScreen } = await import('./LoadingScreen.jsx')
const { applyTheme } = await import('../lib/practiceSettings.js')

/** @param {boolean} inline */
async function render(inline) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(LoadingScreen, { inline })) })
  const box = container.querySelector('.boot-loading')
  const info = {
    className: box?.className,
    name: container.querySelector('.boot-loading-name')?.textContent,
    dots: container.querySelectorAll('.boot-loading-dots span').length,
    banner: container.querySelector('.boot-loading img')?.getAttribute('src'),
  }
  await act(async () => { root.unmount() })
  container.remove()
  return info
}

test('배너 + "운행일지" + 점 세 개, 화면 안(inline)용은 따로 표시', async () => {
  const full = await render(false)
  assert.equal(full.className, 'boot-loading')
  assert.equal(full.name, '운행일지')
  assert.equal(full.dots, 3)
  assert.match(String(full.banner), /banner_image\.png$/)
  assert.equal((await render(true)).className, 'boot-loading boot-loading-inline')
})

test('index.html도 같은 모양(클래스)·탭 제목 "운행일지"·앱 파일 전 테마 스크립트', () => {
  const html = readFileSync('./index.html', 'utf8')
  assert.match(html, /<title>운행일지<\/title>/)
  assert.match(html, /class="boot-loading"/)
  assert.match(html, /localStorage\.getItem\('lastTheme'\)/)
  assert.match(html, /prefers-color-scheme: dark/)
})

test('applyTheme은 화면 테마와 함께 lastTheme을 기억한다', () => {
  applyTheme('dark')
  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark')
  assert.equal(localStorage.getItem('lastTheme'), 'dark')
  applyTheme('light')
  assert.equal(document.documentElement.getAttribute('data-theme'), null)
  assert.equal(localStorage.getItem('lastTheme'), 'light')
  localStorage.removeItem('lastTheme')
})
