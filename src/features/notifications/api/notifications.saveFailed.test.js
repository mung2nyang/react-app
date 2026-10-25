// 로드맵 110-B — 일지 저장 실패 날짜(110-A 목록)마다 알림: 맨 앞·날짜 오래된 순, 그 날짜 일지로, 닫기·끄기 없음.
import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { collectNotifications, dismissNotification } = await import('./notifications.js')
const { addFailedDayLogDate } = await import('../../../data/sync/failedDayLogDates.ts')
const { commitSettings } = await import('../../../data/store/commitHelpers.ts')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')

test('실패 날짜마다 알림(메인·기사 차량), 맨 앞·날짜 오래된 순, 그 날짜 일지 주소', () => {
  const ownerKey = 'nf-items'
  commitSettings(ownerKey, normalizeSettings({ dailyInspectionOn: false }))
  addFailedDayLogDate(ownerKey, 'main', '2026-10-22')
  addFailedDayLogDate(ownerKey, '34나5678', '2026-10-09')
  const items = collectNotifications(ownerKey)
  assert.deepEqual(items.slice(0, 2), [
    {
      id: 'saveFailed:34나5678:2026-10-09', kind: 'saveFailed', page: 'logs/34나5678/day/2026-10-09',
      title: '10월 9일 운행일지(5678)를 저장하지 못했습니다.', body: '일지를 확인한 후 저장이 안 된 내용이 있으면 다시 입력해 주세요.', dateLabel: '', noDismiss: true,
    },
    {
      id: 'saveFailed:main:2026-10-22', kind: 'saveFailed', page: 'day/2026-10-22',
      title: '10월 22일 운행일지를 저장하지 못했습니다.', body: '일지를 확인한 후 저장이 안 된 내용이 있으면 다시 입력해 주세요.', dateLabel: '', noDismiss: true,
    },
  ])
  // 저녁이면 "오늘 일지" 알림도 끼므로 순서 대신 포함만 본다.
  assert.ok(items.slice(2).some((item) => item.kind === 'inspectionRequired'), '다른 알림은 그 뒤')
})

test('알림 받기에서 꺼도, 닫은 id에 있어도 빠지지 않는다', () => {
  const ownerKey = 'nf-off'
  commitSettings(ownerKey, normalizeSettings({ dailyInspectionOn: true, notifOff: ['saveFailed', 'today'] }))
  addFailedDayLogDate(ownerKey, 'main', '2026-10-22')
  dismissNotification(ownerKey, 'saveFailed:main:2026-10-22')
  assert.deepEqual(collectNotifications(ownerKey).map((item) => item.id), ['saveFailed:main:2026-10-22'])
})
