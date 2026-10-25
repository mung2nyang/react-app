// @ts-check
import { useState } from 'react'
import {
  markMonthlyReceivablesPaid,
  patchWorkLog,
  persistReceivableWorkDataChange,
} from '../../../data/sync/ownerFinance.ts'
import {
  addPartialPayment, markReceivableItemPaid, undoLastPayment,
} from '../../../domain/payments.ts'
import { getReceivableItems } from '../../../domain/finance.ts'
import { groupItems } from '../../../domain/receivables.ts'
import { formatWon } from '../../../domain/money.ts'
import { checkPartialAmount } from '../../../domain/payments.ts'
import { focusField } from '../../../shared/ui/FieldError.jsx'
import { useToast } from '../../../shared/hooks/useToast.js'

/** @typedef {import('../../../domain/financeReceivables.ts').ReceivableItemLike} ReceivableItemLike */
/** @typedef {import('../../../domain/financeTypes.ts').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('../../../domain/day-record.ts').DayRecordLike} DayRecordLike */

/** @param {string} key */
export const partialInputId = (key) => `receivablePartial-${key}`

/**
 * @param {Object} params
 * @param {string} params.ownerKey
 * @param {import('../../../domain/financeTypes.ts').WorkDataByLogId} params.workDataByLogId
 * @param {import('../../../domain/financeTypes.ts').FinanceSettings} params.settings
 * @param {(message: string, options?: { confirmLabel?: string, danger?: boolean, message?: string }) => Promise<boolean>} params.confirm
 */
export function useReceivablesActions({
  ownerKey, workDataByLogId, settings, confirm,
}) {
  const showToast = useToast()
  const [saving, setSaving] = useState(false)
  const [partialKey, setPartialKey] = useState('')
  const [partialAmount, setPartialAmount] = useState('')
  const [historyKey, setHistoryKey] = useState('')
  const [problem, setProblem] = useState(/** @type {(NonNullable<ReturnType<typeof checkPartialAmount>> & { key: string, value: string })|null} */ (null))
  // 같은 카드에서 입금액을 고치기 시작하면 표시를 거둔다.
  const partialProblem = problem && problem.key === partialKey && problem.value === partialAmount ? problem : null

  function clearPartialUi() {
    setPartialKey('')
    setPartialAmount('')
  }

  async function persist(/** @type {WorkDataByLogId} */ next, /** @type {string} [successMessage] */ successMessage) {
    if (saving) return false
    setSaving(true)
    try {
      const result = await persistReceivableWorkDataChange(ownerKey, next)
      if (!result.ok) {
        if (result.toast) showToast?.(result.toast)
        if (result.partial) clearPartialUi()
        return false
      }
      clearPartialUi()
      if (successMessage) showToast?.(successMessage)
      return true
    } finally {
      setSaving(false)
    }
  }

  async function applyPatch(
    /** @type {string} */ logId,
    /** @type {string} */ dateKey,
    /** @type {string} */ detailId,
    /** @type {(store: Record<string, DayRecordLike>, dateKey: string, detailId: string) => { data?: Record<string, DayRecordLike>, error?: string }} */ apply,
    /** @type {string} [successMessage] */ successMessage,
  ) {
    const result = patchWorkLog(workDataByLogId, logId, dateKey, detailId, apply)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    await persist(result.workDataByLogId, successMessage)
  }

  /** @param {ReceivableItemLike} item */
  function payItem(item) {
    applyPatch(item.logId, item.dateKey, item.detailId, (store, dateKey, detailId) => (
      markReceivableItemPaid(store, dateKey, detailId)
    ), '입금 완료 처리했습니다.')
  }

  /** @param {string} clientName @param {string} monthKey @param {boolean} stay */
  async function payGroup(clientName, monthKey, stay) {
    if (saving) return false
    // 한 달치를 한 번에 바꾸고 되돌리기는 한 건씩이라 먼저 묻는다(로드맵 44).
    const items = groupItems(getReceivableItems(settings, workDataByLogId), clientName, monthKey)
    const amount = items.reduce((sum, item) => sum + item.remainingAmount, 0)
    const month = parseInt(monthKey.slice(5, 7), 10)
    const ok = await confirm(`${clientName}의 ${month}월 미수금을 모두 입금 완료로 처리할까요?`, {
      message: `미수 ${items.length}건, ${formatWon(amount)}입니다. 취소하려면 각 건을 하나씩 처리해야 합니다.`,
      confirmLabel: '입금 완료',
    })
    if (!ok) return false
    const next = markMonthlyReceivablesPaid(workDataByLogId, settings, clientName, monthKey)
    setSaving(true)
    try {
      const result = await persistReceivableWorkDataChange(ownerKey, next)
      if (!result.ok) {
        if (result.toast) showToast?.(result.toast)
        return false
      }
      showToast?.(`${clientName} ${parseInt(monthKey.slice(5, 7), 10)}월분 미수금을 수금 완료 처리했습니다.`)
      return !stay
    } finally {
      setSaving(false)
    }
  }

  /** @param {ReceivableItemLike} item */
  function confirmPartial(item) {
    const found = checkPartialAmount(partialAmount, item.remainingAmount)
    setProblem(found && { ...found, key: partialKey, value: partialAmount })
    if (found) {
      focusField(partialInputId(partialKey))
      return
    }
    applyPatch(item.logId, item.dateKey, item.detailId, (store, dateKey, detailId) => (
      addPartialPayment(store, dateKey, detailId, partialAmount)
    ), '부분 입금을 등록했습니다.')
  }

  /** @param {ReceivableItemLike} item */
  async function undoPayment(item) {
    const ok = await confirm('가장 최근 입금 기록 1건을 취소하시겠습니까?', { confirmLabel: '입금 취소', danger: true })
    if (!ok) return
    applyPatch(item.logId, item.dateKey, item.detailId, (store, dateKey, detailId) => (
      undoLastPayment(store, dateKey, detailId)
    ), '입금 기록을 취소했습니다.')
  }

  return {
    saving,
    partialKey,
    setPartialKey,
    partialAmount,
    setPartialAmount,
    partialProblem,
    historyKey,
    setHistoryKey,
    payItem,
    payGroup,
    confirmPartial,
    undoPayment,
  }
}
