// 로드맵 31: 미수금 목록·상세를 오갈 때 ?back= 표시를 들고 다녀야 목록 뒤로가기가 마이페이지로 돌아간다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { receivablesDetailPath, receivablesListPath } from './receivablesPaths.js'

test('상세 주소: ?back= 표시를 뒤에 그대로 붙인다', () => {
  assert.equal(receivablesDetailPath('미지정 거래처', '2026-10', '?back=mypage'), `/app/receivables/${encodeURIComponent('미지정 거래처')}/2026-10?back=mypage`)
})

test('상세 주소: 표시가 없으면 예전과 같다', () => {
  assert.equal(receivablesDetailPath('한진', '2026-09'), `/app/receivables/${encodeURIComponent('한진')}/2026-09`)
})

test('목록 주소: ?back= 표시를 뒤에 그대로 붙인다', () => {
  assert.equal(receivablesListPath('?back=mypage'), '/app/receivables?back=mypage')
  assert.equal(receivablesListPath('?back=home'), '/app/receivables?back=home')
})

test('목록 주소: 표시가 없으면 예전과 같다', () => {
  assert.equal(receivablesListPath(), '/app/receivables')
  assert.equal(receivablesListPath(''), '/app/receivables')
})
