// @ts-check
// 기사 개인정보 화면의 "소속 연결" 카드(로드맵 7-C-2) — 해제 요청·취소·동의. 해제가 확정되면 내 계정으로 다시 불러온 뒤 화면을 바꾼다(초대코드 연동의 반대 방향).
import { useState } from 'react'
import { buildCloudAppSession, ownerKeyFromSession } from '../../app/boot.js'
import { requestDriverUnlinkAction } from '../../lib/driverUnlink.js'
import { hydrateFromSupabase } from '../../lib/hydrate.js'
import { useOwnerDrivers, useOwnerProfile } from '../../store/ownerDataHooks.js'
import DriverUnlinkControls from './DriverUnlinkControls.jsx'
import './driver-connection.css'

/** @typedef {import('../../lib/outboxTypes.js').AppSession} AppSession */

const HYDRATE_FAIL_TOAST = '연동은 해제됐지만 내 계정 데이터를 일부 못 불러왔습니다.'

/**
 * @param {{
 *   ownerKey: string,
 *   session: AppSession|null|undefined,
 *   showToast?: (message: string) => void,
 *   onUnlinked?: (session: AppSession) => void,
 * }} props
 */
export default function EmployerLinkCard({ ownerKey, session, showToast, onUnlinked }) {
  const drivers = useOwnerDrivers(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const [busy, setBusy] = useState(false)
  const link = drivers.find((driver) => driver.status === 'linked')
  const meId = session?.userId || ''

  /** @param {import('../../lib/driverUnlink.js').UnlinkAction} action */
  async function run(action) {
    if (busy || !link || !meId) return
    setBusy(true)
    const result = await requestDriverUnlinkAction({ ownerKey, drivers, driverId: link.id, action })
    const disconnected = !result.failed && !result.drivers.some((driver) => driver.id === link.id)
    if (!disconnected) {
      setBusy(false)
      showToast?.(result.toast)
      return
    }
    const next = await buildCloudAppSession(meId, { name: session?.name, phone: session?.phone })
    let toast = result.toast
    try {
      await hydrateFromSupabase(meId, ownerKeyFromSession(next), { employedDriver: !!next.linkedOwnerId })
    } catch (error) {
      console.error('[EmployerLinkCard] 해제 후 내 계정 불러오기 실패:', error)
      toast = HYDRATE_FAIL_TOAST
    }
    setBusy(false)
    showToast?.(toast)
    onUnlinked?.(next)
  }

  return (
    <section className="setting-section personal-card employer-link-card">
      <div className="personal-card-heading">
        <span className="personal-card-icon">04</span>
        <div><h3>소속 연결</h3><p>연동된 차주와의 연결 관리</p></div>
      </div>
      {link ? (
        <>
          <p className="car-sub-text">연동 중 · {profile.bizName || '연동된 운송사'} · 배정 차량 {link.vehicleNumber || '-'}</p>
          <div className="driver-card-actions">
            <DriverUnlinkControls driver={link} meId={meId} counterpartLabel="차주" onAction={(action) => { void run(action) }} />
          </div>
        </>
      ) : (
        <p className="car-sub-text">연동 정보를 불러오는 중입니다.</p>
      )}
    </section>
  )
}
