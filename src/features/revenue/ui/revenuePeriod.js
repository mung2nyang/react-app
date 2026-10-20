// @ts-check
// 차주·연동 기사 매출 화면이 같이 쓰는 것: 보는 달·탭과 이동, 계산 설정 준비, 12달 순이익 줄.
import { useMemo, useState } from 'react'
import { shiftMonth } from '../../../domain/calendar.js'
import { buildFinanceSettings } from '../../../data/sync/ownerFinance.js'
import { useOwnerCars, useOwnerDrivers, useOwnerProfile, useOwnerSettings } from '../../../data/store/ownerDataHooks.js'
import { monthKeyOf } from './revenueFormat.js'

/** 년 매출이면 1년, 월 매출이면 1달씩 옮긴다. */
export function useRevenuePeriod() {
  const [tab, setTab] = useState('monthly')
  const [viewDate, setViewDate] = useState(() => new Date())
  const yearly = tab === 'yearly'

  /** @param {number} delta */
  function shift(delta) {
    setViewDate((date) => (yearly ? new Date(date.getFullYear() + delta, date.getMonth(), 1) : shiftMonth(date, delta)))
  }

  return { tab, setTab, yearly, viewDate, setViewDate, year: viewDate.getFullYear(), month: viewDate.getMonth(), shift }
}

/** 차량·설정·개인정보·기사가 바뀌면 계산 설정을 다시 만든다. @param {string} ownerKey */
export function useRevenueFinanceSettings(ownerKey) {
  const cars = useOwnerCars(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  return useMemo(() => {
    void cars
    void practiceSettings
    void profile
    void drivers
    return buildFinanceSettings(ownerKey)
  }, [ownerKey, cars, practiceSettings, profile, drivers])
}

/**
 * @param {number} year
 * @param {(monthKey: string) => { netProfit: number }} detailFor
 * @returns {Array<{ month: number, netProfit: number }>}
 */
export function buildYearlyRows(year, detailFor) {
  return Array.from({ length: 12 }, (_, m) => ({ month: m + 1, netProfit: detailFor(monthKeyOf(year, m)).netProfit }))
}
