// @ts-check
// 로드맵 24-J-2 — 운비서 점검표: 일지 안내 줄과 같은 조건(설정·계약 기간·휴무·차량·이미 저장)과 같은 저장(11항목 양호·점검자 이름).
import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

/** @type {import('../../../data/sync/dailyInspections.ts').DailyInspection|null} */
let serverRecord = null
/** @type {Error|null} */
let fetchError = null
/** @type {Error|null} */
let saveError = null
/** @type {Array<{ vehicleId: string|number, workDate: string }>} */
let fetched = []
/** @type {Array<Record<string, import('../../../domain/jsonTypes.ts').JsonValue>>} */
let saved = []
mock.module('../../../data/sync/dailyInspections.ts', {
  namedExports: {
    fetchDailyInspection: async (/** @type {string|number} */ vehicleId, /** @type {string} */ workDate) => { fetched.push({ vehicleId, workDate }); if (fetchError) throw fetchError; return serverRecord },
    saveDailyInspection: async (/** @type {Record<string, import('../../../domain/jsonTypes.ts').JsonValue>} */ input) => { if (saveError) throw saveError; saved.push(input) },
  },
})

const { checkInspection, saveAllGood, savedSentence, INSPECTION_SETTING_OFF, INSPECTION_DAY_OFF, INSPECTION_NO_VEHICLE } = await import('./unbiseoInspection.ts')
const { TRY_LATER } = await import('./unbiseoParse.ts')
const { commitCars, commitDrivers, commitProfile, commitSettings, commitWorkData } = await import('../../../data/store/commitHelpers.ts')
const { EMPTY_PROFILE } = await import('../../../data/sync/profileSave.ts')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { allGoodItems } = await import('../../../domain/dailyInspectionItems.ts')
const { SERVER_SAVE_FAIL } = await import('../../../shared/utils/failureMessages.js')

const OWNER = 'unbiseo-inspection'
const TODAY = '2026-10-25'

beforeEach(() => {
  serverRecord = null
  fetchError = null
  saveError = null
  fetched = []
  saved = []
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }))
  commitCars(OWNER, [{ id: 'c-sub', type: 'sub', number: '77사7777', supabaseId: 'veh-sub' }, { id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'veh-main' }])
  commitProfile(OWNER, { ...EMPTY_PROFILE, name: '차주이름' })
  commitDrivers(OWNER, [])
  commitWorkData(OWNER, {})
})

test('다 지나고 그날 점검표가 없으면 [저장하기] — 메인 차량·그 날짜, 점검자는 내 이름', async () => {
  assert.deepEqual(await checkInspection(OWNER, TODAY, TODAY, false), { sentence: '오늘 일상점검표를 모두 양호로 저장할게요.', save: { date: TODAY, vehicleId: 'veh-main', inspectorName: '차주이름' } })
  assert.deepEqual(await checkInspection(OWNER, '2026-10-03', TODAY, false), { sentence: '10월 3일 일상점검표를 모두 양호로 저장할게요.', save: { date: '2026-10-03', vehicleId: 'veh-main', inspectorName: '차주이름' } })
  assert.deepEqual(fetched, [{ vehicleId: 'veh-main', workDate: TODAY }, { vehicleId: 'veh-main', workDate: '2026-10-03' }])
  commitCars(OWNER, [{ id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'veh-main', driverName: ' 박기사 ' }])
  assert.equal((await checkInspection(OWNER, TODAY, TODAY, false)).save?.inspectorName, '박기사', '메인 차량 기사 이름이 먼저')
})

test('이미 있음·읽기 실패는 문장만', async () => {
  serverRecord = { items: allGoodItems(), actionNote: '', inspectorName: '차주이름' }
  assert.deepEqual(await checkInspection(OWNER, '2026-10-03', TODAY, false), { sentence: '10월 3일 일상점검표는 이미 저장되어 있어요.', save: null })
  serverRecord = null
  fetchError = new Error('down')
  const errors = mock.method(console, 'error', () => {})
  try {
    assert.deepEqual(await checkInspection(OWNER, TODAY, TODAY, false), { sentence: TRY_LATER, save: null })
  } finally { errors.mock.restore() }
})

test('처음 걸리는 것 하나만: 설정 꺼짐 → 계약 기간 밖 → 휴무 → 차량 없음, 이때는 서버를 읽지 않는다', async () => {
  commitDrivers(OWNER, [{ id: 'link-1', name: '김기사', phone: '', vehicleNumber: '12가3456', startDate: '2026-10-05', endDate: '2026-10-20', status: 'linked' }])
  commitWorkData(OWNER, { '2026-10-03': { isOff: true }, '2026-10-10': { isOff: true } })
  const ask = (/** @type {string} */ date, isDriver = true) => checkInspection(OWNER, date, TODAY, isDriver)
  assert.equal((await ask('2026-10-03')).sentence, '계약기간 전 날짜입니다. 10월 5일부터 기록할 수 있습니다.')
  assert.equal((await ask(TODAY)).sentence, '계약기간이 끝난 날짜입니다. 10월 20일까지 기록할 수 있습니다.')
  assert.equal((await ask('2026-10-03', false)).sentence, INSPECTION_DAY_OFF, '차주는 계약 기간을 보지 않음')
  assert.equal((await ask('2026-10-10')).sentence, INSPECTION_DAY_OFF, '기간 안 휴무')
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: false }))
  assert.equal((await ask('2026-10-03')).sentence, INSPECTION_SETTING_OFF, '설정 꺼짐이 맨 먼저')
  assert.equal(INSPECTION_SETTING_OFF, '앱 설정에서 일상점검표 사용을 켜면 쓸 수 있어요.')
  assert.equal(INSPECTION_DAY_OFF, '휴무 날은 일상점검표를 쓰지 않아요.')
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }))
  commitCars(OWNER, [{ id: 'c-main', type: 'main', number: '12가3456' }])
  assert.deepEqual(await ask('2026-10-12'), { sentence: INSPECTION_NO_VEHICLE, save: null })
  assert.equal(INSPECTION_NO_VEHICLE, '일상점검표를 저장할 차량이 없어요.')
  assert.deepEqual(fetched, [])
})

test('저장: 일지 창과 같은 몸통(11항목 양호·조치 기록 빈 칸), 실패면 그 오류 문구 또는 서버 저장 실패 문구', async () => {
  const save = { date: '2026-10-03', vehicleId: 'veh-main', inspectorName: '차주이름' }
  assert.equal(await saveAllGood(save), null)
  assert.deepEqual(saved, [{ vehicleId: 'veh-main', workDate: '2026-10-03', items: allGoodItems(), actionNote: '', inspectorName: '차주이름' }])
  assert.equal(Object.keys(allGoodItems()).length, 11)
  const errors = mock.method(console, 'error', () => {})
  try {
    saveError = new Error('로그인 후 저장할 수 있습니다.')
    assert.equal(await saveAllGood(save), '로그인 후 저장할 수 있습니다.')
    saveError = new Error('')
    assert.equal(await saveAllGood(save), SERVER_SAVE_FAIL)
  } finally { errors.mock.restore() }
  assert.equal(savedSentence(TODAY, TODAY), '오늘 일상점검표를 모두 양호로 저장했어요.')
  assert.equal(savedSentence('2026-10-03', TODAY), '10월 3일 일상점검표를 모두 양호로 저장했어요.')
})
