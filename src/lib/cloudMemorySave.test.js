import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { setHydration, getState } = await import('../store/app-store.js')
const { commitCars, commitClients, commitExpenses, commitInvoices, commitProfile } = await import('../store/commitHelpers.js')
const { saveProfile, EMPTY_PROFILE } = await import('./profile.js')
const { savePracticeSettings } = await import('./practiceSettings.js')
const { saveExpenses } = await import('./expenses.js')
const { saveInvoices } = await import('./invoices.js')
const { hasDirty } = await import('./dirtyJournal.js')
const { readJsonKey, storageKeyFor, writeJsonKey } = await import('../store/persist.js')

/** @param {string} userId @param {string} ownerKey */
function beginReady(userId, ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'ready', userId, ownerKey })
}

/** @param {string} userId @param {string} ownerKey */
function beginFailed(userId, ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'failed', userId, ownerKey })
}

/** @type {Array<import('../store/persist.js').PersistDomain>} */
const BUSINESS_DOMAINS = ['cars', 'clients', 'drivers', 'workData', 'expenses', 'invoices', 'profile']

/**
 * @param {string} ownerKey
 * @param {() => Promise<void>} fn
 */
async function withBusinessSetItemCount(ownerKey, fn) {
  const watched = new Set(BUSINESS_DOMAINS.map((domain) => storageKeyFor(domain, ownerKey)))
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  let hits = 0
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (watched.has(key)) hits += 1
    return original.call(this, key, value)
  })
  try {
    await fn()
    return hits
  } finally {
    spy.mock.restore()
  }
}

/** @param {import('../store/app-store.js').DomainValue|undefined} value */
function profileName(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && 'name' in value ? value.name : undefined
}

/** @param {import('../store/app-store.js').DomainValue|undefined} value */
function settingsUnitPrice(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && 'unitPrice' in value ? value.unitPrice : undefined
}

/** @param {import('../store/app-store.js').DomainValue|undefined} value */
function settingsCallDetail(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && 'callDetail' in value ? value.callDetail : undefined
}

/** @param {import('../store/app-store.js').DomainValue|undefined} value */
function firstItemId(value) {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const first = value[0]
  return first && typeof first === 'object' && first !== null && 'id' in first ? first.id : undefined
}

/** @param {import('../store/app-store.js').DomainValue|undefined} value */
function firstInvoiceRemoteId(value) {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const first = value[0]
  return first && typeof first === 'object' && first !== null && 'supabaseId' in first ? first.supabaseId : undefined
}

describe('슬라이스 E — 로그인 프로필·설정·비용·계산서는 서버 성공 후 Store만', () => {
  test('saveProfile: profiles upsert 1회 후 Store, 업무 LS setItem 0, dirty 없음', async () => {
    const ownerKey = 'cms-profile-ok'
    const userId = 'user-cms-profile-ok'
    beginReady(userId, ownerKey)
    writeJsonKey('profile', ownerKey, { name: '옛LS' })
    commitProfile(ownerKey, { ...EMPTY_PROFILE, name: '이전' }, { syncToCloud: false })
    handlers.profiles = { upsert: () => ({ data: null, error: null }) }

    const hits = await withBusinessSetItemCount(ownerKey, async () => {
      await saveProfile(ownerKey, { ...EMPTY_PROFILE, name: '서버후이름' })
    })
    assert.equal(countOf('profiles', 'upsert'), 1)
    assert.equal(profileName(getState().profile[ownerKey]), '서버후이름')
    assert.equal(profileName(readJsonKey('profile', ownerKey, {})), '옛LS')
    assert.equal(hits, 0)
    assert.equal(hasDirty(ownerKey), false)
    endCloudSession()
  })

  test('saveProfile hydration failed: Store·LS 불변, upsert 0회', async () => {
    const ownerKey = 'cms-profile-failed'
    beginFailed('user-1', ownerKey)
    commitProfile(ownerKey, { ...EMPTY_PROFILE, name: '유지' }, { syncToCloud: false })
    writeJsonKey('profile', ownerKey, { name: 'LS유지' })
    await assert.rejects(() => saveProfile(ownerKey, { ...EMPTY_PROFILE, name: '막힘' }), /클라우드 동기화가 아직 준비되지 않았습니다/)
    assert.equal(countOf('profiles', 'upsert'), 0)
    assert.equal(profileName(getState().profile[ownerKey]), '유지')
    assert.equal(profileName(readJsonKey('profile', ownerKey, {})), 'LS유지')
    endCloudSession()
  })

  test('savePracticeSettings: upsert 1회 후 Store 단가, LS는 theme만, dirty 없음', async () => {
    const ownerKey = 'cms-settings-ok'
    const userId = 'user-cms-settings-ok'
    beginReady(userId, ownerKey)
    writeJsonKey('settings', ownerKey, { theme: 'light', unitPrice: 1 })
    handlers.profiles = { upsert: () => ({ data: null, error: null }) }

    await savePracticeSettings(ownerKey, { unitPrice: 9000, callDetail: true })
    assert.equal(countOf('profiles', 'upsert'), 1)
    assert.equal(settingsUnitPrice(getState().settings[ownerKey]), 9000)
    assert.equal(settingsCallDetail(getState().settings[ownerKey]), true)
    assert.deepEqual(readJsonKey('settings', ownerKey, {}), { theme: 'light' })
    assert.equal(hasDirty(ownerKey), false)
    endCloudSession()
  })

  test('savePracticeSettings throw: Store 단가 불변', async () => {
    const ownerKey = 'cms-settings-err'
    beginReady('user-1', ownerKey)
    await savePracticeSettings(ownerKey, { unitPrice: 100 })
    handlers.profiles = { upsert: () => ({ data: null, error: { message: 'profiles down' } }) }
    await assert.rejects(() => savePracticeSettings(ownerKey, { unitPrice: 999 }))
    assert.equal(settingsUnitPrice(getState().settings[ownerKey]), 100)
    endCloudSession()
  })

  test('saveExpenses: 서버 기록 후 Store, expenses LS setItem 0', async () => {
    const ownerKey = 'cms-exp-ok'
    const userId = 'user-cms-exp-ok'
    beginReady(userId, ownerKey)
    commitCars(ownerKey, [{ id: 'car-1', type: 'main', number: '11가1111', supabaseId: 501 }], { syncToCloud: false })
    writeJsonKey('expenses', ownerKey, [{ id: 'old', kind: 'fuel', date: '2026-08-01' }])
    handlers.daily_logs = {
      select: () => ({ data: [{ id: 10, work_date: '2026-08-01' }], error: null }),
      upsert: () => ({ data: { id: 10 }, error: null }),
    }
    handlers.fuel_records = { delete: () => ({ data: null, error: null }), insert: () => ({ data: null, error: null }) }
    handlers.maintenance_records = { delete: () => ({ data: null, error: null }), insert: () => ({ data: null, error: null }) }
    handlers.misc_expense_records = { delete: () => ({ data: null, error: null }), insert: () => ({ data: null, error: null }) }
    /** @type {Array<import('../domain/expenseTypes.js').ExpenseItem>} */
    const next = [{ id: 'fuel-new', kind: 'fuel', date: '2026-08-01', name: '주유', cost: 1000 }]

    const hits = await withBusinessSetItemCount(ownerKey, async () => {
      await saveExpenses(ownerKey, next)
    })
    assert.ok(countOf('fuel_records', 'insert') >= 1)
    assert.equal(firstItemId(getState().expenses[ownerKey]), 'fuel-new')
    assert.equal(firstItemId(readJsonKey('expenses', ownerKey, [])), 'old')
    assert.equal(hits, 0)
    assert.equal(hasDirty(ownerKey), false)
    endCloudSession()
  })

  test('saveExpenses 서버 실패: Store 유지', async () => {
    const ownerKey = 'cms-exp-fail'
    beginReady('user-1', ownerKey)
    commitCars(ownerKey, [{ id: 'car-1', type: 'main', number: '11가1111', supabaseId: 501 }], { syncToCloud: false })
    /** @type {Array<import('../domain/expenseTypes.js').ExpenseItem>} */
    const previous = [{ id: 'keep', kind: 'fuel', date: '2026-08-01', name: '주유', cost: 1 }]
    commitExpenses(ownerKey, previous, { syncToCloud: false })
    handlers.daily_logs = { select: () => ({ data: null, error: { message: 'daily down' } }) }
    /** @type {Array<import('../domain/expenseTypes.js').ExpenseItem>} */
    const attempted = [{ id: 'new', kind: 'fuel', date: '2026-08-01', name: '주유', cost: 2 }]
    await assert.rejects(() => saveExpenses(ownerKey, attempted))
    assert.equal(firstItemId(getState().expenses[ownerKey]), 'keep')
    endCloudSession()
  })

  test('saveInvoices: tax_invoices insert 후 Store, invoices LS 불변', async () => {
    const ownerKey = 'cms-inv-ok'
    const userId = 'user-cms-inv-ok'
    beginReady(userId, ownerKey)
    commitCars(ownerKey, [{ id: 'car-1', type: 'main', number: '11가1111', supabaseId: 501 }], { syncToCloud: false })
    commitClients(ownerKey, [{ id: 'c1', companyName: '거래', supabaseId: 8 }], { syncToCloud: false })
    writeJsonKey('invoices', ownerKey, [{ id: 'old-inv' }])
    handlers.tax_invoices = { insert: () => ({ data: { id: 99 }, error: null }) }
    const draft = {
      id: 'inv-1', clientName: '거래', carNumber: '11가1111', monthKey: '2026-08',
      supplyAmount: 10000, taxAmount: 1000, totalAmount: 11000, status: 'draft',
    }

    const hits = await withBusinessSetItemCount(ownerKey, async () => {
      await saveInvoices(ownerKey, [draft])
    })
    assert.equal(countOf('tax_invoices', 'insert'), 1)
    assert.equal(firstInvoiceRemoteId(getState().invoices[ownerKey]), 99)
    assert.equal(firstItemId(readJsonKey('invoices', ownerKey, [])), 'old-inv')
    assert.equal(hits, 0)
    assert.equal(hasDirty(ownerKey), false)
    endCloudSession()
  })

  test('saveInvoices 서버 실패: Store 유지', async () => {
    const ownerKey = 'cms-inv-fail'
    beginReady('user-1', ownerKey)
    commitCars(ownerKey, [{ id: 'car-1', type: 'main', number: '11가1111', supabaseId: 501 }], { syncToCloud: false })
    const previous = [{ id: 'keep-inv', clientName: '거래', carNumber: '11가1111' }]
    commitInvoices(ownerKey, previous, { syncToCloud: false })
    handlers.tax_invoices = { insert: () => ({ data: null, error: { message: 'tax down' } }) }
    await assert.rejects(() => saveInvoices(ownerKey, [{
      id: 'new-inv', clientName: '거래', carNumber: '11가1111', monthKey: '2026-08',
    }]))
    assert.equal(firstItemId(getState().invoices[ownerKey]), 'keep-inv')
    endCloudSession()
  })
})
