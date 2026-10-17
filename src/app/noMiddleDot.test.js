// 로드맵 87 — 화면 글자에 가운뎃점(·)을 쓰지 않는다(쉼표·"와/과"·빗금으로). 주석·개발자용 console 기록은 화면에 안 보여 뺀다.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/** @param {string} dir @returns {Array<string>} */
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(js|jsx)$/.test(name) && !name.endsWith('.test.js') ? [path] : []
  })
}

/** 주석을 지운다 — 블록 주석, 줄 앞이나 공백 뒤의 // 주석(주소 속 //는 남김). @param {string} text */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .filter((line) => !line.includes('console.'))
    .join('\n')
}

test('화면 글자(src·앱 설치 설명)에 가운뎃점(·)이 없다', () => {
  /** @type {Array<string>} */
  const found = []
  for (const file of [...sourceFiles('src'), 'public/manifest.webmanifest']) {
    const raw = readFileSync(file, 'utf8')
    const text = file.endsWith('.webmanifest') ? raw : stripComments(raw)
    for (const line of text.split(/\r?\n/)) if (line.includes('·')) found.push(`${file}: ${line.trim()}`)
  }
  assert.deepEqual(found, [])
})
