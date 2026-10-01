// 0-2 — 프로필 서버 저장·복원에 대표자명(business_representative)·예금주(account_holder)가 포함되는지.
import { mock, test } from 'node:test'
import assert from 'node:assert/strict'

/** @type {Array<{ table: string, row: Record<string, unknown> }>} */
const captured = []

mock.module('../supabaseClient.js', {
  namedExports: {
    supabase: {
      from: (/** @type {string} */ table) => ({
        upsert: (/** @type {Record<string, unknown>} */ row) => {
          captured.push({ table, row })
          return Promise.resolve({ error: null })
        },
      }),
    },
  },
})

const { upsertProfileOnSupabase } = await import('./profileCloudCommit.js')
const { mergeProfileRow } = await import('./hydrateMerge.js')

const FULL = {
  name: '김성명', phone: '010-1111-2222', bizName: '한빛운수', bizRepresentative: '김대표', bizNumber: '123-45-67890',
  bizAddress: '서울시 강서구 1', bizType: '운수업', bizItem: '화물운송', bizEmail: 'tax@hanbit.kr',
  bankName: '국민은행', accountNumber: '111-222-333', accountHolder: '김예금',
}

test('서버 저장 요청에 대표자명·예금주가 들어가고 기존 칸도 그대로 보낸다', async () => {
  captured.length = 0
  await upsertProfileOnSupabase('user-1', FULL, {})
  assert.equal(captured.length, 1)
  const { table, row } = captured[0]
  assert.equal(table, 'profiles')
  assert.equal(row.business_representative, '김대표')
  assert.equal(row.account_holder, '김예금')
  assert.equal(row.business_name, '한빛운수')
  assert.equal(row.bank_name, '국민은행')
  assert.equal(row.account_number, '111-222-333')
})

test('값이 비어 있으면 대표자명·예금주는 null로 보낸다', async () => {
  captured.length = 0
  await upsertProfileOnSupabase('user-1', { ...FULL, bizRepresentative: '', accountHolder: '' }, {})
  assert.equal(captured[0].row.business_representative, null)
  assert.equal(captured[0].row.account_holder, null)
})

test('서버 행의 대표자명·예금주를 복원한다(새로고침·다른 기기)', () => {
  const merged = mergeProfileRow({}, {
    name: '김성명', business_representative: '서버대표', account_holder: '서버예금', bank_name: '국민은행', account_number: '111',
  })
  assert.equal(merged.bizRepresentative, '서버대표')
  assert.equal(merged.accountHolder, '서버예금')
  assert.equal(merged.bankName, '국민은행')
  assert.equal(merged.accountNumber, '111')
})

test('서버 행에 두 값이 없거나 null이면 빈 문자열, 없는 행이면 전부 빈 값', () => {
  const noCols = mergeProfileRow({}, { name: '김성명' })
  assert.equal(noCols.bizRepresentative, '')
  assert.equal(noCols.accountHolder, '')
  const nulls = mergeProfileRow({}, /** @type {import('./hydrateMergeTypes.js').ProfileRow} */ ({ business_representative: undefined, account_holder: undefined }))
  assert.equal(nulls.bizRepresentative, '')
  assert.equal(mergeProfileRow({}, null).accountHolder, '')
})

test('서버 값이 비면 로컬 값을 유지한다(기존 다른 칸과 같은 규칙)', () => {
  const merged = mergeProfileRow({ bizRepresentative: '로컬대표', accountHolder: '로컬예금' }, { name: '김성명' })
  assert.equal(merged.bizRepresentative, '로컬대표')
  assert.equal(merged.accountHolder, '로컬예금')
})

test('9-B-0 연동 기사(본인 칸만): 사업자·계좌 칸은 보내지 않고 이름·연락처·설정만 보낸다', async () => {
  captured.length = 0
  await upsertProfileOnSupabase('driver-1', FULL, { timeOn: true }, { ownFieldsOnly: true })
  const { row } = captured[0]
  assert.equal(row.name, '김성명')
  assert.equal(row.phone, '010-1111-2222')
  assert.deepEqual(row.settings, { timeOn: true })
  for (const key of ['business_name', 'business_number', 'business_address', 'business_type', 'business_item', 'business_email',
    'business_representative', 'bank_name', 'account_number', 'account_holder']) {
    assert.equal(key in row, false, `${key}는 보내면 안 된다(서버 행 그대로)`)
  }
})
