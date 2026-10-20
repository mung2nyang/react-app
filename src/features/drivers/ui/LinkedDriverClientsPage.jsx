// @ts-check
// 차주가 보는 연동·미연동 기사 차량 거래처 화면 — 주소의 기사·차량으로 어느 차량 거래처인지 찾는다.
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getShortCarNum } from '../../../domain/cars.js'
import { resolveDriverManagementContext } from '../../../domain/driverManagementContext.js'
import { useOwnerCars, useOwnerDrivers } from '../../../data/store/ownerDataHooks.js'
import { toLinkedDriverLink } from './linkedDriverLink.js'
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import ScopedClientsList from '../../clients/ui/ScopedClientsList.jsx'
import '../../clients/ui/client-management.css'
import './linked-driver.css'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function LinkedDriverClientsPage({ ownerKey = 'guest', onBack, onOpenMenu }) {
  const navigate = useNavigate()
  const { linkId: rawLinkId, logId: rawLogId } = useParams()
  const linkId = decodeURIComponent(rawLinkId || '')
  const logId = decodeURIComponent(rawLogId || '')
  const drivers = useOwnerDrivers(ownerKey)
  const cars = useOwnerCars(ownerKey)

  const ctx = useMemo(
    () => resolveDriverManagementContext({ linkId, logId }, drivers, cars),
    [linkId, logId, drivers, cars],
  )
  const link = ctx.driver ? toLinkedDriverLink(ctx.driver) : null
  const unlinked = ctx.mode === 'unlinked'
  const scopeKey = (unlinked ? ctx.plate : (ctx.car?.number || '')) || ''

  function handleBack() {
    if (onBack) onBack()
    else navigate(-1)
  }

  const title = unlinked
    ? (ctx.plate ? `${ctx.car?.driverName || getShortCarNum(ctx.plate)} 거래처` : '거래처')
    : `${link?.driverName || '기사'} 기사 거래처`

  if (ctx.notFound) {
    return (
      <div className="page client-management-page">
        <PageHeader title={unlinked ? title : '기사 거래처'} onBack={handleBack} onOpenMenu={onOpenMenu} />
        <div className="linked-driver-empty">
          {unlinked ? '차량 정보를 찾을 수 없습니다.' : '연동된 기사 정보를 찾을 수 없습니다.'}
        </div>
      </div>
    )
  }

  return (
    <div className="page client-management-page">
      <PageHeader title={title} onBack={handleBack} onOpenMenu={onOpenMenu} />
      <ScopedClientsList ownerKey={ownerKey} scopeKey={scopeKey} listId="linkedDriverClientsListContainer" />
    </div>
  )
}
