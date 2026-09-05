// @ts-check
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { fetchMyInquiries, requestSupportInquirySave } = await import('./supportInquiryMutations.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { setHydration } = await import('../store/app-store.js')

/** @param {string} userId @param {string} ownerKey */
function beginReady(userId, ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'ready', userId, ownerKey })
}

describe('requestSupportInquirySave — Step 10 5-2', () => {
  test('userId 없으면 insert를 호출하지 않는다', async () => {
    beginReady('u1', 'u1')
    const before = countOf('support_inquiries', 'insert')
    const result = await requestSupportInquirySave({
      userId: null,
      type: '문의',
      title: '제목',
      content: '내용',
    })
    assert.equal(result.ok, false)
    assert.equal(countOf('support_inquiries', 'insert'), before)
    endCloudSession()
  })

  test('성공 시 support_inquiries insert 1회 + 성공 토스트', async () => {
    beginReady('user-inq-1', 'user-inq-1')
    /** @type {Array<Record<string, unknown>>} */
    const inserted = []
    handlers.support_inquiries = {
      insert: (payload) => {
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          inserted.push(payload)
        }
        return { data: null, error: null }
      },
    }

    const result = await requestSupportInquirySave({
      userId: 'user-inq-1',
      type: '기능 건의',
      title: '야간 알림',
      content: '알림 시간 조정이 필요합니다.',
    })

    assert.equal(result.ok, true)
    assert.equal(result.toast, '문의가 접수되었습니다.')
    assert.equal(countOf('support_inquiries', 'insert'), 1)
    assert.equal(inserted.length, 1)
    assert.deepEqual(inserted[0], {
      user_id: 'user-inq-1',
      type: '기능 건의',
      title: '야간 알림',
      content: '알림 시간 조정이 필요합니다.',
      status: 'open',
    })
    assert.equal('raw' in inserted[0], false)
    endCloudSession()
  })

  test('insert 실패 시 Fail-Fast 토스트', async () => {
    beginReady('user-inq-2', 'user-inq-2')
    handlers.support_inquiries = {
      insert: () => ({ data: null, error: { message: 'network down' } }),
    }

    const result = await requestSupportInquirySave({
      userId: 'user-inq-2',
      type: '오류 신고',
      title: '저장 안 됨',
      content: '저장 버튼이 동작하지 않습니다.',
    })

    assert.equal(result.ok, false)
    assert.equal(result.toast, '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.')
    assert.equal(countOf('support_inquiries', 'insert'), 1)
    endCloudSession()
  })
})

describe('fetchMyInquiries — Step 10 5-3', () => {
  test('성공 시 user_id 필터·최신순 배열을 반환한다', async () => {
    beginReady('user-list-1', 'user-list-1')
    /** @type {Array<Record<string, unknown>>} */
    const filtersSeen = []
    handlers.support_inquiries = {
      select: (filters) => {
        if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
          filtersSeen.push(filters)
        }
        return {
          data: [
            {
              id: 'a1',
              type: '문의',
              title: '최신',
              content: '내용1',
              answer: '답변입니다',
              created_at: '2026-09-05T12:00:00.000Z',
            },
            {
              id: 'a2',
              type: '오류 신고',
              title: '이전',
              content: '내용2',
              answer: null,
              created_at: '2026-09-01T12:00:00.000Z',
            },
          ],
          error: null,
        }
      },
    }

    const rows = await fetchMyInquiries('user-list-1')
    assert.equal(countOf('support_inquiries', 'select'), 1)
    assert.equal(filtersSeen.length, 1)
    assert.equal(filtersSeen[0].user_id, 'user-list-1')
    assert.equal(rows.length, 2)
    assert.equal(rows[0].id, 'a1')
    assert.equal(rows[0].answer, '답변입니다')
    assert.equal(rows[1].id, 'a2')
    assert.equal(rows[1].answer, null)
    endCloudSession()
  })

  test('조회 실패 시 throw한다', async () => {
    beginReady('user-list-2', 'user-list-2')
    handlers.support_inquiries = {
      select: () => ({ data: null, error: { message: 'network down' } }),
    }
    await assert.rejects(() => fetchMyInquiries('user-list-2'), /network down/)
    assert.equal(countOf('support_inquiries', 'select'), 1)
    endCloudSession()
  })

  test('userId 없으면 select를 호출하지 않고 throw한다', async () => {
    beginReady('u1', 'u1')
    const before = countOf('support_inquiries', 'select')
    await assert.rejects(() => fetchMyInquiries(''), /로그인/)
    assert.equal(countOf('support_inquiries', 'select'), before)
    endCloudSession()
  })
})
