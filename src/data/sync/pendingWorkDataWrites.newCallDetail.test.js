// 새로 만들거나 고친 콜 상세가 든 하루 기록도 저장 대기에 등록된다(값 없는 linkedLoadIndex 칸을 만들지 않음).
import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { buildCallDetail, upsertCallDetail } = await import('../../domain/call-details.ts')
const { clearPendingDayWrite, registerPendingDayWrite } = await import('./pendingWorkDataWrites.ts')

/** dayDraftLifecycle.commitNow와 같은 patch — structuredClone은 값 없는 칸도 그대로 둔다. @param {Array<object>} callDetails */
function patchOf(callDetails) {
  return structuredClone({ isOff: false, fixedCount: 0, palletCount: 0, callDetails, fixedRouteCounts: {} })
}

test('새 콜: linkedLoadIndex 칸이 없고, 그 콜이 든 하루 기록이 저장 대기에 등록된다', () => {
  const built = buildCallDetail({ loadLoc: '평택', unloadLoc: '용인', fare: '150000', client: '' }, null, '2026-10-26', [])
  assert.ok('item' in built && built.item, '콜 상세 만들기 성공')
  assert.equal('linkedLoadIndex' in built.item, false)
  const patch = patchOf([built.item])
  assert.equal(registerPendingDayWrite('b5-owner', '2026-10-26', patch), true, '저장 대기 등록이 거절됨')
  clearPendingDayWrite('b5-owner', '2026-10-26', patch)
})

test('고친 콜: 원래 linkedLoadIndex 값은 그대로 남고, 저장 대기에 등록된다', () => {
  const existing = { id: 'trp-1', loadLoc: '평택', fare: '50000', distanceType: '혼짐', linkedLoadIndex: '0' }
  const result = upsertCallDetail([existing], { loadLoc: '평택', unloadLoc: '오산', fare: '60000' }, 0, '2026-10-26', [])
  assert.equal(result.error, undefined)
  assert.equal(result.items[0].linkedLoadIndex, '0')
  const patch = patchOf(result.items)
  assert.equal(registerPendingDayWrite('b5-owner', '2026-10-27', patch), true, '저장 대기 등록이 거절됨')
  clearPendingDayWrite('b5-owner', '2026-10-27', patch)
})
