// @ts-check
// 로드맵 24-I-2 — 위도·경도 → 기상청 격자: 기상청 격자 표(2026-10판)의 위치와 nx·ny가 같아야 한다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kmaGridOf } from './kmaGrid.ts'

test('기상청 표의 시·군·구 위치 → 표와 같은 격자 번호', () => {
  // [이름, 위도, 경도, nx, ny] — 서버 kmaGrid.json과 같은 값.
  const places = [
    ['서울 종로구', 37.5703777777777, 126.981641666666, 60, 127],
    ['경기 평택시', 36.9894388888888, 127.114655555555, 62, 114],
    ['부산 강서구', 35.2091638888888, 128.982908333333, 96, 76],
    ['제주 제주시', 33.4963111111111, 126.533208333333, 53, 38],
    ['제주 서귀포시', 33.25406007, 126.55955, 53, 33],
    ['강원 고성군', 38.3779611111111, 128.470163888888, 85, 145],
    ['경북 울릉군', 37.480575, 130.903788888888, 127, 127],
    ['전남광주 신안군', 34.7898111111111, 126.381730555555, 50, 66],
  ]
  for (const [name, lat, lon, nx, ny] of places) {
    assert.deepEqual(kmaGridOf(Number(lat), Number(lon)), { nx, ny }, String(name))
  }
})

test('격자 밖·숫자 아님은 null', () => {
  assert.equal(kmaGridOf(35.6812, 139.7671), null, '도쿄')
  assert.equal(kmaGridOf(51.5072, -0.1276), null, '런던')
  assert.equal(kmaGridOf(Number.NaN, 127), null)
  assert.equal(kmaGridOf(37.5, Number.POSITIVE_INFINITY), null)
})
