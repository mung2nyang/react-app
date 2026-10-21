// @ts-check
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import ScopedClientsList from './ScopedClientsList.jsx'
import { useOwnerCars } from '../../../data/store/ownerDataHooks.js'
import { useSession } from '../../../data/cloud/sessionContext.js'

/**
 * 연동 기사 앱의 거래처 화면 — 내 차량(첫 차량) 거래처만.
 *
 * @param {Object} props
 * @param {() => void} [props.onBack]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function OwnerScopedClientsView({ onBack, onOpenMenu }) {
  const { ownerKey } = useSession()
  const cars = useOwnerCars(ownerKey)
  const scopeKey = cars[0]?.number || ''

  return (
    <div className="page client-management-page">
      <PageHeader title="거래처" onBack={onBack} onOpenMenu={onOpenMenu} />
      <ScopedClientsList
        scopeKey={scopeKey}
        listId="ownerScopedClientsListContainer"
        notice={(
          <p className="linked-driver-readonly-notice" style={{ marginBottom: 10 }}>
            <span>차주와 공유하는 거래처 목록입니다. 등록, 수정, 삭제가 차주 화면에도 함께 반영됩니다.</span>
          </p>
        )}
      />
    </div>
  )
}
