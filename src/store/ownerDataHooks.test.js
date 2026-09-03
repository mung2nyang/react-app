// @ts-check
// Step 9 slice C: readOwnerWorkDataByLogId returns full workLogs (main + sub).
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from '../domain/finance.fixtures.js'

const { getOwnerMonthlyFinanceDetail } = await import('../domain/financeOwnerDetail.js')
const { getReceivableItems } = await import('../domain/financeReceivables.js')
const { commitLogWorkData, commitWorkData } = await import('./commitHelpers.js')
const { readOwnerWorkDataByLogId } = await import('./ownerDataHooks.js')

describe('Step 9 slice C — readOwnerWorkDataByLogId', () => {
  test('missing owner returns stable { main: {} }', () => {
    const a = readOwnerWorkDataByLogId('slice-c-missing-owner')
    const b = readOwnerWorkDataByLogId('slice-c-missing-owner')
    assert.equal(a, b)
    assert.deepEqual(Object.keys(a), ['main'])
    assert.deepEqual(a.main, {})
  })

  test('sub logIds are included and raise all/driver fare and receivables', () => {
    const owner = 'slice-c-revenue-hooks'
    const subNumber = '서울12가3456'
    commitWorkData(owner, FIXTURE_WORK.main, { syncToCloud: false })
    commitLogWorkData(owner, subNumber, FIXTURE_WORK[subNumber])
    commitLogWorkData(owner, '부산33나1111', FIXTURE_WORK['부산33나1111'])

    const byLogId = readOwnerWorkDataByLogId(owner)
    assert.ok(byLogId.main)
    assert.ok(byLogId[subNumber])
    assert.ok(byLogId['부산33나1111'])
    assert.equal(byLogId[subNumber]['2026-05-12']?.fare, 250000)

    const mainOnly = { main: byLogId.main }
    for (const scope of ['all', 'driver']) {
      const withSub = getOwnerMonthlyFinanceDetail(MONTH_KEY, scope, FIXTURE_SETTINGS, byLogId, [])
      const withoutSub = getOwnerMonthlyFinanceDetail(MONTH_KEY, scope, FIXTURE_SETTINGS, mainOnly, [])
      assert.ok(
        withSub.income.fare.total > withoutSub.income.fare.total,
        `scope=${scope}: sub logs must raise fare (${withSub.income.fare.total} vs ${withoutSub.income.fare.total})`,
      )
    }

    const ownerScope = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, byLogId, [])
    const ownerMainOnly = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, mainOnly, [])
    assert.equal(ownerScope.income.fare.total, ownerMainOnly.income.fare.total, 'scope=owner uses main only')

    const recvWith = getReceivableItems(FIXTURE_SETTINGS, byLogId)
    const recvMain = getReceivableItems(FIXTURE_SETTINGS, mainOnly)
    assert.ok(recvWith.length >= recvMain.length, 'receivables may include sub logId items')
  })
})
