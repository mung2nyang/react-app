// 로드맵 11번 1단계: 홈 화면 앱(PWA) 설정 파일·아이콘·index.html 연결 — 주소창 없이 열리려면 셋 다 맞아야 한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))

/** PNG 머리글에서 가로·세로 픽셀 @param {string} path */
function pngSize(path) {
  const buf = readFileSync(path)
  assert.equal(buf.toString('hex', 0, 8), '89504e470d0a1a0a', `${path}는 PNG여야 한다`)
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
}

test('설정 파일: 이름·시작 주소·범위·주소창 없는 모드·아이콘(192·512·maskable)', () => {
  assert.equal(manifest.name, '운행 일지')
  assert.equal(manifest.short_name, '운행 일지')
  assert.equal(manifest.start_url, './', '배포 주소(/react-app/) 아래에서 시작')
  assert.equal(manifest.scope, './')
  assert.equal(manifest.display, 'standalone')
  /** @type {Array<{ sizes: string, purpose: string }>} */
  const icons = manifest.icons
  assert.ok(icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'))
  assert.ok(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'))
  assert.ok(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'))
})

test('설정 파일의 아이콘 그림이 실제로 있고 크기가 적힌 것과 같다', () => {
  for (const icon of manifest.icons) {
    assert.equal(pngSize(`public/${icon.src}`), icon.sizes, icon.src)
  }
})

test('index.html이 설정 파일·상태바 색·아이폰 아이콘을 연결한다', () => {
  const html = readFileSync('index.html', 'utf8')
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/)
  assert.match(html, /<meta name="theme-color" content="#f4f7f6" \/>/)
  assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/icon-192\.png" \/>/)
  assert.match(html, /setAttribute\('content', '#121212'\)/, '다크 테마면 상태바 색도 어둡게')
})
