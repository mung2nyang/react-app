// @ts-check
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import {
  applyGuestBackupData,
  buildGuestBackupData,
  getLastBackupAt,
  markBackupDone,
} from './guestBackup.js'
import { initializeOwnerFromPersist, replaceOwnerState } from '../store/owner-state.js'
import { commitBatch, getState } from '../store/app-store.js'
import { commitDismissedNotifications } from '../store/commitHelpers.js'
import { normalizeSettings } from '../../domain/practiceSettings.js'

describe('guestBackup — 게스트 데이터 내보내기/가져오기', () => {
  beforeEach(() => {
    localStorage.clear()
    replaceOwnerState('guest', {
      cars: [],
      clients: [],
      drivers: [],
      expenses: [],
      invoices: [],
      profile: { name: '', phone: '', bizName: '' },
      settings: normalizeSettings({
        theme: 'light',
        inputMode: 'count',
        unitPrice: 0,
        fixedOn: true,
        callDetail: true,
        paymentOn: false,
      }),
      workLogs: { main: {} },
    })
  })

  test('타임스탬프: getLastBackupAt 초기값 null, markBackupDone 후 갱신', () => {
    assert.equal(getLastBackupAt(), null)
    const fixedTime = '2026-09-05T12:00:00.000Z'
    markBackupDone(fixedTime)
    assert.equal(getLastBackupAt(), fixedTime)

    markBackupDone()
    const nowIso = getLastBackupAt()
    assert.ok(nowIso && !Number.isNaN(new Date(nowIso).getTime()))
  })

  test('왕복: buildGuestBackupData → applyGuestBackupData 후 각 도메인 값 일치', () => {
    /** @type {import('../store/owner-state.js').OwnerSnapshot} */
    const seedSnapshot = {
      cars: [
        { id: 'car-1', number: '11가1111', type: 'main' },
        { id: 'car-2', number: '22나2222', type: 'sub' },
      ],
      clients: [
        { id: 'c-1', companyName: '삼화운수' },
      ],
      drivers: [
        { id: 'd-1', name: '홍길동', phone: '010-1111-2222', inviteCode: '123456', status: 'pending' },
      ],
      expenses: [
        { id: 'exp-1', kind: 'fuel', date: '2026-09-01', name: '주유', cost: 50000 },
      ],
      settings: normalizeSettings({
        theme: 'dark',
        inputMode: 'fare',
        unitPrice: 10000,
        fixedOn: true,
        callDetail: true,
        paymentOn: true,
      }),
      profile: {
        name: '차주',
        phone: '010-9999-8888',
        bizName: '차주로지스',
      },
      workLogs: {
        main: {
          '2026-09-01': { isOff: false, fixedCount: 2, callDetails: [{ fare: 80000 }] },
        },
        '22나2222': {
          '2026-09-02': { isOff: true },
        },
      },
    }

    replaceOwnerState('guest', seedSnapshot)
    // 서브 차량 로컬 일지 저장 (실제 앱에서는 commitLogWorkData 로 쓰임)
    localStorage.setItem('reactPracticeWorkData:guest:log:22나2222', JSON.stringify({
      '2026-09-02': { isOff: true },
    }))

    const backup = buildGuestBackupData()
    assert.equal(backup.backupType, 'react_practice_backup')
    assert.equal(backup.version, 1)
    assert.ok(backup.createdAt)

    const backupCars = /** @type {Array<unknown>} */ (backup.cars)
    const backupClients = /** @type {Array<unknown>} */ (backup.clients)
    const backupExpenses = /** @type {Array<unknown>} */ (backup.expenses)
    const backupWorkLogs = /** @type {Record<string, Record<string, import('../../domain/dayRecordTypes.js').DayRecordLike>>} */ (backup.workLogs)

    assert.equal(backupCars.length, 2)
    assert.equal(backupClients.length, 1)
    assert.equal(backupExpenses.length, 1)
    assert.equal(backupWorkLogs.main['2026-09-01'].fixedCount, 2)
    assert.equal(backupWorkLogs['22나2222']['2026-09-02'].isOff, true)

    // 스토어를 초기 상태로 비움
    replaceOwnerState('guest', {
      cars: [],
      clients: [],
      drivers: [],
      expenses: [],
      invoices: [],
      settings: normalizeSettings({
        theme: 'light',
        inputMode: 'count',
        unitPrice: 0,
        fixedOn: true,
        callDetail: true,
        paymentOn: false,
      }),
      workLogs: { main: {} },
    })

    assert.equal((getState().cars.guest || []).length, 0)
    assert.equal((getState().clients.guest || []).length, 0)

    // 복원 적용
    const restoreResult = applyGuestBackupData(backup)
    assert.equal(restoreResult.ok, true)

    const state = getState()
    assert.equal((state.cars.guest || []).length, 2)
    assert.equal(state.cars.guest[0].number, '11가1111')
    assert.equal(state.cars.guest[1].number, '22나2222')
    assert.equal((state.clients.guest || []).length, 1)
    assert.equal(state.clients.guest[0].companyName, '삼화운수')
    assert.equal((state.expenses.guest || []).length, 1)
    assert.equal(state.expenses.guest[0].cost, 50000)
    assert.equal(state.settings.guest?.theme, 'dark')
    assert.equal(state.settings.guest?.inputMode, 'fare')
    assert.equal(state.profile.guest?.name, '차주')
    assert.equal(state.workLogs.guest?.main?.['2026-09-01']?.fixedCount, 2)
    assert.equal(state.workLogs.guest?.['22나2222']?.['2026-09-02']?.isOff, true)
  })

  test('손상된 JSON 거부: null, 배열, 유효 도메인 없는 객체는 거부되고 스토어 불변', () => {
    // 1. null / 원시값 / 배열
    assert.equal(applyGuestBackupData(null).ok, false)
    assert.equal(applyGuestBackupData(undefined).ok, false)
    assert.equal(applyGuestBackupData('not-json-object').ok, false)
    assert.equal(applyGuestBackupData([1, 2, 3]).ok, false)

    // 2. 유효 도메인 키가 전혀 없는 객체
    assert.equal(applyGuestBackupData({}).ok, false)
    assert.equal(applyGuestBackupData({ randomKey: 123 }).ok, false)

    // 3. 도메인 타입이 손상된 경우
    assert.equal(applyGuestBackupData({ cars: 'not-an-array' }).ok, false)
    assert.equal(applyGuestBackupData({ cars: [null] }).ok, false)
    assert.equal(applyGuestBackupData({ clients: 'not-an-array' }).ok, false)
    assert.equal(applyGuestBackupData({ clients: [123] }).ok, false)
    assert.equal(applyGuestBackupData({ settings: 123 }).ok, false)
    assert.equal(applyGuestBackupData({ settings: [] }).ok, false)
    assert.equal(applyGuestBackupData({ workData: 'bad-work-data' }).ok, false)
    assert.equal(applyGuestBackupData({ workData: { '2026-05-01': null } }).ok, false)
    assert.equal(applyGuestBackupData({ workLogs: { main: null } }).ok, false)
    assert.equal(applyGuestBackupData({ subWorkData: 'bad' }).ok, false)
  })

  /** @returns {Record<string, string|null>} */
  function storageSnapshot() {
    /** @type {Record<string, string|null>} */
    const out = {}
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key) out[key] = localStorage.getItem(key)
    }
    return out
  }

  /** @param {import('./pendingWorkDataWritesTypes.js').JsonValue} file */
  function assertRejectedUnchanged(file) {
    replaceOwnerState('guest', { cars: [{ id: 'car-1', number: '11가1111', type: 'main' }], workLogs: { main: { '2026-09-01': { count: 1 } } } })
    const before = storageSnapshot()
    const res = applyGuestBackupData(file)
    assert.deepEqual(res, { ok: false, error: '백업 파일이 손상되었거나 운행일지 백업 파일이 아닙니다.' })
    assert.deepEqual(storageSnapshot(), before)
    assert.equal(getState().cars.guest?.[0]?.number, '11가1111')
    assert.equal(getState().workLogs.guest?.main?.['2026-09-01']?.count, 1)
    assert.equal(initializeOwnerFromPersist('guest'), true)
  }

  test('68: 차량·거래처에 정해진 칸 밖 내용이 있으면 거절, 기존 기록 그대로', () => {
    assertRejectedUnchanged({ cars: [{ id: 'car-9', number: '99가9999', type: 'main', oldField: 1 }] })
    assertRejectedUnchanged({ clients: [{ id: 'c-9', companyName: '옛거래처', legacyMemo: 'x' }] })
  })

  test('68: 하루 기록에 정해진 칸 밖 내용·틀린 콜 상세가 있으면 거절', () => {
    assertRejectedUnchanged({ workData: { '2026-05-01': { count: 2, memo: '옛 메모' } } })
    assertRejectedUnchanged({ workLogs: { main: { '2026-05-01': { callDetails: [{ fare: 'abc' }] } } } })
    assertRejectedUnchanged({ workLogs: { main: { 'not-a-date': { count: 1 } } } })
  })

  test('68: subWorkData 안쪽 일지가 틀리면 거절', () => {
    assertRejectedUnchanged({ workData: {}, subWorkData: { '22나2222': { '2026-05-01': { count: -1 } } } })
    assertRejectedUnchanged({ workData: {}, subWorkData: { '22나2222': 'bad' } })
  })

  test('68: 설정·개인정보에 정해진 칸 밖 내용이 있으면 거절', () => {
    assertRejectedUnchanged({ settings: { theme: 'dark', oldToggle: true } })
    assertRejectedUnchanged({ profile: { name: '차주', fax: '02-000-0000' } })
  })

  test('68: 복원에 성공하면 앱 켤 때 검사도 통과하고 옛 휴무 표기는 정리돼 저장', () => {
    const res = applyGuestBackupData({
      cars: [{ id: 'car-1', number: '11가1111', type: 'main' }, { id: 'car-2', number: '22나2222', type: 'sub' }],
      workData: { '2026-05-01': 'off' },
      subWorkData: { '22나2222': { '2026-05-02': { count: 3 } } },
    })
    assert.deepEqual(res, { ok: true })
    assert.deepEqual(JSON.parse(localStorage.getItem('reactPracticeWorkData:guest') || 'null'), { '2026-05-01': { isOff: true } })
    assert.equal(initializeOwnerFromPersist('guest'), true)
    assert.equal(getState().workLogs.guest?.['22나2222']?.['2026-05-02']?.count, 3)
  })

  test('68-1: 백업에 없는 기사 차량의 옛 일지 키는 복원 때 지워짐', () => {
    replaceOwnerState('guest', {
      cars: [{ id: 'car-3', number: '33다3333', type: 'sub' }],
      workLogs: { main: {}, '33다3333': { '2026-04-01': { count: 1 } } },
    }, { extraWrites: [{ key: 'reactPracticeWorkData:guest:log:33다3333', value: { '2026-04-01': { count: 1 } } }] })
    assert.ok(localStorage.getItem('reactPracticeWorkData:guest:log:33다3333'))

    const res = applyGuestBackupData({
      cars: [{ id: 'car-2', number: '22나2222', type: 'sub' }],
      workLogs: { main: {}, '22나2222': { '2026-05-02': { count: 3 } } },
    })
    assert.deepEqual(res, { ok: true })
    assert.equal(localStorage.getItem('reactPracticeWorkData:guest:log:33다3333'), null)
    assert.deepEqual(JSON.parse(localStorage.getItem('reactPracticeWorkData:guest:log:22나2222') || 'null'), { '2026-05-02': { count: 3 } })
  })
  /** 기기에 닫은 알림·빈 날 삭제 목록을 심는다. @param {Array<string>} ids @param {Record<string, string>} tombstones */
  function seedMarks(ids, tombstones) {
    commitDismissedNotifications('guest', ids)
    commitBatch([{ domain: 'workDataDeletedDates', ownerKey: 'guest', value: tombstones }])
  }

  test('78: 닫은 알림·빈 날 삭제 목록도 백업 시점으로 복원(교체), 앱 다시 켜도 남음', () => {
    seedMarks(['today:2026-10-17', 'backup:never'], { '2026-10-01': '2026-10-02T00:00:00.000Z' })
    const backup = buildGuestBackupData()
    seedMarks(['today:2026-10-18'], { '2026-10-09': '2026-10-10T00:00:00.000Z' })

    assert.deepEqual(applyGuestBackupData(backup), { ok: true })
    assert.deepEqual(getState().dismissedNotifications.guest, ['today:2026-10-17', 'backup:never'])
    assert.deepEqual(getState().workDataDeletedDates.guest, { '2026-10-01': '2026-10-02T00:00:00.000Z' })

    assert.deepEqual(JSON.parse(localStorage.getItem('reactPracticeDismissedNotifs:guest') || 'null'), ['today:2026-10-17', 'backup:never'])
    assert.deepEqual(JSON.parse(localStorage.getItem('reactPracticeWorkDataDeletedDates:guest') || 'null'), { '2026-10-01': '2026-10-02T00:00:00.000Z' })
    assert.equal(initializeOwnerFromPersist('guest'), true)
    assert.deepEqual(getState().dismissedNotifications.guest, ['today:2026-10-17', 'backup:never'])
    assert.deepEqual(getState().workDataDeletedDates.guest, { '2026-10-01': '2026-10-02T00:00:00.000Z' })
  })

  test('78: 두 목록이 없는 옛 백업은 기기 목록을 그대로 둠', () => {
    seedMarks(['backup:never'], { '2026-10-01': '2026-10-02T00:00:00.000Z' })
    assert.deepEqual(applyGuestBackupData({ cars: [{ id: 'car-1', number: '11가1111', type: 'main' }] }), { ok: true })
    assert.deepEqual(getState().dismissedNotifications.guest, ['backup:never'])
    assert.deepEqual(getState().workDataDeletedDates.guest, { '2026-10-01': '2026-10-02T00:00:00.000Z' })
  })

  test('78: 두 목록 모양이 틀리면 거절, 두 목록만 있는 파일도 거절', () => {
    assertRejectedUnchanged({ cars: [], dismissedNotifications: [1, 2] })
    assertRejectedUnchanged({ cars: [], workDataDeletedDates: { 'not-a-date': '2026-10-02T00:00:00.000Z' } })
    assertRejectedUnchanged({ cars: [], workDataDeletedDates: ['2026-10-01'] })
    assertRejectedUnchanged({ dismissedNotifications: ['backup:never'], workDataDeletedDates: {} })
  })
})
