import { savePracticeSettings } from './settingsSave.ts'
import { requestVehicleSave } from './vehicleMutations.ts'
import type { CarLike } from '../../domain/financeTypes.ts'

export type OnboardingWizard = {
  workStyle?: 'fixed' | 'call' | 'both' | null
  paymentOn?: boolean | null
  timeOn?: boolean
  cargoTonnageOn?: boolean
  platformOn?: boolean
  distanceOn?: boolean
  carNumber?: string
  carTonnage?: string
}

/**
 * 온보딩 wizard → practiceSettings patch.
 * `both`일 때 fixedOn·callDetail을 둘 다 true로 명시한다(normalizeSettings가
 * fixedOn===true면 callDetail 기본값이 false라 생략하면 탈락함).
 */
export function buildOnboardingSettingsPatch(wizard: OnboardingWizard | null | undefined) {
  const workStyle = wizard?.workStyle
  const fixedOn = workStyle === 'fixed' || workStyle === 'both'
  const callDetail = workStyle === 'call' || workStyle === 'both'
  return {
    fixedOn,
    callDetail,
    paymentOn: !!wizard?.paymentOn,
    timeOn: !!wizard?.timeOn,
    cargoTonnageOn: !!wizard?.cargoTonnageOn,
    platformOn: !!wizard?.platformOn,
    distanceOn: !!wizard?.distanceOn,
  }
}

/** 온보딩 답변을 기존 설정/차량 저장 경로로 반영한다. 실패해도 throw하지 않고 toast만 돌려준다. */
export async function applyOnboardingWizard({ ownerKey, userId, cars = [], wizard }: {
  ownerKey: string,
  userId: string | null | undefined,
  cars?: Array<CarLike>,
  wizard: OnboardingWizard,
}): Promise<{ toast?: string }> {
  let toast: string | undefined
  try {
    await savePracticeSettings(ownerKey, buildOnboardingSettingsPatch(wizard))
  } catch (error) {
    console.error('온보딩 설정 저장 실패:', error)
    toast = '설정 저장에 실패했습니다. 앱 설정에서 다시 저장해 주세요.'
  }

  const number = String(wizard?.carNumber || '').trim()
  if (!number) return { toast }

  try {
    const result = await requestVehicleSave({
      ownerKey,
      userId: userId || null,
      cars,
      editingId: null,
      draft: {
        type: 'main',
        number,
        tonnage: String(wizard?.carTonnage || '').trim(),
      },
    })
    if (result.failed) {
      toast = result.toast || '차량 저장에 실패했습니다. 차량 관리에서 다시 등록해 주세요.'
    }
  } catch (error) {
    console.error('온보딩 차량 저장 실패:', error)
    toast = '차량 저장에 실패했습니다. 차량 관리에서 다시 등록해 주세요.'
  }

  return { toast }
}
