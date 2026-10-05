// @ts-check

/**
 * @param {string} raw
 */
export function formatPhoneNumber(raw) {
  const value = String(raw || '').replace(/[^0-9]/g, '')
  if (value.length < 4) return value
  if (value.length < 7) return `${value.slice(0, 3)}-${value.slice(3)}`
  if (value.length < 11) return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`
}

export const BIZ_NUMBER_PLACEHOLDER = '- 제외한 숫자 10자리를 입력해 주세요'

/**
 * 사업자등록번호 입력칸 — 숫자만 받아 10자리까지 000-00-00000 모양으로 - 자동 삽입.
 * @param {string} raw
 */
export function formatBizNumber(raw) {
  const value = String(raw || '').replace(/[^0-9]/g, '').slice(0, 10)
  if (value.length <= 3) return value
  if (value.length <= 5) return `${value.slice(0, 3)}-${value.slice(3)}`
  return `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5)}`
}

/**
 * 사업자등록번호 검증번호(마지막 자리) 확인. 10자리가 아니면 판단하지 않음(true).
 * @param {string} raw
 */
export function isBizNumberChecksumOk(raw) {
  const d = String(raw || '').replace(/[^0-9]/g, '').split('').map(Number)
  if (d.length !== 10) return true
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
  let sum = weights.reduce((acc, w, i) => acc + d[i] * w, 0)
  sum += Math.floor((d[8] * 5) / 10)
  return (10 - (sum % 10)) % 10 === d[9]
}

/**
 * 차량 톤수 칸에 보일 숫자(소수 한 자리까지). '21톤' → '21', '2.55' → '2.5'
 * @param {string|undefined} raw
 */
export function tonnageDigits(raw) {
  const match = String(raw || '').replace(/[^0-9.]/g, '').match(/^(\d*)(\.\d?)?/)
  return match ? `${match[1]}${match[2] || ''}` : ''
}

/**
 * 톤수 저장값. 숫자 뒤에 '톤' 자동, 빈칸이면 빈칸. finalize면 끝의 '.'도 정리.
 * @param {string|undefined} raw
 * @param {boolean} [finalize]
 */
export function tonnageValue(raw, finalize = false) {
  let digits = tonnageDigits(raw)
  if (finalize) digits = digits.replace(/\.$/, '')
  return digits ? `${digits}톤` : ''
}
