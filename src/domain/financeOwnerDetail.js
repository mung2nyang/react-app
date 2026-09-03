// @ts-check
// 재감사 2차(FAIL 지적) — finance.js를 200줄 이하로 실제로 쪼갠 조각. 오너/기사
// 월별 손익 상세(getOwnerMonthlyFinanceDetail) 하나만 담는다 — 원래 finance.js에서
// 가장 큰(약 150줄) 단일 함수였다.
// 재감사 3차(FAIL 지적 4번) — @ts-check 적용. 이 함수의 반환 모양은
// components/revenue/OwnerMonthlyCards.jsx가 ReturnType으로 그대로 참조하므로,
// 필드 이름·구조를 바꾸면 그쪽도 같이 깨진다(타입 체크가 잡아 준다).
import { getShortCarNum, isVehicleRevenueSharedWithOwner } from './cars.js'
import { getFixedRouteClient, resolveFixedUnitPrice } from './clients.js'
import { parseCurrencyValue } from './money.js'
import {
  getCallDetailCommissionAmount, getCallDetailDurationMinutes, getDriverCarWorkData,
  getMonthlyDriverSalaryExpense, logData,
} from './financeCore.js'
import { getReceivableItems } from './financeReceivables.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {{ id?: string, kind: string, date: string, name?: string, category?: string, fuelType?: string, cost?: number, subsidy?: number, liters?: number|string }} ExpenseLike */

// Step 6 재감사(FAIL 지적 2번) — 비용(정비/주유/기타) 단일 계약: 정본은 expenses
// 스토어(lib/expenses.js가 저장하는 배열, day-log/의 useExpenseForm.js가 즉시
// 저장으로 쓰는 바로 그 데이터)다. 예전엔 여기서 record.maintItems/fuelItems/
// miscItems(클라우드 hydrate가 daily_logs/fuel_records/... 테이블을 병합해서만
// 채우는 필드 — hydrateMerge.js의 mergeWorkDataFromRows)를 읽어서, 일지 화면에서
// 방금 추가한 비용이 새로고침·클라우드 동기화 전까지는 매출 화면에 전혀 안 잡히는
// 이중 저장 버그가 있었다. expenses 배열은 날짜별로 소유자 전체에 걸쳐 있고
// (차량별로 안 나뉜다 — 이 앱의 비용 데이터 모델 자체가 그렇다), scope로도 나뉘지
// 않는다 — sources 루프 밖에서 monthKey로 한 번만 걸러 계산한다. record.maintItems/
// fuelItems/miscItems는 더 이상 여기서 읽지 않는다(중복 계산 금지).
/**
 * @param {string} monthKey
 * @param {string} scope
 * @param {FinanceSettings} [settings]
 * @param {WorkDataByLogId} [workDataByLogId]
 * @param {Array<ExpenseLike>} [expenses]
 */
export function getOwnerMonthlyFinanceDetail(monthKey, scope = 'owner', settings = {}, workDataByLogId = {}, expenses = []) {
  const cars = Array.isArray(settings.cars) ? settings.cars : []
  const subCarsInScope = cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car))

  /** @type {Array<{ logId: string, label: string, data: Record<string, import('./day-record.js').DayRecordLike> }>} */
  const sources = []
  if (scope !== 'driver') sources.push({ logId: 'main', label: '메인 차량', data: logData(workDataByLogId, 'main') })
  if (scope !== 'owner') {
    subCarsInScope.forEach((car) => {
      sources.push({ logId: car.number, label: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
    })
  }

  const fixedRouteClientForTotals = getFixedRouteClient(settings)
  const fixedClientLabel = fixedRouteClientForTotals?.companyName || '고정노선'

  let tripCount = 0
  let distanceKm = 0
  let durationMinutes = 0
  let vatAmount = 0

  /** @type {Map<string, number>} */
  const fareByClient = new Map()
  /** @type {Map<string, number>} */
  const commissionByClient = new Map()
  /** @type {Array<{ date: string, label: string, amount: number }>} */
  const maintItems = []
  /** @type {Array<{ date: string, label: string, amount: number }>} */
  const fuelItems = []
  /** @type {Array<{ date: string, label: string, amount: number }>} */
  const miscItems = []
  /** @type {Array<{ date: string, label: string, amount: number }>} */
  const fuelSubsidyItems = []
  let fuelSubsidyTotal = 0

  sources.forEach((source) => {
    const isMain = source.logId === 'main'
    const activeFixedOn = isMain ? settings.fixedOn : settings.subFixedOn
    const activePalletOn = !!fixedRouteClientForTotals?.palletOn
    const fixedUnitPrice = resolveFixedUnitPrice(settings)
    const palletUnitPrice = parseCurrencyValue(fixedRouteClientForTotals?.palletPrice)

    Object.entries(source.data || {}).forEach(([dateKey, record]) => {
      if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object') return

      if (!record.isOff) {
        if (Number(record.fixedCount) > 0) {
          const count = Number(record.fixedCount) || 0
          tripCount += count
          const amount = count * fixedUnitPrice
          fareByClient.set(fixedClientLabel, (fareByClient.get(fixedClientLabel) || 0) + amount)
          vatAmount += Math.round(amount * 0.1)
        }
        if (Number(record.palletCount) > 0 && activeFixedOn && activePalletOn) {
          const amount = (Number(record.palletCount) || 0) * palletUnitPrice
          fareByClient.set(fixedClientLabel, (fareByClient.get(fixedClientLabel) || 0) + amount)
          vatAmount += Math.round(amount * 0.1)
        }

        ;(Array.isArray(record.callDetails) ? record.callDetails : []).forEach((detail) => {
          const type = detail?.distanceType || ''
          if (type === '공차') {
            // 0회 처리
          } else if (type === '혼짐') {
            if (detail.linkedLoadIndex === 'pending' || detail.linkedLoadIndex === '-1' || detail.linkedLoadIndex === undefined) tripCount += 1
          } else {
            tripCount += 1
          }

          const fare = parseCurrencyValue(detail?.fare)
          const clientLabel = detail?.client || '미지정 거래처'
          fareByClient.set(clientLabel, (fareByClient.get(clientLabel) || 0) + fare)

          if (!detail?.vatExempt) vatAmount += Math.round(fare * 0.1)

          const commission = getCallDetailCommissionAmount(detail, fare, settings)
          if (commission > 0) commissionByClient.set(clientLabel, (commissionByClient.get(clientLabel) || 0) + commission)

          distanceKm += parseCurrencyValue(detail?.distanceKm)
          durationMinutes += getCallDetailDurationMinutes(detail)
        })
      }
    })
  })

  // 재감사 2차(FAIL 지적 3번) — expenses는 차량 구분 없이 소유자 전체에 걸친 하나의
  // 배열이라, 항상 "메인 차량(owner)" 소속으로 다뤄야 한다 — sources 배열 자체가
  // scope==='driver'일 때 'main'을 아예 안 넣는 것과 같은 기준으로, 여기서도
  // scope==='driver'면 아예 훑지 않는다. 1차 수정 때 이 gate를 빠뜨려서, scope='driver'
  // 화면에서도 오너의 정비/주유/기타 비용이 기사 손익에 섞여 들어가는 오염이 있었다.
  if (scope !== 'driver') {
    ;(Array.isArray(expenses) ? expenses : []).forEach((item) => {
      const date = String(item?.date || '')
      if (!date.startsWith(monthKey)) return
      if (item.kind === 'maint') {
        maintItems.push({ date, label: item.name || item.category || '정비', amount: parseCurrencyValue(item.cost) })
      } else if (item.kind === 'fuel') {
        const cost = parseCurrencyValue(item.cost)
        const subsidy = parseCurrencyValue(item.subsidy)
        fuelItems.push({ date, label: `${item.fuelType || '주유'}${item.liters ? ` ${item.liters}L` : ''}`, amount: cost })
        if (subsidy > 0) {
          fuelSubsidyItems.push({ date, label: item.fuelType || '주유', amount: subsidy })
          fuelSubsidyTotal += subsidy
        }
      } else if (item.kind === 'misc') {
        miscItems.push({ date, label: item.name || item.category || '기타', amount: parseCurrencyValue(item.cost) })
      }
    })
  }

  const { total: salaryTotal, items: salaryItems } = scope !== 'owner'
    ? getMonthlyDriverSalaryExpense(monthKey, settings, subCarsInScope)
    : { total: 0, items: [] }

  /** @param {{date: string}} a @param {{date: string}} b */
  const sortByDate = (a, b) => a.date.localeCompare(b.date)
  maintItems.sort(sortByDate)
  fuelItems.sort(sortByDate)
  miscItems.sort(sortByDate)
  fuelSubsidyItems.sort(sortByDate)

  const fareItems = Array.from(fareByClient.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
  const commissionItems = Array.from(commissionByClient.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)

  const fareTotal = fareItems.reduce((sum, i) => sum + i.amount, 0)
  const commissionTotal = commissionItems.reduce((sum, i) => sum + i.amount, 0)
  const maintTotal = maintItems.reduce((sum, i) => sum + i.amount, 0)
  const fuelTotal = fuelItems.reduce((sum, i) => sum + i.amount, 0)
  const miscTotal = miscItems.reduce((sum, i) => sum + i.amount, 0)

  const incomeTotal = fareTotal - commissionTotal + fuelSubsidyTotal
  const expenseTotal = maintTotal + fuelTotal + miscTotal + salaryTotal

  const unpaidItems = getReceivableItems(settings, workDataByLogId).filter((item) => {
    if (!item.workDate.startsWith(monthKey) || item.remainingAmount <= 0) return false
    if (scope === 'owner') return item.logId === 'main'
    if (scope === 'driver') return item.logId !== 'main'
    return true
  })
  const unpaidTotal = unpaidItems.reduce((sum, i) => sum + i.remainingAmount, 0)

  return {
    monthKey,
    tripCount,
    distanceKm: Math.round(distanceKm),
    durationHours: Math.round(durationMinutes / 60),
    vatAmount,
    netProfit: incomeTotal - expenseTotal,
    income: {
      total: incomeTotal,
      fare: { total: fareTotal, items: fareItems },
      commission: { total: commissionTotal, items: commissionItems },
      fuelSubsidy: { total: fuelSubsidyTotal, items: fuelSubsidyItems },
    },
    expense: {
      total: expenseTotal,
      maint: { total: maintTotal, items: maintItems },
      fuel: { total: fuelTotal, items: fuelItems },
      misc: { total: miscTotal, items: miscItems },
      salary: { total: salaryTotal, items: salaryItems },
    },
    unpaid: { total: unpaidTotal, count: unpaidItems.length, items: unpaidItems },
  }
}
