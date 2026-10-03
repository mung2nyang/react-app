// @ts-check
// 원본 driver-link.js sendDriverInviteSms() 이관 — 서버 SMS API가 아니라 기기 문자
// 앱을 sms: 스킴으로 열어주는 방식이라 별도 발송 인프라가 필요 없다.
import { formatInviteCode, INVITE_CODE_PATTERN, normalizeInviteCode } from '../domain/drivers.js'

/**
 * @param {{ name?: string, phone?: string, inviteCode?: string, vehicleNumber?: string, ownerDisplayName?: string, userAgent?: string }} input
 * @returns {{ error: string }|{ href: string }}
 */
export function buildDriverInviteSmsHref({
  name = '', phone = '', inviteCode = '', vehicleNumber = '', ownerDisplayName = '운송사', userAgent = '',
}) {
  const trimmedPhone = phone.trim()
  if (!trimmedPhone || trimmedPhone.replace(/\D/g, '').length < 10) {
    return { error: '기사 전화번호를 먼저 올바르게 입력해 주세요.' }
  }
  const code = normalizeInviteCode(inviteCode)
  if (!INVITE_CODE_PATTERN.test(code)) {
    return { error: '[코드 생성]으로 초대 코드를 먼저 만들어 주세요.' }
  }
  const trimmedName = name.trim()
  const trimmedVehicle = vehicleNumber.trim()
  const message = `[운행일지] 안녕하세요, ${ownerDisplayName}입니다.${trimmedName ? ` ${trimmedName}기사님,` : ''}\n${trimmedVehicle ? `[${trimmedVehicle}] 차량 ` : ''}소속 기사 연동 초대 코드입니다.\n\n▶ 초대 코드: ${formatInviteCode(code)}\n\n운행일지 앱 실행 후 [마이페이지 > 소속 연결]에서 위 코드를 입력해 주세요. (초대 저장 후 7일 동안 사용할 수 있습니다)`
  const separator = /iPhone|iPad|iPod/i.test(userAgent) ? '&' : '?'
  return { href: `sms:${trimmedPhone}${separator}body=${encodeURIComponent(message)}` }
}
