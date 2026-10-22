// 저장 자료 검사(Valibot)의 공용 조각. 함정 둘: ① Valibot은 배열도 객체로 받고 검사 뒤엔 새 객체를 넘기므로 배열 거부는 객체 검사 앞(plain).
// ② Valibot number는 NaN을 거부한다 — 지금까지 typeof만 보던 칸은 그 파일에서 따로 맞춘다.
import * as v from 'valibot'
import type { JsonValue } from './jsonTypes.ts'

export function isPlainObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 칸이 없으면 통과, 칸이 있는데 값이 비어 있으면(undefined) 거부. */
export const opt = v.exactOptional
export const str = v.string()
export const bool = v.boolean()
export const finiteNumber = v.pipe(v.number(), v.finite())
export const stringOrNumber = v.union([str, finiteNumber])
export const nonEmptyString = v.pipe(str, v.nonEmpty())

/** 우리 검사 함수를 Valibot 조각으로. */
export const by = (check: (value: JsonValue) => boolean) => v.custom((input) => check(input as JsonValue))

/** 배열이 아닌 객체(덧붙일 조건까지)만 먼저 통과시킨 뒤 schema로 검사한다. */
export const plain = <T extends v.GenericSchema>(schema: T, extra: (value: Record<string, JsonValue>) => boolean = () => true) =>
  v.pipe(by((input) => isPlainObject(input) && extra(input)), schema)
