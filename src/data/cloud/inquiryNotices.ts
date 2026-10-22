// 알림용 문의 읽기 — 내 문의 중 답변 온 것, 관리자면 답변 대기 건수(로드맵 23-C). 저장 없음.
import type { JsonValue } from '../../domain/jsonTypes.ts'
import { supabase } from './supabaseClient.ts'

export type AnsweredInquiry = { id: string, title: string, answeredAt: string }
export type PendingInquirySummary = { count: number, latestId: string, latestTitle: string }

function record(row: JsonValue | undefined): { [key: string]: JsonValue } | null {
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null
}

function text(row: { [key: string]: JsonValue }, key: string): string {
  const value = row[key]
  return typeof value === 'string' ? value : ''
}

/** 본인 문의 중 답변이 있는 것만(최근 답변 먼저). 실패하면 던진다. */
export async function fetchMyAnsweredInquiries(userId: string): Promise<Array<AnsweredInquiry>> {
  const { data, error } = await supabase
    .from('support_inquiries')
    .select('id, title, answer, answered_at')
    .eq('user_id', userId)
    .order('answered_at', { ascending: false })
  if (error) throw new Error(error.message || '문의 조회에 실패했습니다.')
  const rows: Array<JsonValue> = Array.isArray(data) ? data : []
  const out: Array<AnsweredInquiry> = []
  for (const raw of rows) {
    const row = record(raw)
    const id = row ? row.id : null
    if (!row || typeof id !== 'string' || !id || !text(row, 'answer').trim()) continue
    out.push({ id, title: text(row, 'title'), answeredAt: text(row, 'answered_at') })
  }
  return out
}

/** 관리자 함수(0025)로 답변 대기 건수와 가장 최근 대기 문의. 0건이면 null, 실패하면 던진다. */
export async function fetchPendingInquirySummary(): Promise<PendingInquirySummary | null> {
  const { data, error } = await supabase.rpc('admin_list_support_inquiries')
  if (error) throw new Error(error.message || '문의 목록 조회에 실패했습니다.')
  const rows: Array<JsonValue> = Array.isArray(data) ? data : []
  let count = 0
  let latest: { id: string, title: string } | null = null
  for (const raw of rows) {
    const row = record(raw)
    const id = row ? row.id : null
    if (!row || typeof id !== 'string' || !id || text(row, 'answer').trim()) continue
    count += 1
    // 서버가 답변 대기 먼저·최근 먼저로 주므로 처음 만난 대기 문의가 가장 최근.
    if (!latest) latest = { id, title: text(row, 'title') }
  }
  return latest ? { count, latestId: latest.id, latestTitle: latest.title } : null
}
