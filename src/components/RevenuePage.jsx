// @ts-check
// 계정 유형에 따라 OwnerRevenueView/DriverRevenueView 중 하나를 고르는 오케스트레이션.
// PageShell은 PageHeader로 흡수해 이 파일이 직접 렌더링한다.
import OwnerRevenueView from './revenue/OwnerRevenueView.jsx'
import DriverRevenueView from './revenue/DriverRevenueView.jsx'
import PageHeader from './PageHeader.jsx'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {{ accountType?: string }} [props.session]
 * @param {() => void} props.onBack
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function RevenuePage({ ownerKey = 'guest', session, onBack, onOpenMenu }) {
  const isDriver = session?.accountType === 'employed_driver'

  return (
    <div className="page revenue-page">
      <PageHeader title="매출" onBack={onBack} onOpenMenu={onOpenMenu} />
      {isDriver
        ? <DriverRevenueView ownerKey={ownerKey} />
        : <OwnerRevenueView ownerKey={ownerKey} />}
    </div>
  )
}
