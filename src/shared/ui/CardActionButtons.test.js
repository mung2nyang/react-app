// 로드맵 48 — 카드 안 수정·삭제 버튼은 44px, 거래처 카드 버튼 사이 8px, 거래처 이름 줄은 버튼 자리만큼 비켜 줌.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** @param {string} path */
function css(path) {
  return readFileSync(join(src, path), 'utf8')
}

/**
 * @param {string} text
 * @param {string} selector 규칙 맨 앞 선택자(여러 줄 선택자면 마지막 줄)
 */
function rule(text, selector) {
  const start = text.indexOf(`${selector} {`)
  assert.ok(start >= 0, `${selector} 규칙을 찾아야 한다`)
  return text.slice(start, text.indexOf('}', start))
}

test('거래처·차량 카드·유지비 기록 버튼 44px, 버튼 사이 8px', () => {
  const text = css('shared/styles/management-common.css')
  const size = rule(text, '.management-record-actions .action-icon-btn')
  assert.match(size, /width:\s*44px/)
  assert.match(size, /height:\s*44px/)
  assert.match(rule(text, '.car-action-btns'), /gap:\s*8px/)
})

test('하루 화면 운행·지출 카드 버튼 44px', () => {
  const size = rule(css('components/day-log/day-log-shell.css'), '.work-log-page .maint-fuel-actions .action-icon-btn')
  assert.match(size, /width:\s*44px/)
  assert.match(size, /height:\s*44px/)
})

test('거래처 카드 이름 줄은 버튼 자리(44×2+8)만큼 비켜 주고, 칩 줄 없으면 높이 44px', () => {
  const text = css('components/clients/client-management.css')
  assert.match(text, /\.client-list-card \.client-card-badges \{ padding-right: 100px; \}/)
  assert.match(text, /\.client-card-title:not\(:has\(\+ \.client-card-badges\)\) \{ min-height: 44px;/)
})
