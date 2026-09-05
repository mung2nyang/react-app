// @ts-check
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { fetchDriverOwnClients } = await import('./fetchDriverOwnClients.js')

describe('fetchDriverOwnClients — 기사 본인 거래처 읽기 전용 조회', () => {
  test('linkSupabaseId가 없으면 쿼리 없이 빈 배열을 돌려준다', async () => {
    resetHandlers()
    assert.deepEqual(await fetchDriverOwnClients(null), [])
    assert.deepEqual(await fetchDriverOwnClients(''), [])
    assert.deepEqual(await fetchDriverOwnClients(undefined), [])
    assert.equal(countOf('driver_links', 'select'), 0)
    assert.equal(countOf('clients', 'select'), 0)
  })

  test('driver_links에서 driver_id를 찾고, clients에서 user_id로 기사 거래처를 조회한다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.driver_links = {
      select: (filters) => {
        const f = (filters && typeof filters === 'object' && !Array.isArray(filters)) ? filters : {}
        if ('id' in f && f.id === 'link-1') {
          return { data: { driver_id: 'driver-user-99' }, error: null }
        }
        return { data: null, error: null }
      },
    }
    handlers.clients = {
      select: (filters) => {
        const f = (filters && typeof filters === 'object' && !Array.isArray(filters)) ? filters : {}
        if ('user_id' in f && f.user_id === 'driver-user-99') {
          return {
            data: [
              { id: 101, company_name: '대한운송', biz_number: '123-45-67890', manager_name: '김담당', raw: { isPinned: true } },
              { id: 102, company_name: '민국물류', biz_number: '987-65-43210', manager_name: '', raw: null },
            ],
            error: null,
          }
        }
        return { data: [], error: null }
      },
    }

    const result = await fetchDriverOwnClients('link-1')
    assert.equal(result.length, 2)
    assert.equal(result[0].companyName, '대한운송')
    assert.equal(result[0].bizNumber, '123-45-67890')
    assert.equal(result[0].managerName, '김담당')
    assert.equal(result[0].id, '101')
    assert.equal(result[0].isPinned, true)

    assert.equal(result[1].companyName, '민국물류')
    assert.equal(result[1].bizNumber, '987-65-43210')
    assert.equal(result[1].managerName, '')
  })

  test('driver_links 조회가 실패하거나 driver_id가 없으면 빈 배열을 반환한다 (에러 미누출)', async () => {
    resetHandlers()
    handlers.driver_links = {
      select: () => ({ data: null, error: { message: 'driver_link not found' } }),
    }
    const result = await fetchDriverOwnClients('link-missing')
    assert.deepEqual(result, [])
    assert.equal(countOf('clients', 'select'), 0)
  })

  test('clients 조회가 실패하거나 RLS로 차단(0건)되어도 빈 배열을 반환한다', async () => {
    resetHandlers()
    handlers.driver_links = {
      select: () => ({ data: { driver_id: 'driver-user-1' }, error: null }),
    }
    handlers.clients = {
      select: () => ({ data: null, error: { message: 'RLS policy violation' } }),
    }
    const result = await fetchDriverOwnClients('link-blocked')
    assert.deepEqual(result, [])
  })

  test('네트워크 throw 예외 발생 시에도 조용히 빈 배열을 반환한다', async () => {
    resetHandlers()
    handlers.driver_links = {
      select: () => { throw new Error('network down') },
    }
    const result = await fetchDriverOwnClients('link-down')
    assert.deepEqual(result, [])
  })
})
