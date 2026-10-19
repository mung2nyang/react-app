// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { logIdForCar, mergeVehicleDayLogsFromServer } from './hydrateVehicleDayLogs.js'

describe('logIdForCar', () => {
  test('main -> main, sub -> plate, empty -> null', () => {
    assert.equal(logIdForCar({ type: 'main', number: '11가1111' }), 'main')
    assert.equal(logIdForCar({ type: 'sub', number: '22나2222' }), '22나2222')
    assert.equal(logIdForCar({ type: 'sub', number: '' }), null)
    assert.equal(logIdForCar({ type: 'sub', number: 'main' }), null)
  })
})

describe('mergeVehicleDayLogsFromServer', () => {
  test('splits dailyRows into logId maps', async () => {
    const { workLogs } = await mergeVehicleDayLogsFromServer({
      cars: [
        { type: 'main', number: '11가1111', supabaseId: 1 },
        { type: 'sub', number: '22나2222', supabaseId: 2 },
      ],
      mainTombstoneKeys: [],
      fetchDaily: async (vehicleId) => ({
        data: vehicleId === 1
          ? [{ work_date: '2026-08-01', is_off: false, fixed_count: 1, raw: {} }]
          : [{ work_date: '2026-08-02', is_off: false, fixed_count: 4, raw: {} }],
        error: null,
      }),
      fetchTransport: async () => ({ data: [], error: null }),
      throwIfAnyHydrateError: () => {},
    })
    assert.equal(workLogs.main['2026-08-01']?.fixedCount, 1)
    assert.equal(workLogs['22나2222']['2026-08-02']?.fixedCount, 4)
  })

  test('main tombstone dates excluded only from main map', async () => {
    const { workLogs } = await mergeVehicleDayLogsFromServer({
      cars: [
        { type: 'main', number: '11가1111', supabaseId: 1 },
        { type: 'sub', number: '22나2222', supabaseId: 2 },
      ],
      mainTombstoneKeys: ['2026-08-01'],
      fetchDaily: async () => ({
        data: [{ work_date: '2026-08-01', is_off: false, fixed_count: 9, raw: {} }],
        error: null,
      }),
      fetchTransport: async () => ({ data: [], error: null }),
      throwIfAnyHydrateError: () => {},
    })
    assert.equal(workLogs.main['2026-08-01'], undefined)
    assert.equal(workLogs['22나2222']['2026-08-01']?.fixedCount, 9)
  })
})