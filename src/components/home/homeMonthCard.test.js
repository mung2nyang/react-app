// 로드맵 51 — 홈 "이번 달 정산 합계" 금액은 숫자와 "원"이 한 줄, 자리가 모자라면 "달력에서 보기"만 아래 줄로.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'home.css'), 'utf8')

/** @param {string} selector */
function rule(selector) {
  const start = css.indexOf(`${selector} {`)
  assert.ok(start >= 0, `${selector} 규칙을 찾아야 한다`)
  return css.slice(start, css.indexOf('}', start))
}

test('이번 달 금액은 줄바꿈 막음, 카드는 넘치면 다음 줄로', () => {
  assert.match(rule('.home-month-total'), /white-space:\s*nowrap/)
  assert.match(rule('.home-month-card'), /flex-wrap:\s*wrap/)
})
