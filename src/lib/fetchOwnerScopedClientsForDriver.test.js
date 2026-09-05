// @ts-check
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { fetchOwnerScopedClientsForDriver } = await import('./fetchOwnerScopedClientsForDriver.js')

describe('fetchOwnerScopedClientsForDriver — 소속기사용 차주 등록 거래처 조회', () => {
  test('clients 테이블에서 company_name을 조회하여 객체 배열로 반환한다 (빈 문자열·공백 제외)', async () => {
    resetHandlers()
    handlers.clients = {
      select: () => ({
        data: [
          { company_name: '대한운송' },
          { company_name: '  ' },
          { company_name: null },
          { company_name: '민국물류 ' },
          { company_name: 123 },
        ],
        error: null,
      }),
    }

    const result = await fetchOwnerScopedClientsForDriver()
    assert.equal(result.length, 2)
    assert.deepEqual(result, [
      { companyName: '대한운송' },
      { companyName: '민국물류' },
    ])
  })

  test('clients 조회가 실패(RLS 차단 또는 에러)해도 에러를 던지지 않고 빈 배열을 반환한다', async () => {
    resetHandlers()
    handlers.clients = {
      select: () => ({ data: null, error: { message: 'RLS policy violation' } }),
    }

    const result = await fetchOwnerScopedClientsForDriver()
    assert.deepEqual(result, [])
  })

  test('data가 배열이 아니거나 비어있으면 빈 배열을 반환한다', async () => {
    resetHandlers()
    handlers.clients = {
      select: () => ({ data: [], error: null }),
    }
    assert.deepEqual(await fetchOwnerScopedClientsForDriver(), [])

    handlers.clients = {
      select: () => ({ data: null, error: null }),
    }
    assert.deepEqual(await fetchOwnerScopedClientsForDriver(), [])
  })

  test('네트워크 throw 예외 발생 시에도 조용히 빈 배열을 반환한다', async () => {
    resetHandlers()
    handlers.clients = {
      select: () => {
        throw new Error('network down')
      },
    }

    const result = await fetchOwnerScopedClientsForDriver()
    assert.deepEqual(result, [])
  })
})
