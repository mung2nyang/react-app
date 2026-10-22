// durable 큐 내부 값(dateKey·patch·callDetails)을 EffectivePatch 계약대로 런타임 검증한다 — { "2026-08-31": [] } 같은 값이 통과하면 기존 일지가 지워진다.
// JsonValue로 받아 실제로 좁힌 뒤에만 필드를 읽는다. 콜상세 검증은 callDetailSchema.ts.
import { isValidCallDetail } from '../store/callDetailSchema.ts'
import type { JsonValue } from '../../domain/jsonTypes.ts'
import type { EffectivePatch } from './pendingWorkDataWritesTypes.ts'

function isPlainObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** fixedCount/palletCount/fixedRouteCounts는 0 이상의 유한한 정수만(DayDraft 계약). */
function isNonNegativeInteger(value: JsonValue): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

const PATCH_KEYS = (['isOff', 'fixedCount', 'palletCount', 'callDetails', 'fixedRouteCounts']) as const

export function isValidPatch(value: JsonValue): value is EffectivePatch {
  if (!isPlainObject(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== PATCH_KEYS.length) return false
  if (!PATCH_KEYS.every((key) => key in value)) return false
  if (typeof value.isOff !== 'boolean') return false
  if (!isNonNegativeInteger(value.fixedCount)) return false
  if (!isNonNegativeInteger(value.palletCount)) return false
  if (!Array.isArray(value.callDetails)) return false
  for (const item of value.callDetails) if (!isValidCallDetail(item)) return false
  if (!isPlainObject(value.fixedRouteCounts)) return false
  for (const v of Object.values(value.fixedRouteCounts)) if (!isNonNegativeInteger(v)) return false
  return true
}
