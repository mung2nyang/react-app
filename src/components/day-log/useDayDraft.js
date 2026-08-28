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
import { saveWorkDataWithTombstoneCheck } from '../../lib/workData.js'
import { clearUnsafeRegistrationFailure, markUnsafeRegistrationFailure } from '../../lib/durableWriteGuard.js'
import { clearPendingDayWrite, getPendingDayWrite, registerPendingDayWrite } from '../../lib/pendingWorkDataWrites.js'
import { readOwnerWorkData } from '../../store/ownerDataHooks.js'
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
 */
export function useDayDraft(ownerKey, dateKey, onCommitted, showToast) {
  // 재감사(FAIL 지적 3번) — id 없는 레거시 콜상세를 "마운트 시 정확히 한 번" 영구
  // id로 채운다. useState(() => ...)로 감싸 컴포넌트 생애주기당 정확히 한 번만
  // 계산한다(MainPageRoute.jsx가 이제 dateKey로 key를 주므로, 날짜가 바뀌면 이
  // 컴포넌트 자체가 새로 마운트되고 여기도 다시 한 번만 돈다 — 재감사 FAIL 지적
  // 1번 수정과 맞물린다). initDayLogState는 이 값을 그대로 옮기기만 하고 스스로
  // id를 만들지 않는다 — 아래 mount effect가 changed일 때만 실제로 store/localStorage에
  // 원자적으로 반영한다(초안만 바뀌고 store는 안 바뀌는 반쪽 상태를 만들지 않는다).
  // 재감사 3차(FAIL 지적 2번) — 이 owner/date로 아직 서버는커녕 store에도 못 들어간
  // durable pending patch가 있으면(quota 실패로 큐에 남은 이전 인스턴스의 편집) store
  // 값 위에 덮어씌운다. 이걸 안 하면: 실패한 편집이 큐에 남은 채로 화면을 나갔다
  // 다시 들어와서 다른 필드를 편집해 성공 커밋하면, 그 성공 커밋이 여전히 store의
  // 오래된 값 기준이라 큐에 있던(더 먼저 실패한) 편집이 통째로 사라진다 — 필드
  // 단위로 얕게 덮어써서(patchDraft와 같은 규칙) 이후 draft 편집이 이 위에 자연스럽게
  // 쌓인다(따로 리비전 번호를 둘 필요가 없다).
  const [idMigration] = useState(() => {
    const stored = readOwnerWorkData(ownerKey)[dateKey]
    const pending = getPendingDayWrite(ownerKey, dateKey)
    return backfillCallDetailIds(pending ? { ...stored, ...pending } : stored)
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

  const commitNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const draft = draftRef.current
    const latest = readOwnerWorkData(ownerKey)
    // structuredClone: draft와 store가 커밋 이후에도 같은 배열/객체 참조를 공유하지
    // 않게 한다(재감사 FAIL 지적 8번) — draft.callDetails의 각 item(payments 배열,
    // commissionSnapshot 객체 포함)을 얕게만 복제했었는데, 그러면 "커밋된 뒤에도
    // draft를 계속 들고 있다가 어딘가에서 항목을 제자리 수정(in-place mutate)하면"
    // 이미 store에 반영된 값까지 같이 바뀌는 참조 공유 버그가 이론상 가능했다.
    // saveDayRecord에 넘기기 직전에 깊은 복제를 해서 store 쪽 사본을 draft와 완전히
    // 분리한다.
    const patch = structuredClone({
      isOff: draft.isOff,
      fixedCount: draft.fixedCount,
      palletCount: draft.palletCount,
      callDetails: draft.callDetails,
      fixedRouteCounts: draft.fixedRouteCounts,
    })
    const next = saveDayRecord(latest, dateKey, patch)
    try {
      // 재감사 3차(FAIL 지적 1번) — 빈 날 삭제가 실제로 일어났으면(latest에는
      // dateKey가 있었는데 next에는 없으면) workData 커밋과 같은 원자적 트랜잭션에
      // tombstone 기록도 함께 실어 보낸다 — lib/workData.js 참고.
      saveWorkDataWithTombstoneCheck(ownerKey, dateKey, latest, next)
    } catch (error) {
      // writeAllOrNothing(atomicPersist.js)이 이미 store/localStorage를 실패 전
      // 상태로 롤백했다 — commitBatch의 notify()/scheduleCloudSync()도 이 throw보다
      // 뒤에 있어서 여기 도달 자체가 "store 불변 + notify 0회 + 클라우드 예약 0회"를
      // 보장한다. UI에는 거짓 "저장됨" 대신 실패를 알리고, hasPendingRef는 그대로
      // true로 남겨 마지막 편집이 유실되지 않았다는 걸 나타낸다.
      setAutoSaveStatus('failed')
      showToastRef.current?.('자동 저장에 실패했습니다. 저장 공간을 확인해 주세요.')
      console.error('일지 자동 저장 실패:', error)
      // 재감사 2차(FAIL 지적) — quota가 계속 꽉 차 있는 상태(persistent)에서 화면을
      // 나가면(언마운트) 아래 unmount effect의 마지막 재시도조차 실패할 수 있고,
      // 그러면 draftRef는 컴포넌트와 함께 사라져 이 편집을 복구할 방법이 없어진다.
      // 이 patch를 컴포넌트 생애주기와 무관한 전역 큐에 등록해 둔다 — online 이벤트나
      // 5초 주기 타이머(app/pendingWriteRetryListeners.js)가 나중에(공간이 확보되면)
      // 계속 재시도한다. 성공하면 onCommitted도 그때 가서 불러 준다.
      const registered = registerPendingDayWrite(ownerKey, dateKey, patch, (ok) => { if (ok) onCommittedRef.current?.() })
      // 재감사 10차(FAIL 지적 2번) — registerPendingDayWrite가 dateKey/patch 계약
      // 위반으로 거부하면(정상 동작에서는 안 일어나지만 반환값을 무시하면 안 된다)
      // 이 편집은 durable에도 fallback에도 전혀 안 남는다 — durableWriteGuard 전용
      // 메모리에 최신 draft를 남겨 beforeunload/전역 이동 방어가 계속 살아있게 한다
      // (성공으로 처리하지 않고, 그렇다고 조용히 잃어버리지도 않는다).
      if (!registered) markUnsafeRegistrationFailure(ownerKey, dateKey, patch)
      return
    }
    hasPendingRef.current = false
    clearUnsafeRegistrationFailure(ownerKey, dateKey)
    // 방금 성공했으니, 혹시 이전 실패로 큐에 남아 있던 이 날짜의 오래된 patch가
    // 있다면 지운다 — 재감사 5차(FAIL 지적 1번, P0): 방금 커밋한 patch를 반드시
    // 같이 넘긴다. durable에서 못 지우면(정리 자체가 실패하면) clearPendingDayWrite가
    // 이 patch를 authoritative fallback으로 남겨서, 다음 재시도가 오래된 stale
    // durable 값이 아니라 지금 막 store에 반영된 이 값을 계속 본다 — patch 없이
    // owner/date만 넘기면 store엔 이미 새 값이 있는데 큐만 오래된 값으로 되돌아갈
    // 수 있었다(실측 확인).
    clearPendingDayWrite(ownerKey, dateKey, patch)
    setAutoSaveStatus('saved')
    onCommittedRef.current?.()
  }, [ownerKey, dateKey])

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
