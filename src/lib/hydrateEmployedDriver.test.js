// @ts-check
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers, countOf } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const {
  buildEmployedDriverSnapshot,
  remapEmployedDriverWorkLogs,
} = await import('./hydrateEmployedDriver.js')

describe('remapEmployedDriverWorkLogs', () => {
  test('(a) 번호판 키 서버 일지 → workLogs.main, 번호판 키 없음', () => {
    const plate = '서울12가3456'
    const day = { isOff: false, callDetails: [{ fare: 100000 }] }
    const remapped = remapEmployedDriverWorkLogs(
      { main: { '2026-04-01': { isOff: true } }, [plate]: { '2026-05-12': day } },
      [{ type: 'sub', number: plate, supabaseId: 'v1' }],
    )
    assert.deepEqual(Object.keys(remapped), ['main'])
    assert.equal(remapped.main['2026-05-12'], day)
    assert.equal(/** @type {Record<string, unknown>} */ (remapped)[plate], undefined)
  })

  test('cars 비면 workLogs = { main: {} } (logIdForCar 미호출)', () => {
    const remapped = remapEmployedDriverWorkLogs(
      { main: {}, '99가9999': { '2026-05-01': { isOff: false } } },
      [],
    )
    assert.deepEqual(remapped, { main: {} })
  })

  test('cars null/undefined 도 { main: {} }', () => {
    assert.deepEqual(remapEmployedDriverWorkLogs({ main: { a: /** @type {any} */ ({}) } }, null), { main: {} })
    assert.deepEqual(remapEmployedDriverWorkLogs(undefined, undefined), { main: {} })
  })

  test('2대+ 이면 첫 차량만 main (TODO multi-vehicle)', () => {
    const first = { '2026-05-01': { isOff: false, fixedCount: 1 } }
    const second = { '2026-05-02': { isOff: false, fixedCount: 9 } }
    const remapped = remapEmployedDriverWorkLogs(
      { main: {}, '11가1111': first, '22나2222': second },
      [
        { type: 'sub', number: '11가1111' },
        { type: 'sub', number: '22나2222' },
      ],
    )
    assert.deepEqual(remapped, { main: first })
  })
})

describe('buildEmployedDriverSnapshot — 소속기사 hydrate 비용 및 스냅샷 조회', () => {
  test('정상 조회: 배정차량 1대, 비용 3종 각 1건씩 → snapshot.expenses 3건 확인', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.rpc = {
      get_linked_owner_profile_settings: () => ({
        data: { name: '차주대표', business_name: '차주상사', settings: {} },
        error: null,
      }),
      get_assigned_vehicle_summary: () => ({
        data: [{ id: 'veh-assigned-1', number: '12가3456', type: 'sub' }],
        error: null,
      }),
    }
    handlers.driver_links = {
      select: () => ({ data: [{ id: 'link-1', driver_id: 'driver-1', status: 'linked' }], error: null }),
    }
    handlers.profiles = {
      select: () => ({ data: { phone: '010-1234-5678' }, error: null }),
    }
    handlers.clients = {
      select: () => ({ data: [], error: null }),
    }
    handlers.daily_logs = {
      select: () => ({ data: [], error: null }),
    }
    handlers.transport_details = {
      select: () => ({ data: [], error: null }),
    }
    handlers.fuel_records = {
      select: () => ({
        data: [{ id: 'fuel-1', vehicle_id: 'veh-assigned-1', work_date: '2026-05-01', cost_amount: 50000, volume_liter: 30, sequence: 1 }],
        error: null,
      }),
    }
    handlers.maintenance_records = {
      select: () => ({
        data: [{ id: 'maint-1', vehicle_id: 'veh-assigned-1', work_date: '2026-05-02', cost_amount: 80000, sequence: 1, raw: { name: '엔진오일' } }],
        error: null,
      }),
    }
    handlers.misc_expense_records = {
      select: () => ({
        data: [{ id: 'misc-1', vehicle_id: 'veh-assigned-1', work_date: '2026-05-03', cost_amount: 10000, sequence: 1, raw: { name: '주차비' } }],
        error: null,
      }),
    }

    const snapshot = await buildEmployedDriverSnapshot({
      userId: 'driver-1',
      ownerKey: 'owner-1',
      throwIfAnyHydrateError: (labeled) => {
        for (const [table, err] of Object.entries(labeled)) {
          if (err) throw new Error(`${table} failed: ${err.message || 'error'}`)
        }
      },
      localDrivers: [],
    })

    assert.equal(snapshot.cars.length, 1)
    assert.equal(snapshot.cars[0].number, '12가3456')
    assert.equal(snapshot.cars[0].supabaseId, 'veh-assigned-1')

    assert.equal(snapshot.expenses.length, 3)
    const kinds = snapshot.expenses.map((e) => e.kind).sort()
    assert.deepEqual(kinds, ['fuel', 'maint', 'misc'])

    assert.equal(countOf('fuel_records', 'select'), 1)
    assert.equal(countOf('maintenance_records', 'select'), 1)
    assert.equal(countOf('misc_expense_records', 'select'), 1)
  })

  test('배정 0대: 배정 차량이 없으면 비용 3종 조회를 하지 않고 expenses는 빈 배열이다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.rpc = {
      get_linked_owner_profile_settings: () => ({
        data: { name: '차주대표', business_name: '차주상사', settings: {} },
        error: null,
      }),
      get_assigned_vehicle_summary: () => ({
        data: [],
        error: null,
      }),
    }
    handlers.driver_links = {
      select: () => ({ data: [], error: null }),
    }
    handlers.profiles = {
      select: () => ({ data: { phone: '010-1234-5678' }, error: null }),
    }
    handlers.clients = {
      select: () => ({ data: [], error: null }),
    }
    handlers.daily_logs = {
      select: () => ({ data: [], error: null }),
    }
    handlers.transport_details = {
      select: () => ({ data: [], error: null }),
    }

    const snapshot = await buildEmployedDriverSnapshot({
      userId: 'driver-1',
      ownerKey: 'owner-1',
      throwIfAnyHydrateError: (labeled) => {
        for (const [table, err] of Object.entries(labeled)) {
          if (err) throw new Error(`${table} failed: ${err.message || 'error'}`)
        }
      },
      localDrivers: [],
    })

    assert.equal(snapshot.cars.length, 0)
    assert.equal(snapshot.expenses.length, 0)
    assert.deepEqual(snapshot.expenses, [])

    // 비용 3종 테이블 조회가 일절 발생하지 않았는지 검증
    assert.equal(countOf('fuel_records', 'select'), 0)
    assert.equal(countOf('maintenance_records', 'select'), 0)
    assert.equal(countOf('misc_expense_records', 'select'), 0)
  })
})
