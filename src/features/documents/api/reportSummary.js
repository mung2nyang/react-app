// @ts-check
// 리포트 요약 — 일자별 표 행·월간 요약 집계.
import { getFixedRouteClient, resolveFixedUnitPrice } from '../../../domain/clients.ts'
import {
  callFareTotal,
  dayTripCount,
  getFixedCount,
  getPalletCount,
  isOffDay,
} from '../../../domain/day-record.ts'
import { monthSettlementSummary } from '../../../domain/monthSettlement.ts'
import { parseCurrencyValue } from '../../../domain/money.ts'
import {
  readOwnerCars,
  readOwnerClients,
  readOwnerExpenses,
  readOwnerProfile,
  readOwnerSettings,
  readOwnerWorkData,
} from '../../../data/store/ownerDataHooks.ts'

/** @typedef {import('../../../domain/clientTypes.ts').ClientLike} ClientLike */
/** @typedef {import('../../../domain/dayRecordTypes.ts').DayRecordLike} DayRecordLike */
/** @typedef {import('../../../domain/financeTypes.ts').CarLike} CarLike */
/** @typedef {ReturnType<typeof readOwnerProfile>} ProfileLike */

/**
 * 리포트 요약 중간 일자별 표 행(원본 buildReportPage workList 규칙).
 * @param {Record<string, DayRecordLike>|null|undefined} workData
 * @param {number} year
 * @param {number} monthIndex
 * @param {{ unitPrice?: number, fixedRouteClient?: ClientLike|null, showPallet?: boolean }} [options]
 * @returns {Array<{ day: number, isOff: boolean, workVal: number, palletCount: number, amount: number }>}
 */
export function buildReportDayRows(workData, year, monthIndex, options = {}) {
  const unitPrice = Number(options.unitPrice) || 0
  const showPallet = !!options.showPallet
  const palletUnitPrice = parseCurrencyValue(options.fixedRouteClient?.palletPrice)
  const lastDate = new Date(year, monthIndex + 1, 0).getDate()
  /** @type {Array<{ day: number, isOff: boolean, workVal: number, palletCount: number, amount: number }>} */
  const rows = []
  for (let day = 1; day <= lastDate; day += 1) {
    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const record = workData?.[dateKey]
    if (!record) continue
    if (isOffDay(record)) {
      rows.push({ day, isOff: true, workVal: 0, palletCount: 0, amount: 0 })
      continue
    }
    const workVal = dayTripCount(record)
    const palletCount = showPallet ? getPalletCount(record) : 0
    const dayFare = getFixedCount(record) * unitPrice + callFareTotal(record)
    const amount = dayFare + palletCount * palletUnitPrice
    if (workVal > 0 || palletCount > 0) {
      rows.push({ day, isOff: false, workVal, palletCount, amount })
    }
  }
  return rows
}

/**
 * 기사차량 내역서는 그 차량이 "내 사업자와 동일"이 꺼져 있고 계좌(은행·계좌번호·예금주)가 하나라도 입력돼 있으면
 * 세 칸 모두 차량 값으로 보여 준다(차주 계좌번호에 차량 은행이 섞이지 않게 묶어서 교체).
 * 동일이 켜져 있거나 비어 있으면 차주 계좌 그대로 — 켜짐인데 personalInfo에 옛 계좌값이 남아 있어도 무시한다.
 * @param {CarLike|null} car
 * @param {ProfileLike} profile
 */
function withVehicleAccount(car, profile) {
  const info = car?.type === 'sub' && car.businessInfo && !car.businessInfo.sameAsOwner ? car.personalInfo : null
  if (!info || !(info.bank || info.account || info.accountHolder)) return profile
  return { ...profile, bankName: info.bank || '', accountNumber: info.account || '', accountHolder: info.accountHolder || '' }
}

/**
 * @param {string} ownerKey
 * @param {number} year
 * @param {number} monthIndex
 * @param {string} [logKey]
 */
export function buildMonthReport(ownerKey, year, monthIndex, expenses = readOwnerExpenses(ownerKey), cars = readOwnerCars(ownerKey), practiceSettings = readOwnerSettings(ownerKey), workData = readOwnerWorkData(ownerKey), clients = readOwnerClients(ownerKey), profile = readOwnerProfile(ownerKey), logKey = 'main') {
  void expenses
  const mainCar = (cars || []).find((car) => car.type === 'main') || cars[0] || null
  // 서브차량 내역서(차주 계정)·연동기사 본인 내역서는 그 차량 스코프 고정노선을 먼저 쓴다(없으면 차주 것 fallback).
  const fixedScopeKey = mainCar?.type === 'sub' ? String(mainCar.number || '') : ''
  const unitPrice = resolveFixedUnitPrice({ clients }, fixedScopeKey)
  const fixedRouteClient = getFixedRouteClient({ clients }, fixedScopeKey)
  // 고정 노선 켜짐은 그 일지 기준 — 메인(연동 기사 본인 포함)은 fixedOn, 차주가 보는 기사 차량은 subFixedOn(달력과 같음).
  const activeFixedOn = logKey === 'main' ? !!practiceSettings.fixedOn : !!practiceSettings.subFixedOn
  const showPallet = activeFixedOn && !!fixedRouteClient?.palletOn
  const settled = monthSettlementSummary(workData, year, monthIndex, {
    unitPrice,
    fixedRouteClient,
    activeFixedOn,
    clients,
  })
  const days = buildReportDayRows(workData, year, monthIndex, {
    unitPrice,
    fixedRouteClient,
    showPallet,
  })

  return {
    year,
    monthIndex,
    title: `${year}년 ${monthIndex + 1}월 운송비 내역서`,
    profile: withVehicleAccount(mainCar, profile),
    mainCar,
    days,
    showPallet,
    distanceKm: settled.distanceKm,
    trips: settled.trips,
    callTrips: settled.callTrips,
    fixedBaseFare: settled.fixedBaseFare,
    defaultBaseFare: settled.defaultBaseFare,
    fareByClient: settled.fareByClient,
    commissionByClient: settled.commissionByClient,
    commissionLabelByClient: settled.commissionLabelByClient,
    palletFare: settled.palletFare,
    vat: settled.vat,
    // 운송비 내역서는 회사 제출용이라 콜 상세 산재보험료를 줄·계에 넣지 않는다.
    total: settled.total + settled.insuranceTotal,
  }
}
