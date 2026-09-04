// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { remapEmployedDriverWorkLogs } from './hydrateEmployedDriver.js'

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
