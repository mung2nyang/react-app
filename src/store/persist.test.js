import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { PERSIST_KEYS, readJsonKey, storageKeyFor, writeJsonKey } from './persist.js'

const OWNER = 'persist-roundtrip-owner'

describe('persist — 9개 키 round-trip', () => {
  for (const domain of Object.keys(PERSIST_KEYS)) {
    test(`${domain}: 쓴 값을 그대로 읽는다`, () => {
      const value = { domain, marker: `${domain}-value`, nested: { n: 1 } }
      writeJsonKey(domain, OWNER, value)
      const readBack = readJsonKey(domain, OWNER, null)
      assert.deepEqual(readBack, value)
    })
  }

  test('storageKeyFor가 만드는 실제 localStorage 키는 PERSIST_KEYS 접두어와 정확히 같다', () => {
    for (const [domain, prefix] of Object.entries(PERSIST_KEYS)) {
      assert.equal(storageKeyFor(domain, OWNER), `${prefix}:${OWNER}`)
    }
  })

  test('알 수 없는 domain은 storageKeyFor에서 던진다', () => {
    assert.throws(() => storageKeyFor('doesNotExist', OWNER))
  })

  test('값이 없으면 fallback을 그대로 돌려준다', () => {
    const fallback = { empty: true }
    assert.deepEqual(readJsonKey('cars', 'never-written-owner', fallback), fallback)
  })

  test('JSON이 깨져 있으면 fallback으로 떨어진다', () => {
    localStorage.setItem(storageKeyFor('cars', OWNER), '{not json')
    assert.deepEqual(readJsonKey('cars', OWNER, []), [])
  })

  test('9개 도메인은 서로 다른 localStorage 키를 쓴다(값이 섞이지 않는다)', () => {
    const domains = Object.keys(PERSIST_KEYS)
    domains.forEach((domain, index) => writeJsonKey(domain, OWNER, { onlyFor: domain, index }))
    domains.forEach((domain) => {
      const value = readJsonKey(domain, OWNER, null)
      assert.equal(value.onlyFor, domain)
    })
  })
})
