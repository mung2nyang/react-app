// @ts-check
// 구글 로그인 G-2 — 내 profiles 행이 없을 때만(조회 성공 + 행 없음) 기본 정보 화면으로. 조회 실패는 지금처럼 홈.
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { isProfileRowMissing } = await import('./boot.js')

beforeEach(() => { resetHandlers() })

test('행이 없으면(조회 성공, data 없음) 기본 정보 화면이 필요하다', async () => {
  handlers.profiles = { select: () => ({ data: null, error: null }) }
  assert.equal(await isProfileRowMissing('google-user'), true)
})

test('행이 있으면 필요 없다(전화번호 가입자·기본 정보를 마친 구글 계정)', async () => {
  handlers.profiles = { select: () => ({ data: { id: 'phone-user' }, error: null }) }
  assert.equal(await isProfileRowMissing('phone-user'), false)
})

test('조회가 실패하면 행이 없다고 단정하지 않는다(지금처럼 홈)', async () => {
  handlers.profiles = { select: () => ({ data: null, error: { message: '네트워크 오류' } }) }
  assert.equal(await isProfileRowMissing('any-user'), false)
})
