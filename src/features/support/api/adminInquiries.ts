// 관리자 문의 목록·답변 저장 — 서버 함수(0025)로만, 로컬 저장 없음(Fail-Fast).
import type { JsonValue } from '../../../domain/jsonTypes.ts'
import { supabase } from '../../../data/cloud/supabaseClient.ts'
import {
  assertCloudWriteReady,
  assertSessionStillCurrent,
  captureSession,
} from '../../../data/cloud/cloudSession.ts'
import { StaleSessionError } from '../../../data/sync/saveErrors.ts'
import { SERVER_SAVE_FAIL, SESSION_CHANGED_FAIL } from '../../../shared/utils/failureMessages.js'

export type AdminInquiry = {
  id: string
  type: string
  title: string
  content: string
  answer: string
  answeredAt: string
  createdAt: string
  userName: string
}

export type AdminAnswerResult = { ok: boolean, toast: string, reload: boolean }

export const ANSWER_SAVED_TOAST = '답변을 저장했습니다.'
const NOT_ADMIN_TOAST = '관리자만 답변할 수 있습니다.'
const MISSING_TOAST = '없는 문의입니다. 목록을 다시 불러옵니다.'
const EMPTY_ANSWER_TOAST = '답변 내용이 비어 있습니다.'

function text(row: { [key: string]: JsonValue }, key: string): string {
  const value = row[key]
  return typeof value === 'string' ? value : ''
}

/** 서버 한 줄 → 화면용. id가 글자가 아니면 그 줄은 버린다. */
export function normalizeAdminInquiry(row: JsonValue | undefined): AdminInquiry | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const id = row.id
  if (typeof id !== 'string' || !id) return null
  return {
    id,
    type: text(row, 'type'),
    title: text(row, 'title'),
    content: text(row, 'content'),
    answer: text(row, 'answer'),
    answeredAt: text(row, 'answered_at'),
    createdAt: text(row, 'created_at'),
    userName: text(row, 'user_name'),
  }
}

/** 모든 문의(답변 대기 먼저·최근 먼저, 서버 순서 그대로). 실패하면 던진다. */
export async function fetchAdminInquiries(): Promise<Array<AdminInquiry>> {
  const captured = captureSession()
  const { data, error } = await supabase.rpc('admin_list_support_inquiries')
  assertSessionStillCurrent(captured)
  if (error) throw new Error(error.message || '문의 목록 조회에 실패했습니다.')
  const rows: Array<JsonValue> = Array.isArray(data) ? data : []
  const out: Array<AdminInquiry> = []
  for (const row of rows) {
    const item = normalizeAdminInquiry(row)
    if (item) out.push(item)
  }
  return out
}

function failToast(code: string | undefined): AdminAnswerResult {
  if (code === '42501') return { ok: false, toast: NOT_ADMIN_TOAST, reload: false }
  if (code === 'P0002') return { ok: false, toast: MISSING_TOAST, reload: true }
  return { ok: false, toast: SERVER_SAVE_FAIL, reload: false }
}

export async function requestAdminAnswerSave(inquiryId: string, answer: string): Promise<AdminAnswerResult> {
  const answerText = answer.trim()
  if (!answerText) return { ok: false, toast: EMPTY_ANSWER_TOAST, reload: false }
  try {
    assertCloudWriteReady()
  } catch (error) {
    return { ok: false, toast: error instanceof Error ? error.message : String(error), reload: false }
  }
  const captured = captureSession()
  try {
    const { error } = await supabase.rpc('admin_answer_support_inquiry', {
      inquiry_id: inquiryId,
      answer_text: answerText,
    })
    assertSessionStillCurrent(captured)
    if (error) {
      console.error('[requestAdminAnswerSave] 저장 실패:', error)
      return failToast(error.code)
    }
    return { ok: true, toast: ANSWER_SAVED_TOAST, reload: true }
  } catch (error) {
    if (error instanceof StaleSessionError) return { ok: false, toast: SESSION_CHANGED_FAIL, reload: false }
    console.error('[requestAdminAnswerSave] 저장 실패:', error)
    return { ok: false, toast: SERVER_SAVE_FAIL, reload: false }
  }
}
