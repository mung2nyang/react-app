// @ts-check
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { collectNotifications, dismissNotification } from './notifications.js'
import { markBackupDone } from './guestBackup.js'

describe('notifications — 데이터 백업 권장 알림 및 게스트/로그인 분기', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('게스트 미백업: lastBackupAt 없으면 백업 권장 알림(backup:never)이 뜬다', () => {
    const notifs = collectNotifications('guest')
    const backupNotif = notifs.find((item) => item.id.startsWith('backup:'))
    assert.ok(backupNotif, '백업 권장 알림이 있어야 한다')
    assert.equal(backupNotif.id, 'backup:never')
    assert.equal(backupNotif.page, 'settings')
    assert.equal(backupNotif.title, '데이터 백업 권장')
    assert.equal(backupNotif.body, '아직 백업한 적이 없습니다. 브라우저 데이터 삭제 시 기록이 사라질 수 있습니다.')
  })

  test('14일 경계값: 13일 전 백업은 알림 없고, 14일 전 백업부터 알림이 뜬다', () => {
    const now = Date.now()

    // 13일 전: 알림 없음
    const thirteenDaysAgo = new Date(now - 13 * 86400000).toISOString()
    markBackupDone(thirteenDaysAgo)
    const notifs13 = collectNotifications('guest')
    assert.equal(notifs13.some((item) => item.id.startsWith('backup:')), false)

    // 14일 전: 알림 발생
    const fourteenDaysAgo = new Date(now - 14 * 86400000).toISOString()
    markBackupDone(fourteenDaysAgo)
    const notifs14 = collectNotifications('guest')
    const backup14 = notifs14.find((item) => item.id.startsWith('backup:'))
    assert.ok(backup14, '14일 경과 시 백업 알림이 떠야 한다')
    assert.equal(backup14.title, '데이터 백업 권장')
    assert.equal(backup14.body, '마지막 백업으로부터 14일이 지났습니다. 최신 데이터로 백업해 주세요.')

    // 15일 전: 알림 발생
    const fifteenDaysAgo = new Date(now - 15 * 86400000).toISOString()
    markBackupDone(fifteenDaysAgo)
    const notifs15 = collectNotifications('guest')
    const backup15 = notifs15.find((item) => item.id.startsWith('backup:'))
    assert.ok(backup15, '15일 경과 시 백업 알림이 떠야 한다')
    assert.equal(backup15.body, '마지막 백업으로부터 15일이 지났습니다. 최신 데이터로 백업해 주세요.')
  })

  test('세션 분기: 로그인(클라우드) 세션에서는 백업 알림이 전혀 뜨지 않는다', () => {
    // 1. ownerKey가 'guest'가 아닌 경우 (로그인 계정 ID)
    const notifsOwner = collectNotifications('owner-user-123')
    assert.equal(notifsOwner.some((item) => item.id.startsWith('backup:')), false)

    // 2. ownerKey는 'guest'여도 cloud session인 경우
    /** @type {import('./cloudSession.js').AppSession} */
    const cloudSession = { userId: 'u1', guestMode: false }
    const notifsCloud = collectNotifications('guest', cloudSession)
    assert.equal(notifsCloud.some((item) => item.id.startsWith('backup:')), false)
  })

  test('알림 닫기: dismissNotification 후 다시 뜨지 않는다', () => {
    const notifsBefore = collectNotifications('guest')
    const backupNotif = notifsBefore.find((item) => item.id.startsWith('backup:'))
    assert.ok(backupNotif)

    dismissNotification('guest', backupNotif.id)

    const notifsAfter = collectNotifications('guest')
    assert.equal(notifsAfter.some((item) => item.id === backupNotif.id), false)
  })
})
