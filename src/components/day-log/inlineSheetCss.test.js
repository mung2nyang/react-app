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
  assert.match(dayLog, /position:\s*sticky/)
  assert.match(dayLog, /scroll-padding-bottom/)
  assert.equal(/inline-sheet-panel[\s\S]{0,180}max-height:\s*calc\(100dvh/.test(dayLog), false)
  assert.equal(dayLog.includes('scrollIntoView'), false)
})

test('InlineSheet는 scrollIntoView 등 직접 DOM 조작을 하지 않는다', () => {
  const source = readFileSync(join(here, 'InlineSheet.jsx'), 'utf8')
  assert.equal(source.includes('scrollIntoView'), false)
  assert.equal(source.includes('useLayoutEffect'), false)
})
