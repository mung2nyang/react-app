// @ts-check
// 서브 일지 durable pending을 차량번호 변경/삭제와 같은 원자 단위로 다룬다.
import { durableKey, readDurable } from './durableStorage.js'
import {
  clearUnsafeRegistrationFailure,
  listUnsafeRegistrations,
  markUnsafeRegistrationFailure,
} from './durableWriteGuard.js'
import { pendingOwnerForLog } from './pendingLogOwner.js'
import { fallback, KEY_SEP, settledCallbacks } from './pendingWorkDataWritesState.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */
/** @typedef {import('../store/atomicPersist.js').KeyedWrite} KeyedWrite */

/**
 * @typedef {Object} PendingDatePatch
 * @property {string} dateKey
 * @property {EffectivePatch} patch
 */

/** @param {string} pendingOwner */
function fallbackPatchesFor(pendingOwner) {
  /** @type {Array<PendingDatePatch>} */
  const items = []
  fallback.forEach((patch, key) => {
    const [owner, dateKey] = key.split(KEY_SEP)
    if (owner === pendingOwner && dateKey) items.push({ dateKey, patch })
  })
  return items
}

/** @param {string} pendingOwner */
function unsafePatchesFor(pendingOwner) {
  return listUnsafeRegistrations()
    .filter((item) => item.ownerKey === pendingOwner)
    .map((item) => ({ dateKey: item.dateKey, patch: item.patch }))
}

/**
 * @param {string} ownerKey
 * @param {string} logId
 */
export function inspectLogPending(ownerKey, logId) {
  const pendingOwner = pendingOwnerForLog(ownerKey, logId)
  const durable = readDurable(pendingOwner)
  const fallbackItems = fallbackPatchesFor(pendingOwner)
  const unsafeItems = unsafePatchesFor(pendingOwner)
  return {
    pendingOwner,
    readable: durable.ok,
    durable: durable.ok ? durable.value : null,
    fallbackItems,
    unsafeItems,
    hasCallback: Array.from(settledCallbacks.keys()).some((key) => key.startsWith(`${pendingOwner}${KEY_SEP}`)),
    hasAny: durable.ok
      ? Object.keys(durable.value).length > 0 || fallbackItems.length > 0 || unsafeItems.length > 0
      : fallbackItems.length > 0 || unsafeItems.length > 0,
  }
}

/** @param {string} pendingOwner */
export function clearPendingMapsForOwner(pendingOwner) {
  Array.from(fallback.keys()).forEach((key) => {
    if (key.startsWith(`${pendingOwner}${KEY_SEP}`)) fallback.delete(key)
  })
  Array.from(settledCallbacks.keys()).forEach((key) => {
    if (key.startsWith(`${pendingOwner}${KEY_SEP}`)) settledCallbacks.delete(key)
  })
  unsafePatchesFor(pendingOwner).forEach((item) => {
    clearUnsafeRegistrationFailure(pendingOwner, item.dateKey)
  })
}

/**
 * @param {string} oldOwner
 * @param {string} newOwner
 */
export function rekeyPendingMaps(oldOwner, newOwner) {
  Array.from(fallback.entries()).forEach((entry) => {
    const key = entry[0]
    const patch = entry[1]
    if (!key.startsWith(`${oldOwner}${KEY_SEP}`)) return
    const dateKey = key.slice(oldOwner.length + KEY_SEP.length)
    fallback.set(`${newOwner}${KEY_SEP}${dateKey}`, patch)
    fallback.delete(key)
  })
  Array.from(settledCallbacks.entries()).forEach((entry) => {
    const key = entry[0]
    const cb = entry[1]
    if (!key.startsWith(`${oldOwner}${KEY_SEP}`)) return
    const dateKey = key.slice(oldOwner.length + KEY_SEP.length)
    settledCallbacks.set(`${newOwner}${KEY_SEP}${dateKey}`, cb)
    settledCallbacks.delete(key)
  })
  unsafePatchesFor(oldOwner).forEach((item) => {
    clearUnsafeRegistrationFailure(oldOwner, item.dateKey)
    markUnsafeRegistrationFailure(newOwner, item.dateKey, item.patch)
  })
}

/**
 * @typedef {Object} PendingPlanError
 * @property {string} error
 */

/**
 * @typedef {Object} PendingPlanOk
 * @property {Array<KeyedWrite>} extraWrites
 * @property {() => void} afterPersist
 */

/**
 * @param {string} ownerKey
 * @param {string} oldNumber
 * @param {string} newNumber
 * @returns {PendingPlanError | PendingPlanOk}
 */
export function planPendingLogMove(ownerKey, oldNumber, newNumber) {
  const oldInspect = inspectLogPending(ownerKey, oldNumber)
  const newInspect = inspectLogPending(ownerKey, newNumber)
  if (!oldInspect.readable || !newInspect.readable) {
    return { error: '운행 대기 기록을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' }
  }
  /** @type {Record<string, EffectivePatch>} */
  const merged = Object.assign({}, newInspect.durable || {}, oldInspect.durable || {})
  newInspect.fallbackItems.forEach((item) => { merged[item.dateKey] = item.patch })
  oldInspect.fallbackItems.forEach((item) => { merged[item.dateKey] = item.patch })
  /** @type {Array<KeyedWrite>} */
  const extraWrites = []
  const jsonMerged = /** @type {import('../store/atomicPersist.js').JsonValue} */ (merged)
  if (Object.keys(merged).length > 0) extraWrites.push({ key: durableKey(newInspect.pendingOwner), value: jsonMerged })
  extraWrites.push({ key: durableKey(oldInspect.pendingOwner), remove: true })
  return {
    extraWrites,
    afterPersist: () => rekeyPendingMaps(oldInspect.pendingOwner, newInspect.pendingOwner),
  }
}

/**
 * @param {string} ownerKey
 * @param {string} logId
 * @returns {PendingPlanError | PendingPlanOk}
 */
export function planPendingLogDiscard(ownerKey, logId) {
  const inspect = inspectLogPending(ownerKey, logId)
  if (!inspect.readable) {
    return { error: '운행 대기 기록을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' }
  }
  return {
    extraWrites: [{ key: durableKey(inspect.pendingOwner), remove: true }],
    afterPersist: () => clearPendingMapsForOwner(inspect.pendingOwner),
  }
}
