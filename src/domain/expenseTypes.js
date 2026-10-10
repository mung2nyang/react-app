// @ts-check
// ExpenseItem/ExpenseDraft 타입 정본(타입 전용 모듈).
/**
 * @typedef {Object} ExpenseItem
 * @property {string} id
 * @property {'maint'|'fuel'|'misc'} kind
 * @property {string} date
 * @property {string} [name]
 * @property {string} [category]
 * @property {string} [fuelType]
 * @property {string} [payment]
 * @property {number} [cost]
 * @property {number} [subsidy]
 * @property {number} [mileage]
 * @property {number|string} [liters]
 * @property {string} [vehicleNumber] 차주 본인 서브 로그 태그(없으면 메인). DriverExpenseItem 동명 필드와 무관
 */

/**
 * upsertExpense가 받는 폼 입력값 — 아직 정규화 전이라 전부 느슨한 값이다.
 * @typedef {Object} ExpenseDraft
 * @property {string} [kind]
 * @property {string} [date]
 * @property {string} [name]
 * @property {string} [category]
 * @property {string} [fuelType]
 * @property {string} [payment]
 * @property {string|number} [cost]
 * @property {string|number} [subsidy]
 * @property {string|number} [mileage]
 * @property {string|number} [liters]
 * @property {string} [vehicleNumber]
 */

/**
 * 차주 화면 읽기전용 — 소속기사 서브차량 비용(driverExpenses 슬라이스).
 * ExpenseItem.vehicleNumber(차주 본인 서브 로그 태그)와는 다른 개념.
 * @typedef {ExpenseItem & { vehicleNumber: string }} DriverExpenseItem
 */

export {}
