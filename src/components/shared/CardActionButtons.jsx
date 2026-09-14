// @ts-check
import { EditIcon, DeleteIcon } from '../day-log/icons.jsx'

/**
 * 카드 수정/삭제 아이콘 버튼 공용화(§2-1-B).
 * 바깥 wrapper(`.car-action-btns` / `.management-record-actions`)는 호출측이 유지.
 *
 * @param {Object} props
 * @param {() => void} props.onEdit
 * @param {() => void} props.onDelete
 */
export default function CardActionButtons({ onEdit, onDelete }) {
  return (
    <>
      <button type="button" className="action-icon-btn" title="수정" onClick={onEdit}>
        <EditIcon />
      </button>
      <button type="button" className="action-icon-btn del" title="삭제" onClick={onDelete}>
        <DeleteIcon />
      </button>
    </>
  )
}
