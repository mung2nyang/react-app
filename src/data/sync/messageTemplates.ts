import type { FinanceSettings } from '../../domain/financeTypes.ts'

/** 문구 1~3 이름 — 일지 문자 창·운비서 문자가 같이 쓴다. */
export const MESSAGE_TEMPLATE_TITLES = ['미수금 안내', '입금 요청', '운행 완료']

export function getDefaultMessageTemplatePatterns(): [string, string, string] {
  return [
    '안녕하세요, {거래처} 담당자님. {운행구간} 운송료 {운송료}원이 미수 상태입니다. 확인 부탁드립니다.',
    '안녕하세요. {운행구간} 운송 건 운송료 {운송료}원 입금 부탁드립니다. 감사합니다.',
    '안녕하세요, {거래처} 담당자님. {운행구간} 운행이 완료되었습니다. 이용해 주셔서 감사합니다.',
  ]
}

/** 계정 설정의 문구 1~3, 바꾼 문구가 없으면 기본. */
export function getMessageTemplatePatterns(settings: FinanceSettings): [string, string, string] {
  return settings.messageTemplates || getDefaultMessageTemplatePatterns()
}

export function getDefaultReportShareMessagePattern(): string {
  return '안녕하세요, {거래처} 담당자님. 운송비 내역서입니다. 확인 부탁드립니다.'
}

/** 계정 설정의 내역서 공유 문구, 없으면 기본. */
export function getReportShareMessagePattern(settings: FinanceSettings): string {
  return settings.reportShareMessage || getDefaultReportShareMessagePattern()
}

export function fillMessageTemplatePattern(pattern: string, values: { company: string, route: string, fare: string }): string {
  return String(pattern)
    .replaceAll('{거래처}', values.company)
    .replaceAll('{운행구간}', values.route)
    .replaceAll('{운송료}', values.fare)
}

export function fillReportShareMessagePattern(pattern: string, company = '거래처'): string {
  return String(pattern).replaceAll('{거래처}', company || '거래처')
}
