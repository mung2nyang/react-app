import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseDateKeySelection } from './calendar.js'

// MainPageRoute.jsx는 `/app`(index)에서 selected가 null이면 CalendarPage를, 아니면
// WorkLogPage를 그린다(Step 5). 이 함수가 index 라우트에서 정확히 null을 돌려주는 데
// 그 분기가 달려 있다 — null이 아닌 다른 값을 돌려주면 항상 일지 화면만 그려져서
// 애초에 달력으로 돌아갈 방법이 없어진다.
describe('parseDateKeySelection — /app/day/:date 라우트 파라미터 계약', () => {
  test('date가 없으면(=index 라우트, "/app") null — MainPage가 달력을 그린다', () => {
    assert.equal(parseDateKeySelection(undefined), null)
  })

  test('형식이 안 맞는 값도 null로 떨어진다(깨진 URL로 일지가 잘못 열리지 않는다)', () => {
    assert.equal(parseDateKeySelection(''), null)
    assert.equal(parseDateKeySelection('2026-8-1'), null)
    assert.equal(parseDateKeySelection('not-a-date'), null)
  })

  test('유효한 YYYY-MM-DD는 month/day를 정확히 뽑는다', () => {
    assert.deepEqual(parseDateKeySelection('2026-08-26'), { dateKey: '2026-08-26', month: 8, day: 26 })
    assert.deepEqual(parseDateKeySelection('2026-01-01'), { dateKey: '2026-01-01', month: 1, day: 1 })
    assert.deepEqual(parseDateKeySelection('2026-12-31'), { dateKey: '2026-12-31', month: 12, day: 31 })
  })
})

// Step 5(달력 홈 재작성) 재감사 3번: viewDateFromSearchParams/searchParamsForViewDate는
// calendarViewDate.js(타입 전용 모듈)로 옮겼다 — 그 테스트도 calendarViewDate.test.js로
// 함께 옮겼다.
