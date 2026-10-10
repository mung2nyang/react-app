// @ts-check
// 알림 화면 — 알림마다 날짜 줄(dateLabel)과 끈 종류(notifOff) 빼기.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'
import { collectNotifications } from './notifications.js'
import { markBackupDone } from './guestBackup.js'
import { commitSettings } from '../store/commitHelpers.js'
import { normalizeSettings } from '../domain/practiceSettings.js'

describe('notifications — 날짜 줄·끈 종류', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { mock.timers.reset() })

  test('오늘 운행일지 비어 있음 = 오늘 MM.DD', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 10, 18, 30, 0).getTime() })
    const item = collectNotifications('label-today').find((n) => n.kind === 'today')
    assert.equal(item?.dateLabel, '10.10')
  })

  test('백업 권장 = 마지막 백업 날짜(이 휴대폰 날짜 기준), 한 번도 안 했으면 날짜 없음', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 10, 9, 0, 0).getTime() })
    assert.equal(collectNotifications('guest').find((n) => n.kind === 'backup')?.dateLabel, '')
    mock.timers.setTime(new Date(2026, 8, 1, 0, 30, 0).getTime()) // 자정 직후 — UTC로 바꾸면 하루 앞 날짜가 되는 시각
    markBackupDone()
    mock.timers.setTime(new Date(2026, 9, 10, 9, 0, 0).getTime())
    assert.equal(collectNotifications('guest').find((n) => n.kind === 'backup')?.dateLabel, '마지막 백업 09.01')
  })

  test('끈 종류는 빠지고, 일상점검 의무화 안내는 끌 수 없다', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 10, 18, 30, 0).getTime() })
    const owner = 'label-off'
    commitSettings(owner, normalizeSettings({ notifOff: ['today', 'inspectionRequired'] }), { syncToCloud: false })
    const kinds = collectNotifications(owner).map((n) => n.kind)
    assert.equal(kinds.includes('today'), false)
    assert.equal(kinds.includes('inspectionRequired'), true, '의무화 안내는 notifOff에 넣어도(모르는 이름이라 저장 전에 빠짐) 그대로')
  })
})
