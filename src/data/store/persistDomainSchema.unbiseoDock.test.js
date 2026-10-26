// 설정에 새 칸 unbiseoDockOn(운비서 버튼)이 들어가도 이 휴대폰 설정 읽기가 형식 오류가 되지 않아야 한다.
import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { storageKeyFor } = await import('./persist.ts')
const { readPersistDomain } = await import('./persistDomainRead.ts')
const { savePracticeSettings } = await import('../sync/settingsSave.ts')

test('운비서 버튼을 끈 설정을 다시 읽어도 통과하고 값이 그대로다', async () => {
  const owner = 'unbiseo-dock-roundtrip'
  await savePracticeSettings(owner, { unbiseoDockOn: false })
  const read = readPersistDomain('settings', owner)
  assert.equal(read.ok, true, `형식 오류가 나면 안 된다 — ${JSON.stringify(read)}`)
  assert.equal(read.ok && read.kind === 'value' ? Reflect.get(Object(read.value), 'unbiseoDockOn') : null, false)
})

test('unbiseoDockOn이 참·거짓이 아니면 형식 오류로 걸러진다', () => {
  const owner = 'unbiseo-dock-bad'
  for (const bad of ['false', 0, null, []]) {
    localStorage.setItem(storageKeyFor('settings', owner), JSON.stringify({ theme: 'light', unbiseoDockOn: bad }))
    const read = readPersistDomain('settings', owner)
    assert.deepEqual(read, { ok: false, kind: 'schema' }, `잘못된 모양 ${JSON.stringify(bad)}`)
  }
})
