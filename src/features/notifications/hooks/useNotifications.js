// @ts-check
// 알림 숫자·알림 목록 — 알림에 쓰는 Store 값을 구독해 바뀌면 다시 센다. refreshKey는 시간이 지나 생기는 알림용(화면 주소).
import { useMemo, useSyncExternalStore } from 'react'
import { collectNotifications } from '../api/notifications.js'
import { buildInquiryNoticeItems } from '../api/inquiryNoticeItems.ts'
import useInquiryNotices from './useInquiryNotices.ts'
import { getState, subscribe } from '../../../data/store/app-store.ts'
import { failedDayLogDatesVersion, subscribeFailedDayLogDates } from '../../../data/sync/failedDayLogDates.ts'
import {
  useOwnerClients,
  useOwnerDrivers,
  useOwnerProfile,
  useOwnerSettings,
  useOwnerWorkDataByLogId,
} from '../../../data/store/ownerDataHooks.ts'

/**
 * @param {string} ownerKey
 * @param {import('../../../data/sync/syncTypes.ts').AppSession|null} [session]
 * @param {string} [refreshKey]
 */
export default function useNotifications(ownerKey, session = null, refreshKey = '') {
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const settings = useOwnerSettings(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const clients = useOwnerClients(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const dismissed = useSyncExternalStore(subscribe, () => getState().dismissedNotifications[ownerKey])
  // 일지 저장 실패 날짜(휴대폰, Store 밖)가 바뀌면 다시 센다.
  const failedVersion = useSyncExternalStore(subscribeFailedDayLogDates, failedDayLogDatesVersion)
  // 문의 알림(로드맵 23-C)은 서버에서 물어 와 목록 맨 뒤에 붙인다.
  const inquiry = useInquiryNotices(refreshKey)
  return useMemo(
    () => [
      ...collectNotifications(ownerKey, session),
      ...buildInquiryNoticeItems(inquiry, dismissed || [], settings.notifOff || []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 구독한 값이 바뀌면 다시 센다(계산은 Store에서 직접 읽음)
    [ownerKey, session, refreshKey, workDataByLogId, settings, drivers, clients, profile, dismissed, inquiry, failedVersion],
  )
}
