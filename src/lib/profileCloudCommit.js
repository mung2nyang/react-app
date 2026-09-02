// @ts-check
// 로그인 프로필·설정 저장: profiles upsert 1회. practiceSnapshot(LS 미러)은 넣지 않는다.
import { supabase } from '../supabaseClient.js'

/** @typedef {import('./hydrateMergeTypes.js').LocalProfile} LocalProfile */
/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */

/**
 * @param {string} userId
 * @param {LocalProfile} profile
 * @param {FinanceSettings} settings
 */
export async function upsertProfileOnSupabase(userId, profile, settings) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    name: profile.name || null,
    phone: profile.phone || null,
    business_name: profile.bizName || null,
    business_number: profile.bizNumber || null,
    business_address: profile.bizAddress || null,
    business_type: profile.bizType || null,
    business_item: profile.bizItem || null,
    business_email: profile.bizEmail || null,
    bank_name: profile.bankName || null,
    account_number: profile.accountNumber || null,
    settings,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
