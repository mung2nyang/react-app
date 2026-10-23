// @ts-check
// 로드맵 24-D-2 — 운비서 질문 숫자는 매출·미수금·세금계산서 화면이 쓰는 함수를 같은 자료로 직접 부른 값과 같다(새 계산 없음 증명).
import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { before, test } from 'node:test'

const { commitCars, commitClients, commitDrivers, commitExpenses, commitLogWorkData, commitSettings } = await import('../../../data/store/commitHelpers.ts')
const { readOwnerDriverExpenses, readOwnerExpenses, readOwnerWorkDataByLogId } = await import('../../../data/store/ownerDataHooks.ts')
const { buildFinanceSettings } = await import('../../../data/sync/ownerFinance.ts')
const { getOwnerMonthlyFinanceDetail, getReceivableItems, getTaxInvoiceSourceGroups } = await import('../../../domain/finance.ts')
const { getDriverSelfMonthlyDetail } = await import('../../../domain/driverSelfRevenue.ts')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { FIXTURE_EXPENSES, FIXTURE_SETTINGS, FIXTURE_WORK } = await import('../../../domain/finance.fixtures.ts')
const { monthsOf, questionNumbers } = await import('./unbiseoNumbers.ts')

/** @typedef {import('./unbiseoQuestion.ts').UnbiseoQuestion} UnbiseoQuestion */

const OWNER = 'unbiseo-numbers'
const MAY = /** @type {const} */ ({ unit: 'month', value: '2026-05' })
const YEAR = /** @type {const} */ ({ unit: 'year', value: '2026' })
const YEAR_MONTHS = monthsOf(YEAR)

/** @param {Partial<UnbiseoQuestion>} fields @returns {UnbiseoQuestion} */
const q = (fields) => ({ type: 'revenue', period: MAY, client: '', expenseType: '', ...fields })

before(() => {
  commitSettings(OWNER, normalizeSettings({ fixedOn: true, subFixedOn: true }))
  commitClients(OWNER, FIXTURE_SETTINGS.clients)
  commitCars(OWNER, FIXTURE_SETTINGS.cars)
  commitDrivers(OWNER, [{ id: 'link-1', name: '김기사', phone: '', vehicleNumber: '서울12가3456', startDate: '2026-05-01', endDate: '2026-05-31', status: 'linked' }])
  Object.entries(FIXTURE_WORK).forEach(([logId, data]) => commitLogWorkData(OWNER, logId, data))
  // 연 합 확인용 — 메인 차량 4월 운행 하나(차주 탭에 잡힘).
  commitLogWorkData(OWNER, 'main', { ...FIXTURE_WORK.main, '2026-04-15': { callDetails: [{ id: 'trp-unbiseo-apr', client: '롯데', fare: '50,000' }] } })
  commitExpenses(OWNER, FIXTURE_EXPENSES)
})

// 화면과 같은 재료 — 매출·미수금 화면이 쓰는 그대로.
const screen = () => ({ settings: buildFinanceSettings(OWNER), work: readOwnerWorkDataByLogId(OWNER), expenses: readOwnerExpenses(OWNER), driverExpenses: readOwnerDriverExpenses(OWNER) })
/** @param {string} monthKey */
const ownerDetail = (monthKey) => { const s = screen(); return getOwnerMonthlyFinanceDetail(monthKey, 'owner', s.settings, s.work, s.expenses, s.driverExpenses) }
/** @param {string} monthKey */
const driverDetail = (monthKey) => { const s = screen(); return getDriverSelfMonthlyDetail(monthKey, s.settings, s.work, s.expenses) }
/** @param {(monthKey: string) => number} pick */
const yearSum = (pick) => YEAR_MONTHS.reduce((sum, monthKey) => sum + pick(monthKey), 0)

test('기간의 달: 달은 그 달, 연은 12달, 전체는 없음', () => {
  assert.deepEqual(monthsOf(MAY), ['2026-05'])
  assert.equal(YEAR_MONTHS.length, 12)
  assert.equal(YEAR_MONTHS[0], '2026-01')
  assert.equal(YEAR_MONTHS[11], '2026-12')
  assert.deepEqual(monthsOf({ unit: 'all' }), [])
})

test('차주: 매출·순이익·지출·운행 횟수 = 매출 화면 기본 "차주" 탭 함수(달, 연은 12달 합)', () => {
  const may = ownerDetail('2026-05')
  assert.ok(may.income.total > 0 && may.tripCount > 0 && may.expense.total > 0, '자료가 비어 있지 않음')
  assert.equal(questionNumbers(OWNER, q({}), false).amount, may.income.total)
  assert.equal(questionNumbers(OWNER, q({ type: 'netProfit' }), false).amount, may.netProfit)
  assert.equal(questionNumbers(OWNER, q({ type: 'expense' }), false).amount, may.expense.total)
  for (const kind of /** @type {const} */ (['fuel', 'maint', 'misc'])) {
    assert.equal(questionNumbers(OWNER, q({ type: 'expense', expenseType: kind }), false).amount, may.expense[kind].total, kind)
  }
  assert.equal(questionNumbers(OWNER, q({ type: 'trips' }), false).count, may.tripCount)
  assert.equal(questionNumbers(OWNER, q({ period: YEAR }), false).amount, yearSum((m) => ownerDetail(m).income.total))
  assert.equal(questionNumbers(OWNER, q({ type: 'netProfit', period: YEAR }), false).amount, yearSum((m) => ownerDetail(m).netProfit))
  assert.equal(questionNumbers(OWNER, q({ type: 'trips', period: YEAR }), false).count, yearSum((m) => ownerDetail(m).tripCount))
  assert.ok(yearSum((m) => ownerDetail(m).tripCount) > may.tripCount, '연 합에 다른 달(4월)도 들어감')
})

test('연동 기사: 매출(운송 수입)·순이익(정산액)·운행 횟수 = 기사 본인 매출 화면 함수', () => {
  const may = driverDetail('2026-05')
  assert.ok(may.income.total > 0 && may.netProfit > 0, '자료가 비어 있지 않음')
  assert.notEqual(may.netProfit, ownerDetail('2026-05').netProfit, '차주 숫자와 다름')
  assert.equal(questionNumbers(OWNER, q({}), true).amount, may.income.total)
  assert.equal(questionNumbers(OWNER, q({ type: 'netProfit' }), true).amount, may.netProfit)
  assert.equal(questionNumbers(OWNER, q({ type: 'trips' }), true).count, may.tripCount)
  assert.equal(questionNumbers(OWNER, q({ type: 'netProfit', period: YEAR }), true).amount, yearSum((m) => driverDetail(m).netProfit))
})

test('미수금 = 미수금 화면 항목(getReceivableItems)의 남은 금액 합·건수 — 전체·거래처·달', () => {
  const s = screen()
  const items = getReceivableItems(s.settings, s.work)
  assert.ok(items.length > 1, '자료가 비어 있지 않음')
  const total = (/** @type {typeof items} */ list) => list.reduce((sum, item) => sum + item.remainingAmount, 0)
  assert.ok(items.some((item) => item.logId !== 'main') && items.some((item) => item.logId === 'main'), '메인·기사 차량 둘 다 있음')
  assert.deepEqual(questionNumbers(OWNER, q({ type: 'unpaid', period: { unit: 'all' } }), false), { amount: total(items), count: items.length, supply: 0, withSub: true })
  const hanjin = items.filter((item) => item.client === '한진')
  assert.ok(hanjin.length > 0 && hanjin.length < items.length)
  assert.ok(hanjin.every((item) => item.logId === 'main'), '한진은 메인 차량만')
  assert.deepEqual(questionNumbers(OWNER, q({ type: 'unpaid', period: { unit: 'all' }, client: '한진' }), false), { amount: total(hanjin), count: hanjin.length, supply: 0, withSub: false })
  const daehan = items.filter((item) => item.client === '대한')
  assert.ok(daehan.length > 0 && daehan.every((item) => item.logId !== 'main'), '대한은 기사 차량만')
  assert.deepEqual(questionNumbers(OWNER, q({ type: 'unpaid', period: { unit: 'all' }, client: '대한' }), false), { amount: total(daehan), count: daehan.length, supply: 0, withSub: true })
  const april = items.filter((item) => String(item.workDate).slice(0, 7) === '2026-04')
  assert.ok(april.length > 0)
  assert.deepEqual(questionNumbers(OWNER, q({ type: 'unpaid', period: { unit: 'month', value: '2026-04' } }), false), { amount: total(april), count: april.length, supply: 0, withSub: april.some((item) => item.logId !== 'main') })
  const mayMain = items.filter((item) => String(item.workDate).slice(0, 7) === '2026-05' && item.client === '한진')
  assert.deepEqual(questionNumbers(OWNER, q({ type: 'unpaid', period: { unit: 'month', value: '2026-05' }, client: '한진' }), false), { amount: total(mayMain), count: mayMain.length, supply: 0, withSub: false }, '거래처·달')
  assert.deepEqual(questionNumbers(OWNER, q({ type: 'unpaid', period: { unit: 'all' }, client: '없는거래처' }), false), { amount: 0, count: 0, supply: 0, withSub: false })
})

test('거래처 매출 = 서류 발급 [세금계산서] 탭(메인 서류)의 그 거래처 묶음 공급가액·합계', () => {
  const s = screen()
  const groups = getTaxInvoiceSourceGroups('2026-05', 'sales', s.settings, s.work, 'main').filter((group) => group.clientName === '한진')
  assert.ok(groups.length > 0 && groups[0].supplyAmount > 0, '자료가 비어 있지 않음')
  const want = groups.reduce((sum, group) => ({ amount: sum.amount + group.totalAmount, count: sum.count + group.count, supply: sum.supply + group.supplyAmount }), { amount: 0, count: 0, supply: 0 })
  assert.deepEqual(questionNumbers(OWNER, q({ client: '한진' }), false), want)
  assert.deepEqual(questionNumbers(OWNER, q({ client: '한진', period: { unit: 'month', value: '2026-06' } }), false), { amount: 0, count: 0, supply: 0 })
  assert.deepEqual(questionNumbers(OWNER, q({ client: '한진', period: YEAR }), false), want, '연은 12달 합(한진은 5월만)')
})

// 로드맵 24-D3 — 하루 숫자는 일지 "운송료 합계"·달력 칸이 쓰는 함수를 같은 자료로 부른 값(메인 차량, 휴무면 0).
test('하루: 운송료 = dayFareTotal(일지와 같은 단가·파렛트), 운행 = dayTripCount, 휴무·빈 날은 0', async () => {
  const { dayFareTotal } = await import('../../../domain/calendarBadges.ts')
  const { dayTripCount } = await import('../../../domain/day-record.ts')
  const owner = 'unbiseo-numbers-day'
  const day = '2026-10-15'
  const record = { fixedCount: 2, palletCount: 3, callDetails: [{ id: 'trp-d1', client: '롯데', fare: '50,000' }, { id: 'trp-d2', client: '한진', fare: '30,000' }] }
  commitSettings(owner, normalizeSettings({ fixedOn: true }))
  commitClients(owner, FIXTURE_SETTINGS.clients)
  commitLogWorkData(owner, 'main', { [day]: record, '2026-10-16': { ...record, isOff: true } })
  commitLogWorkData(owner, '서울12가3456', { [day]: { fixedCount: 9 } })
  const at = (/** @type {string} */ value, /** @type {Partial<UnbiseoQuestion>} */ fields = {}) => questionNumbers(owner, q({ period: { unit: 'day', value }, ...fields }), false)
  assert.equal(at(day).amount, dayFareTotal(record, '250,000', 10000))
  assert.equal(at(day).amount, 2 * 250000 + 3 * 10000 + 80000, '고정 노선 + 파렛트 + 세부 운송료(기사 차량 빼고)')
  assert.equal(at(day, { type: 'trips' }).count, dayTripCount(record))
  assert.equal(at(day, { type: 'trips' }).count, 4)
  assert.deepEqual(at('2026-10-16'), { amount: 0, count: 0, supply: 0 }, '휴무')
  assert.deepEqual(at('2026-10-16', { type: 'trips' }), { amount: 0, count: 0, supply: 0 })
  assert.deepEqual(at('2026-10-17'), { amount: 0, count: 0, supply: 0 }, '빈 날')
  // 고정 노선이 꺼졌으면 일지처럼 파렛트 단가 없음.
  commitSettings(owner, normalizeSettings({ fixedOn: false }))
  assert.equal(at(day).amount, dayFareTotal(record, '250,000', 0))
})

test('하루 지출 = 그날 메인 차량 지출 합(종류를 말하면 그 종류만, 기사 차량 태그·다른 날 빼고)', () => {
  const owner = 'unbiseo-numbers-day-expense'
  const day = '2026-10-15'
  commitExpenses(owner, [
    { id: 'e1', kind: 'fuel', date: day, cost: 80000 },
    { id: 'e2', kind: 'maint', date: day, cost: 20000 },
    { id: 'e3', kind: 'fuel', date: day, cost: 5000, vehicleNumber: '서울12가3456' },
    { id: 'e4', kind: 'fuel', date: '2026-10-14', cost: 7000 },
  ])
  const at = (/** @type {''|'fuel'|'maint'|'misc'} */ expenseType) => questionNumbers(owner, q({ type: 'expense', period: { unit: 'day', value: day }, expenseType }), false).amount
  assert.equal(at(''), 100000)
  assert.equal(at('fuel'), 80000)
  assert.equal(at('maint'), 20000)
  assert.equal(at('misc'), 0)
})

test('하루 미수금 = 미수금 화면 항목 중 그 날짜(거래처를 말하면 거래처도)', () => {
  const s = screen()
  const items = getReceivableItems(s.settings, s.work)
  const day = items[0].workDate
  const onDay = items.filter((item) => item.workDate === day)
  assert.ok(onDay.length > 0 && onDay.length < items.length)
  const want = { amount: onDay.reduce((sum, item) => sum + item.remainingAmount, 0), count: onDay.length, supply: 0, withSub: onDay.some((item) => item.logId !== 'main') }
  assert.deepEqual(questionNumbers(OWNER, q({ type: 'unpaid', period: { unit: 'day', value: day } }), false), want)
  const client = onDay[0].client
  const onDayClient = onDay.filter((item) => item.client === client)
  assert.equal(questionNumbers(OWNER, q({ type: 'unpaid', period: { unit: 'day', value: day }, client }), false).count, onDayClient.length)
})
