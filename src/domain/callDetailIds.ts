// 콜상세 id 정규화. hydrate(서버 numeric id)와 일지 저장이 같은 규칙을 쓴다.
import type { JsonValue } from './jsonTypes.ts'
import type { CallDetailLike } from './callDetail.ts'

export function withCoercedCallDetailId<T extends object>(item: T): T {
  if (!item || typeof item !== 'object') return item
  const id = (item as { id?: JsonValue }).id
  if (typeof id === 'number' && Number.isFinite(id)) {
    return ({ ...item, id: String(id) }) as T
  }
  return item
}

export function resolveCallDetailId(detail: CallDetailLike | null | undefined): string {
  if (!detail || typeof detail !== 'object') return ''
  const coerced = withCoercedCallDetailId(detail)
  const id = coerced && typeof coerced === 'object' ? coerced.id : undefined
  return typeof id === 'string' ? id.trim() : ''
}

export function findCallDetailIndex(details: Array<CallDetailLike> | null | undefined, detailId: string): number {
  const key = String(detailId || '').trim()
  if (!key || !Array.isArray(details)) return -1
  return details.findIndex((item) => resolveCallDetailId(item) === key)
}

/** 같은 id는 한 번만 남긴다(먼저 나온 항목). id 없는 레거시는 그대로 둔다. */
export function dedupeCallDetailsById<T extends object>(list: Array<T> | null | undefined): Array<T> {
  const seen = new Set<string>()
  const next: Array<T> = []
  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const coerced = withCoercedCallDetailId(item)
    if (!coerced || typeof coerced !== 'object') return
    const id = (coerced as { id?: JsonValue }).id
    const key = typeof id === 'string' ? id : ''
    if (key) {
      if (seen.has(key)) return
      seen.add(key)
    }
    next.push(coerced)
  })
  return next
}
