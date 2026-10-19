// 옛 하루 기록 안 주유·정비·기타 목록 항목 검사의 통과/거부를 칸마다 못 박는다 — 검사 코드를 라이브러리로 바꿔도 결과가 같아야 한다.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  isPersistedFuelItem, isPersistedFuelList, isPersistedMaintItem, isPersistedMaintList, isPersistedMiscItem, isPersistedMiscList,
} from './persistDayRecordLegacy.js'

/** @typedef {import('../../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {Record<string, JsonValue>} Rec */

const FUEL = { type: 'diesel', cost: 50000, subsidy: '1,000', liter: '40', liters: 40.5, mileage: '12345' }
const MAINT = { name: '오일', fare: '30,000원', mileage: 12345, category: '정비', payment: 'card' }
const MISC = { id: 'm-1', name: '세차', fare: 10000, mileage: '1', category: '기타', payment: 'cash' }

/** @type {Array<{ name: string, item: (value: JsonValue) => boolean, list: (value: JsonValue) => boolean, full: Rec, bad: Array<[string, JsonValue]>, required: Array<string>, money: Array<string>, strOrNum: Array<string> }>} */
const CASES = [
  {
    name: '주유', item: isPersistedFuelItem, list: isPersistedFuelList, full: FUEL,
    bad: [['type', 1], ['type', ''], ['cost', 'abc'], ['cost', true], ['subsidy', '-1'], ['subsidy', null], ['liter', true], ['liters', {}], ['mileage', null]],
    required: ['type', 'cost'], money: ['cost', 'subsidy'], strOrNum: ['liter', 'liters', 'mileage'],
  },
  {
    name: '정비', item: isPersistedMaintItem, list: isPersistedMaintList, full: MAINT,
    bad: [['name', 1], ['name', ''], ['fare', 'abc'], ['fare', null], ['mileage', true], ['category', 1], ['payment', 1]],
    required: ['name', 'fare'], money: ['fare'], strOrNum: ['mileage'],
  },
  {
    name: '기타', item: isPersistedMiscItem, list: isPersistedMiscList, full: MISC,
    bad: [['id', 1], ['id', ''], ['name', 1], ['name', ''], ['fare', '1,00'], ['mileage', []], ['category', 1], ['payment', false]],
    required: ['name', 'fare'], money: ['fare'], strOrNum: ['mileage'],
  },
]

for (const { name, item, list, full, bad, required, money, strOrNum } of CASES) {
  describe(`${name} 항목 검사`, () => {
    test('모든 칸 올바르면 통과, 꼭 있는 칸만 있어도 통과', () => {
      assert.equal(item(full), true)
      /** @type {Rec} */
      const only = {}
      for (const key of required) only[key] = full[key]
      assert.equal(item(only), true)
    })

    test('칸마다 틀린 종류, 모르는 칸, 꼭 있는 칸 빠짐, 값 비어 있음, 객체 아님 → 거부', () => {
      for (const [key, value] of bad) assert.equal(item({ ...full, [key]: value }), false, `${key}=${JSON.stringify(value)}`)
      assert.equal(item({ ...full, junk: 1 }), false)
      for (const key of required) {
        const copy = { ...full }
        delete copy[key]
        assert.equal(item(copy), false, `${key} 빠짐`)
      }
      for (const key of Object.keys(full)) {
        const copy = { ...full }
        Reflect.set(copy, key, undefined)
        assert.equal(item(copy), false, `${key}=undefined`)
      }
      for (const value of [null, [], [full], 'text', 3, true]) assert.equal(item(value), false, JSON.stringify(value))
    })

    test('돈 칸: 숫자면 음수·소수도 통과, 금액 글자·빈 글자 통과, 틀린 글자·NaN·무한대 거부', () => {
      for (const key of money) {
        for (const ok of [-5, 1.5, 0, '1,000원', '1000', '']) assert.equal(item({ ...full, [key]: ok }), true, `${key}=${JSON.stringify(ok)}`)
        for (const no of ['abc', '-1', Number.NaN, Number.POSITIVE_INFINITY, true]) assert.equal(item({ ...full, [key]: no }), false, `${key}=${String(no)}`)
      }
    })

    test('주행거리·리터 칸: 글자·숫자 통과, NaN·무한대 거부', () => {
      for (const key of strOrNum) {
        for (const ok of ['x', 3, -1.5]) assert.equal(item({ ...full, [key]: ok }), true, `${key}=${JSON.stringify(ok)}`)
        for (const no of [Number.NaN, Number.NEGATIVE_INFINITY]) assert.equal(item({ ...full, [key]: no }), false, `${key}=${String(no)}`)
      }
    })

    test('목록 검사: 빈 목록 통과, 목록 아님·틀린 항목 하나 거부', () => {
      assert.equal(list([]), true)
      assert.equal(list([full, full]), true)
      assert.equal(list([full, { ...full, junk: 1 }]), false)
      for (const value of [null, {}, full, 'x']) assert.equal(list(value), false, JSON.stringify(value))
    })
  })
}
