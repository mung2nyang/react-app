import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  addFixedRoutePreset,
  addRunCountPreset,
  normalizeFixedRoutePresets,
  normalizeRunCountPresets,
  normalizeSettings,
  removeFixedRoutePreset,
  RUN_COUNT_PRESET_MAX,
} from './practiceSettings.js'
import { applyFixedRouteRun, getCallDetails, saveDayRecord } from './day-record.js'

describe('횟수 버튼 프리셋', () => {
  test('비어 있으면 1~5가 기본값이다', () => {
    assert.deepEqual(normalizeRunCountPresets([]), [1, 2, 3, 4, 5])
    assert.deepEqual(normalizeRunCountPresets(''), [1, 2, 3, 4, 5])
  })

  test('양수만 남기고 최대 10개다', () => {
    assert.deepEqual(normalizeRunCountPresets([2, 2, 0, -1, 7]), [2, 7])
    const many = normalizeRunCountPresets([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    assert.equal(many.length, RUN_COUNT_PRESET_MAX)
    assert.ok(!many.includes(11))
  })

  test('버튼을 하나씩 더 붙일 수 있다', () => {
    const settings = normalizeSettings({ runCountPresets: [1, 3] })
    const result = addRunCountPreset(settings, 'main')
    assert.deepEqual(result.settings.runCountPresets, [1, 3, 4])
  })
})

describe('상하차지 프리셋', () => {
  test('로컬 설정 배열에 저장하고 클라이언트가 아니다', () => {
    const settings = normalizeSettings({})
    const added = addFixedRoutePreset(settings, 'main', '부산', '대구')
    assert.equal(added.settings.fixedRoutePresets.length, 1)
    assert.equal(added.settings.fixedRoutePresets[0].loadLoc, '부산')
    assert.equal(added.settings.fixedRoutePresets[0].unloadLoc, '대구')
    assert.ok(added.settings.fixedRoutePresets[0].id)
    assert.equal(settings.fixedRoutePresets.length, 0)
  })

  test('차주와 기사차량 목록이 따로 있다', () => {
    let settings = normalizeSettings({})
    settings = addFixedRoutePreset(settings, 'main', '서울', '인천').settings
    settings = addFixedRoutePreset(settings, 'sub', '대전', '광주').settings
    assert.equal(settings.fixedRoutePresets[0].loadLoc, '서울')
    assert.equal(settings.subFixedRoutePresets[0].loadLoc, '대전')
  })

  test('상차지·하차지 없으면 추가하지 않는다', () => {
    const result = addFixedRoutePreset(normalizeSettings({}), 'main', '부산', '')
    assert.equal(result.error, '상차지와 하차지를 모두 입력해 주세요.')
  })

  test('삭제는 id 기준이다', () => {
    let settings = addFixedRoutePreset(normalizeSettings({}), 'main', '부산', '대구').settings
    const id = settings.fixedRoutePresets[0].id
    settings = removeFixedRoutePreset(settings, 'main', id)
    assert.deepEqual(settings.fixedRoutePresets, [])
  })

  test('깨진 값은 버린다', () => {
    assert.deepEqual(normalizeFixedRoutePresets([{ loadLoc: 'A' }, { id: 'r1', loadLoc: '부산', unloadLoc: '대구' }]), [
      { id: 'r1', loadLoc: '부산', unloadLoc: '대구' },
    ])
  })
})

describe('원탭 노선 기록', () => {
  test('세부입력은 안 만들고 횟수와 노선별 카운트만 올린다', () => {
    const counts = applyFixedRouteRun({}, 'route_1', 1)
    const data = saveDayRecord({}, '2026-08-26', { fixedCount: 1, fixedRouteCounts: counts })
    const record = data['2026-08-26']
    assert.equal(record.fixedCount, 1)
    assert.deepEqual(record.fixedRouteCounts, { route_1: 1 })
    assert.deepEqual(getCallDetails(record), [])
  })

  test('같은 노선을 한 번 취소하면 총 횟수도 같이 줄어든다', () => {
    let counts = applyFixedRouteRun({}, 'route_1', 1)
    counts = applyFixedRouteRun(counts, 'route_1', 1)
    counts = applyFixedRouteRun(counts, 'route_1', -1)
    const data = saveDayRecord({}, '2026-08-26', { fixedCount: 1, fixedRouteCounts: counts })
    assert.deepEqual(data['2026-08-26'].fixedRouteCounts, { route_1: 1 })
  })
})

describe('driverInvoiceBasis — 기사 매입 계산서 발행 기준 보존', () => {
  test('driverInvoiceBasis: gross는 gross로 보존되고 그 외는 net으로 기본값 정규화된다', () => {
    assert.equal(normalizeSettings({ driverInvoiceBasis: 'gross' }).driverInvoiceBasis, 'gross')
    assert.equal(normalizeSettings({ driverInvoiceBasis: 'net' }).driverInvoiceBasis, 'net')
    assert.equal(normalizeSettings({}).driverInvoiceBasis, 'net')
    assert.equal(normalizeSettings({ driverInvoiceBasis: 'invalid' }).driverInvoiceBasis, 'net')
  })

  test('다른 설정 저장 시에도 driverInvoiceBasis가 탈락하지 않고 유지된다', () => {
    const prev = normalizeSettings({ driverInvoiceBasis: 'gross', unitPrice: 50000 })
    const updated = normalizeSettings({ ...prev, unitPrice: 60000 })
    assert.equal(updated.driverInvoiceBasis, 'gross')
    assert.equal(updated.unitPrice, 60000)
  })
})
