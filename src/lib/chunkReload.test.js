// 로드맵 33 — 업데이트 뒤 옛 화면 파일을 못 받으면 한 번 새로고침, 10초 안 두 번째는 안 함.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHUNK_RELOAD_WINDOW_MS, installChunkReload } from './chunkReload.js'

function setup(startAt = 1_000_000) {
  /** @type {Array<(event: Event) => void>} */
  const listeners = []
  const win = {
    reloads: 0,
    addEventListener: (/** @type {string} */ type, /** @type {(event: Event) => void} */ fn) => { if (type === 'vite:preloadError') listeners.push(fn) },
    location: { reload: () => { win.reloads += 1 } },
  }
  /** @type {Map<string, string>} */
  const store = new Map()
  const storage = { getItem: (/** @type {string} */ k) => store.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { store.set(k, v) } }
  let now = startAt
  installChunkReload(win, storage, () => now)
  const fire = () => {
    const event = new Event('vite:preloadError', { cancelable: true })
    listeners.forEach((fn) => fn(event))
    return event.defaultPrevented
  }
  return { win, fire, advance: (/** @type {number} */ ms) => { now += ms } }
}

test('받기 실패 → 새로고침 1번 + 오류 신호를 막음', () => {
  const { win, fire } = setup()
  assert.equal(fire(), true)
  assert.equal(win.reloads, 1)
})

test('10초 안 두 번째 실패 → 새로고침 안 함, 오류는 그대로(안내 화면으로)', () => {
  const { win, fire, advance } = setup()
  fire()
  advance(CHUNK_RELOAD_WINDOW_MS - 1)
  assert.equal(fire(), false)
  assert.equal(win.reloads, 1)
})

test('10초 지나면 다시 1번', () => {
  const { win, fire, advance } = setup()
  fire()
  advance(CHUNK_RELOAD_WINDOW_MS)
  assert.equal(fire(), true)
  assert.equal(win.reloads, 2)
})

test('탭 저장소에 시각을 못 남기면 새로고침 안 함(반복 방지 불가)', () => {
  const listeners = /** @type {Array<(event: Event) => void>} */ ([])
  let reloads = 0
  installChunkReload(
    { addEventListener: (_type, fn) => { listeners.push(fn) }, location: { reload: () => { reloads += 1 } } },
    { getItem: () => null, setItem: () => { throw new Error('저장소 막힘') } },
  )
  const event = new Event('vite:preloadError', { cancelable: true })
  listeners.forEach((fn) => fn(event))
  assert.equal(reloads, 0)
  assert.equal(event.defaultPrevented, false)
})
