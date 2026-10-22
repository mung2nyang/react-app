// 거래처 저장(saveClients) — 계산 규칙은 domain/clients.ts.
import { commitClients } from '../store/commitHelpers.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'

export function saveClients(ownerKey: string, clients: ClientLike[]) {
  commitClients(ownerKey, clients)
}
