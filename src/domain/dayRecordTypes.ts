// DayRecordLike 타입 정본(타입 전용 모듈). calendarBadges.ts/financeTypes.ts가 이름을 이어 받는다.
import type { CallDetailLike } from './callDetail.ts'
import type { JsonRecord } from './jsonTypes.ts'

/**
 * persist 런타임(`isPersistedDayRecord`)과 동일한 계약: 횟수는 음이 아닌 정수,
 * 운임은 `isValidCurrencyAmount`(정수 또는 천단위 쉼표 문자열).
 */
export type DayRecordLike = {
  isOff?: boolean
  fixedCount?: number
  palletCount?: number
  callDetails?: Array<CallDetailLike>
  fixedRouteCounts?: Record<string, number>
  fare?: number | string
  fixedFare?: number | string
  totalFare?: number | string
  count?: number
  dailyDistance?: number
  fuelItems?: Array<JsonRecord>
  maintItems?: Array<JsonRecord>
  miscItems?: Array<JsonRecord>
  /** 연동 해제 때 복사된 날의 배정 차량 번호 */
  assignedVehicleNumber?: string
}
