// @ts-check
// 달력 "월간 운송료 정산" 카드와 새 홈 "이번 달 정산 합계"가 같은 입력으로 같은 합계를 내도록 모은 훅(CalendarPage에서 옮김).
import { useMemo } from 'react'
import { resolveLogSettings } from '../../domain/carSettingsScope.js'
import { getFixedRouteClient, resolveFixedUnitPrice } from '../../domain/clients.js'
import { monthSettlementSummary } from '../../domain/monthSettlement.js'
import {
  useOwnerCars, useOwnerClients, useOwnerExpenses,
  useOwnerSettings, useOwnerWorkData, useOwnerWorkDataByLogId,
} from '../../store/ownerDataHooks.js'

const EMPTY_WORK = /** @type {Record<string, import('../../domain/dayRecordTypes.js').DayRecordLike>} */ ({})

/**
 * @param {{ ownerKey: string, logId?: string, clientScopeKey?: string, year: number, month: number }} input month는 0-based
 */
export default function useMonthSettlement({ ownerKey, logId = 'main', clientScopeKey, year, month }) {
  const isMain = logId === 'main'
  const mainWorkData = useOwnerWorkData(ownerKey)
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const workData = isMain ? mainWorkData : (workDataByLogId[logId] || EMPTY_WORK)
  const settings = useOwnerSettings(ownerKey)
  const inputMode = /** @type {'count'|'fare'} */ (resolveLogSettings(settings, logId).inputMode === 'fare' ? 'fare' : 'count')
  const clients = useOwnerClients(ownerKey)
  const fixedScopeKey = clientScopeKey || logId
  const unitPrice = resolveFixedUnitPrice({ clients }, fixedScopeKey)
  const cars = useOwnerCars(ownerKey)
  const expenses = useOwnerExpenses(ownerKey)

  const fixedRouteClient = getFixedRouteClient({ clients }, fixedScopeKey)
  const activeFixedOn = isMain ? !!settings.fixedOn : !!settings.subFixedOn
  const car = isMain ? null : (cars || []).find((c) => c.number === logId) || null

  const summary = useMemo(
    () => monthSettlementSummary(workData, year, month, {
      logId, unitPrice, fixedRouteClient, activeFixedOn, clients, car, expenses,
    }),
    [workData, year, month, logId, unitPrice, fixedRouteClient, activeFixedOn, clients, car, expenses],
  )
  return { workData, settings, inputMode, unitPrice, expenses, summary }
}
