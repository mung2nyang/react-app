// @ts-check
// 운행일지의 콜 상세 저장·삭제·수금 바꾸기, 고정 노선 횟수, 고정 장소 저장 — 화면(DayLogPage)은 그리기만.
import { applyFixedRouteRun, getFixedRouteCounts } from '../../../domain/day-record.js'
import { removeCallDetail, upsertCallDetail } from '../../../domain/call-details.js'
import { getDetailPaymentSummary } from '../../../domain/finance.js'
import { togglePinnedLocation as togglePinnedLocationIn } from '../../../domain/locationShortcuts.js'
import { toggleCallPaymentStatus } from '../../../domain/payments.js'
import { savePracticeSettings } from '../../../data/sync/settingsSave.js'
import { useToast } from '../../../shared/hooks/useToast.js'
import { useSession } from '../../../data/cloud/sessionContext.js'

/** @typedef {import('../ui/dayLogTypes.js').ClientLike} ClientLike */
/** @typedef {import('../ui/dayLogTypes.js').Settings} Settings */
/** @typedef {import('./day-log-reducer.js').DayDraft} DayDraft */
/** @typedef {import('../../../domain/call-details.js').CallDetailDraft} CallDetailDraft */

/**
 * @param {DayDraft} draft
 * @param {ReturnType<typeof import('./useDayDraft.js').useDayDraft>['dispatch']} dispatch
 * @param {{ dateKey: string, clients: Array<ClientLike>, settings: Settings, editingCallId: string|null }} options
 */
export default function useCallDetailActions(draft, dispatch, { dateKey, clients, settings, editingCallId }) {
  const { ownerKey } = useSession()
  const showToast = useToast()

  /** @param {Partial<DayDraft>} patch */
  function patchDraft(patch) { dispatch({ type: 'patchDraft', patch }) }
  /** @param {string} id */
  function indexOfCall(id) { return draft.callDetails.findIndex((item) => item.id === id) }

  /** @param {string} routeId @param {number} delta */
  function runRoute(routeId, delta) {
    const nextCounts = applyFixedRouteRun(getFixedRouteCounts(draft), routeId, delta)
    const nextCount = Math.max(0, (Number(draft.fixedCount) || 0) + delta)
    patchDraft({ fixedRouteCounts: nextCounts, fixedCount: nextCount })
  }

  /** @param {CallDetailDraft} formDraft */
  function saveCall(formDraft) {
    const editingIndex = editingCallId ? indexOfCall(editingCallId) : -1
    const result = upsertCallDetail(draft.callDetails, formDraft, editingIndex, dateKey, clients)
    if (result.error) { showToast?.(result.error); return }
    // buildCallDetail이 항상 id를 붙이므로 "id 항상 있음" 일지 타입으로 좁힌다.
    patchDraft({ callDetails: /** @type {Array<DayDraft['callDetails'][number]>} */ (result.items) })
    dispatch({ type: 'closeCallForm' })
    showToast?.(editingIndex >= 0 ? '세부 입력을 수정했습니다.' : '세부 입력을 저장했습니다.')
  }

  /** @param {string} id */
  function deleteCall(id) {
    patchDraft({ callDetails: /** @type {Array<DayDraft['callDetails'][number]>} */ (removeCallDetail(draft.callDetails, indexOfCall(id))) })
  }

  /** @param {string} location */
  async function togglePinnedLocation(location) {
    const result = togglePinnedLocationIn(settings, location)
    if (result.error) { showToast?.(result.error); return }
    try {
      await savePracticeSettings(ownerKey, (current) => ({ pinnedLocations: togglePinnedLocationIn(current, location).settings.pinnedLocations }))
    } catch {
      showToast?.('고정 장소 저장에 실패했습니다.')
    }
  }

  /** @param {string} id */
  function togglePayment(id) {
    const detail = draft.callDetails.find((item) => item.id === id)
    if (!detail) return
    const unpaid = getDetailPaymentSummary(detail).status !== 'paid'
    const wrapped = { [dateKey]: { ...draft, callDetails: draft.callDetails } }
    const result = toggleCallPaymentStatus(wrapped, dateKey, id)
    if (result.error) { showToast?.(result.error); return }
    patchDraft({ callDetails: result.data[dateKey].callDetails })
    showToast?.(unpaid ? '수금 처리했습니다.' : '수금을 취소했습니다.')
  }

  return { patchDraft, runRoute, saveCall, deleteCall, togglePayment, togglePinnedLocation }
}
