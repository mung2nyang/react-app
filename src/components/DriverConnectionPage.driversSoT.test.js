import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: DriverConnectionPage } = await import('./DriverConnectionPage.jsx')
const { commitDrivers } = await import('../store/commitHelpers.js')

test('기사를 커밋하면 연동 목록이 리마운트 없이 갱신한다', async () => {
  const ownerKey = 'sot-drivers-page'
  commitDrivers(ownerKey, [], { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(DriverConnectionPage, {
        ownerKey,
        session: null,
        onBack: () => {},
      }))
    })
    assert.ok(container.textContent.includes('초대된 기사가 없습니다.'))

    await act(async () => {
      commitDrivers(ownerKey, [{
        id: 'drv-sot-1',
        name: '소트기사',
        phone: '010-0000-0000',
        inviteCode: 'ABC123',
        status: 'pending',
      }], { syncToCloud: false })
    })
    assert.ok(
      container.textContent.includes('소트기사'),
      'loadDrivers 스냅샷이면 리마운트 없이 목록이 안 바뀐다',
    )
    assert.equal(container.textContent.includes('초대된 기사가 없습니다.'), false)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
