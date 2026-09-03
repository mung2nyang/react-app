// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { saveInviteAfterVehicle, todayIsoDate } from './carInviteFromDraft.js'

describe('carInviteFromDraft', () => {
  test('todayIsoDate returns YYYY-MM-DD', () => {
    assert.match(todayIsoDate(), /^\d{4}-\d{2}-\d{2}$/)
  })

  test('skips invite when not cloud or code missing', async () => {
    const base = {
      ownerKey: 'o1',
      userId: 'u1',
      drivers: [],
      cars: [],
      saved: { id: 'c1', number: '12가3456', type: 'sub' },
      inviteDraft: {
        type: 'sub',
        number: '12가3456',
        driverName: 'Kim',
        driverPhone: '010-1234-5678',
        inviteCode: '',
        inviteStartDate: '2026-09-03',
        inviteDriverId: null,
      },
    }
    assert.equal(await saveInviteAfterVehicle({ ...base, cloud: false }), null)
    assert.equal(await saveInviteAfterVehicle({ ...base, cloud: true }), null)
  })
})