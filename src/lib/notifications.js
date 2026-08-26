import { todayKey } from './expenses.js'
import { formatWon } from './money.js'
import { getDdayLabel, overdueItems } from './receivables.js'
import { loadDrivers } from './drivers.js'
import { loadWorkData } from './workData.js'
import { buildFinanceSettings, loadWorkDataByLogId } from './ownerFinance.js'
import { getReceivableItems } from './finance.js'
import { readJsonKey } from '../store/persist.js'
import { commitDismissedNotifications } from '../store/commitHelpers.js'

function loadDismissed(ownerKey) {
  const parsed = readJsonKey('dismissedNotifications', ownerKey, [])
  return new Set(Array.isArray(parsed) ? parsed : [])
}

export function dismissNotification(ownerKey, id) {
  const next = loadDismissed(ownerKey)
  next.add(id)
  commitDismissedNotifications(ownerKey, [...next])
}

export function collectNotifications(ownerKey = 'guest') {
  const dismissed = loadDismissed(ownerKey)
  const items = []
  const settings = buildFinanceSettings(ownerKey)
  const workDataByLogId = loadWorkDataByLogId(ownerKey)

  overdueItems(getReceivableItems(settings, workDataByLogId)).forEach((item) => {
    const id = `overdue:${item.logId}:${item.dateKey}:${item.detailIndex}`
    if (dismissed.has(id)) return
    items.push({
      id,
      page: 'receivables',
      title: `연체 미수금 · ${item.client}`,
      body: `${formatWon(item.remainingAmount)} · ${getDdayLabel(item.paymentDueDate)}`,
    })
  })

  loadDrivers(ownerKey).filter((driver) => driver.status !== 'linked').forEach((driver) => {
    const id = `driver:${driver.id}`
    if (dismissed.has(id)) return
    items.push({
      id,
      page: 'drivers',
      title: `초대 대기 · ${driver.name}`,
      body: `코드 ${driver.inviteCode}${driver.vehicleNumber ? ` · ${driver.vehicleNumber}` : ''}`,
    })
  })

  const dateKey = todayKey()
  const todayId = `today:${dateKey}`
  if (!loadWorkData(ownerKey)[dateKey] && !dismissed.has(todayId)) {
    items.push({
      id: todayId,
      page: 'home',
      title: '오늘 운행일지가 비어 있습니다',
      body: '달력에서 오늘 날짜를 눌러 횟수나 휴무를 남겨 주세요.',
    })
  }

  return items
}
