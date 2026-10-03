// @ts-check
// 데이터 다운로드(B-1): 비회원 백업과 같은 모양 + 일상점검표(차량 번호별), 서버에서 다 불러오기 전엔 막힘.
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const cars = [
  { id: 'c-main', number: '12가3456', type: 'main', supabaseId: 'v-main' },
  { id: 'c-sub', number: '34나5678', type: 'sub', supabaseId: 'v-sub' },
  { id: 'c-local', number: '56다7890', type: 'sub' },
]
const workLogs = { main: { '2026-10-01': { calls: [] } }, '34나5678': { '2026-10-02': { calls: [] } } }
/** @type {Array<Array<string|number>>} */
const inspectionCalls = []
let cloudOwner = 'owner-1'
let ready = true

mock.module('../store/ownerDataHooks.js', {
  namedExports: {
    readOwnerCars: () => cars,
    readOwnerClients: () => [{ name: '한빛물류' }],
    readOwnerDrivers: () => [],
    readOwnerExpenses: () => [{ id: 'e-1' }],
    readOwnerInvoices: () => [],
    readOwnerProfile: () => ({ name: '차주', accountNumber: '111-22' }),
    readOwnerSettings: () => ({ theme: 'dark' }),
    readOwnerWorkDataByLogId: () => workLogs,
  },
})
mock.module('./cloudSession.js', {
  namedExports: { getCloudOwnerKey: () => cloudOwner, isHydrationReady: () => ready },
})
mock.module('./dailyInspections.js', {
  namedExports: {
    fetchVehiclesDailyInspections: async (/** @type {Array<string|number>} */ ids) => {
      inspectionCalls.push(ids)
      return { 'v-sub': { '2026-10-02': { items: {}, actionNote: '', inspectorName: '김기사' } } }
    },
  },
})

const { buildMemberBackupData, memberBackupBlockedReason } = await import('./memberBackup.js')

test('비회원 백업과 같은 칸 + 점검표는 서버 id가 있는 차량만 읽어 차량 번호(메인은 main)로 담는다', async () => {
  const data = await buildMemberBackupData('owner-1')
  assert.equal(data.backupType, 'react_practice_backup')
  assert.equal(data.version, 1)
  for (const key of ['cars', 'clients', 'settings', 'expenses', 'invoices', 'drivers', 'profile', 'workData', 'workLogs']) {
    assert.ok(key in data, key)
  }
  assert.deepEqual(data.workData, workLogs.main)
  assert.deepEqual(data.workLogs, workLogs)
  assert.deepEqual(inspectionCalls.at(-1), ['v-main', 'v-sub'])
  assert.deepEqual(Object.keys(/** @type {object} */ (data.dailyInspections)), ['34나5678'])
})

test('로그인 owner가 아니거나 서버에서 다 불러오기 전이면 막는다', () => {
  cloudOwner = 'owner-1'
  ready = true
  assert.equal(memberBackupBlockedReason('owner-1'), null)
  ready = false
  assert.match(String(memberBackupBlockedReason('owner-1')), /불러오는 중/)
  ready = true
  cloudOwner = 'someone-else'
  assert.match(String(memberBackupBlockedReason('owner-1')), /불러오는 중/)
})
