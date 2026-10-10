// 알림 화면 수정 1 — 설정에 새 칸 notifOff(끈 알림 종류)가 들어가도 이 휴대폰 설정 읽기가 형식 오류가 되지 않아야 한다
// (안 되면 비회원은 다음에 켤 때 32번 막기 화면 — 로드맵 25번과 같은 종류).
import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

mock.module('../lib/syncQueue.js', {
  namedExports: { scheduleCloudSync: () => {}, flushCloudSync: async () => {} },
})

const { storageKeyFor } = await import('./persist.js')
const { readPersistDomain } = await import('./persistDomainRead.js')
const { savePracticeSettings } = await import('../lib/practiceSettings.js')

test('끈 알림 종류를 저장한 설정을 다시 읽어도 통과하고 값이 그대로다', async () => {
  const owner = 'notif-off-roundtrip'
  await savePracticeSettings(owner, { notifOff: ['overdue', 'today'] })
  const read = readPersistDomain('settings', owner)
  assert.equal(read.ok, true, `형식 오류가 나면 안 된다 — ${JSON.stringify(read)}`)
  assert.equal(read.kind, 'value')
  assert.deepEqual(read.ok && read.kind === 'value' ? Reflect.get(Object(read.value), 'notifOff') : null, ['overdue', 'today'])
})

test('모르는 이름은 저장 전에 빠진다(아는 종류만)', async () => {
  const owner = 'notif-off-unknown'
  await savePracticeSettings(owner, { notifOff: ['overdue', 'nope'] })
  const read = readPersistDomain('settings', owner)
  assert.deepEqual(read.ok && read.kind === 'value' ? Reflect.get(Object(read.value), 'notifOff') : null, ['overdue'])
})

test('notifOff가 글자 목록이 아니면 지금처럼 형식 오류로 걸러진다', () => {
  const owner = 'notif-off-bad'
  for (const bad of ['overdue', [1, 2], { overdue: true }, null]) {
    localStorage.setItem(storageKeyFor('settings', owner), JSON.stringify({ theme: 'light', notifOff: bad }))
    const read = readPersistDomain('settings', owner)
    assert.deepEqual(read, { ok: false, kind: 'schema' }, `잘못된 모양 ${JSON.stringify(bad)}`)
  }
})
