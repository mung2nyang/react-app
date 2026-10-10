// @ts-check
// hydrate 실패를 배너로 알리고 다시 시도 버튼을 준다(편집 보호는 hydrate.js가 맡고, 여기는 표시만).
import { useEffect, useState } from 'react'
import { getState, subscribe } from '../store/app-store.js'
import { retryHydrate } from '../lib/hydrate.js'

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

/**
 * @param {Object} props
 * @param {(message: string) => void} [props.showToast]
 */
export default function HydrationRetryBanner({ showToast }) {
  const [status, setStatus] = useState(() => getState().hydration.status)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => subscribe((state) => setStatus(state.hydration.status)), [])

  if (status !== 'failed') return null

  async function handleRetry() {
    setRetrying(true)
    try {
      await retryHydrate()
      showToast?.('기록을 다시 불러왔습니다.')
    } catch (error) {
      console.error('[HydrationRetryBanner] 재시도 실패', error)
      showToast?.('다시 시도했지만 아직 불러오지 못했습니다.')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div style={bannerStyle} role="alert">
      <span>서버에서 기록을 불러오지 못했습니다. 이 휴대폰에 있는 기록으로 계속 쓸 수 있습니다.</span>
      <button type="button" style={buttonStyle} onClick={handleRetry} disabled={retrying}>
        {retrying ? '다시 시도하는 중…' : '다시 시도'}
      </button>
    </div>
  )
}
