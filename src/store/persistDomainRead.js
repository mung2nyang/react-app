// @ts-check
import { storageKeyFor } from './persist.js'
import { matchesDomainSchema } from './persistDomainSchema.js'
import { isPlainObject } from './persistDomainRecords.js'

/** @typedef {import('./persist.js').PersistDomain} PersistDomain */
/** @typedef {import('./app-store.js').DomainValue} DomainValue */

/**
 * @typedef {{ ok: true, kind: 'missing', value: DomainValue }
 *   | { ok: true, kind: 'value', value: DomainValue }
 *   | { ok: false, kind: 'getItem' | 'parse' | 'schema' }} PersistDomainRead
 */

/** @param {PersistDomain} domain */
function expectsArray(domain) {
  return domain !== 'settings' && domain !== 'profile' && domain !== 'workData' && domain !== 'workDataDeletedDates'
}

/** @param {PersistDomain} domain */
function emptyValue(domain) {
  return expectsArray(domain) ? /** @type {DomainValue} */ ([]) : /** @type {DomainValue} */ ({})
}

/**
 * 키 부재와 getItem/parse/schema 실패를 구분한다. 실패 시 fallback으로 바꾸지 않는다.
 * @param {PersistDomain} domain
 * @param {string} ownerKey
 * @returns {PersistDomainRead}
 */
export function readPersistDomain(domain, ownerKey) {
  const key = storageKeyFor(domain, ownerKey)
  let raw
  try {
    raw = localStorage.getItem(key)
  } catch {
    return { ok: false, kind: 'getItem' }
  }
  if (raw === null) return { ok: true, kind: 'missing', value: emptyValue(domain) }
  /** @type {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} */
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, kind: 'parse' }
  }
  if (!isPlainObject(parsed) && !Array.isArray(parsed)) return { ok: false, kind: 'schema' }
  if (!matchesDomainSchema(domain, parsed)) return { ok: false, kind: 'schema' }
  return { ok: true, kind: 'value', value: /** @type {DomainValue} */ (parsed) }
}
