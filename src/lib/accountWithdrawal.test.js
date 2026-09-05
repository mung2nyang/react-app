// @ts-check
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { requestAccountWithdrawal } = await import('./accountWithdrawal.js')

describe('requestAccountWithdrawal', () => {
  test('RPC 성공 시 ok:true와 성공 토스트', async () => {
    resetHandlers()
    handlers.rpc = {
      delete_own_account: () => ({ data: null, error: null }),
    }
    const result = await requestAccountWithdrawal()
    assert.equal(result.ok, true)
    assert.equal(result.toast, '탈퇴가 완료되었습니다.')
    assert.equal(countOf('rpc', 'delete_own_account'), 1)
  })

  test('RPC 실패 시 ok:false와 실패 토스트', async () => {
    resetHandlers()
    handlers.rpc = {
      delete_own_account: () => ({ data: null, error: { message: 'permission denied' } }),
    }
    const result = await requestAccountWithdrawal()
    assert.equal(result.ok, false)
    assert.equal(result.toast, 'permission denied')
    assert.equal(countOf('rpc', 'delete_own_account'), 1)
  })

  test('RPC throw 시 ok:false', async () => {
    resetHandlers()
    handlers.rpc = {
      delete_own_account: () => { throw new Error('network down') },
    }
    const result = await requestAccountWithdrawal()
    assert.equal(result.ok, false)
    assert.equal(result.toast, 'network down')
    assert.equal(countOf('rpc', 'delete_own_account'), 1)
  })
})
