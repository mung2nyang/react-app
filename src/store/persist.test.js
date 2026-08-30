import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { PERSIST_KEYS, readJsonKey, readLogWorkData, storageKeyFor, storageKeyForLog, writeJsonKey } from './persist.js'
import { readPersistDomain } from './persistDomainRead.js'

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

describe('readLogWorkData — 키 부재와 실패를 구분한다', () => {
  test('키 부재는 ok missing 이고 빈 객체다', () => {
    const result = readLogWorkData('never-log-owner', '12가3456')
    assert.equal(result.ok, true)
    assert.equal(result.kind, 'missing')
    assert.deepEqual(result.value, {})
  })

  test('정상 JSON 객체는 kind value', () => {
    localStorage.setItem(storageKeyForLog(OWNER, '99하9999'), JSON.stringify({ '2026-08-01': { isOff: true } }))
    const result = readLogWorkData(OWNER, '99하9999')
    assert.equal(result.ok, true)
    assert.equal(result.kind, 'value')
    assert.equal(result.value['2026-08-01'].isOff, true)
  })

  test('getItem 예외는 ok false kind getItem 이며 {}가 아니다', () => {
    const proto = Object.getPrototypeOf(localStorage)
    const original = proto.getItem
    const spy = mock.method(proto, 'getItem', function patched(/** @type {string} */ key) {
      if (key === storageKeyForLog(OWNER, 'boom')) throw new Error('blocked')
      return original.call(localStorage, key)
    })
    try {
      const result = readLogWorkData(OWNER, 'boom')
      assert.equal(result.ok, false)
      assert.equal(result.kind, 'getItem')
      assert.equal('value' in result, false)
    } finally {
      spy.mock.restore()
    }
  })

  test('깨진 JSON은 parse, 배열은 schema', () => {
    localStorage.setItem(storageKeyForLog(OWNER, 'bad-json'), '{nope')
    const parsed = readLogWorkData(OWNER, 'bad-json')
    assert.equal(parsed.ok, false)
    assert.equal(parsed.kind, 'parse')
    localStorage.setItem(storageKeyForLog(OWNER, 'bad-schema'), '[]')
    const schema = readLogWorkData(OWNER, 'bad-schema')
    assert.equal(schema.ok, false)
    assert.equal(schema.kind, 'schema')
  })

  test('잘못된 dateKey와 DayRecord 중첩 손상은 schema다', () => {
    localStorage.setItem(storageKeyForLog(OWNER, 'bad-date'), JSON.stringify({ '2026-02-30': { isOff: false, fixedCount: 1 } }))
    assert.equal(readLogWorkData(OWNER, 'bad-date').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'bad-count'), JSON.stringify({ '2026-08-01': { isOff: false, fixedCount: '1' } }))
    assert.equal(readLogWorkData(OWNER, 'bad-count').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'neg-count'), JSON.stringify({ '2026-08-01': { isOff: false, fixedCount: -1 } }))
    assert.equal(readLogWorkData(OWNER, 'neg-count').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'float-count'), JSON.stringify({ '2026-08-01': { isOff: false, fixedCount: 1.5 } }))
    assert.equal(readLogWorkData(OWNER, 'float-count').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'bad-call'), JSON.stringify({
      '2026-08-01': { isOff: false, callDetails: [{ id: 'c1', payments: 'broken' }] },
    }))
    assert.equal(readLogWorkData(OWNER, 'bad-call').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'extra-key'), JSON.stringify({ '2026-08-01': { isOff: false, hacked: true } }))
    assert.equal(readLogWorkData(OWNER, 'extra-key').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'legacy-call'), JSON.stringify({
      '2026-08-01': { isOff: false, callDetails: [{ loadLoc: '레거시상차', fare: '1,000' }] },
    }))
    assert.equal(readLogWorkData(OWNER, 'legacy-call').kind, 'value')
    localStorage.setItem(storageKeyForLog(OWNER, 'vanilla-exp'), JSON.stringify({
      '2026-08-01': {
        isOff: false,
        fuelItems: [{ type: '주유', cost: '80,000', subsidy: '5,000', liter: 40 }],
        maintItems: [{ name: '오일', fare: '30,000' }],
        miscItems: [{ name: '통행료', fare: '8,000' }],
      },
    }))
    assert.equal(readLogWorkData(OWNER, 'vanilla-exp').kind, 'value')
    localStorage.setItem(storageKeyForLog(OWNER, 'empty-item'), JSON.stringify({
      '2026-08-01': { isOff: false, fuelItems: [{}] },
    }))
    assert.equal(readLogWorkData(OWNER, 'empty-item').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'fuel-extra'), JSON.stringify({
      '2026-08-01': { isOff: false, fuelItems: [{ type: '주유', cost: 1, unknown: true }] },
    }))
    assert.equal(readLogWorkData(OWNER, 'fuel-extra').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'nested-cost'), JSON.stringify({
      '2026-08-01': { isOff: false, fuelItems: [{ type: '주유', cost: { n: 1 } }] },
    }))
    assert.equal(readLogWorkData(OWNER, 'nested-cost').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'bad-fare'), JSON.stringify({ '2026-08-01': { fare: 'oops' } }))
    assert.equal(readLogWorkData(OWNER, 'bad-fare').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'ok-fare'), JSON.stringify({ '2026-08-01': { fare: '1,000' } }))
    assert.equal(readLogWorkData(OWNER, 'ok-fare').kind, 'value')
    localStorage.setItem(storageKeyForLog(OWNER, 'empty-day'), JSON.stringify({ '2026-08-01': {} }))
    assert.equal(readLogWorkData(OWNER, 'empty-day').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'legacy-off'), JSON.stringify({ '2026-08-01': 'off' }))
    const offRead = readLogWorkData(OWNER, 'legacy-off')
    assert.equal(offRead.kind, 'value')
    assert.equal(offRead.ok && offRead.value['2026-08-01']?.isOff, true)
    localStorage.setItem(storageKeyForLog(OWNER, 'distance-fee'), JSON.stringify({
      '2026-08-01': {
        isOff: false,
        dailyDistance: 12.5,
        callDetails: [{ loadLoc: '상차', fare: '1,000', insuranceFee: '2,000' }],
      },
    }))
    assert.equal(readLogWorkData(OWNER, 'distance-fee').kind, 'value')
    localStorage.setItem(storageKeyForLog(OWNER, 'fuel-name-only'), JSON.stringify({
      '2026-08-01': { isOff: false, fuelItems: [{ name: '주유만' }] },
    }))
    assert.equal(readLogWorkData(OWNER, 'fuel-name-only').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'maint-cost-only'), JSON.stringify({
      '2026-08-01': { isOff: false, maintItems: [{ cost: 1000 }] },
    }))
    assert.equal(readLogWorkData(OWNER, 'maint-cost-only').kind, 'schema')
    localStorage.setItem(storageKeyForLog(OWNER, 'misc-id-only'), JSON.stringify({
      '2026-08-01': { isOff: false, miscItems: [{ id: 'misc-1' }] },
    }))
    assert.equal(readLogWorkData(OWNER, 'misc-id-only').kind, 'schema')
  })
})

describe('readPersistDomain — 빈 항목과 잘못된 내부 필드는 schema', () => {
  test('cars/clients/expenses의 {} 항목은 schema다', () => {
    writeJsonKey('cars', OWNER, [{}])
    assert.equal(readPersistDomain('cars', OWNER).kind, 'schema')
    writeJsonKey('clients', OWNER, [{}])
    assert.equal(readPersistDomain('clients', OWNER).kind, 'schema')
    writeJsonKey('expenses', OWNER, [{}])
    assert.equal(readPersistDomain('expenses', OWNER).kind, 'schema')
    writeJsonKey('invoices', OWNER, [{}])
    assert.equal(readPersistDomain('invoices', OWNER).kind, 'schema')
    writeJsonKey('drivers', OWNER, [{}])
    assert.equal(readPersistDomain('drivers', OWNER).kind, 'schema')
  })

  test('잘못된 내부 필드와 enum/숫자 위반은 schema다', () => {
    writeJsonKey('cars', OWNER, [{ number: '11가1111', extra: 1 }])
    assert.equal(readPersistDomain('cars', OWNER).kind, 'schema')
    writeJsonKey('cars', OWNER, [{ number: '11가1111', settlementMode: null, commType: null }])
    assert.equal(readPersistDomain('cars', OWNER).kind, 'schema')
    writeJsonKey('cars', OWNER, [{ number: '11가1111', settlementMode: 'bogus' }])
    assert.equal(readPersistDomain('cars', OWNER).kind, 'schema')
    writeJsonKey('cars', OWNER, [{ number: '11가1111', commType: 'bogus' }])
    assert.equal(readPersistDomain('cars', OWNER).kind, 'schema')
    writeJsonKey('cars', OWNER, [{ number: '11가1111', infoType: 'bogus' }])
    assert.equal(readPersistDomain('cars', OWNER).kind, 'schema')
    writeJsonKey('clients', OWNER, [{ id: 'c1', companyName: '한진', paymentTerm: 'bogus' }])
    assert.equal(readPersistDomain('clients', OWNER).kind, 'schema')
    writeJsonKey('settings', OWNER, { defaultDriverSettlementMode: 'bogus' })
    assert.equal(readPersistDomain('settings', OWNER).kind, 'schema')
    writeJsonKey('settings', OWNER, { driverInvoiceBasis: 'bogus' })
    assert.equal(readPersistDomain('settings', OWNER).kind, 'schema')
    writeJsonKey('invoices', OWNER, [{ id: 'i1', flow: 'bogus' }])
    assert.equal(readPersistDomain('invoices', OWNER).kind, 'schema')
    writeJsonKey('invoices', OWNER, [{ id: 'i1', status: 'bogus' }])
    assert.equal(readPersistDomain('invoices', OWNER).kind, 'schema')
    writeJsonKey('clients', OWNER, [{ id: 'c1', companyName: '한진', isPinned: 'yes' }])
    assert.equal(readPersistDomain('clients', OWNER).kind, 'schema')
    writeJsonKey('settings', OWNER, { theme: 'neon' })
    assert.equal(readPersistDomain('settings', OWNER).kind, 'schema')
    writeJsonKey('expenses', OWNER, [{ id: 'e1', kind: 'food', date: '2026-08-01' }])
    assert.equal(readPersistDomain('expenses', OWNER).kind, 'schema')
    writeJsonKey('invoices', OWNER, [{ id: 'i1', supplyAmount: Number.NaN }])
    assert.equal(readPersistDomain('invoices', OWNER).kind, 'schema')
    writeJsonKey('drivers', OWNER, [{ id: 'd1', status: 'gone' }])
    assert.equal(readPersistDomain('drivers', OWNER).kind, 'schema')
    writeJsonKey('profile', OWNER, { name: 1 })
    assert.equal(readPersistDomain('profile', OWNER).kind, 'schema')
    writeJsonKey('workDataDeletedDates', OWNER, { 'not-a-date': '2026-08-01T00:00:00.000Z' })
    assert.equal(readPersistDomain('workDataDeletedDates', OWNER).kind, 'schema')
    writeJsonKey('workData', OWNER, { '2026-08-01': {} })
    assert.equal(readPersistDomain('workData', OWNER).kind, 'schema')
  })
})
