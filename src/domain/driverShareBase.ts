// 매출제 기사 몫의 기준 금액 — 차량마다 "운송료 전체"(기본) 또는 "거래처 수수료 뗀 뒤"(로드맵 61, 보리 결정 2026-10-18).
// 달력·매출 기사 급여·기사 관리 정산·연동 기사 본인 매출이 모두 이 함수로 기준 금액을 받는다.
import { getFixedRouteClient, resolveFixedUnitPrice } from './clients.ts'
import { getCallDetails, getFixedCount } from './day-record.ts'
import { isDateWithinAssignment } from './drivers.ts'
import { getCallDetailCommissionAmount } from './financeCore.ts'
import { getFixedRouteCommissionAmount } from './fixedRouteCommission.ts'
import { parseCurrencyValue } from './money.ts'
import type { CarLike, DriverLinkLike, FinanceSettings } from './financeTypes.ts'
import type { DayRecordLike } from './day-record.ts'

/** 차량에 정한 기준. 없거나 모르는 값이면 운송료 전체. */
export function resolveDriverShareBase(car: CarLike | null | undefined): 'gross' | 'afterClientCommission' {
  return car?.driverShareBase === 'afterClientCommission' ? 'afterClientCommission' : 'gross'
}

/** 기사 몫을 계산할 금액 — 기준이 "뗀 뒤"면 운송료에서 같은 운행들의 거래처 수수료를 뺀다. */
export function driverShareBaseAmount(car: CarLike | null | undefined, grossAmount: number, clientCommission: number) {
  return resolveDriverShareBase(car) === 'afterClientCommission' ? grossAmount - clientCommission : grossAmount
}

/** 그달 계약 기간 안 운행의 거래처 수수료 합(콜 상세 + 고정노선) — getMonthlyDriverTotals와 같은 날짜·기간 거르기. */
// scopeKey: 고정 노선 거래처를 찾을 차량 번호(없으면 연동 정보의 차량 번호).
export function getMonthlyDriverClientCommission(data: Record<string, DayRecordLike> | null | undefined, monthKey: string, link: DriverLinkLike | null = null, settings: FinanceSettings = {}, scopeKey?: string) {
  const key = scopeKey || link?.vehicleNumber
  const fixedRouteClient = getFixedRouteClient(settings, key)
  const fixedUnitPrice = resolveFixedUnitPrice(settings, key)
  let total = 0
  Object.entries(data || {}).forEach(([dateKey, record]) => {
    if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object' || record.isOff) return
    if (!isDateWithinAssignment(dateKey, link?.assignmentStart, link?.assignmentEnd)) return
    getCallDetails(record).forEach((detail) => {
      const workDate = detail.workDate || dateKey
      if (!workDate.startsWith(monthKey) || !isDateWithinAssignment(workDate, link?.assignmentStart, link?.assignmentEnd)) return
      total += getCallDetailCommissionAmount(detail, parseCurrencyValue(detail.fare), settings)
    })
    const fixedCount = getFixedCount(record)
    if (fixedCount > 0) total += getFixedRouteCommissionAmount(fixedRouteClient, fixedCount * fixedUnitPrice, fixedCount)
  })
  return total
}
