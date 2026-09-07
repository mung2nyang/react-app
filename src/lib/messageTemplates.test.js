// @ts-check
import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'

/** setupDom(jsdom) 없이 localStorage만 최소 구현 — 이 모듈은 Storage API만 씀. */
function installMemoryLocalStorage() {
  /** @type {Map<string, string>} */
  const store = new Map()
  const storage = {
    get length() { return store.size },
    clear() { store.clear() },
    /** @param {string} key */
    getItem(key) { return store.has(key) ? /** @type {string} */ (store.get(key)) : null },
    /** @param {number} index */
    key(index) { return [...store.keys()][index] ?? null },
    /** @param {string} key */
    removeItem(key) { store.delete(key) },
    /**
     * @param {string} key
     * @param {string} value
     */
    setItem(key, value) { store.set(String(key), String(value)) },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
}

installMemoryLocalStorage()

const {
  getDefaultMessageTemplatePatterns,
  getDefaultReportShareMessagePattern,
  getMessageTemplatePatterns,
  getReportShareMessagePattern,
  resetMessageTemplateSettings,
  saveMessageTemplateSettings,
} = await import('./messageTemplates.js')

describe('messageTemplates — 문자 문구 localStorage 읽기/쓰기', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('저장된 값 없으면 기본값 반환', () => {
    assert.deepEqual(getMessageTemplatePatterns(), getDefaultMessageTemplatePatterns())
    assert.equal(getReportShareMessagePattern(), getDefaultReportShareMessagePattern())
  })

  test('save 후 get이 저장한 값·순서를 반환', () => {
    /** @type {[string, string, string]} */
    const patterns = ['미수 커스텀', '입금 커스텀', '완료 커스텀']
    const report = '내역서 커스텀 {거래처}'
    saveMessageTemplateSettings(patterns, report)
    assert.deepEqual(getMessageTemplatePatterns(), patterns)
    assert.equal(getReportShareMessagePattern(), report)
  })

  test('localStorage.getItem 예외 시 기본값 폴백', () => {
    saveMessageTemplateSettings(['a', 'b', 'c'], 'report')
    const spy = mock.method(localStorage, 'getItem', () => {
      throw new Error('quota or blocked')
    })
    try {
      assert.deepEqual(getMessageTemplatePatterns(), getDefaultMessageTemplatePatterns())
      assert.equal(getReportShareMessagePattern(), getDefaultReportShareMessagePattern())
    } finally {
      spy.mock.restore()
    }
  })

  test('배열 길이 불일치·JSON 파싱 실패 시 기본값 폴백', () => {
    localStorage.setItem('messageTemplateCustomBodies', JSON.stringify(['하나만']))
    assert.deepEqual(getMessageTemplatePatterns(), getDefaultMessageTemplatePatterns())

    localStorage.setItem('messageTemplateCustomBodies', '{not-json')
    assert.deepEqual(getMessageTemplatePatterns(), getDefaultMessageTemplatePatterns())
  })

  test('reset 후 다시 기본값', () => {
    saveMessageTemplateSettings(['a', 'b', 'c'], 'report custom')
    resetMessageTemplateSettings()
    assert.deepEqual(getMessageTemplatePatterns(), getDefaultMessageTemplatePatterns())
    assert.equal(getReportShareMessagePattern(), getDefaultReportShareMessagePattern())
  })
})
