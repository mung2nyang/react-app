// @ts-check
// 로드맵 24-H-3 — 되묻기 버튼을 말로 고르기: 딱 하나 맞을 때만 그 버튼, 둘 이상·없음은 null.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALL_WORDS, DIRECT_WORDS, clientWords, matchChoice, monthWords, stepQuestion, templateWords } from './unbiseoChoice.ts'

/** @param {Record<string, Array<string>>} table */
function choicesOf(table) {
  return Object.entries(table).map(([name, words]) => ({ name, words, choose: () => {} }))
}

/** @param {string} said @param {Record<string, Array<string>>} table */
function pickName(said, table) {
  const choices = choicesOf(table)
  const chosen = matchChoice(said, choices)
  return chosen ? choices.find((choice) => choice === chosen)?.name ?? null : null
}

const TODAY = '2026-10-24'

test('거래처: 이름이 말에 들어 있으면 그 버튼, 띄어쓰기·문장부호는 빼고 본다', () => {
  const table = { 한진: clientWords('한진'), 대한: clientWords('대한 물류') }
  assert.equal(pickName('한진', table), '한진')
  assert.equal(pickName('한진으로', table), '한진')
  assert.equal(pickName('한진에 보내줘!', table), '한진')
  assert.equal(pickName('대한물류요.', table), '대한')
  assert.equal(pickName('한진 대한', { 한진: clientWords('한진'), 대한: clientWords('대한') }), null, '서로 다른 둘이 같은 길이로 맞으면 null')
  assert.equal(pickName('어제 수원 화성 15만', table), null, '안 맞으면 null')
})

test('거래처: 짧은 이름이 긴 이름 안에 있으면 길게 맞은 쪽', () => {
  const table = { 한진: clientWords('한진'), 한진물류: clientWords('한진물류') }
  assert.equal(pickName('한진물류에 보내줘', table), '한진물류')
  assert.equal(pickName('한진에 보내줘', table), '한진')
})

test('달: 올해는 "7월분"·"7월", 다른 해는 "2025년 7월"까지, "11월"은 "1월"이 아님', () => {
  const table = { jul: monthWords('2026-07', TODAY), lastJul: monthWords('2025-07', TODAY), jan: monthWords('2026-01', TODAY), nov: monthWords('2026-11', TODAY) }
  assert.equal(pickName('7월분', table), 'jul')
  assert.equal(pickName('7월', table), 'jul')
  assert.equal(pickName('2025년 7월', table), 'lastJul')
  assert.equal(pickName('2025년 7월분으로', table), 'lastJul')
  assert.equal(pickName('11월분', table), 'nov')
  assert.equal(pickName('1월분', table), 'jan')
  assert.equal(pickName('8월', table), null)
})

test('어떤 건: 전체·전부·남은 거 다 → 남은 전체, 직접·고를게 → 직접 고르기, "7월분 전체"는 달', () => {
  const table = { jul: monthWords('2026-07', TODAY), aug: monthWords('2026-08', TODAY), all: ALL_WORDS, direct: DIRECT_WORDS }
  assert.equal(pickName('전체', table), 'all')
  assert.equal(pickName('전부 보내줘', table), 'all')
  assert.equal(pickName('남은 거 다', table), 'all')
  assert.equal(pickName('직접', table), 'direct')
  assert.equal(pickName('내가 고를게요', table), 'direct')
  assert.equal(pickName('7월분 전체', table), 'jul')
})

test('문구: 번호·순서·이름으로, 둘을 말하면 null', () => {
  const table = { one: templateWords(1), two: templateWords(2), three: templateWords(3) }
  assert.equal(pickName('1번', table), 'one')
  assert.equal(pickName('일번', table), 'one')
  assert.equal(pickName('첫 번째', table), 'one')
  assert.equal(pickName('미수금 안내로', table), 'one')
  assert.equal(pickName('2번', table), 'two')
  assert.equal(pickName('두 번째', table), 'two')
  assert.equal(pickName('입금 요청', table), 'two')
  assert.equal(pickName('3번', table), 'three')
  assert.equal(pickName('세 번째', table), 'three')
  assert.equal(pickName('운행 완료', table), 'three')
  assert.equal(pickName('1번 말고 2번', table), null)
  assert.equal(pickName('11번', table), null)
})

test('버튼이 없으면 늘 null, 읽을 질문은 버튼 이름을 붙여서', () => {
  assert.equal(matchChoice('1번', []), null)
  assert.equal(stepQuestion('어떤 문구로 보낼까요?', ['미수금 안내', '입금 요청', '운행 완료']), '어떤 문구로 보낼까요? 미수금 안내, 입금 요청, 운행 완료.')
  assert.equal(stepQuestion('보낼 건을 골라 주세요.', []), '보낼 건을 골라 주세요.')
})
