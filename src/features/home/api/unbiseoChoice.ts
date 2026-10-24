// 되묻기 버튼을 말로 고르기 — 지금 보이는 버튼 중 딱 하나 맞을 때만, 아니면 서버로.
import { MESSAGE_TEMPLATE_TITLES } from '../../../data/sync/messageTemplates.ts'

/** 버튼 하나 — 맞출 말(정리한 글자)과 누름. */
export type UnbiseoChoice = { words: Array<string>, choose: () => void }
/** 지금 묻는 단계 — 말로 골랐을 때 읽을 질문과 말로 고를 수 있는 버튼(없으면 서버로). */
export type UnbiseoStep = { question: string, choices: Array<UnbiseoChoice> }

export const ALL_WORDS = ['전체', '전부', '남은거다']
export const DIRECT_WORDS = ['직접', '고를게']
const NUMBER_WORDS = [['1번', '일번', '첫번째'], ['2번', '두번째'], ['3번', '세번째']]

/** 띄어쓰기·문장부호를 뺀 글자. */
export function normalizeSaid(said: string): string {
  return said.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

export function clientWords(client: string): Array<string> {
  return [normalizeSaid(client)]
}

/** 올해 달은 "7월분"·"7월", 다른 해는 "2025년 7월"까지. */
export function monthWords(month: string, today: string): Array<string> {
  const name = `${Number(month.slice(5, 7))}월`
  const words = month.slice(0, 4) === today.slice(0, 4) ? [name] : [`${month.slice(0, 4)}년${name}`]
  return words.flatMap((word) => [`${word}분`, word])
}

export function templateWords(template: 1 | 2 | 3): Array<string> {
  return [...NUMBER_WORDS[template - 1], normalizeSaid(MESSAGE_TEMPLATE_TITLES[template - 1])]
}

export function stepQuestion(prompt: string, labels: Array<string>): string {
  return labels.length ? `${prompt} ${labels.join(', ')}.` : prompt
}

// 숫자로 시작하는 말은 앞이 숫자면 안 맞는다("11월"의 "1월").
function hits(said: string, word: string): boolean {
  let at = said.indexOf(word)
  while (at >= 0) {
    if (!/^\d/.test(word) || at === 0 || !/\d/.test(said[at - 1])) return true
    at = said.indexOf(word, at + 1)
  }
  return false
}

function longestHit(said: string, choice: UnbiseoChoice): number {
  return choice.words.reduce((best, word) => (word && word.length > best && hits(said, word) ? word.length : best), 0)
}

/** 가장 길게 맞은 버튼이 딱 하나면 그 버튼("2025년 7월"은 올해 "7월"보다 앞선다), 아니면 null. */
export function matchChoice(said: string, choices: Array<UnbiseoChoice>): UnbiseoChoice | null {
  const text = normalizeSaid(said)
  const scored = choices.map((choice) => ({ choice, length: longestHit(text, choice) }))
  const best = Math.max(0, ...scored.map((row) => row.length))
  const top = scored.filter((row) => row.length === best)
  return best > 0 && top.length === 1 ? top[0].choice : null
}
