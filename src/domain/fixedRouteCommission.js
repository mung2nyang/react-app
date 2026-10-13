// @ts-check
// 고정노선 운행의 거래처 수수료 — 달력·매출이 같이 쓰는 정본(보리 확인 2026-10-13: 고정노선에도 등록된 수수료를 뗀다).
import { parseCurrencyValue } from './money.js'

/** @typedef {import('./clientTypes.js').ClientLike} ClientLike */

/**
 * 비율이면 그날 금액에서 내림, 정액이면 그날 횟수만큼.
 * @param {ClientLike|null|undefined} client 고정노선 거래처
 * @param {number} amount 그날 고정노선 금액(단가 × 횟수)
 * @param {number} fixedCount 그날 고정노선 횟수
 * @returns {number}
 */
export function getFixedRouteCommissionAmount(client, amount, fixedCount) {
  if (!client?.commEnabled) return 0
  if (client.commType === 'percent' || !client.commType) {
    return Math.floor(amount * ((parseFloat(String(client.commValue)) || 0) / 100))
  }
  return parseCurrencyValue(client.commValue) * Math.max(1, fixedCount)
}
