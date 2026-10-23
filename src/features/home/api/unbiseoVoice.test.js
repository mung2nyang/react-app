// @ts-check
// 로드맵 24-E2 — 운비서 목소리 함수 부르기: 보내는 값, 받은 소리는 mp3로, 실패·빈 소리는 없음(휴대폰 목소리로 대신).
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { FunctionsHttpError } from '@supabase/supabase-js'

/** @type {Array<{ name: string, options: object }>} */
const calls = []
/** @type {() => Promise<{ data: Blob|string|null, error: Error|null }>} */
let reply = async () => ({ data: null, error: null })

mock.module('../../../data/cloud/supabaseClient.ts', {
  namedExports: {
    supabase: {
      functions: {
        /** @param {string} name @param {object} options */
        invoke: async (name, options) => { calls.push({ name, options }); return reply() },
      },
    },
  },
})

const { requestUnbiseoVoice } = await import('./unbiseoVoice.ts')

beforeEach(() => { calls.length = 0; reply = async () => ({ data: null, error: null }) })

test('답 문장(앞뒤 공백 정리)을 보내고 5초 넘으면 포기, 받은 소리는 mp3로', async () => {
  reply = async () => ({ data: new Blob(['mp3'], { type: 'application/octet-stream' }), error: null })
  const sound = await requestUnbiseoVoice(' 10월 매출은 3,303,011원입니다. ')
  assert.deepEqual(calls, [{ name: 'unbiseo-voice', options: { body: { text: '10월 매출은 3,303,011원입니다.' }, timeout: 5000 } }])
  assert.ok(sound instanceof Blob)
  assert.equal(sound.type, 'audio/mpeg')
  assert.equal(sound.size, 3)
})

test('빈 문장·301자는 부르지 않는다', async () => {
  assert.equal(await requestUnbiseoVoice('  '), null)
  assert.equal(await requestUnbiseoVoice('가'.repeat(301)), null)
  assert.equal(calls.length, 0)
})

test('오류(401·503)·시간 넘김(던짐)·소리 아님·빈 소리는 없음', async () => {
  for (const status of [401, 503]) {
    reply = async () => ({ data: null, error: new FunctionsHttpError(new Response('{}', { status })) })
    assert.equal(await requestUnbiseoVoice('답'), null, String(status))
  }
  reply = async () => { throw new Error('aborted') }
  assert.equal(await requestUnbiseoVoice('답'), null)
  reply = async () => ({ data: '{"error":"x"}', error: null })
  assert.equal(await requestUnbiseoVoice('답'), null)
  reply = async () => ({ data: new Blob([]), error: null })
  assert.equal(await requestUnbiseoVoice('답'), null)
})
