// @ts-check
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { buildClientRow } = await import('./cloudStorage.js')
const { upsertClientFromList } = await import('./syncVehiclesClients.js')
const { requestClientSave } = await import('./clientMutations.js')
const { buildEmployedDriverSnapshot } = await import('./hydrateEmployedDriver.js')
const { mergeClientsFromRows } = await import('./hydrateMergeClients.js')
const { reconcileClients } = await import('./outboxReconcile.js')
const { beginSessionEpoch, captureSession, endCloudSession } = await import('./cloudSession.js')
const { setHydration } = await import('../store/app-store.js')

describe('Step 9 ① 슬라이스 C (개정): 기사↔차주 거래처 상호 편집 검증', () => {
  test('buildClientRow는 전달된 ownerId를 user_id로 기록한다 (userId와 무관)', () => {
    const row = buildClientRow('owner-99', {
      id: 'c-test-1',
      companyName: '대한운송',
      scopedToVehicleNumber: '12가3456',
    }, 0)
    assert.equal(row.user_id, 'owner-99')
    assert.equal(row.company_name, '대한운송')
  })

  test('upsertClientFromList: 소속기사 세션(userId≠ownerKey)에서 저장 시 user_id는 차주 ownerKey다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())

    /** @type {Array<Record<string, unknown>>} */
    const insertedRows = []
    /** @type {Array<Record<string, unknown>>} */
    const lookupFilters = []

    handlers.clients = {
      select: (filters) => {
        if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
          lookupFilters.push(filters)
        }
        return { data: [], error: null }
      },
      insert: (payload) => {
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          insertedRows.push(payload)
        }
        return { data: { id: 777 }, error: null }
      },
    }

    beginSessionEpoch('driver-user-1', 'owner-user-99')
    const captured = captureSession()

    /** @type {Array<import('../domain/clientTypes.js').ClientLike>} */
    const clients = [
      {
        id: 'client-local-1',
        companyName: '차주소유거래처',
        scopedToVehicleNumber: '12가3456',
      },
    ]

    const remoteId = await upsertClientFromList(
      'driver-user-1',
      'owner-user-99',
      clients,
      'client-local-1',
      captured,
    )

    assert.equal(remoteId, 777)
    // 1. 조회할 때 차주 소유(ownerKey)로 조회했는지
    assert.equal(lookupFilters.length, 1)
    assert.equal(lookupFilters[0].user_id, 'owner-user-99')
    assert.notEqual(lookupFilters[0].user_id, 'driver-user-1')

    // 2. insert할 때도 차주 소유(ownerKey)로 저장되었는지
    assert.equal(insertedRows.length, 1)
    assert.equal(insertedRows[0].user_id, 'owner-user-99')
    assert.notEqual(insertedRows[0].user_id, 'driver-user-1')
    assert.equal(insertedRows[0].company_name, '차주소유거래처')
    endCloudSession()
  })

  test('requestClientSave: 소속기사 세션에서 거래처 등록 시 ownerKey로 클라우드에 전달된다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())

    /** @type {Array<Record<string, unknown>>} */
    const insertedRows = []
    handlers.clients = {
      select: () => ({ data: [], error: null }),
      insert: (payload) => {
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          insertedRows.push(payload)
        }
        return { data: { id: 888 }, error: null }
      },
    }

    const driverUserId = 'driver-user-2'
    const ownerKey = 'owner-user-88'

    beginSessionEpoch(driverUserId, ownerKey)
    setHydration({ status: 'ready', userId: driverUserId, ownerKey })

    const result = await requestClientSave({
      ownerKey,
      userId: driverUserId,
      clients: [],
      draft: {
        companyName: '기사가등록한거래처',
        scopedToVehicleNumber: '34허5678',
      },
      editingId: null,
    })

    assert.equal(result.failed, false)
    assert.equal(result.saved?.companyName, '기사가등록한거래처')
    assert.equal(result.saved?.supabaseId, '888')

    assert.equal(insertedRows.length, 1)
    assert.equal(insertedRows[0].user_id, ownerKey)
    assert.notEqual(insertedRows[0].user_id, driverUserId)
    endCloudSession()
  })

  test('기사 쓰기 직후 hydrate 경합: 미동기화 로컬 거래처가 서버 hydrate 뒤에도 사라지지 않는다', () => {
    /** @type {Array<import('./hydrateMergeTypes.js').LocalClient>} */
    const localClients = [
      {
        id: 'client-pending-1',
        companyName: '방금추가한거래처',
        scopedToVehicleNumber: '12가3456',
        isPinned: false,
        commEnabled: false,
        commType: 'percent',
        fixedRouteLinked: false,
        palletOn: false,
      },
    ]

    /** @type {Array<import('./hydrateMergeTypes.js').ClientRow>} */
    const serverRows = [
      {
        id: 101,
        legacy_client_id: 'client-existing',
        company_name: '기존거래처',
        is_pinned: false,
        raw: { scopedToVehicleNumber: '12가3456' },
      },
    ]

    const merged = mergeClientsFromRows(localClients, serverRows)
    const reconciled = reconcileClients('owner-1', merged)

    assert.equal(reconciled.length, 2)
    assert.ok(reconciled.some((/** @type {import('../domain/clientTypes.js').ClientLike} */ c) => c.companyName === '기존거래처'))
    assert.ok(reconciled.some((/** @type {import('../domain/clientTypes.js').ClientLike} */ c) => c.companyName === '방금추가한거래처'))
  })

  test('buildEmployedDriverSnapshot: Supabase clients 조회가 snapshot.clients로 매핑되고 에러 시 throw한다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())

    /** @type {Array<Record<string, unknown>>} */
    const clientSelectFilters = []
    handlers.clients = {
      select: (filters) => {
        if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
          clientSelectFilters.push(filters)
        }
        return {
          data: [
            {
              id: 991,
              legacy_client_id: 'c-991',
              company_name: '연동차량거래처',
              raw: { scopedToVehicleNumber: '55구1234' },
            },
          ],
          error: null,
        }
      },
    }

    // RPC mock
    fakeSupabase.rpc = async (fn) => {
      if (fn === 'get_linked_owner_profile_settings') {
        return { data: { name: '차주명', business_name: '차주상호', settings: {} }, error: null }
      }
      if (fn === 'get_driver_assigned_vehicle_summary') {
        return { data: [{ id: 'veh-1', number: '55구1234', type: 'sub' }], error: null }
      }
      return { data: null, error: null }
    }

    const snapshot = await buildEmployedDriverSnapshot({
      userId: 'driver-a',
      ownerKey: 'owner-b',
      throwIfAnyHydrateError: (labeled) => {
        for (const [table, err] of Object.entries(labeled)) {
          if (err) throw new Error(`${table} failed: ${err.message || 'error'}`)
        }
      },
      localDrivers: [],
    })

    assert.equal(clientSelectFilters.length, 1)
    assert.equal(clientSelectFilters[0].user_id, 'owner-b')
    assert.equal(snapshot.clients.length, 1)
    assert.equal(snapshot.clients[0].companyName, '연동차량거래처')
    assert.equal(snapshot.clients[0].scopedToVehicleNumber, '55구1234')

    // clients 조회 에러 시 throw 검증
    handlers.clients = {
      select: () => ({ data: null, error: { message: 'RLS fail' } }),
    }

    await assert.rejects(
      async () => {
        await buildEmployedDriverSnapshot({
          userId: 'driver-a',
          ownerKey: 'owner-b',
          throwIfAnyHydrateError: (labeled) => {
            for (const [table, err] of Object.entries(labeled)) {
              if (err) throw new Error(`${table} failed: ${err.message || 'error'}`)
            }
          },
          localDrivers: [],
        })
      },
      /clients failed: RLS fail/,
    )
  })
})
