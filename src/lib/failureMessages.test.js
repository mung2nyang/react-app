// @ts-check
// 로드맵 56-A — 원인을 아는 실패 문구 3가지와, 서버 저장이면 ①·기기 저장이면 ②.
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { SERVER_SAVE_FAIL, DEVICE_SAVE_FAIL, SESSION_CHANGED_FAIL, saveFailMessage } = await import('./failureMessages.js')

test('문구 3가지(보리 확정 문구 표)', () => {
  assert.equal(SERVER_SAVE_FAIL, '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.')
  assert.equal(DEVICE_SAVE_FAIL, '저장에 실패했습니다. 휴대폰 저장 공간을 확인해 주세요.')
  assert.equal(SESSION_CHANGED_FAIL, '로그인 정보가 바뀌어 저장하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.')
})

test('서버에 저장하다 실패하면 네트워크, 기기에 저장하다 실패하면 저장 공간', () => {
  assert.equal(saveFailMessage(true), SERVER_SAVE_FAIL)
  assert.equal(saveFailMessage(false), DEVICE_SAVE_FAIL)
})

test('기기 저장 실패 상수·로그인 바뀜 안내가 같은 문구를 쓴다', async () => {
  const { STORAGE_FAIL_TOAST } = await import('./outboxCommit.js')
  assert.equal(STORAGE_FAIL_TOAST, DEVICE_SAVE_FAIL)
  const source = (await import('node:fs')).readFileSync(new URL('./cloudSession.js', import.meta.url), 'utf8')
  assert.equal(source.includes('화면을 새로고침한 뒤 다시 시도해 주세요.'), false, '문구를 직접 적지 않고 공용 상수를 쓴다')
  assert.ok(source.includes('SESSION_CHANGED_FAIL'))
})

test('공용 파일 밖에서 ①·③ 문구를 글자로 적은 곳이 없다(로드맵 56-B-1)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const phrases = ['저장에 실패했습니다. 네트워크 상태를 확인해 주세요.', '로그인 정보가 바뀌어 저장하지 못했습니다.']
  /** @type {Array<string>} */
  const found = []
  /** @param {string} dir */
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(js|jsx)$/.test(name) || /\.test\./.test(name) || name === 'failureMessages.js') continue
      const text = readFileSync(full, 'utf8')
      phrases.forEach((phrase) => { if (text.includes(phrase)) found.push(`${full}: ${phrase.slice(0, 12)}`) })
    }
  }
  walk(root)
  assert.deepEqual(found, [])
})
