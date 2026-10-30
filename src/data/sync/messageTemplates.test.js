// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const {
  fillReportShareMessagePattern,
  getDefaultMessageTemplatePatterns,
  getDefaultReportShareMessagePattern,
  getMessageTemplatePatterns,
  getReportShareMessagePattern,
} = await import('./messageTemplates.ts')

describe('messageTemplates — 계정 설정의 문자 문구 읽기', () => {
  test('설정에 문구가 없으면 기본 문구', () => {
    assert.deepEqual(getMessageTemplatePatterns({}), getDefaultMessageTemplatePatterns())
    assert.equal(getReportShareMessagePattern({}), getDefaultReportShareMessagePattern())
  })

  test('설정의 문구를 그 순서 그대로', () => {
    /** @type {[string, string, string]} */
    const patterns = ['미수 커스텀', '입금 커스텀', '완료 커스텀']
    const report = '내역서 커스텀 {거래처}'
    assert.deepEqual(getMessageTemplatePatterns({ messageTemplates: patterns }), patterns)
    assert.equal(getReportShareMessagePattern({ reportShareMessage: report }), report)
  })

  test('한쪽만 바꿨으면 다른 쪽은 기본 문구', () => {
    assert.equal(getReportShareMessagePattern({ messageTemplates: ['a', 'b', 'c'] }), getDefaultReportShareMessagePattern())
    assert.deepEqual(getMessageTemplatePatterns({ reportShareMessage: '내역' }), getDefaultMessageTemplatePatterns())
  })

  test('fillReportShareMessagePattern: {거래처} 치환·빈값 폴백', () => {
    assert.equal(
      fillReportShareMessagePattern('안녕하세요, {거래처} 담당자님.', '한진'),
      '안녕하세요, 한진 담당자님.',
    )
    assert.equal(
      fillReportShareMessagePattern('내역서입니다. {거래처}', ''),
      '내역서입니다. 거래처',
    )
    assert.equal(
      fillReportShareMessagePattern('기본 {거래처}'),
      '기본 거래처',
    )
  })
})
