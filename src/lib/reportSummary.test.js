import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const { buildMonthReport } = await import('./reportSummary.js')
const { EMPTY_PROFILE } = await import('./profile.js')

const OWNER_PROFILE = { ...EMPTY_PROFILE, name: '차주', bankName: '차주은행', accountNumber: '000-000', accountHolder: '차주명의' }

/** @param {Array<import('../domain/financeTypes.js').CarLike>} cars */
function report(cars) {
  return buildMonthReport('rs-test', 2026, 8, [], cars, { fixedOn: false }, {}, [], OWNER_PROFILE)
}

describe('buildMonthReport 계좌', () => {
  test('기사차량에 계좌가 입력돼 있으면 은행·계좌번호·예금주 세 칸 모두 차량 값', () => {
    const { profile } = report([{
      id: 's', type: 'sub', number: '11가1111', businessInfo: { sameAsOwner: false },
      personalInfo: { bank: '국민은행', account: '111-222', accountHolder: '김기사' },
    }])
    assert.equal(profile.bankName, '국민은행')
    assert.equal(profile.accountNumber, '111-222')
    assert.equal(profile.accountHolder, '김기사')
    assert.equal(profile.name, '차주')
  })

  test('일부만 입력했어도 차주 계좌가 섞이지 않는다(빈 칸은 빈 값)', () => {
    const { profile } = report([{
      id: 's', type: 'sub', number: '11가1111', businessInfo: { sameAsOwner: false }, personalInfo: { account: '111-222' },
    }])
    assert.equal(profile.bankName, '')
    assert.equal(profile.accountNumber, '111-222')
    assert.equal(profile.accountHolder, '')
  })

  test('기사차량 계좌가 비어 있으면 차주 계좌', () => {
    const { profile } = report([{ id: 's', type: 'sub', number: '11가1111', businessInfo: { sameAsOwner: false }, personalInfo: { driverName: '김기사', bank: '', account: '' } }])
    assert.equal(profile.bankName, '차주은행')
    assert.equal(profile.accountNumber, '000-000')
    assert.equal(profile.accountHolder, '차주명의')
  })

  test('동일 켜짐(또는 businessInfo 없음)이면 personalInfo에 옛 계좌값이 남아 있어도 차주 계좌', () => {
    const stale = { bank: '옛은행', account: '999', accountHolder: '옛' }
    for (const businessInfo of [{ sameAsOwner: true }, undefined]) {
      const { profile } = report([{ id: 's', type: 'sub', number: '11가1111', businessInfo, personalInfo: stale }])
      assert.equal(profile.bankName, '차주은행')
      assert.equal(profile.accountNumber, '000-000')
      assert.equal(profile.accountHolder, '차주명의')
    }
  })

  test('메인 차량 내역서는 personalInfo가 있어도 차주 계좌 그대로', () => {
    const { profile } = report([{
      id: 'm', type: 'main', number: '22나2222',
      personalInfo: { bank: '국민은행', account: '111-222', accountHolder: '김기사' },
    }])
    assert.equal(profile.bankName, '차주은행')
    assert.equal(profile.accountNumber, '000-000')
  })
})
