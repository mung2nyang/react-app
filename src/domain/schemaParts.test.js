// 저장 자료 검사 공용 조각 — 진행 중 찾은 Valibot 함정(배열을 객체로 받음, NaN 거부, 빈 값)을 못 박는다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as v from 'valibot'
import { finiteNumber, isPlainObject, nonEmptyString, opt, plain, str, stringOrNumber } from './schemaParts.ts'

const ALL_OPTIONAL = v.strictObject({ a: opt(str) })

test('Valibot 객체 검사는 배열도 통과시킨다 — plain()이 배열을 먼저 거른다', () => {
  assert.equal(v.is(ALL_OPTIONAL, []), true, 'Valibot 그대로는 배열 통과(함정)')
  const guarded = plain(ALL_OPTIONAL)
  for (const value of [[], [1], null, 'x', 3]) assert.equal(v.is(guarded, value), false, JSON.stringify(value))
  assert.equal(v.is(guarded, {}), true)
  assert.equal(v.is(guarded, { a: 'x' }), true)
  assert.equal(v.is(guarded, { a: 1 }), false)
  assert.equal(v.is(guarded, { b: 1 }), false)
})

test('plain()의 덧붙일 조건(예: 빈 객체 거부)', () => {
  const nonEmpty = plain(ALL_OPTIONAL, (value) => Object.keys(value).length > 0)
  assert.equal(v.is(nonEmpty, {}), false)
  assert.equal(v.is(nonEmpty, { a: 'x' }), true)
  assert.equal(v.is(nonEmpty, []), false)
})

test('opt: 칸이 없으면 통과, 칸이 있는데 값이 비어 있으면 거부', () => {
  assert.equal(v.is(ALL_OPTIONAL, {}), true)
  assert.equal(v.is(ALL_OPTIONAL, { a: undefined }), false)
})

test('숫자 조각: NaN·무한대 거부, 글자·숫자 조각은 둘 다 받음, 빈 아닌 글자', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '1']) assert.equal(v.is(finiteNumber, value), false, String(value))
  assert.equal(v.is(finiteNumber, -1.5), true)
  assert.equal(v.is(stringOrNumber, 'x'), true)
  assert.equal(v.is(stringOrNumber, 3), true)
  assert.equal(v.is(stringOrNumber, Number.NaN), false)
  assert.equal(v.is(nonEmptyString, ''), false)
  assert.equal(v.is(nonEmptyString, 'x'), true)
})

test('isPlainObject: 배열·null은 객체가 아님', () => {
  assert.equal(isPlainObject({}), true)
  for (const value of [[], null, 'x', 1]) assert.equal(isPlainObject(value), false, JSON.stringify(value))
})
