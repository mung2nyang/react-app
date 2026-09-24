import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { applyBusinessForm, carToBusinessForm } from './carBusinessInfo.js'

/** @typedef {import('./financeTypes.js').CarLike} CarLike */

/** @type {import('./carBusinessInfo.js').CarBusinessForm} */
const FORM = {
  sameAsOwner: false,
  name: '  한빛운수 ',
  bizNumber: '123-45-67890',
  representative: '김대표',
  address: '서울시 강서구 1',
  bizType: '운수업',
  bizItem: '화물운송',
  email: 'tax@hanbit.kr',
  bank: '국민은행',
  account: '111-222-333',
  accountHolder: '김기사',
}

/** @param {Partial<CarLike>} [extra] @returns {CarLike} */
function sub(extra = {}) {
  return { id: 'c', number: '11가1111', type: 'sub', ...extra }
}
/** @param {CarLike} car */
function personal(car) { return car.personalInfo ?? {} }
/** @param {CarLike} car */
function business(car) { return car.businessInfo ?? {} }

describe('carToBusinessForm', () => {
  test('businessInfo가 없으면 "내 사업자 정보와 동일"이고 입력칸은 비어 있다', () => {
    const form = carToBusinessForm(sub())
    assert.equal(form.sameAsOwner, true)
    assert.equal(form.name, '')
    assert.equal(form.bank, '')
  })

  test('동일 켜짐이면 personalInfo에 옛 계좌값이 남아 있어도 폼 계좌는 비어 있다', () => {
    const form = carToBusinessForm(sub({
      businessInfo: { sameAsOwner: true },
      personalInfo: { bank: '옛은행', account: '999', accountHolder: '옛' },
    }))
    assert.equal(form.sameAsOwner, true)
    assert.equal(form.bank, '')
    assert.equal(form.account, '')
    assert.equal(form.accountHolder, '')
  })

  test('저장된 값을 폼으로 복원한다(계좌는 personalInfo에서)', () => {
    const car = applyBusinessForm(sub(), FORM)
    const form = carToBusinessForm(car)
    assert.equal(form.sameAsOwner, false)
    assert.equal(form.name, '한빛운수')
    assert.equal(form.representative, '김대표')
    assert.equal(form.bank, '국민은행')
    assert.equal(form.accountHolder, '김기사')
  })
})

describe('applyBusinessForm', () => {
  test('동일 스위치 켜짐: businessInfo는 값을 복사하지 않고 플래그만, personalInfo 사업자 칸은 비운다', () => {
    const car = sub({
      personalInfo: { driverName: '김기사', phone: '010-1111-2222', name: '옛대표', bizNumber: '999', bank: '옛은행', account: '999', accountHolder: '옛' },
    })
    const next = applyBusinessForm(car, { ...FORM, sameAsOwner: true })
    assert.deepEqual(business(next), {
      sameAsOwner: true, name: '', bizNumber: '', representative: '', address: '', bizType: '', bizItem: '', email: '',
    })
    assert.equal(personal(next).name, '')
    assert.equal(personal(next).bizNumber, '')
    assert.equal(personal(next).email, '')
    assert.equal(personal(next).bank, '')
    assert.equal(personal(next).account, '')
    assert.equal(personal(next).accountHolder, '')
  })

  test('동일 스위치 꺼짐: businessInfo 저장 + personalInfo에 대표자→name·사업자번호 등 복사', () => {
    const next = applyBusinessForm(sub(), FORM)
    assert.equal(business(next).sameAsOwner, false)
    assert.equal(business(next).name, '한빛운수')
    assert.equal(business(next).representative, '김대표')
    assert.equal(personal(next).name, '김대표')
    assert.equal(personal(next).bizNumber, '123-45-67890')
    assert.equal(personal(next).address, '서울시 강서구 1')
    assert.equal(personal(next).bizType, '운수업')
    assert.equal(personal(next).bizItem, '화물운송')
    assert.equal(personal(next).email, 'tax@hanbit.kr')
  })

  test('계좌 3칸은 꺼짐일 때만 저장(켜짐이면 비움), personalInfo의 다른 값(driverName·phone)은 둘 다 보존한다', () => {
    const car = sub({
      personalInfo: { driverName: '김기사', phone: '010-1111-2222' },
    })
    for (const sameAsOwner of [true, false]) {
      const next = applyBusinessForm(car, { ...FORM, sameAsOwner })
      assert.equal(personal(next).bank, sameAsOwner ? '' : '국민은행')
      assert.equal(personal(next).account, sameAsOwner ? '' : '111-222-333')
      assert.equal(personal(next).accountHolder, sameAsOwner ? '' : '김기사')
      assert.equal(personal(next).driverName, '김기사')
      assert.equal(personal(next).phone, '010-1111-2222')
    }
  })

  test('차량의 다른 필드는 그대로 두고 결과 personalInfo/businessInfo 값은 전부 문자열(저장 검증 통과 조건)이다', () => {
    const car = sub({ tonnage: '5톤', insuranceOn: true })
    const next = applyBusinessForm(car, FORM)
    assert.equal(next.tonnage, '5톤')
    assert.equal(next.insuranceOn, true)
    for (const value of Object.values(personal(next))) assert.equal(typeof value, 'string')
    for (const [key, value] of Object.entries(business(next))) {
      assert.equal(typeof value, key === 'sameAsOwner' ? 'boolean' : 'string')
    }
  })
})
