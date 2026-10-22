// 달력 셀 뱃지 계산(dayFareTotal/dayWorkBadgeLabel/dayHasUnpaid)과 표시 포맷(formatFareShort).
import { callFareTotal, dayTripCount, getCallDetails, getFixedCount, isOffDay } from './day-record.ts'
import { filterByDate } from './expenses.ts'
import { getDetailPaymentSummary } from './finance.ts'
import { parseCurrencyValue } from './money.ts'
import type { ExpenseItem } from './expenseTypes.ts'
import type { CallDetailLike } from './callDetail.ts'
import type { DayRecordLike } from './dayRecordTypes.ts'

// DayRecordLike 정본은 dayRecordTypes.ts — 이 파일 경로로 부르는 곳이 있어 이름만 이어 준다.
export type { DayRecordLike }

/**
 * 달력 셀 뱃지용 짧은 금액 표기. 만원 이상은 천 원 단위까지 "35.2만"(백 원 이하 버림,
 * 딱 떨어지면 "35만"), 100만원 이상은 320px 칸에 들어가게 "1234만", 그보다 작으면 "N원".
 */
export function formatFareShort(amount: number): string {
  const n = Math.max(0, Number(amount) || 0)
  if (n >= 10000) {
    const thousands = Math.floor(n / 1000)
    const man = Math.floor(thousands / 10)
    const rest = n >= 1000000 ? 0 : thousands % 10
    return rest ? `${man}.${rest}만` : `${man}만`
  }
  return `${n.toLocaleString('ko-KR')}원`
}

/**
 * 하루치 "운송료 표시" 금액 — inputMode==='fare'일 때 셀 뱃지에 쓴다.
 * 고정노선 연결 거래처의 fixedUnitPrice로 계산한다. 호출부가
 * resolveFixedUnitPrice로 그 값을 넘겨 준다.
 */
export function dayFareTotal(record: DayRecordLike | null | undefined, unitPrice: number | string): number {
  const unit = Math.max(0, parseCurrencyValue(unitPrice))
  return getFixedCount(record) * unit + callFareTotal(record)
}

/** count 모드는 "N회", fare 모드는 짧은 금액 표기. 휴무거나 표시할 값이 전혀 없으면 null(뱃지 숨김). */
export function dayWorkBadgeLabel(record: DayRecordLike | null | undefined, { inputMode = 'count', unitPrice = 0 }: { inputMode?: 'count' | 'fare', unitPrice?: number | string } = {}): string | null {
  if (isOffDay(record)) return null
  const trips = dayTripCount(record)
  const fare = dayFareTotal(record, unitPrice)
  if (trips <= 0 && fare <= 0) return null
  return inputMode === 'fare' ? formatFareShort(fare) : `${trips}회`
}

/**
 * 하루에 미수(완납 아님) 콜상세가 하나라도 있는지. isOff 여부와
 * 무관하게 callDetails를 그대로 검사한다(휴무로 표시를 바꿔도 남아있는 콜상세 기록의
 * 미수 여부는 별개다). paymentOn이 꺼져 있으면 항상 false — 결제 기능 자체를 안 쓰는
 * 계정에는 점을 표시하지 않는다.
 */
export function dayHasUnpaid(record: DayRecordLike | null | undefined, paymentOn: boolean): boolean {
  if (!paymentOn || isOffDay(record)) return false
  return getCallDetails(record).some(
    (detail: CallDetailLike) => getDetailPaymentSummary(detail).status !== 'paid',
  )
}

/**
 * 달력 셀 지출 칩(`.maint-badge`) 문구. 해당 날짜·차량 태그에 맞는 `.cost` 합이
 * 0보다 크면 `formatFareShort`, 아니면 null. `vehicleNumber` 없으면 태그 없는
 * 항목(메인)만, 있으면 그 차량 태그만 합산.
 */
export function dayExpenseBadgeLabel(expenses: Array<ExpenseItem> | null | undefined, dateKey: string, vehicleNumber?: string): string | null {
  const target = String(vehicleNumber || '').trim() || undefined
  const total = filterByDate(expenses || [], dateKey)
    .filter((item) => (String(item.vehicleNumber || '').trim() || undefined) === target)
    .reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
  return total > 0 ? formatFareShort(total) : null
}

/**
 * 일지 화면용 — 해당 날짜·차량 태그에 맞는 지출만 반환. 인자 의미는
 * `dayExpenseBadgeLabel`과 동일(없으면 메인=태그 없음, 있으면 그 차량만).
 */
export function expensesForVehicleDay(expenses: Array<ExpenseItem> | null | undefined, dateKey: string, vehicleNumber?: string): Array<ExpenseItem> {
  const target = String(vehicleNumber || '').trim() || undefined
  return filterByDate(expenses || [], dateKey).filter(
    (item) => (String(item.vehicleNumber || '').trim() || undefined) === target,
  )
}
