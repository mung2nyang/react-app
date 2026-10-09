// @ts-check
// 로드맵 9-B-2: 일지 화면의 일상점검표 안내 줄(피그마 1번) — 그 차량 스위치 켜짐·휴무 아님·로그인·차량이 서버에 있을 때만.
// 열 때 서버에서 그날 1장을 읽어 "작성 필요 [+ 입력]" / "작성 완료 [보기]"를 보이고, 누르면 점검표 모달.
import { useEffect, useState } from 'react'
import { fetchDailyInspection, saveDailyInspection } from '../../lib/dailyInspections.js'
import { vehicleSupabaseIdForLog } from '../../lib/mainDayLogRouting.js'
import { useOwnerCars } from '../../store/ownerDataHooks.js'
import { useOwnerProfile } from '../../store/ownerProfileDriversHooks.js'
import DailyInspectionModal from './DailyInspectionModal.jsx'
import './daily-inspection.css'
import './daily-inspection-loading.css'

/** @typedef {import('../../lib/dailyInspections.js').DailyInspection} DailyInspection */

const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

/**
 * @param {{
 *   ownerKey: string, logId: string, dateKey: string, month: number|string, day: number|string,
 *   enabled: boolean, isOff: boolean, showToast?: (message: string) => void,
 * }} props
 */
export default function DailyInspectionNotice({ ownerKey, logId, dateKey, month, day, enabled, isOff, showToast }) {
  const cars = useOwnerCars(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const vehicleId = vehicleSupabaseIdForLog(ownerKey, logId)
  const active = enabled && !isOff && ownerKey !== 'guest' && vehicleId != null
  const [load, setLoad] = useState(/** @type {{ status: 'loading'|'ready'|'error', record: DailyInspection|null }} */ ({ status: 'loading', record: null }))
  const [reloadTick, setReloadTick] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!active || vehicleId == null) return undefined
    let alive = true
    setLoad({ status: 'loading', record: null })
    fetchDailyInspection(vehicleId, dateKey)
      .then((record) => { if (alive) setLoad({ status: 'ready', record }) })
      .catch((error) => {
        console.error('[DailyInspectionNotice] 불러오기 실패:', error)
        if (alive) setLoad({ status: 'error', record: null })
      })
    return () => { alive = false }
  }, [active, vehicleId, dateKey, reloadTick])

  if (!active || vehicleId == null) return null
  // 서버 확인 중엔 같은 크기 상자에 글자·버튼 자리 막대(빛 지나감)를 그려 아래 내용이 밀리지 않게 한다.
  if (load.status === 'loading') {
    return (
      <div className="daily-inspection-notice is-loading" role="status" aria-busy="true">
        <span className="di-skeleton di-skeleton-text" aria-hidden="true" />
        <span className="di-skeleton di-skeleton-btn" aria-hidden="true" />
        <span className="sr-only">일상점검표 불러오는 중</span>
      </div>
    )
  }


  const car = (logId === 'main' ? cars.find((item) => item.type === 'main') : cars.find((item) => item.number === logId)) || null
  const inspectorName = String(car?.driverName || profile.name || '').trim()
  const title = `${month}월 ${day}일 일상점검표`

  /** @param {{ items: import('../../domain/dailyInspectionItems.js').InspectionItems, actionNote: string }} next */
  async function save(next) {
    if (vehicleId == null) return false
    try {
      await saveDailyInspection({ vehicleId, workDate: dateKey, items: next.items, actionNote: next.actionNote, inspectorName })
      setLoad({ status: 'ready', record: { items: next.items, actionNote: next.actionNote.trim(), inspectorName } })
      return true
    } catch (error) {
      console.error('[DailyInspectionNotice] 저장 실패:', error)
      showToast?.(error instanceof Error && error.message ? error.message : SAVE_FAIL_TOAST)
      return false
    }
  }

  return (
    <>
      <div className="daily-inspection-notice">
        {load.status === 'error' ? (
          <>
            <span>일상점검표를 불러오지 못했습니다.</span>
            <button type="button" className="di-notice-btn retry" onClick={() => setReloadTick((n) => n + 1)}>다시 시도</button>
          </>
        ) : load.record ? (
          <>
            <span>{month}월 {day}일 일상점검표 작성이 완료되었습니다.</span>
            <button type="button" className="di-notice-btn view" onClick={() => setModalOpen(true)}>보기</button>
          </>
        ) : (
          <>
            <span>일상점검표 작성이 필요합니다.</span>
            <button type="button" className="di-notice-btn" onClick={() => setModalOpen(true)}>+ 입력</button>
          </>
        )}
      </div>
      {modalOpen && (
        <DailyInspectionModal title={title} record={load.record} inspectorName={inspectorName} onClose={() => setModalOpen(false)} onSave={save} showToast={showToast} />
      )}
    </>
  )
}
