// @ts-check
import { useState } from 'react'
import { getSupabaseAuthErrorMessage, signInWithGoogle } from '../../../data/cloud/supabaseClient.ts'
import AuthIntroView from './AuthIntroView.jsx'
import { useToast } from '../../../shared/hooks/useToast.js'

/**
 * @param {Object} props
 * @param {() => void} [props.onGuest]
 */
export default function AuthPage({ onGuest }) {
  const showToast = useToast()
  const [busy, setBusy] = useState(false)

  // 성공하면 브라우저가 구글 화면으로 넘어가므로 바쁨 표시를 풀지 않는다.
  async function handleGoogle() {
    if (busy) return
    setBusy(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) {
        showToast(getSupabaseAuthErrorMessage(error))
        setBusy(false)
      }
    } catch (error) {
      showToast(getSupabaseAuthErrorMessage(error instanceof Error ? error : null))
      setBusy(false)
    }
  }

  return (
    <AuthIntroView
      onGuest={onGuest}
      onGoogle={() => { void handleGoogle() }}
      busy={busy}
    />
  )
}
