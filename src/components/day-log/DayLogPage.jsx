// @ts-check
// Step 6(일지 재작성): WorkLogPage.jsx + InlineExpandHost.jsx 폐기 — 이 파일이 그
// 자리를 대신한다. 화면 조합만 맡고, draft 편집·디바운스·커밋은 useDayDraft.js가,
// 콜상세 폼은 CallDetailForm.jsx가, 비용(정비/주유/기타)은 useExpenseForm.js가
// 예전처럼 별도 expenses 스토어에서 즉시 저장으로 관리한다(day record에 넣지 않는다
// — 왜인지는 migration-audit-plan.md Step 6 기록의 "비용 계약" 항목 참고).
import { useState } from 'react'
import { applyFixedRouteRun, getFixedRouteCounts } from '../../domain/day-record.js'
import { getFixedRouteClient } from '../../domain/clients.js'
import { removeCallDetail, upsertCallDetail } from '../../domain/call-details.js'
import { getDetailPaymentSummary } from '../../domain/finance.js'
import { toggleCallPaymentStatus } from '../../domain/payments.js'
import { confirmLeaveIfUnsafe } from '../../lib/durableWriteGuard.js'
import { useDayDraft } from './useDayDraft.js'
import { useExpenseForm } from './useExpenseForm.js'
import { bindInlinePanelActions } from './inlinePanelActions.js'
import DayLogHeader from './DayLogHeader.jsx'
import OffToggle from './OffToggle.jsx'
import FixedCountSection from './FixedCountSection.jsx'
import FixedRouteChips from './FixedRouteChips.jsx'
import PalletSection from './PalletSection.jsx'
import CallDetailList from './CallDetailList.jsx'
import CallDetailForm from './CallDetailForm.jsx'
import DayLogExpenses from './DayLogExpenses.jsx'
import MessageTemplateSheet from './MessageTemplateSheet.jsx'
import InlineSheet from './InlineSheet.jsx'
import './day-log.css'

/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */
/** @typedef {import('./dayLogTypes.js').Settings} Settings */
/** @typedef {import('./day-log-reducer.js').DayDraft} DayDraft */
/** @typedef {import('../../domain/call-details.js').CallDetailDraft} CallDetailDraft */

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
 */
export default function DayLogPage({ month, day, dateKey, ownerKey, clients, settings, showToast, onWorkChanged, onClose, onOpenMenu, logId = 'main' }) {
  const { draft, editingCallId, callFormOpen, dispatch, autoSaveStatus } = useDayDraft(ownerKey, dateKey, onWorkChanged, showToast, logId)
  const expenseForm = useExpenseForm(ownerKey, dateKey, showToast)
  const [messageCallId, setMessageCallId] = useState(/** @type {string|null} */ (null))

  const dayExpenses = expenseForm.expenses.filter((item) => item.date === dateKey)
  const routePresets = settings.fixedRouteOn ? (settings.fixedRoutePresets || []) : []
  const quickCounts = settings.runCountToggle ? (settings.runCountPresets || []) : []
  // settings.clients는 항상 비어 있다(normalizeSettings가 안 만든다) — 실제 거래처
  // 목록은 이 화면의 clients prop(MainPageRoute.jsx가 넘긴다)이라 그쪽을 써야 한다.
  const fixedRouteClient = getFixedRouteClient({ clients })
  const palletVisible = !!(settings.fixedOn && fixedRouteClient?.palletOn)
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

  /** @param {string} id */
  function handleTogglePayment(id) {
    const index = indexOfCall(id)
    if (index < 0) return
    const unpaid = getDetailPaymentSummary(draft.callDetails[index]).status !== 'paid'
    const wrapped = { [dateKey]: { ...draft, callDetails: draft.callDetails } }
    const result = toggleCallPaymentStatus(wrapped, dateKey, index)
    if (result.error) { showToast?.(result.error); return }
    patchDraft({ callDetails: result.data[dateKey].callDetails })
    showToast?.(unpaid ? '수금 처리했습니다.' : '수금을 취소했습니다.')
  }

  return (
    <div className="page work-log-page">
      <DayLogHeader month={month} day={day} autoSaveStatus={autoSaveStatus} onClose={handleClose} onOpenMenu={onOpenMenu} />
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

        {/* 재감사(FAIL 지적 5번) — settings.callDetail이 꺼져 있으면 콜상세 목록·추가
            폼 전체를 숨긴다(고정노선만 쓰는 사업장은 이 섹션이 필요 없다는 설정 계약 —
            practiceSettings.js의 normalizeSettings 참고: fixedOn이 꺼져 있으면 이
            설정 자체가 항상 true로 강제된다). */}
        {settings.callDetail && (
          <>
            <CallDetailList
              details={draft.callDetails}
              settings={settings}
              clients={clients}
              onEdit={(id) => openCallForm(id)}
              onDelete={(id) => patchDraft({ callDetails: /** @type {Array<DayDraft['callDetails'][number]>} */ (removeCallDetail(draft.callDetails, indexOfCall(id))) })}
              onTogglePayment={handleTogglePayment}
              onMessage={(id) => setMessageCallId(id)}
              onAdd={() => openCallForm(null)}
            />
            <InlineSheet open={callFormOpen} className="call-detail-inline-host">
              <CallDetailForm
                key={editingCallId ?? 'new'}
                value={editingCallItem}
                previousItem={editingCallId ? null : previousCallItem}
                dateKey={dateKey}
                clients={clients}
                settings={settings}
                onSave={handleSaveCall}
                onClose={() => dispatch({ type: 'closeCallForm' })}
              />
            </InlineSheet>
          </>
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
