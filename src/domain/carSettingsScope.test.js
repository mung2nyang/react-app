import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resolveLogSettings } from './carSettingsScope.js'
import { normalizeCarSettings, normalizeSettings } from './practiceSettings.js'

const base = normalizeSettings({
  timeOn: true,
  distanceOn: true,
  inputMode: 'fare',
  paymentOn: true,
  fixedRouteOn: true,
  pinnedLocations: ['서울'],
  subCarSettings: {
    '12가3456': { inputMode: 'count', callDetail: true, timeOn: false, platformOn: true, distanceOn: false, cargoTonnageOn: true },
  },
})

describe('resolveLogSettings (차량별 설정 스코프)', () => {
  test('메인(main)·빈 logId는 같은 객체를 그대로 돌려준다', () => {
    assert.equal(resolveLogSettings(base, 'main'), base)
    assert.equal(resolveLogSettings(base, ''), base)
  })

  test('서브차량은 세부입력 5종+inputMode를 그 차량 저장값으로 덮어쓴다', () => {
    const scoped = resolveLogSettings(base, '12가3456')
    assert.equal(scoped.inputMode, 'count')
    assert.equal(scoped.callDetail, true)
    assert.equal(scoped.timeOn, false)
    assert.equal(scoped.platformOn, true)
    assert.equal(scoped.distanceOn, false)
    assert.equal(scoped.cargoTonnageOn, true)
  })

  test('저장값이 없는 서브차량은 기본값(전부 꺼짐)이다 — 메인 값을 따라가지 않는다', () => {
    const scoped = resolveLogSettings(base, '99나9999')
    assert.deepEqual(scoped, { ...base, ...normalizeCarSettings() })
    assert.equal(scoped.timeOn, false)
    assert.equal(scoped.distanceOn, false)
    assert.equal(scoped.inputMode, 'count')
  })

  test('결제·고정노선·자주 쓰는 위치 등 공용값은 서브차량에서도 그대로다', () => {
    const scoped = resolveLogSettings(base, '12가3456')
    assert.equal(scoped.paymentOn, true)
    assert.equal(scoped.fixedRouteOn, true)
    assert.deepEqual(scoped.pinnedLocations, ['서울'])
  })

  test('원본 settings는 바뀌지 않는다', () => {
    resolveLogSettings(base, '12가3456')
    assert.equal(base.timeOn, true)
    assert.equal(base.inputMode, 'fare')
  })
})
