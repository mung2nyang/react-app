// ExpenseItem/ExpenseDraft 타입 정본(타입 전용 모듈).
export type ExpenseItem = {
  id: string
  kind: 'maint' | 'fuel' | 'misc'
  date: string
  name?: string
  category?: string
  fuelType?: string
  payment?: string
  cost?: number
  subsidy?: number
  mileage?: number
  liters?: number | string
  /** 차주 본인 서브 로그 태그(없으면 메인). DriverExpenseItem 동명 필드와 무관 */
  vehicleNumber?: string
}

/** upsertExpense가 받는 폼 입력값 — 아직 정규화 전이라 전부 느슨한 값이다. */
export type ExpenseDraft = {
  kind?: string
  date?: string
  name?: string
  category?: string
  fuelType?: string
  payment?: string
  cost?: string | number
  subsidy?: string | number
  mileage?: string | number
  liters?: string | number
  vehicleNumber?: string
}

/**
 * 차주 화면 읽기전용 — 소속기사 서브차량 비용(driverExpenses 슬라이스).
 * ExpenseItem.vehicleNumber(차주 본인 서브 로그 태그)와는 다른 개념.
 */
export type DriverExpenseItem = ExpenseItem & { vehicleNumber: string }
