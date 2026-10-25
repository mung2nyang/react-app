// @ts-check
// 일지 화면의 일상점검표 안내 줄(피그마 1번) — 그 차량 스위치 켜짐·휴무 아님·로그인·차량이 서버에 있을 때만.
// 열 때 서버에서 그날 1장을 읽어 "작성 필요 [+ 입력]" / "작성 완료 [보기]"를 보이고, 누르면 점검표 모달.
import { useEffect, useState } from 'react'
import { deleteDailyInspection, fetchDailyInspection, saveDailyInspection } from '../../../data/sync/dailyInspections.ts'
import { vehicleSupabaseIdForLog } from '../../../data/sync/mainDayLogRouting.ts'
import { useOwnerCars } from '../../../data/store/ownerDataHooks.ts'
import { useOwnerProfile } from '../../../data/store/ownerProfileDriversHooks.ts'
import DailyInspectionModal from './DailyInspectionModal.jsx'
import './daily-inspection.css'
import './daily-inspection-loading.css'
import { SERVER_SAVE_FAIL } from '../../../shared/utils/failureMessages.js'
import { useToast } from '../../../shared/hooks/useToast.js'
import { useSession } from '../../../data/cloud/sessionContext.ts'
import { confirmDialog } from '../../../shared/ui/confirmDialog.jsx'

/** @typedef {import('../../../data/sync/dailyInspections.ts').DailyInspection} DailyInspection */

const SAVE_FAIL_TOAST = SERVER_SAVE_FAIL
const DELETED_TOAST = '일상점검표를 지웠습니다.'
/** @type {{ status: 'loading', record: DailyInspection|null }} */
const LOADING = { status: 'loading', record: null }

/**
 * @param {{
 *   logId: string, dateKey: string, month: number|string, day: number|string,
 *   enabled: boolean, isOff: boolean,
 * }} props
 */
export default function DailyInspectionNotice({ logId, dateKey, month, day, enabled, isOff }) {
  const { ownerKey } = useSession()
  const showToast = useToast()
  const cars = useOwnerCars(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const vehicleId = vehicleSupabaseIdForLog(ownerKey, logId)
  const active = enabled && !isOff && ownerKey !== 'guest' && vehicleId != null
  const [reloadTick, setReloadTick] = useState(0)
  // 결과는 어느 요청 것인지 열쇠(사용자·차량·날짜·다시 시도)와 같이 — 열쇠가 다르면 불러오는 중.
  const loadKey = `${ownerKey}|${vehicleId}|${dateKey}|${reloadTick}`
  const [result, setResult] = useState(/** @type {{ key: string, status: 'ready'|'error', record: DailyInspection|null }|null} */ (null))
  const load = result && result.key === loadKey ? result : LOADING
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!active || vehicleId == null) return undefined
    let alive = true
    fetchDailyInspection(vehicleId, dateKey)
      .then((record) => { if (alive) setResult({ key: loadKey, status: 'ready', record }) })
      .catch((error) => {
        console.error('[DailyInspectionNotice] 불러오기 실패:', error)
        if (alive) setResult({ key: loadKey, status: 'error', record: null })
      })
    return () => { alive = false }
  }, [active, vehicleId, dateKey, loadKey])

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

  /** @param {{ items: import('../../../domain/dailyInspectionItems.ts').InspectionItems, actionNote: string }} next */
  async function save(next) {
    if (vehicleId == null) return false
    try {
      await saveDailyInspection({ vehicleId, workDate: dateKey, items: next.items, actionNote: next.actionNote, inspectorName })
      setResult({ key: loadKey, status: 'ready', record: { items: next.items, actionNote: next.actionNote.trim(), inspectorName } })
      return true
    } catch (error) {
      console.error('[DailyInspectionNotice] 저장 실패:', error)
      showToast?.(error instanceof Error && error.message ? error.message : SAVE_FAIL_TOAST)
      return false
    }
  }

  // 지우기는 확인 창을 거쳐 서버에서 지운 뒤 "작성 필요"로 돌린다.
  async function remove() {
    if (vehicleId == null) return false
    const ok = await confirmDialog({ title: '점검표를 지울까요?', message: `모든 항목을 비우면 ${month}월 ${day}일 점검표가 삭제됩니다. 삭제한 점검표는 복구할 수 없습니다.`, confirmLabel: '지우기', cancelLabel: '취소', danger: true })
    if (!ok) return false
    try {
      await deleteDailyInspection({ vehicleId, workDate: dateKey })
      setResult({ key: loadKey, status: 'ready', record: null })
      showToast?.(DELETED_TOAST)
      return true
    } catch (error) {
      console.error('[DailyInspectionNotice] 지우기 실패:', error)
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
            <span>일상점검표를 작성해 주세요.</span>
            <button type="button" className="di-notice-btn" onClick={() => setModalOpen(true)}>+ 입력</button>
          </>
        )}
      </div>
      {modalOpen && (
        <DailyInspectionModal title={title} record={load.record} inspectorName={inspectorName} onClose={() => setModalOpen(false)} onSave={save} onDelete={remove} />
      )}
    </>
  )
}
