// @ts-check
// 재감사 7차(FAIL 지적 1번, P0) — durableStorage.js의 readDurable은 최상위가 객체인지만
// 확인하고 내부 값을 단언했다. `{ "2026-08-31": [] }` 같은 값이 정상 pending으로
// 통과해 기존 일지를 지워 버리는 P0가 실측됐다. 이 파일은 그 내부 값을 실제
// EffectivePatch 계약대로 런타임에 전부 검증한다 — JsonValue(pendingWorkDataWritesTypes.js,
// JSON.parse가 실제로 돌려줄 수 있는 모양을 그대로 표현하는 재귀 타입)로 받아
// typeof/Array.isArray로 실제 좁힌 뒤에만 필드를 읽는다. 콜상세 검증은
// callDetailSchema.js(200줄 제한, 역할 분리)로 뺐다.
import { isValidCallDetail } from './callDetailSchema.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */

/** @param {JsonValue} value @returns {value is Record<string, JsonValue>} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 재감사 9차(FAIL 지적 1번, P0) — day-log-reducer.js의 실제 `DayDraft` 계약대로
 * fixedCount/palletCount/fixedRouteCounts 값은 전부 0 이상의 유한한 **정수**다
 * (`Math.max(0, parseInt(...) || 0)`로 만들어진다 — 문자열·소수·음수·NaN·Infinity는
 * 프로덕션에서 절대 안 나온다). typeof number만 보고 통과시키던 예전 검증은
 * `"oops"`/`-1`/`1.5` 전부 놓쳤다.
 * @param {JsonValue} value @returns {value is number}
 */
function isNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

const PATCH_KEYS = /** @type {const} */ (['isOff', 'fixedCount', 'palletCount', 'callDetails', 'fixedRouteCounts'])

/**
 * @param {JsonValue} value
 * @returns {value is EffectivePatch}
 */
export function isValidPatch(value) {
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
