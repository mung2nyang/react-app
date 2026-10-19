// 로드맵 52 — 밝은 화면 달력 배지 글씨·토요일·일요일 색은 바탕과 대비 4.5 이상(WCAG AA 보통 글씨).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'variables.css'), 'utf8')
const light = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))

/** @param {string} name */
function token(name) {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(light)
  assert.ok(match, `--${name} 값을 찾아야 한다`)
  return match[1]
}

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('밝은 화면 달력 배지 글씨 / 배지 바탕 대비 4.5 이상', () => {
  assert.ok(contrast(token('work-badge-text'), token('work-badge-bg')) >= 4.5)
})

test('밝은 화면 토요일·일요일 글자 / 흰 카드 대비 4.5 이상', () => {
  const card = token('card-bg')
  assert.ok(contrast(token('saturday-color'), card) >= 4.5)
  assert.ok(contrast(token('sunday-color'), card) >= 4.5)
})
