// 로드맵 61 — 연동 기사 앱의 차량 정보(서버 함수 get_assigned_vehicle_summary 한 줄)에 기사 몫 기준을 담는다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { carFromAssignedSummary } from './hydrateEmployedDriverCar.js'

const ROW = { id: 'v-1', number: '22나2222', type: 'sub', comm_enabled: true, comm_type: 'percent', comm_value: '30' }

test('서버가 준 기사 몫 기준을 차량에 담고, 없거나 모르는 값이면 운송료 전체', () => {
  assert.equal(carFromAssignedSummary({ ...ROW, driver_share_base: 'afterClientCommission' }).driverShareBase, 'afterClientCommission')
  assert.equal(carFromAssignedSummary({ ...ROW, driver_share_base: 'gross' }).driverShareBase, 'gross')
  assert.equal(carFromAssignedSummary({ ...ROW, driver_share_base: 'x' }).driverShareBase, 'gross')
  assert.equal(carFromAssignedSummary({ ...ROW, driver_share_base: null }).driverShareBase, 'gross')
  assert.equal(carFromAssignedSummary(ROW).driverShareBase, 'gross', '옛 서버 함수(칸 없음)')
})
