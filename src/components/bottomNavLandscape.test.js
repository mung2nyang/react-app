// 로드맵 54 — 눕힌 낮은 화면에서만 아래 메뉴를 납작하게(여백 0·그림 18px), 그림 위·글자 아래 배치와 누르는 칸 44px는 그대로.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'bottom-nav.css'), 'utf8')
const MEDIA = '@media (orientation: landscape) and (max-height: 500px)'

test('눕힌 낮은 화면 규칙: 여백 0·그림 18px, 가로 배치로 바꾸지 않음', () => {
  const start = css.indexOf(MEDIA)
  assert.ok(start >= 0, '눕힌 낮은 화면 전용 규칙이 있어야 한다')
  const block = css.slice(start)
  assert.match(block, /\.bottom-nav-bar\s*\{[^}]*padding:\s*0/)
  assert.match(block, /\.nav-item svg\s*\{[^}]*width:\s*18px[^}]*height:\s*18px/)
  assert.equal(/flex-direction:\s*row/.test(block), false, '그림 위·글자 아래 그대로')
})

test('기본 규칙: 버튼 누르는 칸 44px·세로 배치 그대로', () => {
  const base = css.slice(0, css.indexOf(MEDIA) >= 0 ? css.indexOf(MEDIA) : css.length)
  assert.match(base, /\.nav-item\s*\{[^}]*min-height:\s*44px[^}]*flex-direction:\s*column/)
})
