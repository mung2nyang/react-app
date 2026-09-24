// 이관 마무리 ② 검증 — 세무정보 6칸을 전부 채운 거래처 카드에만 "정보 작성 완료" 배지가 보인다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: ClientListItem } = await import('./ClientListItem.jsx')

const fullClient = {
  id: 'c-1',
  companyName: '한빛물류',
  bizNumber: '123-45-67890',
  taxRepresentative: '김대표',
  taxAddress: '서울시 강서구 1',
  taxBizType: '운수업',
  taxBizItem: '화물운송',
  taxEmail: 'tax@hanbit.kr',
  fixedRouteLinked: true,
}

/** @param {object} client */
async function renderBadgeTexts(client) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(ClientListItem, {
        client,
        dragging: false,
        onDragStart: () => {},
        onDragOver: () => {},
        onDrop: () => {},
        onDragEnd: () => {},
        onEdit: () => {},
        onDelete: () => {},
      }))
    })
    return [...container.querySelectorAll('.client-card-title .management-badge')].map((el) => el.textContent)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
}

test('세무정보 6칸을 전부 채우면 "정보 작성 완료" 배지가 보인다(기존 고정노선 배지도 유지)', async () => {
  const badges = await renderBadgeTexts(fullClient)
  assert.ok(badges.includes('정보 작성 완료'))
  assert.ok(badges.includes('고정노선 연동'))
})

test('6칸 중 하나라도 비었거나 공백뿐이면 배지가 없다', async () => {
  for (const key of ['bizNumber', 'taxRepresentative', 'taxAddress', 'taxBizType', 'taxBizItem', 'taxEmail']) {
    for (const empty of [undefined, '', '   ']) {
      const badges = await renderBadgeTexts({ ...fullClient, [key]: empty })
      assert.ok(!badges.includes('정보 작성 완료'), `${key}=${JSON.stringify(empty)}인데 배지가 보인다`)
    }
  }
})
