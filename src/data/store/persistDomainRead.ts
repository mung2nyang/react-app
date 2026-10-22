import { storageKeyFor } from './persist.ts'
import { matchesDomainSchema } from './persistDomainSchema.ts'
import { isPlainObject } from './persistDomainRecords.ts'
import type { PersistDomain } from './persist.ts'
import type { DomainValue } from './app-store.ts'
import type { JsonValue } from '../../domain/jsonTypes.ts'

export type PersistDomainRead = { ok: true, kind: 'missing', value: DomainValue }
  | { ok: true, kind: 'value', value: DomainValue }
  | { ok: false, kind: 'getItem' | 'parse' | 'schema' }

function expectsArray(domain: PersistDomain) {
  return domain !== 'settings' && domain !== 'profile' && domain !== 'workData' && domain !== 'workDataDeletedDates'
}

function emptyValue(domain: PersistDomain) {
  return expectsArray(domain) ? ([]) as DomainValue : ({}) as DomainValue
}

/** 키 부재와 getItem/parse/schema 실패를 구분한다. 실패 시 fallback으로 바꾸지 않는다. */
export function readPersistDomain(domain: PersistDomain, ownerKey: string): PersistDomainRead {
  const key = storageKeyFor(domain, ownerKey)
  let raw
  try {
    raw = localStorage.getItem(key)
  } catch {
    return { ok: false, kind: 'getItem' }
  }
  if (raw === null) return { ok: true, kind: 'missing', value: emptyValue(domain) }
  let parsed: JsonValue
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, kind: 'parse' }
  }
  if (!isPlainObject(parsed) && !Array.isArray(parsed)) return { ok: false, kind: 'schema' }
  if (!matchesDomainSchema(domain, parsed)) return { ok: false, kind: 'schema' }
  return { ok: true, kind: 'value', value: (parsed) as DomainValue }
}
