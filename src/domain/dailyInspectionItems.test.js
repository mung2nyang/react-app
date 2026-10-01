// @ts-check
// 로드맵 9-B-2 — 일상점검표 항목: 법정 서식 순서 3묶음 11항목, [모두 양호]·저장 조건·서버 값 좁히기.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAILY_INSPECTION_KEYS, DAILY_INSPECTION_SECTIONS, allGoodItems, isInspectionComplete, sanitizeInspectionItems } from './dailyInspectionItems.js'

test('3묶음(외관 4·상태 3·기타 4) 11항목, 서식 첫·끝 항목 문구', () => {
  assert.deepEqual(DAILY_INSPECTION_SECTIONS.map((s) => [s.no, s.title, s.items.length]), [['01', '외관 점검', 4], ['02', '상태 점검', 3], ['03', '기타', 4]])
  assert.equal(DAILY_INSPECTION_KEYS.length, 11)
  assert.equal(new Set(DAILY_INSPECTION_KEYS).size, 11)
  assert.equal(DAILY_INSPECTION_SECTIONS[0].items[0].label, '번호판, 전면유리, 후사경 등의 청결상태')
  assert.equal(DAILY_INSPECTION_SECTIONS[2].items[3].label, '안전삼각대 등 비치 여부')
})

test('[모두 양호]는 11항목 전부 양호, 저장 조건은 11항목 모두 선택', () => {
  const all = allGoodItems()
  assert.equal(Object.keys(all).length, 11)
  assert.ok(Object.values(all).every((v) => v === 'good'))
  assert.equal(isInspectionComplete(all), true)
  const missing = { ...all }
  delete missing.tires
  assert.equal(isInspectionComplete(missing), false)
  assert.equal(isInspectionComplete({ ...all, tires: 'bad' }), true)
})

test('서버 값 좁히기: 모르는 키·양호/불량 아닌 값은 버림', () => {
  assert.deepEqual(sanitizeInspectionItems({ tires: 'bad', lamps: 'good', unknown: 'good', wipers: 'maybe' }), { tires: 'bad', lamps: 'good' })
  assert.deepEqual(sanitizeInspectionItems(null), {})
  assert.deepEqual(sanitizeInspectionItems(['good']), {})
})
