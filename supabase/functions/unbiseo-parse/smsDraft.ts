// 미수금 문자 칸 읽기 — 거래처·달·전체·문구 번호, 틀린 칸은 빈 값(보내기는 사람이).
import type { Json } from './question.ts'

export type SmsDraft = { client: string, month: string, all: boolean, template: 1 | 2 | 3 | null }

const TEMPLATES: Array<1 | 2 | 3> = [1, 2, 3]

/** client는 index.ts가 운행과 같은 규칙(목록 이름 맞춤)으로 정리해 넘긴다. 달은 앞으로 올 달이면 빈 값. */
export function readSmsDraft(row: { [key: string]: Json }, today: string, client: string): SmsDraft {
  const said = row.smsMonth
  const month = typeof said === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(said) && said <= today.slice(0, 7) ? said : ''
  return {
    client,
    month,
    // 달과 전체를 같이 말하면 달이 먼저.
    all: !month && row.smsAll === true,
    template: TEMPLATES.find((number) => number === row.smsTemplate) ?? null,
  }
}
