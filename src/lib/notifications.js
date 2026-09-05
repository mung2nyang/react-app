// @ts-check
import { todayKey } from './expenses.js'
import { formatWon } from './money.js'
import { getDdayLabel, overdueItems } from './receivables.js'
import { loadWorkData } from './workData.js'
import { buildFinanceSettings, loadWorkDataByLogId } from './ownerFinance.js'
import { getReceivableItems } from './finance.js'
import { readJsonKey } from '../store/persist.js'
import { commitDismissedNotifications } from '../store/commitHelpers.js'
import { readOwnerDrivers } from '../store/ownerDataHooks.js'
import { getLastBackupAt } from './guestBackup.js'
import { isCloudSession } from './cloudSession.js'

/** @typedef {import('../domain/financeReceivables.js').ReceivableItemLike} ReceivableItemLike */

/** @param {string} ownerKey */
function loadDismissed(ownerKey) {
  const parsed = /** @type {Array<string>} */ (readJsonKey('dismissedNotifications', ownerKey, []))
  return new Set(Array.isArray(parsed) ? parsed : [])
}

/**
 * @param {string} ownerKey
 * @param {string} id
 */
export function dismissNotification(ownerKey, id) {
  const next = loadDismissed(ownerKey)
  next.add(id)
  commitDismissedNotifications(ownerKey, [...next])
}

/**
 * @param {string} [ownerKey]
 * @param {import('./cloudSession.js').AppSession|null} [session]
 */
export function collectNotifications(ownerKey = 'guest', session = null) {
  const dismissed = loadDismissed(ownerKey)
  /** @type {Array<{ id: string, page: string, title: string, body: string }>} */
  const items = []
  const settings = buildFinanceSettings(ownerKey)
  const workDataByLogId = loadWorkDataByLogId(ownerKey)

  const overdues = /** @type {Array<ReceivableItemLike>} */ (
    overdueItems(getReceivableItems(settings, workDataByLogId))
  )
  overdues.forEach((item) => {
    const id = `overdue:${item.logId}:${item.dateKey}:${item.detailId}`
    if (dismissed.has(id)) return
    items.push({
      id,
      page: 'receivables',
      title: `연체 미수금 · ${item.client}`,
      body: `${formatWon(item.remainingAmount)} · ${getDdayLabel(item.paymentDueDate)}`,
    })
  })

  readOwnerDrivers(ownerKey).filter((driver) => driver.status !== 'linked').forEach((driver) => {
    const id = `driver:${driver.id}`
    if (dismissed.has(id)) return
    items.push({
      id,
      page: 'drivers',
      title: `초대 대기 · ${driver.name}`,
      body: `코드 ${driver.inviteCode}${driver.vehicleNumber ? ` · ${driver.vehicleNumber}` : ''}`,
    })
  })

  const TODAY_LOG_REMINDER_HOUR = 18
  if (new Date().getHours() >= TODAY_LOG_REMINDER_HOUR) {
    const dateKey = todayKey()
    const todayId = `today:${dateKey}`
    const workMap = /** @type {Record<string, unknown>} */ (loadWorkData(ownerKey))
    const todayRecord = workMap[dateKey]
    /** @type {{ isOff?: unknown, callDetails?: unknown, fixedCount?: unknown }|null} */
    const record = (todayRecord && typeof todayRecord === 'object' && !Array.isArray(todayRecord))
      ? /** @type {{ isOff?: unknown, callDetails?: unknown, fixedCount?: unknown }} */ (todayRecord)
      : null
    const hasEntry = !!record && (
      !!record.isOff
      || (Array.isArray(record.callDetails) && record.callDetails.length > 0)
      || (parseInt(String(record.fixedCount ?? ''), 10) || 0) > 0
    )
    if (!hasEntry && !dismissed.has(todayId)) {
      items.push({
        id: todayId,
        page: 'home',
        title: '오늘 운행일지가 비어 있습니다',
        body: '달력에서 오늘 날짜를 눌러 횟수나 휴무를 남겨 주세요.',
      })
    }
  }

  // 게스트 세션 전용: 데이터 백업 권장 알림 (14일 이상 경과 또는 미백업)
  const isGuest = ownerKey === 'guest' && !isCloudSession(session)
  if (isGuest) {
    const lastBackupIso = getLastBackupAt()
    const lastBackupTime = lastBackupIso ? new Date(lastBackupIso).getTime() : NaN
    const hasValidBackup = !Number.isNaN(lastBackupTime)
    const daysSince = hasValidBackup ? Math.floor((Date.now() - lastBackupTime) / 86400000) : null
    const needsBackup = !hasValidBackup || (daysSince !== null && daysSince >= 14)

    if (needsBackup) {
      const backupId = `backup:${hasValidBackup ? lastBackupTime : 'never'}`
      if (!dismissed.has(backupId)) {
        const body = (hasValidBackup && daysSince !== null)
          ? `마지막 백업으로부터 ${daysSince}일이 지났습니다. 최신 데이터로 백업해 주세요.`
          : '아직 백업한 적이 없습니다. 브라우저 데이터 삭제 시 기록이 사라질 수 있습니다.'
        items.push({
          id: backupId,
          page: 'settings',
          title: '데이터 백업 권장',
          body,
        })
      }
    }
  }

  return items
}
