// Step 0-4 감사 보완 2차(5번): hydrate가 실패(status:'failed')하면 배너로 알리고
// retryHydrate()를 직접 부를 수 있게 한다. 이전에는 실패해도 UI에 신호가 전혀 없어서
// 사용자가 "동기화가 막혀 있다"는 사실 자체를 몰랐다 — 로컬 편집은 계속되지만 서버로는
// 영영 안 나갈 수 있었다. 재시도 중 로컬 편집을 보호하는 실제 방어는 cloudSync.js의
// hydrateFromSupabase가 dirtyJournal을 확인해 처리한다(여기서는 버튼과 상태 표시만).
import { useEffect, useState } from 'react'
import { getState, subscribe } from '../store/app-store.js'
import { retryHydrate } from '../lib/cloudSync.js'

const bannerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '10px 16px',
  background: '#fff3cd',
  color: '#664d03',
  fontSize: '13px',
  borderBottom: '1px solid #ffe69c',
}

const buttonStyle = {
  flexShrink: 0,
  padding: '6px 12px',
  borderRadius: '6px',
  border: '1px solid #664d03',
  background: 'transparent',
  color: '#664d03',
  fontSize: '13px',
  cursor: 'pointer',
}

export default function HydrationRetryBanner({ showToast }) {
  const [status, setStatus] = useState(() => getState().hydration.status)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => subscribe((state) => setStatus(state.hydration.status)), [])

  if (status !== 'failed') return null

  async function handleRetry() {
    setRetrying(true)
    try {
      await retryHydrate()
      showToast?.('클라우드 데이터를 다시 불러왔습니다.')
    } catch (error) {
      console.error('[HydrationRetryBanner] 재시도 실패', error)
      showToast?.('다시 시도했지만 아직 클라우드 데이터를 불러오지 못했습니다.')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div style={bannerStyle} role="alert">
      <span>클라우드 데이터를 불러오지 못했습니다. 로컬 데이터로 계속 쓸 수 있어요.</span>
      <button type="button" style={buttonStyle} onClick={handleRetry} disabled={retrying}>
        {retrying ? '재시도 중...' : '다시 시도'}
      </button>
    </div>
  )
}
