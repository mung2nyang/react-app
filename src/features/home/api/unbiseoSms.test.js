// @ts-check
// 로드맵 24-H-2 — 운비서 미수금 문자: 답 읽기, 고를 거리·숫자는 미수금 화면과 같은 함수, 문구 값({운행구간} 4가지·{운송료} 남은 합계), 연락처.
import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { before, test } from 'node:test'

const { commitCars, commitClients, commitLogWorkData, commitSettings } = await import('../../../data/store/commitHelpers.ts')
const { readOwnerWorkDataByLogId } = await import('../../../data/store/ownerDataHooks.ts')
const { buildFinanceSettings } = await import('../../../data/sync/ownerFinance.ts')
const { getReceivableItems } = await import('../../../domain/finance.ts')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { FIXTURE_SETTINGS, FIXTURE_WORK } = await import('../../../domain/finance.fixtures.ts')
const { itemKey, pickedItems, readSms, readSmsItems, smsBody, smsClientItems, smsClientTotals, smsPhone, smsRouteLabel } = await import('./unbiseoSms.ts')

const OWNER = 'unbiseo-sms'
const TODAY = '2026-10-23'

before(() => {
  commitSettings(OWNER, normalizeSettings({ fixedOn: true, subFixedOn: true }))
  commitClients(OWNER, [...FIXTURE_SETTINGS.clients, { id: 'c-daehan', companyName: '대한', phone: '010-2222-3333' }])
  commitCars(OWNER, FIXTURE_SETTINGS.cars)
  Object.entries(FIXTURE_WORK).forEach(([logId, data]) => commitLogWorkData(OWNER, logId, data))
})

test('답 읽기: 칸 그대로, 틀린 칸은 빈 값(거래처 51자·달 모양·전체는 참일 때만·문구 1~3), 달이 있으면 전체는 거짓', () => {
  assert.deepEqual(readSms({ client: ' 한진 ', month: '2026-07', all: false, template: 1 }), { client: '한진', month: '2026-07', all: false, template: 1 })
  assert.deepEqual(readSms({}), { client: '', month: '', all: false, template: null })
  assert.equal(readSms({ client: 'ㄱ'.repeat(51) }).client, '')
  for (const month of ['2026-13', '2026-7', 202607]) assert.equal(readSms({ month }).month, '', String(month))
  assert.equal(readSms({ all: true }).all, true)
  assert.equal(readSms({ all: 'true' }).all, false)
  assert.equal(readSms({ month: '2026-07', all: true }).all, false)
  for (const template of [0, 4, 1.5, '1']) assert.equal(readSms({ template }).template, null, String(template))
})

test('미수 건 = 미수금 화면 함수(getReceivableItems) 그대로, 거래처는 남은 금액 큰 순서', () => {
  const direct = getReceivableItems(buildFinanceSettings(OWNER), readOwnerWorkDataByLogId(OWNER))
  const items = readSmsItems(OWNER)
  assert.deepEqual(items, direct)
  assert.ok(items.length > 2, '자료가 비어 있지 않음')
  const totals = smsClientTotals(items)
  assert.deepEqual(totals.map((row) => row.client), ['대한', '한진', '직접'])
  for (const row of totals) {
    const mine = direct.filter((item) => item.client === row.client)
    assert.deepEqual(row, { client: row.client, count: mine.length, total: mine.reduce((sum, item) => sum + item.remainingAmount, 0) })
  }
})

test('거래처 건·달 묶음(오래된 달부터)과 고른 건', () => {
  const { list, months } = smsClientItems(readSmsItems(OWNER), '대한')
  assert.deepEqual(months.map((group) => [group.monthKey, group.count, group.total]), [['2026-04', 1, 999999], ['2026-05', 1, 200000]])
  assert.equal(pickedItems(list, { kind: 'all' }).length, 2)
  assert.deepEqual(pickedItems(list, { kind: 'month', month: '2026-05' }).map((item) => item.workDate), ['2026-05-12'])
  assert.deepEqual(pickedItems(list, { kind: 'items', keys: [itemKey(list[1])] }), [list[1]])
})

test('{운행구간}: 달 "5월분 3건"(다른 해는 연도), 전체 "전체 n건", 직접 1건 "날짜 상차지 → 하차지", 여러 건 "… 외 n건"', () => {
  const items = readSmsItems(OWNER)
  const hanjin = smsClientItems(items, '한진').list
  assert.equal(smsRouteLabel({ kind: 'month', month: '2026-05' }, hanjin, TODAY), '5월분 3건')
  assert.equal(smsRouteLabel({ kind: 'month', month: '2026-05' }, hanjin, '2027-01-02'), '2026년 5월분 3건')
  assert.equal(smsRouteLabel({ kind: 'all' }, hanjin, TODAY), '전체 3건')
  const one = [{ ...hanjin[0], loadLoc: '평택', unloadLoc: '용인', workDate: '2026-10-03' }]
  assert.equal(smsRouteLabel({ kind: 'items', keys: [] }, one, TODAY), '10월 3일 평택 → 용인')
  assert.equal(smsRouteLabel({ kind: 'items', keys: [] }, [...one, hanjin[1], hanjin[2]], TODAY), '10월 3일 평택 → 용인 외 2건')
  assert.equal(smsRouteLabel({ kind: 'items', keys: [] }, [hanjin[0]], TODAY), '5월 10일 상차지 → 하차지', '빈 지명')
})

test('문구 = 이 휴대폰 문구를 일지 문자 창 함수로 채움, {운송료}는 고른 건의 남은 합계', () => {
  localStorage.removeItem('messageTemplateCustomBodies')
  const hanjin = smsClientItems(readSmsItems(OWNER), '한진').list
  const pick = /** @type {const} */ ({ kind: 'month', month: '2026-05' })
  assert.equal(smsBody(1, '한진', pick, hanjin, TODAY), '안녕하세요, 한진 담당자님. 5월분 3건 운송료 130,000원이 미수 상태입니다. 확인 부탁드립니다.')
  assert.equal(smsBody(2, '한진', pick, hanjin, TODAY), '안녕하세요. 5월분 3건 운송 건 운송료 130,000원 입금 부탁드립니다. 감사합니다.')
  localStorage.setItem('messageTemplateCustomBodies', JSON.stringify(['{거래처} {운행구간} {운송료}원 확인', '', '']))
  try {
    assert.equal(smsBody(1, '한진', { kind: 'all' }, hanjin, TODAY), '한진 전체 3건 130,000원 확인', '바꾼 문구')
  } finally { localStorage.removeItem('messageTemplateCustomBodies') }
})

test('연락처: 같은 이름 거래처의 연락처, 없으면 빈 값', () => {
  assert.equal(smsPhone(OWNER, '대한'), '010-2222-3333')
  assert.equal(smsPhone(OWNER, '한진'), '')
  assert.equal(smsPhone(OWNER, '없는거래처'), '')
})
