// 달력 "월간 운송료 정산" 카드와 새 홈 "이번 달 정산 합계"가 같은 입력으로 같은 합계를 내도록 모은 훅(CalendarPage에서 옮김).
import { useMemo } from 'react'
import { resolveLogSettings } from '../../domain/carSettingsScope.ts'
import { getFixedRouteClient, resolveFixedUnitPrice } from '../../domain/clients.ts'
import { monthSettlementSummary } from '../../domain/monthSettlement.ts'
import {
  useOwnerCars, useOwnerClients, useOwnerExpenses,
  useOwnerSettings, useOwnerWorkData, useOwnerWorkDataByLogId,
} from './ownerDataHooks.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'

const EMPTY_WORK = ({}) as Record<string, DayRecordLike>

/** @param input month는 0-based */
export default function useMonthSettlement({ ownerKey, logId = 'main', clientScopeKey, year, month }: { ownerKey: string, logId?: string, clientScopeKey?: string, year: number, month: number }) {
  const isMain = logId === 'main'
  const mainWorkData = useOwnerWorkData(ownerKey)
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const workData = isMain ? mainWorkData : (workDataByLogId[logId] || EMPTY_WORK)
  const settings = useOwnerSettings(ownerKey)
  const inputMode = (resolveLogSettings(settings, logId).inputMode === 'fare' ? 'fare' : 'count') as 'count' | 'fare'
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
