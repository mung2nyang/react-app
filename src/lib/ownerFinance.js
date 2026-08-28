// @ts-check
// 재감사 3차(FAIL 지적 4번) — 이번 diff가 건드린 프로덕션 JS 전체를 활성 typecheck
// 대상으로 만들라는 지시로 @ts-check를 붙였다.
import { loadCars } from './cars.js'
import { loadClients } from './clients.js'
import { loadDrivers } from './drivers.js'
import { getReceivableItems } from './finance.js'
import { loadPracticeSettings } from './practiceSettings.js'
import { loadProfile } from './profile.js'
import { loadWorkData, markReceivableItemPaid, saveWorkData } from './workData.js'

/** @typedef {import('../domain/day-record.js').DayRecordLike} DayRecordLike */
// WorkDataByLogId의 정본은 domain/financeTypes.js다 — alias만 한다(중복 선언 금지).
/** @typedef {import('../domain/financeTypes.js').WorkDataByLogId} WorkDataByLogId */

/**
 * @param {string} [ownerKey]
 * @returns {WorkDataByLogId}
 */
export function loadWorkDataByLogId(ownerKey = 'guest') {
  // loadWorkData(lib/workData.js)는 아직 @ts-check가 없어 반환 타입이 느슨한
  // object로 추론된다 — 실제 런타임 모양(day-record.js의 saveDayRecord가 만드는
  // dateKey→DayRecordLike 맵)으로 여기서 좁힌다.
  return { main: /** @type {Record<string, DayRecordLike>} */ (loadWorkData(ownerKey)) }
}

/**
 * @param {string} ownerKey
 * @param {WorkDataByLogId} workDataByLogId
 */
export function persistWorkDataByLogId(ownerKey, workDataByLogId) {
  saveWorkData(ownerKey, workDataByLogId.main || {})
}

/** @param {string} [ownerKey] */
export function buildFinanceSettings(ownerKey = 'guest') {
  const practice = loadPracticeSettings(ownerKey)
  const profile = loadProfile(ownerKey)
  const drivers = loadDrivers(ownerKey)
  return {
    paymentOn: true,
    subPaymentOn: true,
    fixedOn: practice.fixedOn,
    subFixedOn: practice.subFixedOn,
    // 재감사 2차(FAIL 지적) — resolveFixedUnitPrice(domain/clients.js)의 fallback
    // 소스. 고정노선 연결 거래처가 없으면(Step 7 전 대부분) 매출 화면도 달력과 같은
    // settings.unitPrice를 쓰게 한다 — 전에는 여기 빠져 있어서 매출 화면은 항상 0으로
    // 계산됐다(달력 배지는 0이 아닌데 매출은 0인 불일치의 원인 중 하나였다).
    unitPrice: practice.unitPrice,
    defaultDriverSettlementMode: 'company',
    driverInvoiceBasis: 'net',
    bizName: profile.bizName,
    bizNumber: profile.bizNumber,
    bizRepresentative: profile.bizRepresentative,
    userName: profile.bizRepresentative || profile.name,
    bizAddress: profile.bizAddress,
    bizType: profile.bizType,
    bizItem: profile.bizItem,
    bizEmail: profile.bizEmail,
    clients: loadClients(ownerKey),
    cars: loadCars(ownerKey),
    driverLinks: drivers.map((driver) => ({
      id: driver.id,
      vehicleNumber: driver.vehicleNumber,
      assignmentStart: driver.startDate,
      assignmentEnd: driver.endDate,
      status: driver.status,
    })),
  }
}

/**
 * @param {WorkDataByLogId} workDataByLogId
 * @param {string} logId
 * @param {string} dateKey
 * @param {number} detailIndex
 * @param {(store: Record<string, DayRecordLike>, dateKey: string, detailIndex: number) => { error?: string, data?: Record<string, DayRecordLike> }} apply
 */
export function patchWorkLog(workDataByLogId, logId, dateKey, detailIndex, apply) {
  const store = workDataByLogId[logId] || {}
  const result = apply(store, dateKey, detailIndex)
  if (result.error || !result.data) return { error: result.error, workDataByLogId }
  return { workDataByLogId: { ...workDataByLogId, [logId]: result.data } }
}

/**
 * @param {WorkDataByLogId} workDataByLogId
 * @param {object} settings
 * @param {string} clientName
 * @param {string} monthKey
 * @param {Date} [paidAt]
 */
export function markMonthlyReceivablesPaid(workDataByLogId, settings, clientName, monthKey, paidAt = new Date()) {
  const targets = getReceivableItems(settings, workDataByLogId).filter((item) => (
    item.client === clientName && item.workDate.slice(0, 7) === monthKey
  ))

  let next = workDataByLogId
  for (const item of targets) {
    const result = markReceivableItemPaid(next[item.logId] || {}, item.dateKey, item.detailIndex, paidAt)
    if (result.error) continue
    next = { ...next, [item.logId]: result.data }
  }
  return next
}
