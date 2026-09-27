// @ts-check
// 기사 정산액에서 산재보험료(월 단위)와 3.3% 원천징수를 계산한다. I/O 없음, 규칙 정본은 docs/roadmap.md 4-2.
// 기준 금액 = 기사 정산액(매출제: 기사 몫, 월급제: 월급). 월보수액 = 정산액 − 정산액 × 필요경비율.
import { parseCurrencyValue } from './money.js'

/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {{ driverIncomeType?: string, insuranceOn?: boolean, withholdingOn?: boolean, expenseRate?: string|number, insuranceRate?: string|number }} DriverIncomeDraft */
/** @typedef {{ driverIncomeType: 'employee'|'business', insuranceOn: boolean, withholdingOn: boolean, expenseRate: string, insuranceRate: string }} DriverIncomeFields */

export const DEFAULT_EXPENSE_RATE = '30.5'
export const DEFAULT_INSURANCE_RATE = '1.8'
const WITHHOLDING_RATE = 3.3

/** 고시 필요경비율 기본값(근로복지공단 고시 기준, 보리 제공). 저장은 숫자만 하고 선택 상태는 저장하지 않는다. */
export const EXPENSE_RATE_PRESETS = [
  { label: '컨테이너 운송', rate: '30.5' },
  { label: '시멘트 운송 (BCT 등)', rate: '30.5' },
  { label: '철강재 운송', rate: '30.5' },
  { label: '위험물질 운송 (탱크로리)', rate: '30.5' },
  { label: '자동차 수송 (카캐리어)', rate: '30.5' },
  { label: '곡물·사료 운송', rate: '30.5' },
  { label: '일반 화물차 (카고·윙바디·탑차 등)', rate: '30.5' },
  { label: '살수차', rate: '43.1' },
  { label: '카고크레인', rate: '43.1' },
  { label: '렉카차 (구난형 특수자동차)', rate: '43.1' },
]

/**
 * 새 기사차량 폼 기본값: 3.3% 사업소득자 → 산재·원천징수 둘 다 켬.
 * @type {DriverIncomeFields}
 */
export const NEW_DRIVER_INCOME_DRAFT = {
  driverIncomeType: 'business',
  insuranceOn: true,
  withholdingOn: true,
  expenseRate: DEFAULT_EXPENSE_RATE,
  insuranceRate: DEFAULT_INSURANCE_RATE,
}

/** 원 미만 버림. 30.5%·1.8% 같은 소수 곱셈의 부동소수점 오차(2501.9999…)로 1원 어긋나지 않게 보정한다. */
function floorWon(/** @type {number} */ value) {
  return Math.floor(value + 1e-6)
}

/** 빈 값·숫자 아님은 기본값, 범위는 0~100. 요율 0은 산재 적용 제외를 뜻한다. */
function rateOf(/** @type {string|number|null|undefined} */ value, /** @type {string} */ fallback) {
  const text = String(value ?? '').trim()
  const parsed = parseFloat(text === '' ? fallback : text)
  return Math.min(100, Math.max(0, Number.isFinite(parsed) ? parsed : parseFloat(fallback)))
}

/**
 * 기사차량 폼 draft → 저장 필드(이 슬라이스의 새 필드 4개 + 기존 insuranceOn).
 * @param {DriverIncomeDraft} draft
 * @returns {DriverIncomeFields}
 */
export function driverIncomeFieldsFromDraft(draft) {
  return {
    driverIncomeType: draft.driverIncomeType === 'employee' ? 'employee' : 'business',
    insuranceOn: !!draft.insuranceOn,
    withholdingOn: !!draft.withholdingOn,
    expenseRate: String(rateOf(draft.expenseRate, DEFAULT_EXPENSE_RATE)),
    insuranceRate: String(rateOf(draft.insuranceRate, DEFAULT_INSURANCE_RATE)),
  }
}

/**
 * 저장된 차량 → 폼 draft. 미설정값은 기존 동작 유지(원천징수 꺼짐, 사업소득자), 요율만 기본값.
 * @param {CarLike} car
 * @returns {DriverIncomeFields}
 */
export function driverIncomeDraftFromCar(car) {
  return {
    driverIncomeType: car.driverIncomeType === 'employee' ? 'employee' : 'business',
    insuranceOn: !!car.insuranceOn,
    withholdingOn: !!car.withholdingOn,
    expenseRate: String(car.expenseRate ?? DEFAULT_EXPENSE_RATE),
    insuranceRate: String(car.insuranceRate ?? DEFAULT_INSURANCE_RATE),
  }
}

/** 기사 정산액 = 월급제는 월급, 매출제는 기사 몫(수수료 계산 결과). */
export function getDriverSettlementAmount(/** @type {CarLike|null|undefined} */ car, /** @type {number} */ commissionAmount) {
  return car?.driverPayMode === 'salary' ? parseCurrencyValue(car.driverSalaryAmount) : commissionAmount
}

/**
 * 산재보험료 총액·부담 나눔·3.3%·기사 실수령. 산재 기사 몫은 산재 적용 토글이 켜졌을 때만 총액의 50%(버림),
 * 나머지는 차주 몫(토글이 꺼지면 차주 100%). 3.3%는 산재 공제 전 정산액 기준이며 원천징수 토글이 켜졌을 때만.
 */
export function getDriverIncomeDeductions(/** @type {CarLike|null|undefined} */ car, /** @type {number} */ settlementAmount) {
  const amount = Math.max(0, Math.floor(Number(settlementAmount) || 0))
  const insuranceBase = amount - floorWon(amount * rateOf(car?.expenseRate, DEFAULT_EXPENSE_RATE) / 100)
  const insuranceTotal = floorWon(insuranceBase * rateOf(car?.insuranceRate, DEFAULT_INSURANCE_RATE) / 100)
  const insuranceDriverShare = car?.insuranceOn ? Math.floor(insuranceTotal / 2) : 0
  const withholding = car?.withholdingOn ? floorWon(amount * WITHHOLDING_RATE / 100) : 0
  return {
    settlementAmount: amount,
    insuranceBase,
    insuranceTotal,
    insuranceDriverShare,
    insuranceOwnerShare: insuranceTotal - insuranceDriverShare,
    withholding,
    driverNet: amount - insuranceDriverShare - withholding,
  }
}

/** 기사 관리 정산 요약 카드용: 총 운송료·기사 정산금·산재(기사 몫)·원천징수·최종 실수령. */
export function getDriverSettlementBreakdown(
  /** @type {{ totalFare?: number, commissionAmount?: number }|null|undefined} */ detail,
  /** @type {CarLike|null|undefined} */ car,
) {
  const settlementAmount = getDriverSettlementAmount(car, detail?.commissionAmount || 0)
  return { totalFare: detail?.totalFare || 0, ...getDriverIncomeDeductions(car, settlementAmount) }
}
