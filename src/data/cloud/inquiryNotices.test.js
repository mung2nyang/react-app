// @ts-check
// 로드맵 23-C — 알림용 문의 읽기: 답변 온 내 문의만, 관리자 답변 대기 요약, 이상한 줄 버림.
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
mock.module('./supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { fetchMyAnsweredInquiries, fetchPendingInquirySummary } = await import('./inquiryNotices.ts')

beforeEach(() => { resetHandlers() })

test('내 문의: 답변 있는 줄만, 본인 id로 묻고, 이상한 줄은 버린다', async () => {
  /** @type {Array<import('../../domain/jsonTypes.ts').JsonValue>} */
  const asked = []
  /** @type {Array<import('../../domain/jsonTypes.ts').JsonValue>} */
  const data = [
    { id: 'q-1', title: '첫 문의', answer: '답', answered_at: '2026-10-22T03:00:00Z' },
    { id: 'q-2', title: '대기', answer: null, answered_at: null },
    { id: 'q-3', title: '공백 답', answer: '   ', answered_at: null },
    { id: 9, title: '숫자 id', answer: '답' },
    'x',
    null,
    { id: 'q-4', title: null, answer: '답', answered_at: null },
  ]
  handlers.support_inquiries = { select: (filters) => { if (filters && typeof filters === 'object' && !Array.isArray(filters)) asked.push(Reflect.get(filters, 'user_id')); return { data, error: null } } }
  const rows = await fetchMyAnsweredInquiries('u-1')
  assert.deepEqual(rows, [
    { id: 'q-1', title: '첫 문의', answeredAt: '2026-10-22T03:00:00Z' },
    { id: 'q-4', title: '', answeredAt: '' },
  ])
  assert.deepEqual(asked, ['u-1'])
})

test('내 문의: 서버 오류면 던진다', async () => {
  handlers.support_inquiries = { select: () => ({ data: null, error: { message: 'x' } }) }
  await assert.rejects(fetchMyAnsweredInquiries('u-1'))
})

test('관리자 요약: 대기 건수와 처음 만난(가장 최근) 대기 문의, 0건이면 null', async () => {
  /** @type {Array<import('../../domain/jsonTypes.ts').JsonValue>} */
  let rows = [
    { id: 'n-2', title: '새 문의', answer: null },
    { id: 'n-1', title: '옛 문의', answer: '' },
    { id: 7, title: '숫자 id', answer: null },
    { id: 'a-1', title: '답한 문의', answer: '답' },
  ]
  handlers.rpc = { admin_list_support_inquiries: () => ({ data: rows, error: null }) }
  assert.deepEqual(await fetchPendingInquirySummary(), { count: 2, latestId: 'n-2', latestTitle: '새 문의' })
  rows = [{ id: 'a-1', title: '답한 문의', answer: '답' }]
  assert.equal(await fetchPendingInquirySummary(), null)
})

test('관리자 요약: 서버 오류(관리자 아님 등)면 던진다', async () => {
  handlers.rpc = { admin_list_support_inquiries: () => ({ data: null, error: { message: '관리자만 볼 수 있습니다.' } }) }
  await assert.rejects(fetchPendingInquirySummary())
})
