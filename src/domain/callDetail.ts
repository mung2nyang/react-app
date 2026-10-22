// 콜상세 한 건의 모양 정본(타입만, 런타임 코드 없음) — 따로 선언하면 서로 안 맞아 타입 오류가 난다.
/**
 * payments.ts/financeCore.ts가 실제로 보존·계산하는 값 그대로: id는 아예 없는 레거시 항목이 실존하고(day-record.ts/backfillCallDetailIds는
 * 콜상세 자신의 id만 채우지 중첩된 payments[] 항목의 id는 손대지 않는다), amount는
 * parseCurrencyValue(financeCore.ts)가 문자열/숫자 둘 다 받는다 — 전부 optional.
 * callDetailSchema.js의 런타임 검증도, financeReceivables.ts의 소비 측도 이 정본을
 * 그대로 참조한다(중복 선언으로 인한 스키마 드리프트 방지).
 */
export type PaymentLike = {
  id?: string
  amount?: string | number
  paidAt?: string
  note?: string
}

export type CallDetailLike = {
  id?: string
  loadLoc?: string
  unloadLoc?: string
  fare?: string | number
  client?: string
  clientId?: string | null
  commissionSnapshot?: { enabled: boolean, type: string | null, value: string | number | null }
  remarks?: string
  vatExempt?: boolean
  paymentStatus?: string
  payments?: Array<PaymentLike>
  paymentDueDate?: string
  workDate?: string
  distanceType?: string
  linkedLoadIndex?: string
  departureTime?: string
  arrivalTime?: string
  platform?: string
  cargoTonnage?: string | number
  receipt?: string
  startOdometer?: string
  endOdometer?: string
  distanceKm?: string
  insuranceFee?: string | number
}
