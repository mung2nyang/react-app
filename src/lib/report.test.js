// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildReportFileName } from './report.js'

describe('buildReportFileName', () => {
  test('연·월 조합을 원본 패턴으로 만든다', () => {
    assert.equal(buildReportFileName(2026, 8), '2026년_9월_운송비내역서.pdf')
    assert.equal(buildReportFileName(2025, 11), '2025년_12월_운송비내역서.pdf')
  })

  test('한 자리 월은 0으로 패딩하지 않는다(원본과 동일)', () => {
    assert.equal(buildReportFileName(2026, 0), '2026년_1월_운송비내역서.pdf')
    assert.equal(buildReportFileName(2024, 4), '2024년_5월_운송비내역서.pdf')
  })
})
