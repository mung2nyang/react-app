import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { reorderClients, sortClientsPinnedFirst, upsertClient } from './clients.js'

describe('거래처 저장 — 세금계산서 필드', () => {
  test('대표자·이메일·주소·업태·종목을 저장한다', () => {
    const result = upsertClient([], {
      companyName: '한진',
      managerName: '박담당',
      taxRepresentative: '이대표',
      taxEmail: 'tax@example.com',
      taxAddress: '서울시 강서구',
      taxBizType: '운수업',
      taxBizItem: '화물운송',
    })
    assert.equal(result.error, undefined)
    assert.equal(result.clients[0].taxRepresentative, '이대표')
    assert.equal(result.clients[0].taxEmail, 'tax@example.com')
    assert.equal(result.clients[0].taxAddress, '서울시 강서구')
    assert.equal(result.clients[0].taxBizType, '운수업')
    assert.equal(result.clients[0].taxBizItem, '화물운송')
  })

  test('즐겨찾기는 목록 앞으로 오고, 드래그는 같은 핀 그룹 안에서만 된다', () => {
    const first = upsertClient([], { companyName: '가', isPinned: false }).clients
    const two = upsertClient(first, { companyName: '나', isPinned: true }).clients
    assert.equal(two[0].companyName, '나')
    assert.equal(two[1].companyName, '가')
    const sorted = sortClientsPinnedFirst([
      { id: 'a', companyName: '가', isPinned: false },
      { id: 'b', companyName: '나', isPinned: true },
    ])
    assert.deepEqual(sorted.map((item) => item.id), ['b', 'a'])
    const same = reorderClients(two, two[0].id, two[1].id)
    assert.equal(same[0].companyName, '나')
  })
})
