// @ts-check
import { useEffect, useState } from 'react'
import { fetchOwnerScopedClientsForDriver } from '../../lib/fetchOwnerScopedClientsForDriver.js'

/** @typedef {import('../../lib/fetchOwnerScopedClientsForDriver.js').OwnerScopedClient} OwnerScopedClient */

/**
 * 소속기사용 "거래처" 화면 (읽기 전용).
 * 차주가 이 차량 전용으로 등록한 거래처를 조회한다.
 *
 * @param {Object} props
 * @param {() => void} [props.onBack]
 */
export default function OwnerScopedClientsView({ onBack }) {
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState(/** @type {Array<OwnerScopedClient>} */ ([]))

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchOwnerScopedClientsForDriver()
      .then((fetched) => {
        if (!active) return
        const seenNames = new Set()
        const deduped = (fetched || []).filter((c) => {
          const key = (c.companyName || '').trim()
          if (!key || seenNames.has(key)) return false
          seenNames.add(key)
          return true
        })
        setClients(deduped)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="page client-management-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">거래처</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="client-list" id="ownerScopedClientsListContainer">
        <p className="linked-driver-readonly-notice" style={{ marginBottom: 10 }}>
          <span>차주가 이 차량 전용으로 등록한 거래처입니다. 조회만 가능합니다.</span>
        </p>
        {loading ? (
          <div className="empty-state">불러오는 중...</div>
        ) : !clients.length ? (
          <div className="empty-state">등록된 거래처가 없습니다.</div>
        ) : (
          clients.map((c) => (
            <div key={c.companyName} className="management-list-card client-list-card client-readonly-card">
              <div className="management-card-inner">
                <div className="client-card-copy">
                  <div className="client-card-title">
                    <strong>{c.companyName}</strong>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
