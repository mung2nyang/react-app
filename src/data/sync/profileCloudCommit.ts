// 로그인 프로필·설정 저장: profiles upsert 1회. practiceSnapshot(LS 미러)은 넣지 않는다.
import { supabase } from '../cloud/supabaseClient.ts'
import type { LocalProfile } from '../hydrate/hydrateMergeTypes.ts'
import type { FinanceSettings } from '../../domain/financeTypes.ts'

/** @param options 연동 기사(9-B-0): 사업자·계좌 칸은 화면에 보이는 차주 값이라 보내지 않는다(서버 행 그대로). */
export async function upsertProfileOnSupabase(userId: string, profile: LocalProfile, settings: FinanceSettings, { ownFieldsOnly = false }: { ownFieldsOnly?: boolean } = {}) {
  const businessAndAccount = ownFieldsOnly ? {} : {
    business_name: profile.bizName || null,
    business_number: profile.bizNumber || null,
    business_address: profile.bizAddress || null,
    business_type: profile.bizType || null,
    business_item: profile.bizItem || null,
    business_email: profile.bizEmail || null,
    business_representative: profile.bizRepresentative || null,
    bank_name: profile.bankName || null,
    account_number: profile.accountNumber || null,
    account_holder: profile.accountHolder || null,
  }
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    name: profile.name || null,
    phone: profile.phone || null,
    ...businessAndAccount,
    settings,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
