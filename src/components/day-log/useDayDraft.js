// @ts-check
// Step 6(일지 재작성): migration-plan.md 1.4 "일지 draft 계약"을 구현한다 — 화면
// 진입 시 store의 확정값을 복제해 로컬 draft로 들고(day-log-reducer.js의
// initDayLogState가 배열/객체를 얕은 복제하고, id 마이그레이션이 반영된 아래
// idMigration.record를 넘겨받는다), 편집은 디바운스 후에만 store/localStorage에
// 커밋한다("입력 → 즉시 화면 반영, 디바운스 후 localStorage"). 커밋 시점(commitNow)에는
// structuredClone으로 draft↔store 참조를 완전히 분리한다(얕은 복제만으로는
// payments/commissionSnapshot 같은 중첩 값이 참조를 공유했다). 언마운트 시 밀린
// 커밋을 flush한다. "빈 날 삭제"는 saveDayRecord(day-record.js)가 이미 하던 일(휴무
// 아님+횟수 0+파렛트 0+콜상세 0이면 그 날짜 키를 지운다)을 재사용한다.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { backfillCallDetailIds, saveDayRecord } from '../../domain/day-record.js'
import { saveLogWorkDataWithTombstoneCheck } from '../../lib/workData.js'
import { pendingOwnerForLog } from '../../lib/pendingLogOwner.js'
import { clearUnsafeRegistrationFailure, getUnsafeRegistrationPatch } from '../../lib/durableWriteGuard.js'
import { clearPendingDayWrite, getPendingDayWrite } from '../../lib/pendingWorkDataWrites.js'
import { commitMainDayLogToCloud } from '../../lib/dayLogCloudCommit.js'
import { shouldCommitDayLogToCloud } from '../../lib/mainDayLogRouting.js'
import { readOwnerLogWorkData } from '../../store/ownerDataHooks.js'
import { queueFailedDayWrite, settlePendingDayWrite, useMountedRef } from './dayDraftLifecycle.js'
import { dayLogReducer, initDayLogState } from './day-log-reducer.js'

const DEBOUNCE_MS = 600

/**
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {(() => void)} [onCommitted] 실제로 store에 커밋될 때마다 한 번(AppShell의
 *   알림 뱃지 재계산 트리거 — 예전 saveDay의 onWorkChanged?.()와 같은 역할). draft가
 *   바뀔 때마다가 아니라 디바운스가 끝나 실제로 쓰였을 때만 부른다.
 * @param {(message: string) => void} [showToast] 재감사(FAIL 지적 9번) — 자동 저장이
 *   실패(예: localStorage 용량 초과)하면 조용히 넘어가지 않고 이걸로 알린다.
 * @param {string} [logId] 차량번호. 생략/`main`이면 메인 일지.
 */
export function useDayDraft(ownerKey, dateKey, onCommitted, showToast, logId = 'main') {
  const pendingOwner = pendingOwnerForLog(ownerKey, logId)
  const [idMigration] = useState(() => {
    const stored = readOwnerLogWorkData(ownerKey, logId)[dateKey]
    // 슬라이스 D: 클라우드 경로(로그인 + 서버에 있는 메인 차량)에서는 서버 정본을
    // hydrate가 이미 Store에 넣었다 — 남아 있는 옛 durable/unsafe 키를 draft 초기값에
    // 겹치면 최신 서버 값을 덮는다. 게스트·서브·미동기화 메인은 예전처럼 overlay한다.
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

  // 커밋 함수·타이머·최신 draft를 ref로 들고 있어서, 아래 "마운트 시 한 번만"
  // unmount effect가 항상 최신 값을 참조하면서도 재실행되지는 않는다
  // (App.jsx의 navigateRef/homePathRef와 같은 패턴).
  const draftRef = useRef(state.draft)
  draftRef.current = state.draft
  const timerRef = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null))
  // 마운트 시 딱 한 번 오는 "초기값" 렌더에서는 디바운스를 걸지 않는다 — 그렇지
  // 않으면 화면을 열기만 해도(아무것도 안 건드려도) 600ms 뒤 store에 같은 값을
  // 다시 쓰는 불필요한 커밋(+예약된 클라우드 동기화)이 매번 일어난다.
  const isFirstDraftRef = useRef(true)
  // onCommitted도 navigateRef와 같은 이유로 ref에 담는다 — 매 렌더 새 함수를 넘겨도
  // (부모가 useCallback으로 안 감싸도) commitNow 자체가 다시 만들어지지 않는다.
  const onCommittedRef = useRef(onCommitted)
  onCommittedRef.current = onCommitted
  const showToastRef = useRef(showToast)
  showToastRef.current = showToast
  // 재감사(FAIL 지적 9번) — "아직 store에 성공적으로 반영되지 않은 편집이 있다"를
  // timerRef(타이머가 걸려 있는지)와 분리했다. commitNow는 시도를 시작하자마자
  // timerRef부터 비우므로(재입력 시 새 타이머를 걸 수 있어야 해서), quota 초과 등으로
  // 그 시도 자체가 실패하면 timerRef만 보는 언마운트 flush는 "밀린 게 없다"고 착각해
  // 실패한 편집을 조용히 버리게 된다. hasPendingRef는 성공적으로 커밋될 때만 false가
  // 되므로, 실패한 뒤 언마운트해도(화면 닫기/라우트 이동) 마지막으로 한 번 더
  // commitNow를 시도한다.
  const hasPendingRef = useRef(false)
  const draftRevRef = useRef(0)
  const mountedRef = useMountedRef()

  const markSaved = useCallback((/** @type {import('../../lib/pendingWorkDataWritesTypes.js').EffectivePatch} */ patch) => {
    hasPendingRef.current = false
    clearUnsafeRegistrationFailure(pendingOwner, dateKey)
    clearPendingDayWrite(pendingOwner, dateKey, patch)
    if (mountedRef.current) setAutoSaveStatus('saved')
    onCommittedRef.current?.()
  }, [pendingOwner, dateKey, mountedRef])

  // 게스트·서브·미동기화 메인: 예전 로컬 경로 그대로 — 로컬 persist + tombstone,
  // quota 실패면 durable 큐에 등록해 online·5초 재시도.
  const commitLocal = useCallback((/** @type {Record<string, import('../../domain/dayRecordTypes.js').DayRecordLike>} */ latest, /** @type {Record<string, import('../../domain/dayRecordTypes.js').DayRecordLike>} */ next, /** @type {import('../../lib/pendingWorkDataWritesTypes.js').EffectivePatch} */ patch) => {
    try {
      saveLogWorkDataWithTombstoneCheck(ownerKey, logId, dateKey, latest, next)
    } catch (error) {
      if (mountedRef.current) setAutoSaveStatus('failed')
      showToastRef.current?.('자동 저장에 실패했습니다. 저장 공간을 확인해 주세요.')
      console.error('일지 자동 저장 실패:', error)
      const attemptRev = draftRevRef.current
      queueFailedDayWrite(pendingOwner, dateKey, patch, (ok) => {
        settlePendingDayWrite(hasPendingRef, mountedRef, setAutoSaveStatus, onCommittedRef, draftRevRef, attemptRev, ok)
      })
      return
    }
    markSaved(patch)
  }, [ownerKey, dateKey, logId, pendingOwner, mountedRef, markSaved])

  const commitNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const draft = draftRef.current
    const latest = readOwnerLogWorkData(ownerKey, logId)
    const patch = structuredClone({
      isOff: draft.isOff,
      fixedCount: draft.fixedCount,
      palletCount: draft.palletCount,
      callDetails: draft.callDetails,
      fixedRouteCounts: draft.fixedRouteCounts,
    })
    const next = saveDayRecord(latest, dateKey, patch)

    // 슬라이스 D: 로그인 메인 일지는 그 날짜 daily_logs(+transport_details)에 직접 1회
    // 쓰고 성공 시에만 Store 반영(Fail-Fast). durable/fallback/tombstone/전체맵 재sync 없음.
    if (shouldCommitDayLogToCloud(ownerKey, logId)) {
      void commitMainDayLogToCloud({ ownerKey, logId, dateKey, previousData: latest, nextData: next }).then((result) => {
        if (!result.cloud) { commitLocal(latest, next, patch); return }
        if (result.ok) { markSaved(patch); return }
        if (mountedRef.current) setAutoSaveStatus('failed')
        if (result.toast) showToastRef.current?.(result.toast)
        // draft는 화면에 남는다. 재시도 큐 없음.
      })
      return
    }
    commitLocal(latest, next, patch)
  }, [ownerKey, dateKey, logId, commitLocal, markSaved, mountedRef])

  // draft가 바뀔 때마다 디바운스를 다시 건다 — 이전 타이머가 남아 있으면 취소하고
  // 새로 건다(연타 입력 중에는 계속 미뤄지다가, 입력이 멈춘 뒤에만 실제로 쓴다).
  //
  // 재감사(실제 렌더 테스트로 발견) — 이 cleanup은 "draft가 또 바뀌어서"뿐 아니라
  // 컴포넌트가 "진짜 언마운트될 때"도 똑같이 불린다(리액트가 모든 활성 effect의
  // cleanup을 언마운트 시에도 돈다). 여기서 timerRef.current를 null로 지워 버리면,
  // 바로 아래(언마운트 flush 전용) effect의 cleanup이 뒤이어 실행될 때 "밀린 타이머가
  // 있다"는 신호를 이미 잃어버려서 flush가 조용히 스킵됐다(실측: 뒤로가기 직후 store가
  // 이전 값에 머물러 있었다). clearTimeout만 하고 null로 지우지는 않는다 — 어차피
  // "draft가 또 바뀐" 정상 경로에서는 바로 다음 줄이 새 타이머로 덮어쓰고,
  // commitNow() 자신도 실행 시작할 때 null로 정리한다.
  useEffect(() => {
    if (isFirstDraftRef.current) {
      isFirstDraftRef.current = false
      return undefined
    }
    draftRevRef.current += 1
    setAutoSaveStatus('pending')
    hasPendingRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(commitNow, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftRef로 최신값을 읽으므로
    // state.draft 참조 자체가 아니라 "바뀌었다는 신호"만 필요하다.
  }, [state.draft, commitNow])

  // 재감사(FAIL 지적 3번) — id 없는 레거시 콜상세를 마운트 시 백필했다면(위 idMigration),
  // 그 결과를 실제로 store/localStorage에 원자적으로 반영한다. "마운트만 해도 store가
  // 바뀐다"는 draft가 실제로 편집된 것과 다르지 않게 다룬다 — hasPendingRef를 세워
  // 두면, 이 커밋이 (quota 등으로) 실패하더라도 언마운트 flush가 재시도한다.
  useEffect(() => {
    if (idMigration.changed) {
      hasPendingRef.current = true
      commitNow()
    }
    // idMigration은 useState 최초값이라 이 인스턴스 동안 참조가 안 바뀌고,
    // commitNow도(재감사 FAIL 지적 1번 수정으로 ownerKey/dateKey가 인스턴스 생애주기
    // 동안 안 바뀌니) 실질적으로 안 바뀐다 — 그래서 의존성 배열에 그대로 적어도
    // "마운트 시 한 번만" 실행된다는 실제 동작은 똑같다(억지로 빈 배열 + disable
    // 주석을 쓰는 대신, oxlint가 요구하는 진짜 의존성을 그대로 적었다).
  }, [idMigration.changed, commitNow])

  // 언마운트 시 밀린 변경을 flush한다 — 디바운스 타이머가 아직 안 끝났는데 화면을
  // 나가면(뒤로가기 등) 마지막 편집이 그대로 유실될 수 있다. hasPendingRef를 보는
  // 이유(timerRef가 아니라)는 위 hasPendingRef 선언부 주석 참고 — 마지막 시도가 실패로
  // 끝났어도(quota 등) 여기서 한 번 더 시도한다.
  useEffect(() => () => {
    if (hasPendingRef.current) commitNow()
  }, [commitNow])

  return { draft: state.draft, editingCallId: state.editingCallId, callFormOpen: state.callFormOpen, dispatch, commitNow, autoSaveStatus }
}
