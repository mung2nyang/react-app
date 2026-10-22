// @ts-check
// 운행일지 화면 조합 — 임시 편집·저장은 useDayDraft, 콜 상세·수금·고정 노선 처리는 useCallDetailActions,
// 비용(정비/주유/기타)은 useExpenseForm(일지 기록이 아닌 비용 저장소에 바로 저장).
import { useMemo, useState } from 'react'
import { expensesForVehicleDay } from '../../../domain/calendarBadges.ts'
import { getFixedRouteClient } from '../../../domain/clients.ts'
import { locationShortcutList } from '../../../domain/locationShortcuts.ts'
import { confirmLeaveIfUnsafe } from '../../../data/sync/durableWriteGuard.js'
import { useOwnerDrivers, useOwnerWorkData, useOwnerWorkDataByLogId } from '../../../data/store/ownerDataHooks.js'
import { useDayDraft } from '../hooks/useDayDraft.js'
import { useExpenseForm } from '../hooks/useExpenseForm.js'
import useCallDetailActions from '../hooks/useCallDetailActions.js'
import { bindInlinePanelActions } from './inlinePanelActions.js'
import usePanelBackGuard from '../hooks/usePanelBackGuard.js'
import { popPanelGuardThen } from '../../../shared/utils/historyMoves.js'
import AutoSaveStatus from './AutoSaveStatus.jsx'
import OffToggle from './OffToggle.jsx'
import FixedCountSection from './FixedCountSection.jsx'
import FixedRouteChips from './FixedRouteChips.jsx'
import PalletSection from './PalletSection.jsx'
import CallDetailList from './CallDetailList.jsx'
import CallDetailForm from './CallDetailForm.jsx'
import DayLogExpenses from './DayLogExpenses.jsx'
import DailyInspectionNotice from './DailyInspectionNotice.jsx'
import AssignmentPeriodPage, { assignmentPeriodNotice } from './AssignmentPeriodPage.jsx'
import MessageTemplateSheet from './MessageTemplateSheet.jsx'
import InlineSheet from './InlineSheet.jsx'
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import './day-log-shell.css'
import './fixed-route.css'
import './day-log.css'
import { useSession } from '../../../data/cloud/sessionContext.js'

/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */
/** @typedef {import('./dayLogTypes.js').Settings} Settings */

const EMPTY_WORK = /** @type {Record<string, never>} */ ({})

/**
 * @param {Object} props
 * @param {number} props.month
 * @param {number} props.day
 * @param {string} props.dateKey
 * @param {Array<ClientLike>} props.clients
 * @param {Settings} props.settings
 * @param {() => void} [props.onClose] 없으면 뒤로가기 숨김(하단 메뉴 진입)
 * @param {(() => void)} [props.onOpenMenu]
 * @param {string} [props.logId]
 * @param {string} [props.clientScopeKey] 거래처 스코프(연동 기사는 배정 차량번호). 없으면 logId.
 * @param {boolean} [props.isEmployedDriver] 기사연동 계정 세션이면 콜 상세의 산재보험료 칸을 숨긴다(CallDetailForm 참고).
 */
export default function DayLogPage({ month, day, dateKey, clients, settings, onClose, onOpenMenu, logId = 'main', clientScopeKey, isEmployedDriver = false }) {
  const { ownerKey } = useSession()
  const { draft, editingCallId, callFormOpen, dispatch, autoSaveStatus } = useDayDraft(ownerKey, dateKey, logId)
  const expenseForm = useExpenseForm(ownerKey, dateKey, logId)
  const { patchDraft, runRoute, saveCall, deleteCall, togglePayment, togglePinnedLocation } = useCallDetailActions(draft, dispatch, { dateKey, clients, settings, editingCallId })
  const [messageCallId, setMessageCallId] = useState(/** @type {string|null} */ (null))
  const mainWorkData = useOwnerWorkData(ownerKey)
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const workData = logId === 'main' ? mainWorkData : (workDataByLogId[logId] || EMPTY_WORK)
  const myLink = useOwnerDrivers(ownerKey).find((driver) => driver.status === 'linked') // 연동 기사 본인 배정 기간
  const periodNotice = isEmployedDriver ? assignmentPeriodNotice(dateKey, myLink?.startDate, myLink?.endDate) : null
  const pinnedLocations = settings.pinnedLocations || []
  const locationShortcuts = useMemo(
    () => locationShortcutList(workData, draft.callDetails, pinnedLocations),
    [workData, draft.callDetails, pinnedLocations],
  )

  const dayExpenses = expensesForVehicleDay(expenseForm.expenses, dateKey, logId !== 'main' ? logId : undefined)
  const routePresets = settings.fixedRouteOn ? (settings.fixedRoutePresets || []) : []
  const quickCounts = settings.runCountToggle ? (settings.runCountPresets || []) : []
  // 거래처는 settings가 아닌 clients prop 전체로 — 연동 기사 배정 차량에 고정노선이 없으면 차주 것으로 넘어간다.
  const fixedRouteClient = getFixedRouteClient({ clients }, clientScopeKey || logId)
  const palletVisible = !!(settings.fixedOn && fixedRouteClient?.palletOn)
  const showCallDetailList = settings.callDetail || draft.callDetails.length > 0
  const editingCallItem = editingCallId ? draft.callDetails.find((item) => item.id === editingCallId) || null : null
  const previousCallItem = draft.callDetails.length > 0 ? draft.callDetails[draft.callDetails.length - 1] : null
  const messageItem = messageCallId ? draft.callDetails.find((item) => item.id === messageCallId) : null

  // 화면 안 뒤로가기는 useBlocker를 못 써서 여기서 저장 실패 상태와 열린 입력 칸을 직접 확인한다.
  async function handleClose() {
    if (confirmLeaveIfUnsafe() && await confirmLeaveOpenPanel()) popPanelGuardThen(() => onClose?.())
  }

  // 콜 상세·비용 입력 칸은 하나만 열리게 inlinePanelActions.js가 묶는다.
  const { openCallForm, openExpenseAdd, openExpenseEdit, openExpenseKindPick, confirmLeaveOpenPanel } = bindInlinePanelActions(dispatch, expenseForm, { callFormOpen, editingCallId })
  usePanelBackGuard(callFormOpen || expenseForm.modalOpen, confirmLeaveOpenPanel, () => { expenseForm.closeAll(); dispatch({ type: 'closeCallForm' }); onClose?.() })

  if (periodNotice) return <AssignmentPeriodPage title={`${month}월 ${day}일 운행일지`} notice={periodNotice} onBack={onClose ? handleClose : undefined} onOpenMenu={onOpenMenu} />
  return (
    <div className="page work-log-page">
      <PageHeader
        title={<>{`${month}월 ${day}일 운행일지`}{workData[dateKey]?.assignedVehicleNumber ? <span className="assigned-vehicle-tag">배정 차량 {workData[dateKey].assignedVehicleNumber}</span> : null}</>}
        titleExtra={<AutoSaveStatus status={autoSaveStatus} />}
        onBack={onClose ? handleClose : undefined}
        onOpenMenu={onOpenMenu}
      />
      <OffToggle isOff={draft.isOff} callCount={draft.callDetails.length} onChange={(off) => patchDraft({ isOff: off, fixedCount: off ? 0 : draft.fixedCount })} />
      <div className={`modal-work-details${draft.isOff ? ' is-off' : ''}`}>
        {settings.fixedOn && (
          <div className="modal-section fixed-route-section">
            <div className="modal-section-title">고정 노선</div>
            <div className="form-group fixed-route-group">
              <FixedCountSection count={draft.fixedCount} isOff={draft.isOff} quickCounts={quickCounts} fixedRouteClient={fixedRouteClient} onChange={(count) => patchDraft({ fixedCount: Math.max(0, parseInt(String(count), 10) || 0) })} />
              <FixedRouteChips routePresets={routePresets} routeCounts={draft.fixedRouteCounts} isOff={draft.isOff} onRun={runRoute} />
            </div>
            <PalletSection visible={palletVisible} palletCount={draft.palletCount} isOff={draft.isOff} fixedRouteClient={fixedRouteClient} onChange={(count) => patchDraft({ palletCount: Math.max(0, parseInt(String(count), 10) || 0) })} />
          </div>
        )}
        <DailyInspectionNotice logId={logId} dateKey={dateKey} month={month} day={day} enabled={!!settings.dailyInspectionOn} isOff={draft.isOff} />

        {/* callDetail OFF여도 기존 callDetails 카드는 보여 준다 — 추가 진입만 canAdd로 막는다. */}
        {showCallDetailList && (
          <CallDetailList
            details={draft.callDetails}
            settings={settings}
            clients={clients}
            canAdd={settings.callDetail}
            onEdit={(id) => openCallForm(id)}
            onDelete={deleteCall}
            onTogglePayment={togglePayment}
            onMessage={(id) => setMessageCallId(id)}
            onAdd={() => openCallForm(null)}
          >
            {settings.callDetail && (
              <InlineSheet
                open={callFormOpen}
                forceInstant={expenseForm.kindPick || expenseForm.modalOpen}
                className="call-detail-inline-host" scrollKey={editingCallId ?? 'new'}
              >
                <CallDetailForm
                  key={editingCallId ?? 'new'}
                  value={editingCallItem}
                  previousItem={editingCallId ? null : previousCallItem}
                  dateKey={dateKey}
                  clients={clients}
                  settings={settings}
                  logId={logId}
                  clientScopeKey={clientScopeKey}
                  locationShortcuts={locationShortcuts}
                  pinnedLocations={pinnedLocations}
                  onTogglePinnedLocation={togglePinnedLocation}
                  isEmployedDriver={isEmployedDriver}
                  onSave={saveCall}
                  onClose={() => dispatch({ type: 'closeCallForm' })}
                />
              </InlineSheet>
            )}
          </CallDetailList>
        )}

        <DayLogExpenses
          dayExpenses={dayExpenses}
          expenseForm={expenseForm}
          callFormOpen={callFormOpen}
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
