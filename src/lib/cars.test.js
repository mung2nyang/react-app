import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { upsertCar } from './cars.js'

describe('차량 저장 — 기사명·정산·수수료', () => {
  test('기사차량은 기사명과 연락처가 없으면 거절한다', () => {
    const result = upsertCar([], {
      number: '서울12가3456',
      type: 'sub',
      driverName: '',
      driverPhone: '010',
    })
    assert.equal(result.error, '기사명과 연락처를 확인해 주세요.')
  })

  test('기사차량 수수료와 정산 방식을 저장한다', () => {
    const result = upsertCar([], {
      number: '서울12가3456',
      type: 'sub',
      driverName: '김기사',
      driverPhone: '010-1234-5678',
      settlementMode: 'driver_direct',
      commEnabled: true,
      commType: 'percent',
      commission: '15',
    })
    assert.equal(result.error, undefined)
    assert.equal(result.cars[0].driverName, '김기사')
    assert.equal(result.cars[0].driverPhone, '010-1234-5678')
    assert.equal(result.cars[0].settlementMode, 'driver_direct')
    assert.equal(result.cars[0].commEnabled, true)
    assert.equal(result.cars[0].commType, 'percent')
    assert.equal(result.cars[0].commission, '15')
  })
})
