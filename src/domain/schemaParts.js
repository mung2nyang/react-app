// @ts-check
// 저장 자료 검사(Valibot)의 공용 조각. 함정 둘: ① Valibot은 배열도 객체로 받고 검사 뒤엔 새 객체를 넘기므로 배열 거부는 객체 검사 앞(plain).
// ② Valibot number는 NaN을 거부한다 — 지금까지 typeof만 보던 칸은 그 파일에서 따로 맞춘다.
import * as v from 'valibot'

/** @typedef {import('../data/sync/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

/** @param {JsonValue} value @returns {value is Record<string, JsonValue>} */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 칸이 없으면 통과, 칸이 있는데 값이 비어 있으면(undefined) 거부. */
export const opt = v.exactOptional
export const str = v.string()
export const bool = v.boolean()
export const finiteNumber = v.pipe(v.number(), v.finite())
export const stringOrNumber = v.union([str, finiteNumber])
export const nonEmptyString = v.pipe(str, v.nonEmpty())

/** 우리 검사 함수를 Valibot 조각으로. @param {(value: JsonValue) => boolean} check */
export const by = (check) => v.custom((input) => check(/** @type {JsonValue} */ (input)))

/**
 * 배열이 아닌 객체(덧붙일 조건까지)만 먼저 통과시킨 뒤 schema로 검사한다.
 * @template {v.GenericSchema} T
 * @param {T} schema
 * @param {(value: Record<string, JsonValue>) => boolean} [extra]
 */
export const plain = (schema, extra = () => true) => v.pipe(by((input) => isPlainObject(input) && extra(input)), schema)
