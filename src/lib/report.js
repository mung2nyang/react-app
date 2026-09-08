// @ts-check
// 리포트 공용 — 파일명·표시용 짧은 헬퍼(공유 모달도 여기만 씀).
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

/** @param {unknown} value */
export function dash(value) {
  const text = String(value || '').trim()
  return text || '-'
}

/**
 * 월간 운송비 내역서 PDF 파일명(원본 downloadPDF 요약 분기와 동일, 월은 0-based monthIndex).
 * @param {number} year
 * @param {number} monthIndex 0=1월 … 11=12월
 */
export function buildReportFileName(year, monthIndex) {
  return `${year}년_${monthIndex + 1}월_운송비내역서.pdf`
}

/**
 * 세부 내역서 PDF 파일명.
 * @param {number} year
 * @param {number} monthIndex
 * @param {string} clientFilter
 */
export function buildDetailReportFileName(year, monthIndex, clientFilter) {
  const suffix = clientFilter === 'ALL' ? '전체' : clientFilter
  return `${year}년_${monthIndex + 1}월_운송비내역서(세부)_${suffix}.pdf`
}

/**
 * 월간 운송비 내역서 PNG 파일명(이미지 저장용, PDF 파일명 규칙 재사용).
 * @param {number} year
 * @param {number} monthIndex
 */
export function buildReportImageFileName(year, monthIndex) {
  return buildReportFileName(year, monthIndex).replace(/\.pdf$/, '.png')
}

/**
 * 세부 내역서 PNG 파일명.
 * @param {number} year
 * @param {number} monthIndex
 * @param {string} clientFilter
 */
export function buildDetailReportImageFileName(year, monthIndex, clientFilter) {
  return buildDetailReportFileName(year, monthIndex, clientFilter).replace(/\.pdf$/, '.png')
}

/**
 * @param {'summary'|'detail'} viewMode
 * @param {string} clientFilter
 * @returns {string}
 */
export function getReportShareCompanyName(viewMode, clientFilter) {
  return viewMode === 'detail' && clientFilter !== 'ALL' ? clientFilter : '거래처'
}

/**
 * @param {'summary'|'detail'} viewMode
 * @param {string} clientFilter
 * @param {Array<ClientLike>|null|undefined} clients
 * @returns {{ name: string, phone: string } | null}
 */
export function getDetailReportClientContact(viewMode, clientFilter, clients) {
  if (viewMode !== 'detail' || clientFilter === 'ALL') return null
  const client = (clients || []).find((item) => item.companyName === clientFilter)
  return client?.phone ? { name: client.companyName, phone: client.phone } : null
}
