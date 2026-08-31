import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter } = await import('react-router-dom')
const { act } = React
const { default: CarListPage } = await import('./CarListPage.jsx')
const { commitCars } = await import('../../store/commitHelpers.js')

test('같은 차량 id가 두 번 커밋돼도 목록 key 경고가 나지 않는다', async () => {
  const ownerKey = 'sot-cars-dup-key'
  const id = 'car_1788141346245_c60pq4'
  const dup = { id, type: 'main', number: '11가1111' }
  commitCars(ownerKey, [dup, { ...dup }], { syncToCloud: false })

  const errors = []
  const original = console.error
  console.error = (...args) => {
    errors.push(args.map(String).join(' '))
    original.apply(console, args)
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(MemoryRouter, null, React.createElement(CarListPage, {
        ownerKey,
        onBack: () => {},
      })))
    })
    assert.equal(container.querySelectorAll('.management-list-card').length, 1)
    assert.equal(
      errors.some((line) => line.includes('same key') && line.includes(id)),
      false,
      `React key 경고가 나면 안 된다: ${errors.join('\n')}`,
    )
  } finally {
    console.error = original
    await act(async () => { root.unmount() })
    container.remove()
  }
})
