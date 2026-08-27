import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { searchParamsForViewDate, viewDateFromSearchParams } from './calendarViewDate.js'

// Step 5(달력 홈 재작성) 완료 조건 "새로고침 후 같은 달" — viewDate를 URL 쿼리에 둬서
// 새로고침에도 남게 하는 왕복 계약. CalendarPage.jsx는 이 두 함수만으로 쿼리 ↔ Date를
// 오간다(React 없이 순수 함수로 검증).
describe('viewDateFromSearchParams / searchParamsForViewDate — 달력 월 URL 왕복', () => {
  test('유효한 y/m 쿼리는 그 연/월의 1일로 해석된다', () => {
    const params = new URLSearchParams({ y: '2026', m: '7' }) // 0-based: 8월
    const viewDate = viewDateFromSearchParams(params)
    assert.equal(viewDate.getFullYear(), 2026)
    assert.equal(viewDate.getMonth(), 7)
    assert.equal(viewDate.getDate(), 1)
  })

  test('쿼리가 없으면(직접 /app 진입) 오늘 날짜로 대체한다', () => {
    const viewDate = viewDateFromSearchParams(new URLSearchParams())
    const today = new Date()
    assert.equal(viewDate.getFullYear(), today.getFullYear())
    assert.equal(viewDate.getMonth(), today.getMonth())
  })

  test('범위를 벗어난 m(예: 12)이나 깨진 값도 오늘 날짜로 대체한다', () => {
    const today = new Date()
    const brokenM = viewDateFromSearchParams(new URLSearchParams({ y: '2026', m: '12' }))
    assert.equal(brokenM.getMonth(), today.getMonth())
    const notANumber = viewDateFromSearchParams(new URLSearchParams({ y: 'abc', m: '3' }))
    assert.equal(notANumber.getFullYear(), today.getFullYear())
  })

  test('searchParamsForViewDate가 만든 값을 다시 넣으면 같은 달로 되돌아온다(왕복)', () => {
    const original = new Date(2025, 0, 15) // 2025년 1월
    const params = new URLSearchParams(searchParamsForViewDate(original))
    const roundTripped = viewDateFromSearchParams(params)
    assert.equal(roundTripped.getFullYear(), 2025)
    assert.equal(roundTripped.getMonth(), 0)
  })
})
