// 차량 창 저장(기사 연동 탭)은 기존 기사의 계약 기간을 바꾸지 않는다 — 차량 창에는 종료일 칸이 없다.
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

/** @type {Array<{ items: Array<{ id: string, startDate?: string, endDate?: string }>, editingId: string|null }>} */
const saved = []
mock.module('../../../data/sync/requestDriverInviteSave.ts', {
  namedExports: {
    requestDriverInviteSave: async (/** @type {{ items: Array<{ id: string, startDate?: string, endDate?: string }>, editingId: string|null }} */ args) => {
      saved.push(args)
      return { items: args.items, blocked: null, toast: '기사 배정 정보를 수정했습니다.' }
    },
  },
})

const { saveInviteAfterVehicle } = await import('./carInviteFromDraft.js')

const car = { id: 'car-1', type: /** @type {'sub'} */ ('sub'), number: '12가3456', supabaseId: 'veh-1' }

beforeEach(() => { saved.length = 0 })

test('기존 기사가 있는 차량을 톤수만 고쳐 저장해도 계약 시작일·종료일이 그대로다', async () => {
  const driver = {
    id: 'drv-1', name: '김기사', phone: '010-1111-2222', inviteCode: 'A2B3C4D5E6',
    vehicleNumber: '12가3456', startDate: '2026-11-01', endDate: '2026-12-31', status: 'linked',
  }
  // CarListPage 수정 창이 만드는 초안 그대로(배정 칸은 안 건드림).
  await saveInviteAfterVehicle({
    cloud: true,
    ownerKey: 'owner-enddate',
    userId: 'user-enddate',
    drivers: [driver],
    cars: [car],
    saved: { ...car, tonnage: '5톤' },
    inviteDraft: {
      type: 'sub', number: '12가3456', driverName: '김기사', driverPhone: '010-1111-2222',
      inviteCode: driver.inviteCode, inviteStartDate: driver.startDate, inviteDriverId: driver.id,
    },
  })

  assert.equal(saved.length, 1, '배정 정보 저장 1번')
  const next = saved[0].items.find((item) => item.id === 'drv-1')
  assert.equal(next?.startDate, '2026-11-01')
  assert.equal(next?.endDate, '2026-12-31')
})

test('기존 기사가 없는 새 초대는 종료일 없이 저장한다', async () => {
  await saveInviteAfterVehicle({
    cloud: true,
    ownerKey: 'owner-enddate-new',
    userId: 'user-enddate-new',
    drivers: [],
    cars: [car],
    saved: car,
    inviteDraft: {
      type: 'sub', number: '12가3456', driverName: '이기사', driverPhone: '010-3333-4444',
      inviteCode: 'B3C4D5E6F7', inviteStartDate: '2026-11-01', inviteDriverId: null,
    },
  })

  assert.equal(saved.length, 1, '배정 정보 저장 1번')
  assert.equal(saved[0].items.length, 1)
  assert.equal(saved[0].items[0].endDate, '')
})
