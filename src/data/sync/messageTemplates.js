// @ts-check

const CUSTOM_BODIES_KEY = 'messageTemplateCustomBodies'
const REPORT_SHARE_KEY = 'reportShareMessagePattern'

/** @returns {[string, string, string]} */
export function getDefaultMessageTemplatePatterns() {
  return [
    '안녕하세요, {거래처} 담당자님. {운행구간} 운송료 {운송료}원이 미수 상태입니다. 확인 부탁드립니다.',
    '안녕하세요. {운행구간} 운송 건 운송료 {운송료}원 입금 부탁드립니다. 감사합니다.',
    '안녕하세요, {거래처} 담당자님. {운행구간} 운행이 완료되었습니다. 이용해 주셔서 감사합니다.',
  ]
}

/** @returns {[string, string, string]} */
export function getMessageTemplatePatterns() {
  const defaults = getDefaultMessageTemplatePatterns()
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_BODIES_KEY) || 'null')
    if (!Array.isArray(saved) || saved.length !== defaults.length) return defaults
    return /** @type {[string, string, string]} */ (
      defaults.map((body, index) => String(saved[index] || body))
    )
  } catch {
    return defaults
  }
}

/** @returns {string} */
export function getDefaultReportShareMessagePattern() {
  return '안녕하세요, {거래처} 담당자님. 운송비 내역서입니다. 확인 부탁드립니다.'
}

/** @returns {string} */
export function getReportShareMessagePattern() {
  try {
    return localStorage.getItem(REPORT_SHARE_KEY)?.trim() || getDefaultReportShareMessagePattern()
  } catch {
    return getDefaultReportShareMessagePattern()
  }
}

/**
 * @param {[string, string, string]} patterns
 * @param {string} reportMessage
 */
export function saveMessageTemplateSettings(patterns, reportMessage) {
  localStorage.setItem(CUSTOM_BODIES_KEY, JSON.stringify(patterns))
  localStorage.setItem(REPORT_SHARE_KEY, reportMessage)
}

export function resetMessageTemplateSettings() {
  localStorage.removeItem(CUSTOM_BODIES_KEY)
  localStorage.removeItem(REPORT_SHARE_KEY)
}

/**
 * @param {string} pattern
 * @param {{ company: string, route: string, fare: string }} values
 * @returns {string}
 */
export function fillMessageTemplatePattern(pattern, values) {
  return String(pattern)
    .replaceAll('{거래처}', values.company)
    .replaceAll('{운행구간}', values.route)
    .replaceAll('{운송료}', values.fare)
}

/**
 * @param {string} pattern
 * @param {string} [company]
 * @returns {string}
 */
export function fillReportShareMessagePattern(pattern, company = '거래처') {
  return String(pattern).replaceAll('{거래처}', company || '거래처')
}
