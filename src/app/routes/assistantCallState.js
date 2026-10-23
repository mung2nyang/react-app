// @ts-check
// 주소 상태로 넘어온 운비서 운행(로드맵 24-B-2)·지출(24-C-2)·고정 노선(24-F-2) — 칸마다 모양을 보고, 이상한 칸은 빈 칸으로.
import { FUEL_TYPES, MAINT_CATEGORIES, MISC_CATEGORIES } from '../../domain/expenses.ts'

const TEXT_MAX = 100
const PAYMENTS = ['카드', '현금']
const FIXED_COUNT_MAX = 20

/** @typedef {{ loadLoc: string, unloadLoc: string, fare: number|null, client: string, cancelOff: boolean }} AssistantCall */
/** @typedef {{ type: 'maint'|'fuel'|'misc', cost: number|null, name: string, category: string, fuelType: string, payment: string, cancelOff: boolean }} AssistantExpense */
/** @typedef {{ count: number, route: string, cancelOff: boolean }} AssistantFixed */

/** @param {object} row @param {string} key */
function textOf(row, key) {
  const value = Reflect.get(row, key)
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > TEXT_MAX ? '' : trimmed
}

/** @param {object} row @param {string} key */
function wonOf(row, key) {
  const value = Reflect.get(row, key)
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/** @param {object} row @param {string} key @param {Array<string>} list */
function oneOf(row, key, list) {
  const value = textOf(row, key)
  return list.includes(value) ? value : ''
}

/** @param {object|null|undefined} state @param {string} key */
function rowOf(state, key) {
  const row = state && typeof state === 'object' ? Reflect.get(state, key) : null
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null
}

/**
 * @param {object|null|undefined} state location.state
 * @returns {AssistantCall|null}
 */
export function readAssistantCall(state) {
  const row = rowOf(state, 'assistantCall')
  if (!row) return null
  return {
    loadLoc: textOf(row, 'loadLoc'),
    unloadLoc: textOf(row, 'unloadLoc'),
    fare: wonOf(row, 'fare'),
    client: textOf(row, 'client'),
    // 휴무를 끄라는 표시 — 참일 때만 참.
    cancelOff: Reflect.get(row, 'cancelOff') === true,
  }
}

/**
 * 분류는 그 종류의 앱 목록 안만(주유는 분류 없음), 주유 종류는 주유일 때만.
 * @param {object|null|undefined} state location.state
 * @returns {AssistantExpense|null}
 */
export function readAssistantExpense(state) {
  const row = rowOf(state, 'assistantExpense')
  if (!row) return null
  const raw = Reflect.get(row, 'type')
  /** @type {'maint'|'fuel'|'misc'} */
  const type = raw === 'fuel' ? 'fuel' : raw === 'misc' ? 'misc' : 'maint'
  const categories = type === 'maint' ? MAINT_CATEGORIES : type === 'misc' ? MISC_CATEGORIES : []
  return {
    type,
    cost: wonOf(row, 'cost'),
    name: textOf(row, 'name'),
    category: oneOf(row, 'category', categories),
    fuelType: type === 'fuel' ? oneOf(row, 'fuelType', FUEL_TYPES) : '',
    payment: oneOf(row, 'payment', PAYMENTS),
    cancelOff: Reflect.get(row, 'cancelOff') === true,
  }
}

/**
 * 횟수가 1~20 정수가 아니면 통째로 버린다(더할 수가 없음).
 * @param {object|null|undefined} state location.state
 * @returns {AssistantFixed|null}
 */
export function readAssistantFixed(state) {
  const row = rowOf(state, 'assistantFixed')
  const count = row ? Reflect.get(row, 'count') : null
  if (!row || typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > FIXED_COUNT_MAX) return null
  return { count, route: textOf(row, 'route'), cancelOff: Reflect.get(row, 'cancelOff') === true }
}

/**
 * 운비서 [기록하기] → 일지로 갈 때 주소 상태. 일지 닫기는 온 곳으로 뒤로가기(from: 'home').
 * @param {import('../../features/home/api/unbiseoParse.ts').UnbiseoRecord} record 운행·지출·고정 노선
 * @param {{ cancelOff: boolean }} options
 */
export function assistantCallNavState(record, options) {
  if ('count' in record) return { from: 'home', assistantFixed: { count: record.count, route: record.route, cancelOff: options.cancelOff } }
  if ('type' in record) {
    const { type, cost, name, category, fuelType, payment } = record
    return { from: 'home', assistantExpense: { type, cost, name, category, fuelType, payment, cancelOff: options.cancelOff } }
  }
  return { from: 'home', assistantCall: { loadLoc: record.loadLoc, unloadLoc: record.unloadLoc, fare: record.fare, client: record.client, cancelOff: options.cancelOff } }
}
