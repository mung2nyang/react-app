import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  parseClientParam,
  parseMonthParam,
  receivablesDetailPath,
} from '../components/receivables/receivablesPaths.js'

describe('receivablesPaths — 8-C 라우트 헬퍼', () => {
  test('receivablesDetailPath는 client를 encodeURIComponent 한다', () => {
    assert.equal(receivablesDetailPath('한진물류', '2026-05'), '/app/receivables/%ED%95%9C%EC%A7%84%EB%AC%BC%EB%A5%98/2026-05')
  })

  test('parseMonthParam은 YYYY-MM만 허용한다', () => {
    assert.equal(parseMonthParam('2026-05'), '2026-05')
    assert.equal(parseMonthParam('2026-5'), null)
    assert.equal(parseMonthParam('invalid'), null)
  })

  test('parseClientParam은 decodeURIComponent 한다', () => {
    assert.equal(parseClientParam(encodeURIComponent('한진물류')), '한진물류')
    assert.equal(parseClientParam(''), '')
  })

  test('revert-and-confirm-fail: 경로에 setDetail state를 쓰지 않는다', () => {
    const path = receivablesDetailPath('A사', '2026-08')
    assert.match(path, /^\/app\/receivables\//)
    assert.ok(!path.includes('setDetail'))
  })
})
