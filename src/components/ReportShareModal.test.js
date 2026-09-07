// @ts-check
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'
import {
  fillReportShareMessagePattern,
  getDefaultMessageTemplatePatterns,
  saveMessageTemplateSettings,
} from '../lib/messageTemplates.js'

const reactActEnv = /** @type {{ IS_REACT_ACT_ENVIRONMENT?: boolean }} */ (globalThis)
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true

const fakeFile = new File(['fake'], 'report.pdf', { type: 'application/pdf' })

mock.module('../lib/reportExport.js', {
  namedExports: {
    createReportImageFile: async () => fakeFile,
    createReportPdfFile: async () => fakeFile,
  },
})

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const {
  buildReportSmsUrl,
  default: ReportShareModal,
} = await import('./ReportShareModal.jsx')

/**
 * @param {Object} [props]
 */
function mountModal(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const exportEl = document.createElement('div')
  const exportRef = { current: exportEl }
  return { container, root, exportRef, props }
}

/**
 * @param {ParentNode} root
 * @param {string} sectionTitle
 * @param {string} buttonLabel
 */
function findChannelButton(root, sectionTitle, buttonLabel) {
  const sections = [...root.querySelectorAll('.report-share-channel')]
  const section = sections.find((el) => el.querySelector('strong')?.textContent === sectionTitle)
  assert.ok(section, `${sectionTitle} 섹션`)
  return /** @type {HTMLButtonElement|undefined} */ (
    [...section.querySelectorAll('button')].find((btn) => btn.textContent?.includes(buttonLabel))
  )
}

describe('ReportShareModal — 카카오톡/문자 공유', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('렌더: 카카오톡/문자 2섹션, PDF·이미지 버튼 4개', async () => {
    const { container, root, exportRef } = mountModal()
    try {
      await act(async () => {
        root.render(React.createElement(ReportShareModal, {
          exportRef,
          viewMode: 'summary',
          clientFilter: 'ALL',
          clients: [],
          year: 2026,
          month: 8,
          onClose: () => {},
        }))
      })
      const channels = container.querySelectorAll('.report-share-channel')
      assert.equal(channels.length, 2)
      assert.equal(channels[0]?.querySelector('strong')?.textContent, '카카오톡으로 보내기')
      assert.equal(channels[1]?.querySelector('strong')?.textContent, '문자로 보내기')
      const buttons = container.querySelectorAll('.report-share-format-buttons button')
      assert.equal(buttons.length, 4)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('SMS: 연락처 없으면 alert 1회·onClose 미호출', async () => {
    let closeCount = 0
    const alertSpy = mock.method(window, 'alert', () => {})
    const { container, root, exportRef } = mountModal()
    try {
      await act(async () => {
        root.render(React.createElement(ReportShareModal, {
          exportRef,
          viewMode: 'summary',
          clientFilter: 'ALL',
          clients: [{ id: 'c1', companyName: '한진', phone: '010-1111-2222' }],
          year: 2026,
          month: 8,
          onClose: () => { closeCount += 1 },
        }))
      })
      const smsPdf = findChannelButton(container, '문자로 보내기', 'PDF로 보내기')
      assert.ok(smsPdf)
      await act(async () => {
        smsPdf.click()
      })
      assert.equal(alertSpy.mock.callCount(), 1)
      assert.equal(
        alertSpy.mock.calls[0]?.arguments[0],
        '특정 거래처의 상세내역을 조회하고, 거래처 연락처가 등록되어 있는지 확인해 주세요.',
      )
      assert.equal(closeCount, 0)
    } finally {
      alertSpy.mock.restore()
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('카카오톡: navigator.share 없으면 onClose + 미지원 토스트', async () => {
    let closeCount = 0
    /** @type {string[]} */
    const toasts = []
    const originalShare = Object.getOwnPropertyDescriptor(Navigator.prototype, 'share')
      || Object.getOwnPropertyDescriptor(navigator, 'share')
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    const { container, root, exportRef } = mountModal()
    try {
      await act(async () => {
        root.render(React.createElement(ReportShareModal, {
          exportRef,
          viewMode: 'summary',
          clientFilter: 'ALL',
          clients: [],
          year: 2026,
          month: 8,
          onClose: () => { closeCount += 1 },
          showToast: (m) => { toasts.push(m) },
        }))
      })
      const kakaoPdf = findChannelButton(container, '카카오톡으로 보내기', 'PDF로 보내기')
      assert.ok(kakaoPdf)
      await act(async () => {
        kakaoPdf.click()
        await Promise.resolve()
        await Promise.resolve()
      })
      assert.equal(closeCount, 1)
      assert.ok(toasts.includes('이 기기에서는 파일 공유를 지원하지 않습니다.'))
    } finally {
      if (originalShare) {
        Object.defineProperty(navigator, 'share', originalShare)
      } else {
        Reflect.deleteProperty(navigator, 'share')
      }
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('카카오톡: 커스텀 내역서 공유 문구가 navigator.share text에 반영', async () => {
    saveMessageTemplateSettings(getDefaultMessageTemplatePatterns(), '커스텀공유 {거래처} 확인요망')
    let closeCount = 0
    /** @type {Array<{ files: Array<File>, title: string, text: string }>} */
    const shareCalls = []
    const originalShare = navigator.share
    const originalCanShare = /** @type {Navigator & { canShare?: Function }} */ (navigator).canShare
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      /** @param {{ files?: Array<File>, title?: string, text?: string }} data */
      value: async (data) => {
        shareCalls.push({
          files: data.files || [],
          title: data.title || '',
          text: data.text || '',
        })
      },
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      writable: true,
      value: () => true,
    })
    const { container, root, exportRef } = mountModal()
    try {
      await act(async () => {
        root.render(React.createElement(ReportShareModal, {
          exportRef,
          viewMode: 'detail',
          clientFilter: '한진',
          clients: [{ id: 'c1', companyName: '한진', phone: '010-1111-2222' }],
          year: 2026,
          month: 8,
          onClose: () => { closeCount += 1 },
          showToast: () => {},
        }))
      })
      const kakaoPdf = findChannelButton(container, '카카오톡으로 보내기', 'PDF로 보내기')
      assert.ok(kakaoPdf)
      await act(async () => {
        kakaoPdf.click()
        await Promise.resolve()
        await Promise.resolve()
      })
      assert.equal(closeCount, 1)
      assert.equal(shareCalls.length, 1)
      const expectedText = fillReportShareMessagePattern('커스텀공유 {거래처} 확인요망', '한진')
      assert.equal(shareCalls[0]?.title, '운송비 내역서')
      assert.equal(shareCalls[0]?.text, expectedText)
      assert.equal(shareCalls[0]?.files?.length, 1)
      assert.equal(shareCalls[0]?.files?.[0], fakeFile)
    } finally {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        writable: true,
        value: originalShare,
      })
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        writable: true,
        value: originalCanShare,
      })
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  test('buildReportSmsUrl: 기본 UA는 ?, iPhone UA는 &', () => {
    const body = '안녕 테스트'
    const defaultUrl = buildReportSmsUrl('01012345678', body)
    assert.equal(defaultUrl, `sms:01012345678?body=${encodeURIComponent(body)}`)

    const originalUa = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get() { return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    })
    try {
      const iphoneUrl = buildReportSmsUrl('01012345678', body)
      assert.equal(iphoneUrl, `sms:01012345678&body=${encodeURIComponent(body)}`)
    } finally {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        get() { return originalUa },
      })
    }
  })
})
