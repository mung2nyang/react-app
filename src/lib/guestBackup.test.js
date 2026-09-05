// @ts-check
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import {
  applyGuestBackupData,
  buildGuestBackupData,
  getLastBackupAt,
  markBackupDone,
} from './guestBackup.js'
import { replaceOwnerState } from '../store/owner-state.js'
import { getState } from '../store/app-store.js'
import { normalizeSettings } from '../domain/practiceSettings.js'

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
    }, { sync: false })
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

    replaceOwnerState('guest', seedSnapshot, { sync: false })
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
    const backupWorkLogs = /** @type {Record<string, any>} */ (backup.workLogs)

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
    }, { sync: false })

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
})
