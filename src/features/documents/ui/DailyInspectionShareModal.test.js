// 로드맵 58-C — 일상점검표 보내기 창: 모양·문구, 카카오톡 공유 값, 공유 못 하는 휴대폰 안내, 문자용 저장.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { default: DailyInspectionShareModal } = await import('./DailyInspectionShareModal.jsx')

const fakeFile = new File(['fake'], '일상점검표.pdf', { type: 'application/pdf' })

/** @param {((data: { files: Array<File>, title: string, text: string }) => Promise<void>)|undefined} value */
function setShare(value) {
  Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value })
}

async function mount() {
  /** @type {Array<string>} */
  const toasts = []
  /** @type {Array<string>} */
  const built = []
  let closed = 0
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(DailyInspectionShareModal, {
      month: 9,
      buildFile: async (/** @type {'pdf'|'image'} */ type) => { built.push(type); return fakeFile },
      onClose: () => { closed += 1 },
      showToast: (/** @type {string} */ message) => { toasts.push(message) },
    }))
  })
  return {
    container,
    toasts,
    built,
    closed: () => closed,
    async press(/** @type {string} */ channel, /** @type {string} */ label) {
      const section = [...container.querySelectorAll('.report-share-channel')].find((el) => el.querySelector('strong')?.textContent === channel)
      const button = [...(section?.querySelectorAll('button') || [])].find((el) => el.textContent === label)
      assert.ok(button, `${channel} ${label}`)
      await act(async () => { button.click(); await Promise.resolve(); await Promise.resolve() })
    },
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('모양: 제목·안내·두 칸·단추 4개', async () => {
  const view = await mount()
  try {
    const text = view.container.textContent || ''
    for (const part of ['점검표 보내기', '보내는 방법이나 파일 형식을 선택해 주세요.', '카카오톡으로 보내기', '파일과 안내 문구를 함께 공유합니다.', '문자로 보내기', '파일을 저장하고 안내 문구로 문자 앱을 엽니다. 받는 사람은 직접 골라 주세요.']) {
      assert.ok(text.includes(part), part)
    }
    assert.equal(view.container.querySelectorAll('.report-share-format-buttons button').length, 4)
  } finally { await view.cleanup() }
})

test('카카오톡: 창 닫고 준비 안내, 이미지 파일·제목 "일상점검표"·문구로 공유', async () => {
  /** @type {Array<{ files: Array<File>, title: string, text: string }>} */
  const shared = []
  setShare(async (/** @type {{ files: Array<File>, title: string, text: string }} */ data) => { shared.push(data) })
  const view = await mount()
  try {
    await view.press('카카오톡으로 보내기', '이미지로 보내기')
    assert.equal(view.closed(), 1)
    assert.deepEqual(view.built, ['image'])
    assert.ok(view.toasts.includes('카카오톡으로 보낼 이미지를 준비하고 있습니다.'))
    assert.equal(shared.length, 1)
    assert.equal(shared[0].title, '일상점검표')
    assert.equal(shared[0].text, '안녕하세요. 10월 일상점검표입니다. 확인 부탁드립니다.')
    assert.deepEqual(shared[0].files, [fakeFile])
  } finally { setShare(undefined); await view.cleanup() }
})

test('카카오톡: 공유 못 하는 휴대폰이면 안내', async () => {
  setShare(undefined)
  const view = await mount()
  try {
    await view.press('카카오톡으로 보내기', 'PDF로 보내기')
    assert.equal(view.closed(), 1)
    assert.ok(view.toasts.includes('이 기기에서는 파일 공유를 지원하지 않습니다.'))
  } finally { await view.cleanup() }
})

test('카카오톡: 공유 실패면 실패 안내, 사용자가 취소하면 안내 없음', async () => {
  setShare(async () => { throw new Error('boom') })
  const failed = await mount()
  try {
    await failed.press('카카오톡으로 보내기', 'PDF로 보내기')
    assert.ok(failed.toasts.includes('카카오톡 파일 공유에 실패했습니다.'))
  } finally { await failed.cleanup() }
  setShare(async () => { const error = new Error('cancel'); error.name = 'AbortError'; throw error })
  const aborted = await mount()
  try {
    await aborted.press('카카오톡으로 보내기', 'PDF로 보내기')
    assert.equal(aborted.toasts.includes('카카오톡 파일 공유에 실패했습니다.'), false)
  } finally { setShare(undefined); await aborted.cleanup() }
})

test('문자: 창 닫고 저장 안내, 파일 만들어 내려받기', async () => {
  const view = await mount()
  const originalCreate = URL.createObjectURL
  /** @type {Array<Blob>} */
  const urls = []
  URL.createObjectURL = (/** @type {Blob} */ blob) => { urls.push(blob); return 'blob:fake' }
  try {
    await view.press('문자로 보내기', 'PDF로 보내기')
    assert.equal(view.closed(), 1)
    assert.deepEqual(view.built, ['pdf'])
    assert.ok(view.toasts.includes('문자로 보낼 PDF를 저장하고 있습니다.'))
    assert.deepEqual(urls, [fakeFile])
  } finally { URL.createObjectURL = originalCreate; await view.cleanup() }
})
