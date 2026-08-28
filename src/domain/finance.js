// @ts-check
// 재감사 2차(FAIL 지적) — 이 파일은 원래 647줄짜리 단일 모듈이었다. "Step 6 이전부터
// 있던 대형 파일이니 예외"로 두지 말고 실제로 200줄 이하 조각으로 쪼개라는 지시에
// 따라 financeCore.js/financeReceivables.js/financeOwnerDetail.js/
// financeTaxInvoiceGroups.js/financeTaxInvoiceEntries.js 5개 파일로 나눴다(각 파일
// 전부 200줄 이하, wc -l로 확인). 이 파일은 그 5개를 그대로 재수출하는 배럴만
// 남겨서, 기존에 `from './finance.js'`(도메인 내부)나 `from '../lib/finance.js'`
// (lib/finance.js가 이 파일을 다시 재수출)로 가져다 쓰던 코드는 단 한 줄도 안
// 고쳐도 되게 했다 — import 경로 이름은 전부 그대로다.
// 재감사 3차(FAIL 지적 4번) — 이 파일에도 @ts-check를 붙이면서 `export * from`
// 그대로는 안 됐다: 5개 파일이 각자 financeTypes.js의 같은 타입(FinanceSettings 등)을
// alias해서, 와일드카드로 한데 모으면 TS2308(같은 이름 중복 export)이 난다. 실제
// 타입 소비자는 없고(전부 함수만 가져다 쓴다, grep으로 실측 확인) 함수 이름만
// 그대로 재수출하면 되므로, 이름을 나열해 충돌을 피한다 — import 경로는 그대로다.
export {
  logData, getDriverCarWorkData, getDetailPaymentSummary, syncDetailPaymentStatus,
  getCallDetailDurationMinutes, getCallDetailCommissionAmount, getMonthlyDriverTotals,
  calculateDriverVehicleCommission, getMonthlyFareRevenue,
} from './financeCore.js'
export { getReceivableItems, getOverdueReceivableItems } from './financeReceivables.js'
export { getOwnerMonthlyFinanceDetail } from './financeOwnerDetail.js'
export {
  getTaxInvoiceSourceGroups, flattenLinkedDriverTrips, getLinkedDriverSettlementDetail,
  getLinkedDriverClientInvoiceGroups,
} from './financeTaxInvoiceGroups.js'
export {
  getTaxInvoiceFlowMeta, getTaxInvoiceRecordId, getTaxInvoicePartyInfo,
  buildTaxInvoiceEntry, getTaxInvoiceSupplierBiz, listTaxInvoiceEntries,
} from './financeTaxInvoiceEntries.js'
