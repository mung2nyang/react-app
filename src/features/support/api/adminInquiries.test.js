// @ts-check
// 로드맵 23-B — 관리자 문의 목록 좁히기·답변 저장(서버 함수 0025, 오류 코드별 문구).
import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../../../data/cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { fetchAdminInquiries, requestAdminAnswerSave } = await import('./adminInquiries.ts')
const { beginSessionEpoch, endCloudSession } = await import('../../../data/cloud/cloudSession.ts')
const { setHydration } = await import('../../../data/store/app-store.ts')
const { SERVER_SAVE_FAIL, SESSION_CHANGED_FAIL } = await import('../../../shared/utils/failureMessages.js')

beforeEach(() => {
  resetHandlers()
  beginSessionEpoch('admin-1', 'admin-1')
  setHydration({ status: 'ready', userId: 'admin-1', ownerKey: 'admin-1' })
})

/** @param {{ code?: string, message?: string }} error */
function failWith(error) {
  handlers.rpc = { admin_answer_support_inquiry: () => ({ data: null, error }) }
}

describe('fetchAdminInquiries', () => {
  test('id 없는 줄·배열 아닌 줄은 버리고, 글자 아닌 칸은 빈 값', async () => {
    /** @type {Array<import('../../../domain/jsonTypes.ts').JsonValue>} */
    const data = [
      { id: 'q-1', type: '문의', title: '제목', content: '내용', status: 'open', answer: null, answered_at: null, created_at: '2026-10-22T01:00:00Z', user_name: '홍길동' },
      { id: 7, title: '숫자 id' },
      { title: 'id 없음' },
      'x',
      null,
      { id: 'q-2', type: 3, title: null, user_name: null },
    ]
    handlers.rpc = { admin_list_support_inquiries: () => ({ data, error: null }) }
    const rows = await fetchAdminInquiries()
    assert.deepEqual(rows.map((row) => row.id), ['q-1', 'q-2'])
    assert.equal(rows[0].userName, '홍길동')
    assert.equal(rows[0].answer, '')
    assert.deepEqual(rows[1], { id: 'q-2', type: '', title: '', content: '', answer: '', answeredAt: '', createdAt: '', userName: '' })
    assert.equal(countOf('rpc', 'admin_list_support_inquiries'), 1)
  })

  test('서버 오류면 던진다', async () => {
    handlers.rpc = { admin_list_support_inquiries: () => ({ data: null, error: { message: '관리자만 볼 수 있습니다.' } }) }
    await assert.rejects(fetchAdminInquiries())
  })
})

describe('requestAdminAnswerSave', () => {
  test('성공: { inquiry_id, answer_text }로 1번, 앞뒤 공백은 뺀다', async () => {
    /** @type {Array<import('../../../data/store/atomicPersist.ts').JsonValue|undefined>} */
    const calls = []
    handlers.rpc = { admin_answer_support_inquiry: (args) => { calls.push(args); return { data: null, error: null } } }
    const result = await requestAdminAnswerSave('q-1', '  답변입니다  ')
    assert.deepEqual(result, { ok: true, toast: '답변을 저장했습니다.', reload: true })
    assert.deepEqual(calls, [{ inquiry_id: 'q-1', answer_text: '답변입니다' }])
  })

  test('공백뿐이면 서버를 안 부른다', async () => {
    const result = await requestAdminAnswerSave('q-1', '   \n ')
    assert.equal(result.ok, false)
    assert.equal(countOf('rpc', 'admin_answer_support_inquiry'), 0)
  })

  test('오류 코드마다 문구: 42501 관리자 아님, P0002 없는 문의(+다시 불러오기), 그 밖 저장 실패', async (t) => {
    t.mock.method(console, 'error', () => {})
    failWith({ code: '42501', message: 'x' })
    assert.deepEqual(await requestAdminAnswerSave('q-1', '답'), { ok: false, toast: '관리자만 답변할 수 있습니다.', reload: false })
    failWith({ code: 'P0002', message: 'x' })
    assert.deepEqual(await requestAdminAnswerSave('q-1', '답'), { ok: false, toast: '없는 문의입니다. 목록을 다시 불러옵니다.', reload: true })
    failWith({ code: '08006', message: 'x' })
    assert.deepEqual(await requestAdminAnswerSave('q-1', '답'), { ok: false, toast: SERVER_SAVE_FAIL, reload: false })
  })

  test('저장 중 세션이 바뀌면 세션 문구', async () => {
    handlers.rpc = {
      admin_answer_support_inquiry: () => {
        endCloudSession()
        return { data: null, error: null }
      },
    }
    const result = await requestAdminAnswerSave('q-1', '답')
    assert.deepEqual(result, { ok: false, toast: SESSION_CHANGED_FAIL, reload: false })
  })

  test('로그인 세션이 없으면 서버를 안 부른다', async () => {
    endCloudSession()
    const result = await requestAdminAnswerSave('q-1', '답')
    assert.equal(result.ok, false)
    assert.equal(countOf('rpc', 'admin_answer_support_inquiry'), 0)
  })
})
