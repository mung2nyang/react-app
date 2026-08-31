import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))

test('일지 인라인 호스트는 max-height:0 + is-open 트릭을 쓰지 않는다', () => {
  const calendar = readFileSync(join(here, '../../main-calendar.css'), 'utf8')
  assert.equal(/call-detail-inline-host[\s\S]{0,120}max-height:\s*0/.test(calendar), false)
  assert.equal(/maint-fuel-inline-host[\s\S]{0,120}max-height:\s*0/.test(calendar), false)
  const dayLog = readFileSync(join(here, 'day-log.css'), 'utf8')
  assert.match(dayLog, /\.inline-sheet\.is-visible/)
  assert.match(dayLog, /grid-template-rows:\s*min-content/)
  assert.match(dayLog, /min-height:\s*min-content/)
  assert.match(dayLog, /scroll-padding-bottom/)
  assert.equal(/inline-sheet-panel[\s\S]{0,180}max-height:\s*calc\(100dvh/.test(dayLog), false)
  assert.equal(dayLog.includes('scrollIntoView'), false)
})

test('일지 인라인 시트의 취소/저장 액션 바는 sticky/fixed가 아니라 일반 문서 흐름이다', () => {
  // 재감사(sticky 제거) — position: sticky의 bottom이 스크롤 포트(.work-log-page)
  // 하단 기준으로 붙어, 시트가 열리는 순간 취소/저장이 폼 바닥이 아니라 화면
  // 위쪽에 먼저 뜨는 문제가 있었다. fixed로 화면에 띄우는 방식도 금지(과거 롤백된
  // 방식) — 이 두 selector엔 position: sticky/fixed가 전혀 없어야 한다.
  const dayLog = readFileSync(join(here, 'day-log.css'), 'utf8')
  const actionsBlockMatch = dayLog.match(/\.call-detail-form-actions,[\s\S]*?\.modal-btns\s*\{([\s\S]*?)\}/)
  assert.ok(actionsBlockMatch, '취소/저장 액션 바 규칙을 day-log.css에서 찾지 못했다')
  const actionsBlock = actionsBlockMatch[1]
  assert.equal(/position:\s*sticky/.test(actionsBlock), false)
  assert.equal(/position:\s*fixed/.test(actionsBlock), false)
})

test('InlineSheet는 scrollIntoView 등 직접 DOM 조작을 하지 않는다', () => {
  const source = readFileSync(join(here, 'InlineSheet.jsx'), 'utf8')
  assert.equal(source.includes('scrollIntoView'), false)
  assert.equal(source.includes('useLayoutEffect'), false)
})
