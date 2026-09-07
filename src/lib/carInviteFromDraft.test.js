import assert from 'node:assert/strict'
import { test } from 'node:test'
import { saveInviteAfterVehicle, todayIsoDate } from './carInviteFromDraft.js'

/** @type {import('./carInviteFromDraft.js').CarInviteDraft} */
const baseDraft = {
  type: 'sub',
  number: '12가3456',
  driverName: '',
  driverPhone: '',
  inviteCode: '123456',
  inviteStartDate: '2026-09-07',
  inviteDriverId: null,
}

test('todayIsoDate returns YYYY-MM-DD', () => {
  assert.match(todayIsoDate(), /^\d{4}-\d{2}-\d{2}$/)
})

test('inviteCode가 6자리 숫자가 아니면(누락/무효) skipInvite 없이도 스킵된다', async () => {
  const result = await saveInviteAfterVehicle({
    cloud: true,
    ownerKey: 'owner-1',
    userId: 'user-1',
    drivers: [],
    cars: [],
    saved: { id: 'car-1', number: '12가3456' },
    inviteDraft: { ...baseDraft, inviteCode: '' },
  })
  assert.equal(result, null)
})

test('skipInvite:true면 신규 등록(운행 일지 모드)에서 초대를 아예 안 만든다', async () => {
  const result = await saveInviteAfterVehicle({
    cloud: true,
    ownerKey: 'owner-1',
    userId: 'user-1',
    drivers: [],
    cars: [],
    saved: { id: 'car-1', number: '12가3456' },
    inviteDraft: baseDraft,
    skipInvite: true,
  })
  // driverName이 비어 있어 upsertDriver를 실제로 불렀다면 검증 에러 문자열이
  // 돌아온다 — null이 나왔다는 건 그 호출 자체를 안 했다는 뜻(조기 return 증명).
  assert.equal(result, null)
})

test('skipInvite 생략(기본 false)이면 기존과 동일하게 초대 생성 경로를 탄다', async () => {
  const result = await saveInviteAfterVehicle({
    cloud: true,
    ownerKey: 'owner-1',
    userId: 'user-1',
    drivers: [],
    cars: [],
    saved: { id: 'car-1', number: '12가3456' },
    inviteDraft: baseDraft,
  })
  assert.equal(result, '기사 이름을 입력해 주세요.')
})

test('skipInvite:false를 명시해도 기존 동작과 같다(회귀 방지)', async () => {
  const result = await saveInviteAfterVehicle({
    cloud: true,
    ownerKey: 'owner-1',
    userId: 'user-1',
    drivers: [],
    cars: [],
    saved: { id: 'car-1', number: '12가3456' },
    inviteDraft: baseDraft,
    skipInvite: false,
  })
  assert.equal(result, '기사 이름을 입력해 주세요.')
})

test('skipInvite:true라도 cloud가 아니면(기존 규칙) 어차피 null', async () => {
  const result = await saveInviteAfterVehicle({
    cloud: false,
    ownerKey: 'owner-1',
    userId: '',
    drivers: [],
    cars: [],
    saved: { id: 'car-1', number: '12가3456' },
    inviteDraft: baseDraft,
    skipInvite: true,
  })
  assert.equal(result, null)
})
