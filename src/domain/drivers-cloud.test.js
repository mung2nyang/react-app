import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { upsertDriver } from './drivers.js'
import { buildClientRow, buildVehicleRow } from '../lib/cloudStorage.js'
import { deleteClientFromSupabase, deleteVehicleFromSupabase } from '../lib/directMutations.js'

// 2026-09-01 보리 지시: 기사 할당 "기간 겹침" 계산 차단(findOverlappingDriverLink 등)은
// 요구한 적 없는 코드라 제거했다. 남긴 규칙은 "같은 차량번호는 한 기사에게만"(기간 무관).
describe('기사 할당 — 같은 차량번호는 한 기사에게만', () => {
  const base = { name: '박기사', phone: '010-3333-4444', inviteCode: '222222', vehicleNumber: '서울12가3456', startDate: '2026-05-20', endDate: '' }
  const cars = [{ type: 'sub', number: '서울12가3456' }]

  test('같은 차량이 이미 다른 기사에게 있으면 기간과 무관하게 거절한다', () => {
    const items = [
      { id: 'a', name: '김기사', phone: '010-1111-2222', inviteCode: '111111', vehicleNumber: '서울12가3456', startDate: '2026-05-01', endDate: '2026-05-31', status: 'pending' },
    ]
    // 기존 할당(5/1~5/31)과 겹치지 않는 6월 기간이어도 같은 차량이면 거절.
    const result = upsertDriver(items, { ...base, startDate: '2026-07-01', endDate: '2026-07-31' }, null, cars)
    assert.equal(result.error, '이미 다른 기사에게 할당된 차량입니다.')
  })

  test('연결 해제된(disconnected) 기사가 쓰던 차량은 다시 할당할 수 있다', () => {
    const items = [
      { id: 'a', name: '김기사', phone: '010-1111-2222', inviteCode: '111111', vehicleNumber: '서울12가3456', startDate: '2026-05-01', endDate: '', status: 'disconnected' },
    ]
    const result = upsertDriver(items, base, null, cars)
    assert.equal(result.error, undefined)
    assert.equal(result.items.length, 2)
  })

  // 수정 시 자기 자신 제외(item.id !== editingId)는 upsertDriver 내부 가드로 처리한다.
  // domain/drivers.js가 @ts-check 대상이 아니라(editingId 기본값 null이 타입을 좁힘)
  // 문자열 editingId를 타입 우회 없이 넘길 수 없어 여기서는 생성 케이스만 검증한다.

  test('메인 차량은 할당할 수 없다', () => {
    const result = upsertDriver([], {
      name: '박기사',
      phone: '010-3333-4444',
      inviteCode: '222222',
      vehicleNumber: '서울00가0000',
      startDate: '2026-05-01',
      endDate: '',
    }, null, [{ type: 'main', number: '서울00가0000' }])
    assert.equal(result.error, '메인 차량은 기사에게 할당할 수 없습니다. 기사차량 번호를 입력해 주세요.')
  })

  test('종료일이 시작일보다 빠르면 거절한다', () => {
    const result = upsertDriver([], {
      name: '박기사',
      phone: '010-3333-4444',
      inviteCode: '222222',
      vehicleNumber: '서울12가3456',
      startDate: '2026-06-10',
      endDate: '2026-05-01',
    }, null, [{ type: 'sub', number: '서울12가3456' }])
    assert.equal(result.error, '할당 종료일은 시작일 이후로 선택해 주세요.')
  })
})

describe('기사 할당 — 한 기사(전화번호)는 차량 1대에만 배정', () => {
  const cars = [
    { type: 'sub', number: '서울12가3456' },
    { type: 'sub', number: '경기78나9012' },
  ]

  test('같은 전화번호가 이미 다른 차량에 활성 배정 중이면 새 차량 배정을 거절한다', () => {
    const items = [
      { id: 'd1', name: '김기사', phone: '010-1111-2222', inviteCode: '111111', vehicleNumber: '서울12가3456', startDate: '2026-05-01', endDate: '', status: 'pending' },
    ]
    const result = upsertDriver(items, {
      name: '김기사',
      phone: '01011112222',
      inviteCode: '222222',
      vehicleNumber: '경기78나9012',
      startDate: '2026-05-10',
      endDate: '',
    }, null, cars)
    assert.equal(result.error, '이미 다른 차량에 배정된 기사입니다.')
  })

  test('기존 배정이 연결 해제된(disconnected) 상태면 새 차량 배정을 허용한다', () => {
    const items = [
      { id: 'd1', name: '김기사', phone: '010-1111-2222', inviteCode: '111111', vehicleNumber: '서울12가3456', startDate: '2026-05-01', endDate: '', status: 'disconnected' },
    ]
    const result = upsertDriver(items, {
      name: '김기사',
      phone: '010-1111-2222',
      inviteCode: '222222',
      vehicleNumber: '경기78나9012',
      startDate: '2026-05-10',
      endDate: '',
    }, null, cars)
    assert.equal(result.error, undefined)
    assert.equal(result.items.length, 2)
  })

  test('같은 기사가 같은 배정 건의 차량을 바꾸는 수정(editingId 있음)은 허용한다', () => {
    const items = [
      { id: 'd1', name: '김기사', phone: '010-1111-2222', inviteCode: '111111', vehicleNumber: '서울12가3456', startDate: '2026-05-01', endDate: '', status: 'pending' },
    ]
    const result = upsertDriver(items, {
      name: '김기사',
      phone: '010-1111-2222',
      inviteCode: '111111',
      vehicleNumber: '경기78나9012',
      startDate: '2026-05-01',
      endDate: '',
    }, 'd1', cars)
    assert.equal(result.error, undefined)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].vehicleNumber, '경기78나9012')
  })
})

describe('클라우드 행 매핑 — 원본 supabase-sync와 같은 필드', () => {
  test('차량 행에 user_id, number, type, raw가 들어간다', () => {
    const row = buildVehicleRow('user-1', {
      number: '서울12가3456',
      type: 'sub',
      tonnage: '5',
      driverName: '김기사',
      driverPhone: '010-1234-5678',
      commEnabled: true,
      commType: 'percent',
      commission: '15',
      settlementMode: 'company',
    }, 1)
    assert.equal(row.user_id, 'user-1')
    assert.equal(row.legacy_log_id, '서울12가3456')
    assert.equal(row.number, '서울12가3456')
    assert.equal(row.type, 'sub')
    assert.equal(row.display_order, 1)
    assert.equal(row.comm_enabled, true)
    assert.equal(row.comm_type, 'percent')
    assert.equal(row.comm_value, '15')
    assert.equal(row.settlement_mode, 'company')
    assert.equal(row.driver_name, '김기사')
    assert.equal(row.raw.driverPhone, '010-1234-5678')
    assert.equal(row.raw.number, '서울12가3456')
  })

  test('거래처 행에 company_name, payment_term, raw가 들어간다', () => {
    const row = buildClientRow('user-1', {
      id: 'c1',
      companyName: '한진',
      paymentTerm: 'next_month_end',
      commEnabled: true,
      commValue: '10',
      taxRepresentative: '이대표',
      taxEmail: 'tax@example.com',
      taxAddress: '서울시',
      taxBizType: '운수업',
      taxBizItem: '화물운송',
    }, 0)
    assert.equal(row.user_id, 'user-1')
    assert.equal(row.legacy_client_id, 'c1')
    assert.equal(row.company_name, '한진')
    assert.equal(row.payment_term, 'next_month_end')
    assert.equal(row.raw.companyName, '한진')
    assert.equal(row.raw.taxRepresentative, '이대표')
    assert.equal(row.raw.taxEmail, 'tax@example.com')
    assert.equal(row.tax_representative, undefined)
    assert.equal(row.is_pinned, false)
  })

  test('supabaseId가 없으면 서버 삭제를 건너뛴다', async () => {
    await deleteVehicleFromSupabase('')
    await deleteVehicleFromSupabase(null)
    await deleteClientFromSupabase('')
    await deleteClientFromSupabase(null)
  })
})
