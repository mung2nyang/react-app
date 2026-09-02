// @ts-check
import { useMemo } from 'react'
import { getReceivableItems } from '../../lib/finance.js'
import { buildFinanceSettings } from '../../lib/ownerFinance.js'
import { dueSoonItems, groupByClientMonth } from '../../lib/receivables.js'
import {
  useOwnerCars,
  useOwnerDrivers,
  useOwnerProfile,
  useOwnerSettings,
  useOwnerWorkDataByLogId,
} from '../../store/ownerDataHooks.js'

/** @param {string} ownerKey */
export function useReceivablesData(ownerKey) {
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
  const hasSubCars = (settings.cars || []).some((car) => car.type === 'sub')
  return { workDataByLogId, settings, items, groups, dueItems, hasSubCars }
}
