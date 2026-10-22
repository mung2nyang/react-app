// @ts-check
// 한 차량 거래처 목록·추가 단추·입력 창·삭제 확인 창 — useScopedClients와 짝.
import ConfirmModal from '../../../shared/ui/ConfirmModal.jsx'
import ClientFormModal from './ClientFormModal.jsx'
import ClientListItem from './ClientListItem.jsx'
import { useScopedClients } from '../hooks/useScopedClients.js'
import '../../drivers/ui/linked-driver.css'
import './client-management.css'
import { useSession } from '../../../data/cloud/sessionContext.ts'

/**
 * @param {Object} props
 * @param {string} props.scopeKey 거래처를 묶는 차량 번호
 * @param {string} props.listId
 * @param {import('react').ReactNode} [props.notice] 목록 위 안내
 */
export default function ScopedClientsList({ scopeKey, listId, notice }) {
  const { ownerKey } = useSession()
  const scoped = useScopedClients({ ownerKey, scopeKey })

  return (
    <>
      <div className="client-list" id={listId}>
        {notice}
        {!scoped.scopedClients.length ? (
          <div className="empty-state">등록된 거래처가 없습니다.</div>
        ) : (
          scoped.scopedClients.map((client) => (
            <ClientListItem
              key={client.id}
              client={client}
              onEdit={() => scoped.openEdit(client)}
              onDelete={() => scoped.setPendingDelete(client)}
            />
          ))
        )}
      </div>
      <button type="button" className="management-add-fab" onClick={scoped.openAdd}>+ 추가</button>
      {scoped.modalOpen && (
        <ClientFormModal
          draft={scoped.draft}
          setDraft={scoped.setDraft}
          editingId={scoped.editingId}
          onCancel={scoped.closeModal}
          onSave={scoped.save}
        />
      )}
      {scoped.pendingDelete && (
        <ConfirmModal
          title="이 거래처를 삭제하시겠습니까?"
          confirmLabel="삭제"
          danger
          onCancel={() => scoped.setPendingDelete(null)}
          onConfirm={scoped.confirmRemove}
        />
      )}
    </>
  )
}
