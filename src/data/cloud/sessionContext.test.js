// 로드맵 59-I2 — ownerKey·session은 공급자에서 꺼내 쓴다. 공급자 밖은 비회원(guest).
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { SessionProvider, useSession } = await import('./sessionContext.ts')

/** @param {(value: ReturnType<typeof useSession>) => void} seen */
function Probe({ seen }) {
  seen(useSession())
  return null
}

/** @param {import('react').ReactNode} element */
async function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  await act(async () => { root.unmount() })
  container.remove()
}

test('공급자 밖에선 비회원(session 없음, ownerKey guest)', async () => {
  /** @type {Array<ReturnType<typeof useSession>>} */
  const values = []
  await render(React.createElement(Probe, { seen: (v) => values.push(v) }))
  assert.deepEqual(values.at(-1), { session: null, ownerKey: 'guest' })
})

test('공급자 안에선 넘긴 값', async () => {
  const session = { userId: 'u1', name: '차주', phone: '', accountType: 'owner_driver', linkedOwnerId: null, guestMode: false }
  /** @type {Array<ReturnType<typeof useSession>>} */
  const values = []
  await render(React.createElement(SessionProvider, { value: { session, ownerKey: 'u1' } }, React.createElement(Probe, { seen: (v) => values.push(v) })))
  assert.deepEqual(values.at(-1), { session, ownerKey: 'u1' })
})
