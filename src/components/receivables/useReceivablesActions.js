// @ts-check
import { useState } from 'react'
import {
  markMonthlyReceivablesPaid,
  patchWorkLog,
  persistReceivableWorkDataChange,
} from '../../lib/ownerFinance.js'
import {
  addPartialPayment,
  markReceivableItemPaid,
  undoLastPayment,
} from '../../lib/workData.js'

/** @typedef {import('../../domain/financeReceivables.js').ReceivableItemLike} ReceivableItemLike */
/** @typedef {import('../../domain/financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('../../domain/day-record.js').DayRecordLike} DayRecordLike */

/**
 * @param {Object} params
 * @param {string} params.ownerKey
 * @param {import('../../domain/financeTypes.js').WorkDataByLogId} params.workDataByLogId
 * @param {import('../../domain/financeTypes.js').FinanceSettings} params.settings
 * @param {(message: string) => void} [params.showToast]
 * @param {() => void} [params.onWorkChanged]
 * @param {(message: string) => Promise<boolean>} params.confirm
 */
export function useReceivablesActions({
  ownerKey, workDataByLogId, settings, showToast, onWorkChanged, confirm,
}) {
  const [saving, setSaving] = useState(false)
  const [partialKey, setPartialKey] = useState('')
  const [partialAmount, setPartialAmount] = useState('')
  const [historyKey, setHistoryKey] = useState('')

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
        if (result.partial) {
          clearPartialUi()
          onWorkChanged?.()
        }
        return false
      }
      clearPartialUi()
      if (successMessage) showToast?.(successMessage)
      onWorkChanged?.()
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
    const next = markMonthlyReceivablesPaid(workDataByLogId, settings, clientName, monthKey)
    setSaving(true)
    try {
      const result = await persistReceivableWorkDataChange(ownerKey, next)
      if (!result.ok) {
        if (result.toast) showToast?.(result.toast)
        if (result.partial) onWorkChanged?.()
        return false
      }
      showToast?.(`${clientName} ${parseInt(monthKey.slice(5, 7), 10)}월분 미수금을 수금 완료 처리했습니다.`)
      onWorkChanged?.()
      return !stay
    } finally {
      setSaving(false)
    }
  }

  /** @param {ReceivableItemLike} item */
  function confirmPartial(item) {
    applyPatch(item.logId, item.dateKey, item.detailId, (store, dateKey, detailId) => (
      addPartialPayment(store, dateKey, detailId, partialAmount)
    ), '부분 입금을 등록했습니다.')
  }

  /** @param {ReceivableItemLike} item */
  async function undoPayment(item) {
    const ok = await confirm('가장 최근 입금 기록 1건을 취소하시겠습니까?')
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
    historyKey,
    setHistoryKey,
    payItem,
    payGroup,
    confirmPartial,
    undoPayment,
  }
}
