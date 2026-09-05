// @ts-check
import { useEffect, useState } from 'react'
import { fetchDriverOwnClients } from '../../lib/fetchDriverOwnClients.js'

/** @typedef {import('../../domain/clientTypes.js').ClientLike} ClientLike */

/**
 * 기사 직접 정산 모드: 차주 조회 전용 거래처 목록.
 * @param {Object} props
 * @param {number|string|null|undefined} [props.supabaseLinkId]
 */
export default function LinkedDriverDirectClientsList({ supabaseLinkId }) {
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState(/** @type {Array<ClientLike>} */ ([]))

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchDriverOwnClients(supabaseLinkId)
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
  }, [supabaseLinkId])

  return (
    <div className="client-list" id="linkedDriverClientsListContainer">
      <p className="linked-driver-readonly-notice" style={{ marginBottom: 10 }}>
        <span>기사 직접 정산 모드에서는 거래처를 기사 본인이 관리하며, 차주는 조회만 할 수 있습니다.</span>
      </p>
      {loading ? (
        <div className="empty-state">불러오는 중...</div>
      ) : !clients.length ? (
        <div className="empty-state">기사가 등록한 거래처가 없습니다.</div>
      ) : (
        clients.map((c) => (
          <div key={c.id || c.companyName} className="management-list-card client-list-card client-readonly-card">
            <div className="management-card-inner">
              <div className="client-card-copy">
                <div className="client-card-title">
                  <strong>{c.companyName}</strong>
                  {c.managerName && <span>{c.managerName} 담당</span>}
                </div>
                <div className="car-sub-text">
                  <span>사업자 {c.bizNumber || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
