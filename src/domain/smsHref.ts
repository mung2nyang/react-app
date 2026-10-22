// 기기 문자 앱을 여는 주소 — 아이폰 계열은 본문 앞에 &, 그 밖은 ?(공유 창·문자 문구·기사 초대가 같이 씀).

export function buildSmsHref(phone: string, body: string, userAgent: string) {
  const separator = /iPhone|iPad|iPod/i.test(userAgent) ? '&' : '?'
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`
}
