// 고정노선 운행의 거래처 수수료 — 달력·매출이 같이 쓰는 정본(보리 확인 2026-10-13: 고정노선에도 등록된 수수료를 뗀다).
import { parseCurrencyValue } from './money.ts'
import type { ClientLike } from './clientTypes.ts'

/**
 * 비율이면 그날 금액에서 내림, 정액이면 그날 횟수만큼.
 * @param client 고정노선 거래처
 * @param amount 그날 고정노선 금액(단가 × 횟수)
 * @param fixedCount 그날 고정노선 횟수
 */
export function getFixedRouteCommissionAmount(client: ClientLike | null | undefined, amount: number, fixedCount: number): number {
  if (!client?.commEnabled) return 0
  if (client.commType === 'percent' || !client.commType) {
    return Math.floor(amount * ((parseFloat(String(client.commValue)) || 0) / 100))
  }
  return parseCurrencyValue(client.commValue) * Math.max(1, fixedCount)
}
