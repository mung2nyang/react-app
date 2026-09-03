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
const { commitCars } = await import('../store/commitHelpers.js')

test('차량을 커밋하면 기사 초대 모달이 리마운트 없이 할당 목록을 갱신한다', async () => {
  const ownerKey = 'sot-cars-drivers'
  commitCars(ownerKey, [], { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(DriverConnectionPage, {
        ownerKey,
        session: { userId: 'sot-cars-drivers-owner', guestMode: false },
        onBack: () => {},
      }))
    })

    const addBtn = [...container.querySelectorAll('button')].find((el) => el.textContent.includes('+ 초대'))
    assert.ok(addBtn, '초대 버튼이 있어야 한다')
    await act(async () => { addBtn.click() })

    assert.equal(container.querySelector('option[value="88나8800"]'), null)

    await act(async () => {
      commitCars(ownerKey, [{
        id: 'sub-sot-1',
        type: 'sub',
        number: '88나8800',
      }], { syncToCloud: false })
    })
    assert.ok(
      container.querySelector('option[value="88나8800"]'),
      'loadCars 스냅샷이면 리마운트 없이 할당 차량이 안 바뀐다',
    )
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
