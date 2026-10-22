// @ts-check
// 로드맵 23-C — 문의 알림 줄: 답변 시각·최근 대기 문의가 id에 들어가 바뀌면 다시 뜨고, 닫은 id·끈 종류는 빠진다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { buildInquiryNoticeItems, NO_INQUIRY_NOTICES } = await import('./inquiryNoticeItems.ts')

const ANSWERED = [{ id: 'q-1', title: '첫 문의', answeredAt: new Date(2026, 9, 22, 9, 0).toISOString() }]
const PENDING = { count: 3, latestId: 'n-9', latestTitle: '새 문의' }

test('답변 도착 한 줄: 제목·내용(문의 제목)·날짜 줄·id에 답변 시각·누르면 my-inquiries', () => {
  const [item] = buildInquiryNoticeItems({ answered: ANSWERED, pending: null }, [], [])
  assert.deepEqual(item, {
    id: `inquiryAnswer:q-1:${ANSWERED[0].answeredAt}`,
    kind: 'inquiryAnswer',
    page: 'my-inquiries',
    title: '문의에 답변이 도착했습니다',
    body: '첫 문의',
    dateLabel: '답변 10.22',
  })
})

test('닫은 뒤 답변이 수정되면(시각 바뀜) 다시 뜬다', () => {
  const dismissed = [`inquiryAnswer:q-1:${ANSWERED[0].answeredAt}`]
  assert.equal(buildInquiryNoticeItems({ answered: ANSWERED, pending: null }, dismissed, []).length, 0)
  const edited = [{ ...ANSWERED[0], answeredAt: new Date(2026, 9, 23, 9, 0).toISOString() }]
  const items = buildInquiryNoticeItems({ answered: edited, pending: null }, dismissed, [])
  assert.equal(items.length, 1)
  assert.equal(items[0].dateLabel, '답변 10.23')
})

test('관리자 새 문의 한 줄: 건수·최근 대기 문의 제목·누르면 admin, 닫은 뒤 새 문의면 다시 뜸', () => {
  const [item] = buildInquiryNoticeItems({ answered: [], pending: PENDING }, [], [])
  assert.deepEqual(item, { id: 'adminInquiry:n-9', kind: 'adminInquiry', page: 'admin', title: '답변 대기 문의 3건', body: '새 문의', dateLabel: '' })
  assert.equal(buildInquiryNoticeItems({ answered: [], pending: PENDING }, ['adminInquiry:n-9'], []).length, 0)
  const newer = { count: 4, latestId: 'n-10', latestTitle: '더 새 문의' }
  assert.equal(buildInquiryNoticeItems({ answered: [], pending: newer }, ['adminInquiry:n-9'], []).length, 1)
})

test('끈 종류는 빠지고, 아무것도 없으면 빈 목록', () => {
  const data = { answered: ANSWERED, pending: PENDING }
  assert.deepEqual(buildInquiryNoticeItems(data, [], ['inquiryAnswer']).map((item) => item.kind), ['adminInquiry'])
  assert.deepEqual(buildInquiryNoticeItems(data, [], ['adminInquiry']).map((item) => item.kind), ['inquiryAnswer'])
  assert.deepEqual(buildInquiryNoticeItems(NO_INQUIRY_NOTICES, [], []), [])
})
