// @ts-check
import { useMemo } from 'react'
import { getReceivableItems } from '../../../domain/finance.ts'
import { buildFinanceSettings } from '../../../data/sync/ownerFinance.ts'
import { dueSoonItems, groupByClientMonth } from '../../../domain/receivables.ts'
import {
  useOwnerCars,
  useOwnerDrivers,
  useOwnerProfile,
  useOwnerSettings,
  useOwnerWorkDataByLogId,
} from '../../../data/store/ownerDataHooks.ts'

/** @param {string} ownerKey @param {boolean} [isEmployedDriver] */
export function useReceivablesData(ownerKey, isEmployedDriver = false) {
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const settings = useMemo(() => {
    void cars
    void practiceSettings
    void profile
    void drivers
    return buildFinanceSettings(ownerKey)
  }, [ownerKey, workDataByLogId, cars, practiceSettings, profile, drivers])
  const items = useMemo(() => getReceivableItems(settings, workDataByLogId), [settings, workDataByLogId])
  const groups = useMemo(() => groupByClientMonth(items), [items])
  const dueItems = useMemo(() => dueSoonItems(items), [items])
  const hasSubCars = !isEmployedDriver && (settings.cars || []).some((car) => car.type === 'sub')
  return { workDataByLogId, settings, items, groups, dueItems, hasSubCars }
}
