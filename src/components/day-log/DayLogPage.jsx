// @ts-check
// Step 6(일지 재작성): WorkLogPage.jsx + InlineExpandHost.jsx 폐기 — 이 파일이 그
// 자리를 대신한다. 화면 조합만 맡고, draft 편집·디바운스·커밋은 useDayDraft.js가,
// 콜상세 폼은 CallDetailForm.jsx가, 비용(정비/주유/기타)은 useExpenseForm.js가
// 예전처럼 별도 expenses 스토어에서 즉시 저장으로 관리한다(day record에 넣지 않는다
// — 왜인지는 migration-audit-plan.md Step 6 기록의 "비용 계약" 항목 참고).
// 211줄, §6: 즐겨찾기 칩용 이력 구독·고정 저장 배선은 이 페이지 조합 책임에 둔다.
import { useMemo, useState } from 'react'
import { expensesForVehicleDay } from '../../domain/calendarBadges.js'
import { applyFixedRouteRun, getFixedRouteCounts } from '../../domain/day-record.js'
import { getFixedRouteClient } from '../../domain/clients.js'
import { removeCallDetail, upsertCallDetail } from '../../domain/call-details.js'
import { getDetailPaymentSummary } from '../../domain/finance.js'
import { locationShortcutList, togglePinnedLocation } from '../../domain/locationShortcuts.js'
import { toggleCallPaymentStatus } from '../../domain/payments.js'
import { confirmLeaveIfUnsafe } from '../../lib/durableWriteGuard.js'
import { savePracticeSettings } from '../../lib/practiceSettings.js'
import { useOwnerWorkData, useOwnerWorkDataByLogId } from '../../store/ownerDataHooks.js'
import { useDayDraft } from './useDayDraft.js'
import { useExpenseForm } from './useExpenseForm.js'
import { bindInlinePanelActions } from './inlinePanelActions.js'
import AutoSaveStatus from './AutoSaveStatus.jsx'
import OffToggle from './OffToggle.jsx'
import FixedCountSection from './FixedCountSection.jsx'
import FixedRouteChips from './FixedRouteChips.jsx'
import PalletSection from './PalletSection.jsx'
import CallDetailList from './CallDetailList.jsx'
import CallDetailForm from './CallDetailForm.jsx'
import DayLogExpenses from './DayLogExpenses.jsx'
import MessageTemplateSheet from './MessageTemplateSheet.jsx'
import InlineSheet from './InlineSheet.jsx'
import PageHeader from '../PageHeader.jsx'
import './day-log-shell.css'
import './fixed-route.css'
import './day-log.css'

/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */
/** @typedef {import('./dayLogTypes.js').Settings} Settings */
/** @typedef {import('./day-log-reducer.js').DayDraft} DayDraft */
/** @typedef {import('../../domain/call-details.js').CallDetailDraft} CallDetailDraft */

const EMPTY_WORK = /** @type {Record<string, never>} */ ({})

/**
 * @param {Object} props
 * @param {number} props.month
 * @param {number} props.day
 * @param {string} props.dateKey
 * @param {string} props.ownerKey
 * @param {Array<ClientLike>} props.clients
 * @param {Settings} props.settings
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onWorkChanged] 커밋될 때만(AppShell 알림 뱃지).
 * @param {() => void} props.onClose
 * @param {(() => void)} [props.onOpenMenu]
 * @param {string} [props.logId]
 * @param {string} [props.clientScopeKey] 거래처 스코프(연동 기사는 배정 차량번호). 없으면 logId.
 */
export default function DayLogPage({ month, day, dateKey, ownerKey, clients, settings, showToast, onWorkChanged, onClose, onOpenMenu, logId = 'main', clientScopeKey }) {
  const { draft, editingCallId, callFormOpen, dispatch, autoSaveStatus } = useDayDraft(ownerKey, dateKey, onWorkChanged, showToast, logId)
  const expenseForm = useExpenseForm(ownerKey, dateKey, showToast, logId)
  const [messageCallId, setMessageCallId] = useState(/** @type {string|null} */ (null))
  const mainWorkData = useOwnerWorkData(ownerKey)
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const workData = logId === 'main' ? mainWorkData : (workDataByLogId[logId] || EMPTY_WORK)
  const pinnedLocations = settings.pinnedLocations || []
  const locationShortcuts = useMemo(
    () => locationShortcutList(workData, draft.callDetails, pinnedLocations),
    [workData, draft.callDetails, pinnedLocations],
  )

  const dayExpenses = expensesForVehicleDay(expenseForm.expenses, dateKey, logId !== 'main' ? logId : undefined)
  const routePresets = settings.fixedRouteOn ? (settings.fixedRoutePresets || []) : []
  const quickCounts = settings.runCountToggle ? (settings.runCountPresets || []) : []
  // settings.clients는 항상 비어 있다(normalizeSettings가 안 만든다) — 실제 거래처
  // 목록은 이 화면의 clients prop(MainPageRoute.jsx가 넘긴다)이라 그쪽을 써야 한다.
  const fixedRouteClient = getFixedRouteClient({ clients })
  const palletVisible = !!(settings.fixedOn && fixedRouteClient?.palletOn)
  const showCallDetailList = settings.callDetail || draft.callDetails.length > 0
  const editingCallItem = editingCallId ? draft.callDetails.find((item) => item.id === editingCallId) || null : null
  const previousCallItem = draft.callDetails.length > 0 ? draft.callDetails[draft.callDetails.length - 1] : null
  const messageItem = messageCallId ? draft.callDetails.find((item) => item.id === messageCallId) : null

  // durable 기록조차 실패한 상태(durableWriteGuard.js)로 나가면 편집이 사라질 수
  // 있다 — beforeunload는 pendingWriteRetryListeners.js가 막지만, 화면 안 이동
  // (뒤로가기)은 데이터 라우터가 아니라 useBlocker를 못 써서(main.jsx) 여기서 직접 확인.
  function handleClose() {
    if (confirmLeaveIfUnsafe()) onClose()
  }

  /** @param {Partial<DayDraft>} patch */
  function patchDraft(patch) { dispatch({ type: 'patchDraft', patch }) }
  /** @param {string} id */
  function indexOfCall(id) { return draft.callDetails.findIndex((item) => item.id === id) }

  // 콜상세/비용 인라인 패널이 서로 다른 state라 하나를 열어도 안 닫히던 문제 —
  // inlinePanelActions.js 참고(200줄 제한 때문에 로직을 옮겼다).
  const { openCallForm, openExpenseAdd, openExpenseEdit, openExpenseKindPick } = bindInlinePanelActions(dispatch, expenseForm)

  /** @param {string} routeId @param {number} delta */
  function handleRouteRun(routeId, delta) {
    const nextCounts = applyFixedRouteRun(getFixedRouteCounts(draft), routeId, delta)
    const nextCount = Math.max(0, (Number(draft.fixedCount) || 0) + delta)
    patchDraft({ fixedRouteCounts: nextCounts, fixedCount: nextCount })
  }

  /** @param {CallDetailDraft} formDraft */
  function handleSaveCall(formDraft) {
    const editingIndex = editingCallId ? indexOfCall(editingCallId) : -1
    const result = upsertCallDetail(draft.callDetails, formDraft, editingIndex, dateKey, clients)
    if (result.error) { showToast?.(result.error); return }
    // upsertCallDetail(도메인 레벨)은 id를 optional로 선언하지만, buildCallDetail이
    // 항상 실제 id를 붙이므로 여기선 항상 있다 — day-log의 "id 항상 있음" 계약으로 좁힌다.
    patchDraft({ callDetails: /** @type {Array<DayDraft['callDetails'][number]>} */ (result.items) })
    dispatch({ type: 'closeCallForm' })
    showToast?.(editingIndex >= 0 ? '세부 입력을 수정했습니다.' : '세부 입력을 저장했습니다.')
  }

  /** @param {string} location */
  async function handleTogglePinnedLocation(location) {
    const result = togglePinnedLocation(settings, location)
    if (result.error) { showToast?.(result.error); return }
    try {
      await savePracticeSettings(ownerKey, { pinnedLocations: result.settings.pinnedLocations })
    } catch {
      showToast?.('고정 장소 저장에 실패했습니다.')
    }
  }

  /** @param {string} id */
  function handleTogglePayment(id) {
    const detail = draft.callDetails.find((item) => item.id === id)
    if (!detail) return
    const unpaid = getDetailPaymentSummary(detail).status !== 'paid'
    const wrapped = { [dateKey]: { ...draft, callDetails: draft.callDetails } }
    const result = toggleCallPaymentStatus(wrapped, dateKey, id)
    if (result.error) { showToast?.(result.error); return }
    patchDraft({ callDetails: result.data[dateKey].callDetails })
    showToast?.(unpaid ? '수금 처리했습니다.' : '수금을 취소했습니다.')
  }

  return (
    <div className="page work-log-page">
      <PageHeader
        title={`${month}월 ${day}일 운행 일지`}
        titleExtra={<AutoSaveStatus status={autoSaveStatus} />}
        onBack={handleClose}
        onOpenMenu={onOpenMenu}
      />
      <OffToggle isOff={draft.isOff} onChange={(off) => patchDraft({ isOff: off, fixedCount: off ? 0 : draft.fixedCount })} />
      <div className={`modal-work-details${draft.isOff ? ' is-off' : ''}`}>
        {settings.fixedOn && (
          <div className="modal-section fixed-route-section">
            <div className="modal-section-title">고정 노선</div>
            <div className="form-group fixed-route-group">
              <FixedCountSection count={draft.fixedCount} isOff={draft.isOff} quickCounts={quickCounts} onChange={(count) => patchDraft({ fixedCount: Math.max(0, parseInt(String(count), 10) || 0) })} />
              <FixedRouteChips routePresets={routePresets} routeCounts={draft.fixedRouteCounts} isOff={draft.isOff} onRun={handleRouteRun} />
            </div>
            <PalletSection visible={palletVisible} palletCount={draft.palletCount} isOff={draft.isOff} onChange={(count) => patchDraft({ palletCount: Math.max(0, parseInt(String(count), 10) || 0) })} />
          </div>
        )}

        {/* callDetail OFF여도 기존 callDetails 카드는 보여 준다 — 추가 진입만 canAdd로 막는다. */}
        {showCallDetailList && (
          <CallDetailList
            details={draft.callDetails}
            settings={settings}
            clients={clients}
            canAdd={settings.callDetail}
            onEdit={(id) => openCallForm(id)}
            onDelete={(id) => patchDraft({ callDetails: /** @type {Array<DayDraft['callDetails'][number]>} */ (removeCallDetail(draft.callDetails, indexOfCall(id))) })}
            onTogglePayment={handleTogglePayment}
            onMessage={(id) => setMessageCallId(id)}
            onAdd={() => openCallForm(null)}
          >
            {settings.callDetail && (
              <InlineSheet open={callFormOpen} className="call-detail-inline-host">
                <CallDetailForm
                  key={editingCallId ?? 'new'}
                  value={editingCallItem}
                  previousItem={editingCallId ? null : previousCallItem}
                  dateKey={dateKey}
                  clients={clients}
                  settings={settings}
                  logId={logId}
                  clientScopeKey={clientScopeKey}
                  ownerKey={ownerKey}
                  showToast={showToast}
                  locationShortcuts={locationShortcuts}
                  pinnedLocations={pinnedLocations}
                  onTogglePinnedLocation={handleTogglePinnedLocation}
                  onSave={handleSaveCall}
                  onClose={() => dispatch({ type: 'closeCallForm' })}
                />
              </InlineSheet>
            )}
          </CallDetailList>
        )}

        <DayLogExpenses
          dayExpenses={dayExpenses}
          expenseForm={expenseForm}
          onKindPick={openExpenseKindPick}
          onAdd={openExpenseAdd}
          onEdit={openExpenseEdit}
        />
      </div>
      {messageItem && (
        <MessageTemplateSheet
          item={messageItem}
          client={clients.find((item) => item.companyName === messageItem.client)}
          onClose={() => setMessageCallId(null)}
        />
      )}
    </div>
  )
}
