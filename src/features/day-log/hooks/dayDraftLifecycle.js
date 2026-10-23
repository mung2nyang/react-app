// @ts-check
// 일지 한 날짜의 저장 담당 — 타이머·저장 대기·판 번호·서버 저장 중을 한곳에 두고 기기/서버 저장과 결과 처리를 한다.
import { saveDayRecord } from '../../../domain/day-record.ts'
import { pendingOwnerForLog } from '../../../data/sync/pendingLogOwner.ts'
import { clearUnsafeRegistrationFailure, markUnsafeRegistrationFailure } from '../../../data/sync/durableWriteGuard.ts'
import { clearPendingDayWrite, registerPendingDayWrite } from '../../../data/sync/pendingWorkDataWrites.ts'
import { saveLogWorkDataWithTombstoneCheck } from '../../../data/sync/workDataSave.ts'
import { commitMainDayLogToCloud } from '../../../data/sync/dayLogCloudCommit.ts'
import { shouldCommitDayLogToCloud } from '../../../data/sync/mainDayLogRouting.ts'
import { readOwnerLogWorkData } from '../../../data/store/ownerDataHooks.ts'
import { pruneDayDraft, registerDayDraft, releaseDayDraft } from '../../../data/sync/dayDraftActivity.ts'
import { DEVICE_SAVE_FAIL, SERVER_SAVE_FAIL } from '../../../shared/utils/failureMessages.js'

/** @typedef {import('../../../data/sync/pendingWorkDataWritesTypes.ts').EffectivePatch} EffectivePatch */
/** @typedef {Record<string, import('../../../domain/dayRecordTypes.ts').DayRecordLike>} WorkMap */
/** @typedef {import('./day-log-reducer.js').DayDraft} DayDraft */
/** @typedef {'idle'|'pending'|'saved'|'failed'} AutoSaveState */
/** @typedef {(status: AutoSaveState) => void} SetAutoSaveState */
/** @typedef {{ hasPending: boolean, draftRev: number, mounted: boolean }} SaveProgress */

const DEBOUNCE_MS = 600

/**
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {EffectivePatch} patch
 * @param {(ok: boolean) => void} onSettled
 */
function queueFailedDayWrite(ownerKey, dateKey, patch, onSettled) {
  const registered = registerPendingDayWrite(ownerKey, dateKey, patch, onSettled)
  if (registered) clearUnsafeRegistrationFailure(ownerKey, dateKey)
  else markUnsafeRegistrationFailure(ownerKey, dateKey, patch)
}

/**
 * 대기 저장이 나중에 끝났을 때. 더 최신 고침이 있으면 옛 저장 성공으로 "저장 대기"를 내리지 않는다 — 내리면 최신 고침이 유실된다.
 * @param {SaveProgress} progress
 * @param {SetAutoSaveState} setAutoSaveStatus
 * @param {number} attemptRev 대기 저장을 걸 때의 판 번호
 * @param {boolean} ok
 */
export function settlePendingDayWrite(progress, setAutoSaveStatus, attemptRev, ok) {
  if (!ok || attemptRev !== progress.draftRev) return
  progress.hasPending = false
  if (progress.mounted) setAutoSaveStatus('saved')
}

/**
 * @param {{ ownerKey: string, logId: string, dateKey: string,
 *   draft: DayDraft, setAutoSaveStatus: SetAutoSaveState }} options
 */
export function createDayDraftSaver({ ownerKey, logId, dateKey, draft: initialDraft, setAutoSaveStatus }) {
  const pendingOwner = pendingOwnerForLog(ownerKey, logId)
  /** @type {SaveProgress} */
  const progress = { hasPending: false, draftRev: 0, mounted: true }
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null
  let saving = false
  let again = false
  /** @type {symbol|null} */
  let activity = null
  /** @type {((message: string) => void)|undefined} */
  let toast
  let latestDraft = initialDraft
  // 저장 실패 알림 앞에 붙는 날짜 — 어느 날 일지가 실패했는지 보이게.
  const failHead = `${Number(dateKey.slice(5, 7))}월 ${Number(dateKey.slice(8, 10))}일 운행일지 `

  /** @param {EffectivePatch} patch */
  function markSaved(patch) {
    progress.hasPending = false
    clearUnsafeRegistrationFailure(pendingOwner, dateKey)
    clearPendingDayWrite(pendingOwner, dateKey, patch)
    if (progress.mounted) setAutoSaveStatus('saved')
  }

  // 게스트·서브·미동기화 메인: 기기 저장 + tombstone, 저장 공간 부족이면 대기 저장에 등록해 다시 시도.
  /** @param {WorkMap} latest @param {WorkMap} next @param {EffectivePatch} patch */
  function commitLocal(latest, next, patch) {
    try {
      saveLogWorkDataWithTombstoneCheck(ownerKey, logId, dateKey, latest, next)
    } catch (error) {
      if (progress.mounted) setAutoSaveStatus('failed')
      toast?.(failHead + DEVICE_SAVE_FAIL)
      console.error('일지 자동 저장 실패:', error)
      const attemptRev = progress.draftRev
      queueFailedDayWrite(pendingOwner, dateKey, patch, (ok) => settlePendingDayWrite(progress, setAutoSaveStatus, attemptRev, ok))
      return
    }
    markSaved(patch)
  }

  // 서버 저장 결과. 저장 시작 때 판 번호가 지금과 같을 때만 "저장 대기"를 내린다(뒤에 고친 내용은 다음 저장이 맡음).
  /** @param {{ ok: boolean, toast: string|null }} result @param {number} attemptRev @param {EffectivePatch} patch */
  function settleCloud(result, attemptRev, patch) {
    if (result.ok) {
      if (attemptRev === progress.draftRev) markSaved(patch)
      return
    }
    if (result.toast) toast?.(result.toast === SERVER_SAVE_FAIL ? failHead + result.toast : result.toast)
    if (!progress.mounted) return
    setAutoSaveStatus('failed')
    // draft는 화면에 남는다. 나가기 전 확인에 걸리도록 표시만 하고 재시도 큐는 없다.
    markUnsafeRegistrationFailure(pendingOwner, dateKey, patch)
  }

  function commitNow() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const draft = latestDraft
    const latest = readOwnerLogWorkData(ownerKey, logId)
    const patch = structuredClone({
      isOff: draft.isOff,
      fixedCount: draft.fixedCount,
      palletCount: draft.palletCount,
      callDetails: draft.callDetails,
      fixedRouteCounts: draft.fixedRouteCounts,
    })
    const next = saveDayRecord(latest, dateKey, patch)
    if (!shouldCommitDayLogToCloud(ownerKey, logId)) {
      commitLocal(latest, next, patch)
      return
    }
    // 로그인 메인 일지는 서버에 직접 1회, 성공 때만 Store 반영. 같은 날짜는 한 번에 하나 — 도는 중에 고치면 끝난 뒤 최신 draft로 한 번 더.
    if (saving) { again = true; return }
    saving = true
    const attemptRev = progress.draftRev
    void commitMainDayLogToCloud({ ownerKey, logId, dateKey, previousData: latest, nextData: next }).then((result) => {
      saving = false
      if (!result.cloud) commitLocal(latest, next, patch)
      else settleCloud(result, attemptRev, patch)
      if (again) {
        again = false
        commitNow()
      }
      if (activity) pruneDayDraft(activity)
    })
  }

  return {
    commitNow,
    /** @param {((message: string) => void)|undefined} next */
    setToast(next) { toast = next },
    /** @param {DayDraft} next */
    setDraft(next) { latestDraft = next },
    /** 화면 열림 표시. 돌려준 함수가 닫힘 표시(StrictMode 다시 켜기에도 맞음). */
    mount() {
      progress.mounted = true
      return () => { progress.mounted = false }
    },
    /** draft가 바뀜 — 0.6초 뒤 저장. */
    edited() {
      progress.draftRev += 1
      setAutoSaveStatus('pending')
      progress.hasPending = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(commitNow, DEBOUNCE_MS)
    },
    /** 타이머만 멈추고 비우지 않는다 — 닫을 때 저장이 남았는지 알아야 한다. */
    cancelTimer() {
      if (timer) clearTimeout(timer)
    },
    /** 옛 콜 id를 채웠으면 바로 저장(실패해도 닫을 때 다시 시도). */
    migrated() {
      progress.hasPending = true
      commitNow()
    },
    /** 닫을 때 남은 고침을 저장한다 — 마지막 시도가 실패했어도 한 번 더. */
    close() {
      // 로그인 갈래: 화면이 닫히면 draft도 사라지므로 표시를 내린 뒤 마지막으로 한 번 더 시도한다.
      if (shouldCommitDayLogToCloud(ownerKey, logId)) clearUnsafeRegistrationFailure(pendingOwner, dateKey)
      if (progress.hasPending) commitNow()
    },
    /** 새로고침·앱 닫기 확인과 숨김 때 바로 저장 목록에 올린다. 돌려준 함수가 내림. */
    track() {
      const token = registerDayDraft(() => timer !== null || saving, () => { if (timer) commitNow() })
      activity = token
      return () => releaseDayDraft(token)
    },
  }
}
