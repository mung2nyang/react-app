// 로드맵 61 — 매출제 기사 몫 기준(운송료 전체 / 거래처 수수료 뗀 뒤): 달력·매출·기사 관리·연동 기사 본인 매출이 같은 값.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { driverShareBaseAmount, getMonthlyDriverClientCommission, resolveDriverShareBase } from './driverShareBase.ts'
import { monthSettlementSummary } from './monthSettlement.ts'
import { getMonthlyDriverRevenueShareExpense } from './driverRevenueShareExpense.ts'
import { getLinkedDriverSettlementDetail } from './financeTaxInvoiceGroups.ts'
import { getDriverSelfMonthlyDetail } from './driverSelfRevenue.ts'

/** @typedef {import('./financeTypes.ts').CarLike} CarLike */
/** @typedef {import('./financeTypes.ts').FinanceSettings} FinanceSettings */

const PLATE = '22나2222'
const MONTH = '2026-10'
const CLIENT = { id: 'c-1', companyName: '한진', commEnabled: true, commType: 'percent', commValue: '10' }
/** 운송료 100만원(한진, 거래처 수수료 10%) */
const WORK = { '2026-10-05': { callDetails: [{ id: 'a', fare: '1,000,000', client: '한진' }] } }
const OPEN_LINK = { id: '', vehicleNumber: PLATE, assignmentStart: '', assignmentEnd: '' }

/** @param {Partial<CarLike>} extra @returns {CarLike} */
const carWith = (extra = {}) => ({ id: 'car-s', number: PLATE, type: 'sub', commEnabled: true, commType: 'percent', commission: '30', driverPayMode: 'revenue', ...extra })

/** @param {CarLike} car @returns {FinanceSettings} */
const settingsWith = (car) => /** @type {FinanceSettings} */ ({ cars: [{ number: '11가1111', type: 'main' }, car], clients: [CLIENT], driverLinks: [] })

/** 네 화면의 기사 몫. @param {CarLike} car */
function fourScreens(car) {
  const settings = settingsWith(car)
  return {
    calendar: monthSettlementSummary(WORK, 2026, 9, { logId: PLATE, car, clients: [CLIENT] }).subCarComm,
    revenue: getMonthlyDriverRevenueShareExpense(MONTH, settings, [car], { [PLATE]: WORK }).total,
    management: getLinkedDriverSettlementDetail(WORK, MONTH, OPEN_LINK, car, settings).commissionAmount,
    driverSelf: getDriverSelfMonthlyDetail(MONTH, settings, { main: WORK }).income.settlement.total,
  }
}

describe('기사 몫 기준 — 네 화면 같은 값', () => {
  test('기준을 안 정하면 운송료 전체: 100만원 × 30% = 30만원', () => {
    assert.deepEqual(fourScreens(carWith()), { calendar: 300000, revenue: 300000, management: 300000, driverSelf: 300000 })
  })

  test('"운송료 전체": 30만원', () => {
    assert.deepEqual(fourScreens(carWith({ driverShareBase: 'gross' })), { calendar: 300000, revenue: 300000, management: 300000, driverSelf: 300000 })
  })

  test('"거래처 수수료 뗀 뒤": (100만원 − 10만원) × 30% = 27만원', () => {
    assert.deepEqual(fourScreens(carWith({ driverShareBase: 'afterClientCommission' })), { calendar: 270000, revenue: 270000, management: 270000, driverSelf: 270000 })
  })

  test('옛 건당 자료는 네 화면 모두 기사 몫 0원', () => {
    const direct = { commType: 'direct', commission: '50000' }
    assert.deepEqual(fourScreens(carWith(direct)), { calendar: 0, revenue: 0, management: 0, driverSelf: 0 })
  })
})

describe('기준 금액·거래처 수수료 합', () => {
  test('모르는 기준 값은 운송료 전체', () => {
    const unknownBase = carWith()
    Reflect.set(unknownBase, 'driverShareBase', 'x')
    assert.equal(resolveDriverShareBase(unknownBase), 'gross')
    assert.equal(resolveDriverShareBase(null), 'gross')
    assert.equal(driverShareBaseAmount(carWith(), 1000, 100), 1000)
    assert.equal(driverShareBaseAmount(carWith({ driverShareBase: 'afterClientCommission' }), 1000, 100), 900)
  })

  test('고정노선 거래처 수수료도 뗌, 계약 기간 밖 운행은 안 셈', () => {
    const fixedClient = { id: 'c-2', companyName: '고정', commEnabled: true, commType: 'percent', commValue: '10', fixedRouteLinked: true, fixedUnitPrice: '100000', scopedToVehicleNumber: PLATE }
    const settings = /** @type {FinanceSettings} */ ({ cars: [carWith()], clients: [CLIENT, fixedClient], driverLinks: [] })
    const work = {
      '2026-10-05': { fixedCount: 2, callDetails: [{ id: 'a', fare: '1,000,000', client: '한진' }] },
      '2026-10-20': { callDetails: [{ id: 'b', fare: '500,000', client: '한진' }] },
    }
    assert.equal(getMonthlyDriverClientCommission(work, MONTH, OPEN_LINK, settings), 100000 + 20000 + 50000)
    const link = { ...OPEN_LINK, assignmentStart: '2026-10-10', assignmentEnd: '' }
    assert.equal(getMonthlyDriverClientCommission(work, MONTH, link, settings), 50000)
    assert.equal(getMonthlyDriverClientCommission({ '2026-10-05': { isOff: true, callDetails: [{ id: 'x', fare: '1000', client: '한진' }] } }, MONTH, OPEN_LINK, settings), 0)
  })
})

describe('기준 값 저장(차량 창 → 차량)', async () => {
  const { upsertCar } = await import('./cars.ts')
  test('고른 기준이 저장되고, 월급제로 바꿔도 남으며, 모르는 값은 운송료 전체', () => {
    const draft = { number: PLATE, type: /** @type {'sub'} */ ('sub'), driverName: '박기사', driverPayMode: 'revenue', commission: '30', driverShareBase: 'afterClientCommission' }
    const saved = upsertCar([], draft, null)
    assert.equal(saved.cars?.[0]?.driverShareBase, 'afterClientCommission')
    const salary = upsertCar(saved.cars || [], { ...draft, driverPayMode: 'salary', driverSalaryAmount: '3000000' }, saved.cars?.[0]?.id || null)
    assert.equal(salary.cars?.[0]?.driverShareBase, 'afterClientCommission')
    assert.equal(upsertCar([], { ...draft, driverShareBase: 'x' }, null).cars?.[0]?.driverShareBase, 'gross')
  })
})
