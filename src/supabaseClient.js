import { createClient } from '@supabase/supabase-js'

// 원래 앱 supabase-config.js와 같은 공개 주소/키입니다.
// (브라우저에 보여도 되는 공개 키. 비밀 열쇠가 아닙니다.)
const SUPABASE_URL = 'https://wphlnkfymvpnklgbuxrk.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_JJZxpsvje-LUGmphA70z9Q_Y7WfrM0G'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function phoneToFakeEmail(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return `${digits}@runlog-user.com`
}

export function getSupabaseAuthErrorMessage(error) {
  const msg = error?.message || ''
  if (/already registered|already exists|user already/i.test(msg)) {
    return '이미 가입된 휴대전화 번호입니다. "로그인"으로 전환해 주세요.'
  }
  if (/invalid login credentials/i.test(msg)) {
    return '이름/전화번호 또는 비밀번호가 올바르지 않습니다. 처음이시라면 "회원가입"으로 전환해 주세요.'
  }
  if (/password.*(at least|6 characters)/i.test(msg)) {
    return '비밀번호는 6자 이상이어야 합니다.'
  }
  if (/network|fetch/i.test(msg)) {
    return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
  }
  return msg || '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}

export async function signInWithPhone(phone, password) {
  return supabase.auth.signInWithPassword({
    email: phoneToFakeEmail(phone),
    password,
  })
}

export async function signUpWithPhone(phone, password) {
  return supabase.auth.signUp({
    email: phoneToFakeEmail(phone),
    password,
  })
}

export async function ensureProfileRow(userId, accountType, name, phone) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    account_type: accountType || null,
    name: name || null,
    phone: phone || null,
  })
  if (error) console.error('profiles 생성 실패:', error)
}
