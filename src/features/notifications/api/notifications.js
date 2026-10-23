// @ts-check
/** @typedef {import('../../../domain/jsonTypes.ts').JsonValue} JsonValue */
import { todayKey } from '../../../domain/expenses.ts'
import { todayWorkLogSelection } from '../../../domain/calendar.ts'
import { formatWon } from '../../../domain/money.ts'
import { getShortCarNum } from '../../../domain/cars.ts'
import { getDdayLabel, overdueItems } from '../../../domain/receivables.ts'
import { buildFinanceSettings, loadWorkDataByLogId } from '../../../data/sync/ownerFinance.ts'
import { getReceivableItems } from '../../../domain/finance.ts'
import { readJsonKey } from '../../../data/store/persist.ts'
import { commitDismissedNotifications } from '../../../data/store/commitHelpers.ts'
import { readOwnerDrivers, readOwnerSettings } from '../../../data/store/ownerDataHooks.ts'
import { getLastBackupAt } from '../../../data/sync/guestBackup.ts'
import { isCloudSession } from '../../../data/cloud/cloudSession.ts'
import { listFailedDayLogDates } from '../../../data/sync/failedDayLogDates.ts'

/** @typedef {import('../../../domain/financeReceivables.ts').ReceivableItemLike} ReceivableItemLike */

export const DAILY_INSPECTION_NOTICE_ID = 'daily-inspection-required'
const SAVE_FAILED_KIND = 'saveFailed'

/** 'YYYY-MM-DD…' → 'MM.DD'(알림 날짜 줄). 모양이 아니면 빈 글자. @param {JsonValue|undefined} value */
function shortDate(value) {
  const match = typeof value === 'string' ? /^\d{4}-(\d{2})-(\d{2})/.exec(value) : null
  return match ? `${match[1]}.${match[2]}` : ''
}

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
 * @param {import('../../../data/cloud/cloudSession.ts').AppSession|null} [session]
 */
export function collectNotifications(ownerKey = 'guest', session = null) {
  const dismissed = loadDismissed(ownerKey)
  /** @type {Array<{ id: string, kind: string, page: string, title: string, body: string, dateLabel: string, actionLabel?: string, dismissLabel?: string, noDismiss?: boolean }>} */
  const items = []

  // 일지 저장 실패(로그인) — 휴대폰에 남은 실패 날짜마다. 닫기·끄기 없이, 다시 저장되거나 그 날짜 일지를 열면 사라진다.
  const failed = [...listFailedDayLogDates(ownerKey)].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.logId.localeCompare(b.logId))
  failed.forEach(({ logId, dateKey }) => {
    const car = logId === 'main' ? '' : `(${getShortCarNum(logId)})`
    items.push({
      id: `saveFailed:${logId}:${dateKey}`,
      kind: SAVE_FAILED_KIND,
      page: logId === 'main' ? `day/${dateKey}` : `logs/${logId}/day/${dateKey}`,
      title: `${Number(dateKey.slice(5, 7))}월 ${Number(dateKey.slice(8, 10))}일 운행일지${car} 저장이 실패했습니다.`,
      body: '일지를 확인한 후 저장이 안 된 내용이 있으면 다시 입력해 주세요.',
      dateLabel: '',
      noDismiss: true,
    })
  })
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
      kind: 'overdue',
      page: 'receivables',
      title: `${item.client} 연체 미수금`,
      body: `${formatWon(item.remainingAmount)}, ${getDdayLabel(item.paymentDueDate)}`,
      dateLabel: [
        shortDate(item.workDate || item.dateKey) && `운행 ${shortDate(item.workDate || item.dateKey)}`,
        shortDate(item.paymentDueDate) && `입금 예정 ${shortDate(item.paymentDueDate)}`,
      ].filter(Boolean).join(', '),
    })
  })

  readOwnerDrivers(ownerKey).filter((driver) => driver.status !== 'linked').forEach((driver) => {
    const id = `driver:${driver.id}`
    if (dismissed.has(id)) return
    items.push({
      id,
      kind: 'driverInvite',
      page: 'drivers',
      title: `${driver.name} 초대 대기`,
      body: `코드 ${driver.inviteCode}${driver.vehicleNumber ? `, ${driver.vehicleNumber}` : ''}`,
      dateLabel: '',
    })
  })

  const TODAY_LOG_REMINDER_HOUR = 18
  if (new Date().getHours() >= TODAY_LOG_REMINDER_HOUR) {
    const dateKey = todayKey()
    const todayId = `today:${dateKey}`
    // 로그인 계정 일지는 메모리에만 있어 기기 저장소가 아닌 메모리(위 workDataByLogId)에서 읽는다.
    const workMap = /** @type {Record<string, JsonValue|undefined>} */ (workDataByLogId.main || {})
    const todayRecord = workMap[dateKey]
    /** @type {{ isOff?: JsonValue, callDetails?: JsonValue, fixedCount?: JsonValue }|null} */
    const record = (todayRecord && typeof todayRecord === 'object' && !Array.isArray(todayRecord))
      ? /** @type {{ isOff?: JsonValue, callDetails?: JsonValue, fixedCount?: JsonValue }} */ (todayRecord)
      : null
    const hasEntry = !!record && (
      !!record.isOff
      || (Array.isArray(record.callDetails) && record.callDetails.length > 0)
      || (parseInt(String(record.fixedCount ?? ''), 10) || 0) > 0
    )
    if (!hasEntry && !dismissed.has(todayId)) {
      items.push({
        id: todayId,
        kind: 'today',
        page: 'home',
        title: '오늘 운행일지가 비어 있습니다',
        body: '홈에서 [운행 기록하기]를 눌러 일지나 휴무를 남겨 주세요.',
        dateLabel: shortDate(dateKey),
      })
    }
  }

  // 9-B-1: 로그인 계정에서 내 메인 차량 일상점검표가 꺼져 있으면 의무화 안내([바로 사용하기]·[다시 보지 않기]).
  if (ownerKey !== 'guest' && !readOwnerSettings(ownerKey).dailyInspectionOn && !dismissed.has(DAILY_INSPECTION_NOTICE_ID)) {
    items.push({
      id: DAILY_INSPECTION_NOTICE_ID,
      kind: 'inspectionRequired',
      page: 'settings',
      title: '일상점검표가 의무화되었습니다',
      body: '관련 법령에 따라 출발 전 일상점검표를 작성해야 합니다. [바로 사용하기]를 누르면 켜집니다.',
      dateLabel: '',
      actionLabel: '바로 사용하기',
      dismissLabel: '다시 보지 않기',
    })
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
          ? `마지막 백업 후 ${daysSince}일이 지났습니다. 지금 백업해 주세요.`
          : '아직 백업한 적이 없습니다. 앱을 지우거나 휴대폰을 바꾸면 기록이 사라질 수 있습니다.'
        items.push({
          id: backupId,
          kind: 'backup',
          page: 'settings',
          title: '백업 권장',
          body,
          dateLabel: hasValidBackup ? `마지막 백업 ${shortDate(todayWorkLogSelection(new Date(lastBackupTime)).dateKey)}` : '',
        })
      }
    }
  }

  // 알림 화면 "알림 받기"에서 끈 종류는 목록·알림 숫자에서 뺌(일상점검 의무화 안내·일지 저장 실패는 끌 수 없음).
  const off = readOwnerSettings(ownerKey).notifOff || []
  return items.filter((item) => item.kind === SAVE_FAILED_KIND || !off.includes(item.kind))
}
