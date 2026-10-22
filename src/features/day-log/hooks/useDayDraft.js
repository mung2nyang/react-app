// @ts-check
// 일지 임시 편집 — Store 값을 복제해 들고, 고치면 0.6초 뒤 저장 담당(dayDraftLifecycle.js)이 저장한다. 닫을 때 남은 것을 저장한다.
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { backfillCallDetailIds } from '../../../domain/day-record.ts'
import { pendingOwnerForLog } from '../../../data/sync/pendingLogOwner.ts'
import { getUnsafeRegistrationPatch } from '../../../data/sync/durableWriteGuard.ts'
import { getPendingDayWrite } from '../../../data/sync/pendingWorkDataWrites.ts'
import { shouldCommitDayLogToCloud } from '../../../data/sync/mainDayLogRouting.ts'
import { readOwnerLogWorkData } from '../../../data/store/ownerDataHooks.ts'
import { createDayDraftSaver } from './dayDraftLifecycle.js'
import { dayLogReducer, initDayLogState } from './day-log-reducer.js'
import { useToast } from '../../../shared/hooks/useToast.js'

/**
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {string} [logId] 차량번호. 생략/`main`이면 메인 일지.
 */
export function useDayDraft(ownerKey, dateKey, logId = 'main') {
  const showToast = useToast()
  const [idMigration] = useState(() => {
    const stored = readOwnerLogWorkData(ownerKey, logId)[dateKey]
    // 서버 갈래는 hydrate가 넣은 서버 값이 정본이라 남은 대기 저장을 겹치지 않는다. 그 밖은 겹친다.
    const pendingOwner = pendingOwnerForLog(ownerKey, logId)
    const queued = shouldCommitDayLogToCloud(ownerKey, logId)
      ? null
      : (getPendingDayWrite(pendingOwner, dateKey) || getUnsafeRegistrationPatch(pendingOwner, dateKey))
    return backfillCallDetailIds(queued ? { ...stored, ...queued } : stored)
  })
  const [state, dispatch] = useReducer(
    dayLogReducer,
    undefined,
    () => initDayLogState(idMigration.record),
  )
  const [autoSaveStatus, setAutoSaveStatus] = useState(/** @type {'idle'|'pending'|'saved'|'failed'} */ ('idle'))

  // 처음 draft 그대로면 저장하지 않는다 — 열기만 해도 같은 값을 다시 쓰지 않게(참조 비교라 StrictMode에도 같다).
  const initialDraftRef = useRef(state.draft)
  const [saver] = useState(() => createDayDraftSaver({ ownerKey, logId, dateKey, draft: state.draft, setAutoSaveStatus }))

  // 화면에 그린 직후 최신 draft를 넘긴다 — 타이머·닫기·숨김 저장이 늘 이 값을 쓴다.
  useLayoutEffect(() => saver.setDraft(state.draft), [saver, state.draft])
  // 아래 효과보다 먼저 둔다 — 닫힘 표시가 닫을 때 저장보다 먼저 내려가야 닫힌 화면의 상태를 안 바꾼다.
  useEffect(() => saver.mount(), [saver])
  useEffect(() => saver.setToast(showToast), [saver, showToast])

  useEffect(() => {
    if (state.draft === initialDraftRef.current) return undefined
    saver.edited()
    return () => saver.cancelTimer()
  }, [state.draft, saver])

  useEffect(() => {
    if (idMigration.changed) saver.migrated()
  }, [idMigration.changed, saver])

  useEffect(() => () => saver.close(), [saver])

  // 새로고침·앱 닫기 확인과 숨김 때 바로 저장(data/sync/dayDraftActivity.ts). 위 저장 뒤에 내려야 저장 중이 남는다.
  useEffect(() => saver.track(), [saver])

  return { draft: state.draft, editingCallId: state.editingCallId, callFormOpen: state.callFormOpen, dispatch, commitNow: saver.commitNow, autoSaveStatus }
}
