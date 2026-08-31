import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { dedupeCarsById, upsertCar } from './cars.js'

describe('차량 저장 — 기사명·정산·수수료', () => {
  test('차량번호 중복은 거절한다', () => {
    const first = upsertCar([], { number: '서울12가3456', type: 'main' })
    const dup = upsertCar(first.cars, { number: '서울12가3456', type: 'sub', driverName: '김기사', driverPhone: '010-1234-5678' })
    assert.equal(dup.error, '이미 등록된 차량번호입니다.')
  })

  test('수정 시 supabaseId와 폼에 없는 필드를 보존한다', () => {
    const created = upsertCar([], { number: '서울12가3456', type: 'sub', driverName: '김기사', driverPhone: '010-1234-5678' })
    created.cars[0].supabaseId = 'veh-1'
    created.cars[0].logEnabled = true
    created.cars[0].insuranceOn = true
    created.cars[0].archived = false
    const edited = upsertCar(created.cars, {
      number: '서울12가9999',
      type: 'sub',
      driverName: '김기사',
      driverPhone: '010-1234-5678',
    }, created.cars[0].id)
    assert.equal(edited.error, undefined)
    assert.equal(edited.cars[0].supabaseId, 'veh-1')
    assert.equal(edited.cars[0].logEnabled, true)
    assert.equal(edited.cars[0].insuranceOn, true)
    assert.equal(edited.cars[0].number, '서울12가9999')
  })
  test('메인 차량은 한 대만 등록할 수 있다', () => {
    const first = upsertCar([], { number: '11가1111', type: 'main' })
    const second = upsertCar(first.cars, { number: '22나2222', type: 'main' })
    assert.equal(second.error, '메인 차량이 이미 등록되어 있습니다.')
  })

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

describe('dedupeCarsById', () => {
  test('같은 id는 선두 한 건만 남긴다', () => {
    const id = 'car_1788141346245_c60pq4'
    const next = dedupeCarsById([
      { id, number: '11가1111', type: 'main' },
      { id, number: '11가1111', type: 'main' },
    ])
    assert.equal(next.length, 1)
    assert.equal(next[0].id, id)
  })
})
