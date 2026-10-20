// @ts-check
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toLinkedDriverLink } from './linkedDriverLink.js'

test('DriverRecord startDate/endDate → assignmentStart/End', () => {
  const link = toLinkedDriverLink({
    id: 'drv-1',
    name: '김기사',
    phone: '010-1111-2222',
    vehicleNumber: '서울12가3456',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    status: 'linked',
  })
  assert.equal(link.id, 'drv-1')
  assert.equal(link.assignmentStart, '2026-05-01')
  assert.equal(link.assignmentEnd, '2026-05-31')
  assert.equal(link.driverName, '김기사')
  assert.equal(link.vehicleNumber, '서울12가3456')
})
