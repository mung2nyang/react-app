// @ts-check
// 개인정보 화면 입력 임시값: 글자는 즉시 화면에 보이고, 저장은 묶어서 기존 saveProfile로 한 번에 한다.
// 로그인 상태의 saveProfile은 서버 저장 뒤에야 Store를 바꾸므로, 글자마다 저장하면 입력이 늦게 보이거나 사라졌다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { saveProfile } from '../../../data/sync/profileSave.ts'
import { SERVER_SAVE_FAIL } from '../../../shared/utils/failureMessages.js'
import { useToast } from '../../../shared/hooks/useToast.js'

/** @typedef {import('../../../data/hydrate/hydrateMergeTypes.ts').LocalProfile} LocalProfile */
/** @typedef {Partial<Record<keyof LocalProfile, string>>} ProfileDraft */

export const SAVE_DELAY_MS = 700
const SAVE_FAIL_TOAST = SERVER_SAVE_FAIL

/**
 * @param {{ ownerKey: string, profile: LocalProfile }} params
 */
export function usePersonalInfoDraft({ ownerKey, profile }) {
  const showToast = useToast()
  const [draft, setDraft] = useState(/** @type {ProfileDraft} */ ({}))
  const dirtyRef = useRef(/** @type {ProfileDraft} */ ({}))
  const timerRef = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null))
  const savingRef = useRef(false)
  const mountedRef = useRef(true)
  const latest = useRef({ ownerKey, profile, showToast })
  useEffect(() => { latest.current = { ownerKey, profile, showToast } })

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (savingRef.current || !Object.keys(dirtyRef.current).length) return
    savingRef.current = true
    const snapshot = dirtyRef.current
    const { ownerKey: owner, profile: base, showToast: toast } = latest.current
    try {
      await saveProfile(owner, { ...base, ...snapshot })
      /** @type {ProfileDraft} */
      const rest = {}
      for (const [key, value] of Object.entries(dirtyRef.current)) {
        if (snapshot[/** @type {keyof LocalProfile} */ (key)] !== value) Object.assign(rest, { [key]: value })
      }
      dirtyRef.current = rest
    } catch (error) {
      console.error('개인정보 저장 실패:', error)
      toast?.(SAVE_FAIL_TOAST)
      dirtyRef.current = {}
    } finally {
      savingRef.current = false
      if (mountedRef.current) setDraft({ ...dirtyRef.current })
    }
    // oxlint-disable-next-line react/immutability -- 저장 중 바뀐 값이 남으면 한 번 더 저장한다(자기 호출).
    if (Object.keys(dirtyRef.current).length) await flush()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void flush()
    }
  }, [flush])

  const set = useCallback((/** @type {keyof LocalProfile} */ field, /** @type {string} */ value) => {
    dirtyRef.current = { ...dirtyRef.current, [field]: value }
    setDraft(dirtyRef.current)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flush() }, SAVE_DELAY_MS)
  }, [flush])

  /** @param {keyof LocalProfile} field */
  const get = (field) => draft[field] ?? profile[field] ?? ''

  return { get, set, flush }
}
