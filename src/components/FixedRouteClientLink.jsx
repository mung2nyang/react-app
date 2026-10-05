// @ts-check
// 앱 설정 고정 노선 카드의 "거래처 연결" 줄 — 연결 요약 + "+ 추가"/"수정" 버튼, 입력·저장은 FixedRouteClientModal 팝업.
import { useState } from 'react'
import FixedRouteClientModal from './FixedRouteClientModal.jsx'
import { fixedRouteCandidates } from '../domain/clientDraft.js'
import { getFixedRouteClient } from '../domain/clients.js'
import { formatCurrencyInput } from '../lib/money.js'
import { useOwnerClients } from '../store/ownerDataHooks.js'

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {string} props.scopeKey 거래처 스코프(차주 메인 = '', 서브차량·연동기사 = 차량번호)
 * @param {(message: string) => void} [props.showToast]
 */
export default function FixedRouteClientLink({ ownerKey, scopeKey, showToast }) {
  const clients = useOwnerClients(ownerKey)
  const candidates = fixedRouteCandidates(clients, scopeKey)
  const linked = candidates.find((client) => client.fixedRouteLinked) || null
  const fallback = scopeKey && !linked ? getFixedRouteClient({ clients }, '') : null
  const [open, setOpen] = useState(false)

  const detail = linked
    ? [`1회 ${formatCurrencyInput(linked.fixedUnitPrice ?? '') || 0}원`, linked.palletOn ? `파렛트 ${formatCurrencyInput(linked.palletPrice ?? '') || 0}원` : '']
      .filter(Boolean).join(' · ')
    : ''

  return (
    <div className="setting-item fixed-route-client-setting">
      {/* 왼쪽: 제목·설명·연결 상태, 오른쪽: 버튼(왼쪽 묶음 세로 가운데) */}
      <div className="fixed-route-client-head">
        <div className="fixed-route-client-left">
          <div className="run-count-preset-copy">
            <label>거래처 연결</label>
            <p>고정 노선 운행분을 정산할 거래처와 단가를 정합니다.</p>
          </div>
          {!candidates.length ? (
            <p className="fixed-route-client-hint">먼저 거래처를 등록해 주세요.</p>
          ) : (
            <div className="fixed-route-client-summary-copy">
              {linked ? (
                <>
                  <strong>{linked.companyName}</strong>
                  <span>{detail}</span>
                </>
              ) : (
                <span>{fallback ? `연결하지 않으면 차주 메인 연결 거래처(${fallback.companyName})를 씁니다.` : '연결된 거래처가 없습니다.'}</span>
              )}
            </div>
          )}
        </div>
        {candidates.length > 0 && (
          <button type="button" className="fixed-route-client-open" onClick={() => setOpen(true)}>{linked ? '수정' : '+ 추가'}</button>
        )}
      </div>
      {open && (
        <FixedRouteClientModal
          ownerKey={ownerKey}
          clients={clients}
          candidates={candidates}
          linked={linked}
          onClose={() => setOpen(false)}
          showToast={showToast}
        />
      )}
    </div>
  )
}
