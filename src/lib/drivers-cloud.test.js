import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { OVERLAP_LINKS, FIXTURE_SETTINGS, FIXTURE_WORK } from './finance.fixtures.js'
import { applyOriginalFixture, loadOriginalWindow } from './originalWindow.js'
import {
  driversToLinks,
  findOverlappingDriverLink,
  overlapConflictMessage,
  upsertDriver,
} from './drivers.js'
import { buildClientRow, buildVehicleRow, deleteClientFromSupabase, deleteVehicleFromSupabase } from './cloudSync.js'

const original = loadOriginalWindow()
applyOriginalFixture(original, FIXTURE_SETTINGS, FIXTURE_WORK)

describe('기사 할당 겹침 — 원본과 같은 규칙', () => {
  test('findOverlappingDriverLink가 원본과 같은 대상을 고른다', () => {
    const hit = findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-05-20', '2026-06-10')
    const originalHit = original.findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-05-20', '2026-06-10')
    assert.equal(hit?.id, originalHit?.id)
    assert.equal(hit?.id, 'a')
  })

  test('해제된 할당은 겹침으로 보지 않는다', () => {
    assert.equal(
      findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-05-10', '2026-05-20', 'a'),
      original.findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-05-10', '2026-05-20', 'a'),
    )
  })

  test('연습앱 기사 목록을 원본 link 모양으로 바꾸면 같은 겹침이 난다', () => {
    const drivers = [
      { id: 'a', name: '김기사', vehicleNumber: '서울12가3456', startDate: '2026-05-01', endDate: '2026-05-31', status: 'pending' },
      { id: 'b', name: '이기사', vehicleNumber: '서울12가3456', startDate: '2026-06-01', endDate: '', status: 'linked' },
    ]
    const ours = findOverlappingDriverLink(driversToLinks(drivers), '서울12가3456', '2026-05-20', '2026-06-10')
    const theirs = original.findOverlappingDriverLink(driversToLinks(drivers), '서울12가3456', '2026-05-20', '2026-06-10')
    assert.equal(ours?.id, theirs?.id)
    assert.equal(ours?.id, 'a')
  })

  test('upsertDriver는 원본과 같은 겹침 안내를 낸다', () => {
    const items = [
      { id: 'a', name: '김기사', phone: '010-1111-2222', inviteCode: '111111', vehicleNumber: '서울12가3456', startDate: '2026-05-01', endDate: '2026-05-31', status: 'pending' },
    ]
    const result = upsertDriver(items, {
      name: '박기사',
      phone: '010-3333-4444',
      inviteCode: '222222',
      vehicleNumber: '서울12가3456',
      startDate: '2026-05-20',
      endDate: '2026-06-10',
    }, null, [{ type: 'sub', number: '서울12가3456' }])
    const conflict = original.findOverlappingDriverLink(driversToLinks(items), '서울12가3456', '2026-05-20', '2026-06-10')
    assert.equal(result.error, overlapConflictMessage(conflict))
    assert.match(result.error, /같은 차량에 김기사의 할당 기간/)
  })

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
