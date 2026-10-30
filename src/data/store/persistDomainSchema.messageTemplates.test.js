// 설정에 문자 문구 칸(messageTemplates·reportShareMessage)이 들어가도 이 휴대폰 설정 읽기가 형식 오류가 되지 않아야 한다.
import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { storageKeyFor } = await import('./persist.ts')
const { readPersistDomain } = await import('./persistDomainRead.ts')
const { savePracticeSettings } = await import('../sync/settingsSave.ts')

test('문자 문구를 저장하고 다른 설정을 바꿔 저장해도, 다시 읽으면 통과하고 문구가 그대로다', async () => {
  const owner = 'message-templates-roundtrip'
  await savePracticeSettings(owner, { messageTemplates: ['가', '나', '다'], reportShareMessage: '내역서' })
  await savePracticeSettings(owner, { unbiseoDockOn: false })
  const read = readPersistDomain('settings', owner)
  assert.equal(read.ok, true, `형식 오류가 나면 안 된다 — ${JSON.stringify(read)}`)
  const value = read.ok && read.kind === 'value' ? Object(read.value) : {}
  assert.deepEqual(Reflect.get(value, 'messageTemplates'), ['가', '나', '다'])
  assert.equal(Reflect.get(value, 'reportShareMessage'), '내역서')
  assert.equal(Reflect.get(value, 'unbiseoDockOn'), false)
})

test('문자 문구 칸 모양이 틀리면 형식 오류로 걸러진다', () => {
  const owner = 'message-templates-bad'
  for (const bad of [
    { messageTemplates: ['가', '나'] },
    { messageTemplates: ['가', '나', '다', '라'] },
    { messageTemplates: ['가', '나', 3] },
    { messageTemplates: '가' },
    { reportShareMessage: 5 },
    { reportShareMessage: null },
  ]) {
    localStorage.setItem(storageKeyFor('settings', owner), JSON.stringify({ theme: 'light', ...bad }))
    const read = readPersistDomain('settings', owner)
    assert.deepEqual(read, { ok: false, kind: 'schema' }, `잘못된 모양 ${JSON.stringify(bad)}`)
  }
})
