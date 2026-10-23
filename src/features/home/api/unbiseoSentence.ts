// 운비서 결과를 앱이 정한 틀의 문장으로 — 빈 칸은 뺀다.
import { formatWon } from '../../../domain/money.ts'
import { formatPhoneNumber } from '../../../domain/formatPhone.ts'
import { getPaymentTermLabel } from '../../../domain/clientPaymentTerms.ts'
import type { UnbiseoCall, UnbiseoClient, UnbiseoExpense, UnbiseoFixed, UnbiseoResult } from './unbiseoParse.ts'
import type { UnbiseoQuestion } from './unbiseoQuestion.ts'

/** 받침 있으면 "으로", 없거나 ㄹ 받침·한글 아님이면 "로". */
function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return `${word}로`
  const final = code % 28
  return final === 0 || final === 8 ? `${word}로` : `${word}으로`
}

function dateLabelOf(date: string, today: string): string {
  const [, month, day] = date.split('-').map(Number)
  return date === today ? '오늘' : `${month}월 ${day}일`
}

/** 운행 결과 한 문장 — 앱이 정해진 틀로 만든다(빈 칸은 뺌). */
export function describeCall(call: UnbiseoCall, today: string): string {
  const dateLabel = dateLabelOf(call.date, today)
  const route = [call.loadLoc, call.unloadLoc].filter(Boolean).join(' → ')
  const parts = [route, call.fare === null ? '' : formatWon(call.fare), call.client].filter(Boolean)
  if (!parts.length) return `${dateLabel} 운행으로 기록할게요.`
  return `${dateLabel} ${withRo(parts.join(', '))} 기록할게요.`
}

/** 고정 노선 결과 한 문장 — 노선을 못 알아들었으면 "고정 노선". */
export function describeFixed(fixed: UnbiseoFixed, today: string): string {
  return `${dateLabelOf(fixed.date, today)} ${fixed.route || '고정 노선'} ${fixed.count}회로 기록할게요.`
}

const EXPENSE_LABEL = { maint: '정비', fuel: '주유', misc: '기타' }

/** 지출 결과 한 문장 — 항목은 주유면 주유 종류, 그 밖은 항목명 → 분류 → 종류 이름 순(빈 칸은 뺌). */
export function describeExpense(expense: UnbiseoExpense, today: string): string {
  const item = expense.type === 'fuel' ? expense.fuelType || '주유' : expense.name || expense.category || EXPENSE_LABEL[expense.type]
  const parts = [item, expense.cost === null ? '' : formatWon(expense.cost), expense.payment].filter(Boolean)
  return `${dateLabelOf(expense.date, today)} ${withRo(parts.join(', '))} 기록할게요.`
}

/** 받침 있으면 "을"·"은", 없거나 한글 아님이면 "를"·"는". */
function particle(word: string, withFinal: string, without: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? `${word}${withFinal}` : `${word}${without}`
}

/** 거래처 등록 문장 — 들은 칸만 괄호 안에(연락처·결제 주기는 거래처 창과 같은 표시). */
export function describeClient(client: UnbiseoClient): string {
  const commission = client.commType === 'percent' ? `수수료 ${client.commValue}%` : client.commType === 'direct' ? `수수료 ${formatWon(client.commValue ?? 0)}` : ''
  const details = [
    client.manager && `담당자 ${client.manager}`,
    client.phone && formatPhoneNumber(client.phone),
    client.paymentTerm && getPaymentTermLabel(client.paymentTerm, client.paymentTermValue ?? ''),
    commission,
  ].filter(Boolean)
  const head = `${particle(client.name, '을', '를')} 거래처로 등록할게요.`
  return details.length ? `${head} (${details.join(', ')})` : head
}

/** 이미 있는 이름 — 등록 버튼 없이 알림만. */
export function describeExistingClient(name: string): string {
  return `${particle(name, '은', '는')} 이미 등록된 거래처예요.`
}

/** 결과 한 문장(운행·지출·질문·관계없음·실패). 질문 답은 숫자를 내는 쪽(answerQuestion)이 만든다. */
export function describeResult(result: UnbiseoResult, today: string, answerQuestion: (question: UnbiseoQuestion) => string): string {
  if (result.kind === 'call') return describeCall(result.call, today)
  if (result.kind === 'expense') return describeExpense(result.expense, today)
  if (result.kind === 'fixed') return describeFixed(result.fixed, today)
  if (result.kind === 'client') return describeClient(result.client)
  if (result.kind === 'question') return answerQuestion(result.question)
  if (result.kind === 'unknown') return '운행 기록으로 알아듣지 못했어요. 다시 말해 주세요.'
  return result.message
}
