// @ts-check
// 로드맵 9-B-2: 일상점검표 모달 — 입력·보기 한 창(피그마 2·3번). 입력 모드는 바깥 클릭으로 안 닫힘(8번 규칙), 보기 모드는 닫힘.
// 연필로 들어온 수정 중 [취소]는 보기로 돌아가고, 처음 입력 중 [취소]는 창을 닫는다.
import { useState } from 'react'
import { DAILY_INSPECTION_SECTIONS, INSPECTION_RESULT_LABEL, allGoodItems, isInspectionComplete } from '../../domain/dailyInspectionItems.js'

/** @typedef {import('../../domain/dailyInspectionItems.js').InspectionItems} InspectionItems */
/** @typedef {import('../../lib/dailyInspections.js').DailyInspection} DailyInspection */

const INCOMPLETE_TOAST = '모든 항목을 선택해 주세요.'

/**
 * @param {{
 *   title: string,
 *   record: DailyInspection|null,
 *   inspectorName: string,
 *   onClose: () => void,
 *   onSave: (next: { items: InspectionItems, actionNote: string }) => Promise<boolean>,
 *   showToast?: (message: string) => void,
 * }} props
 */
export default function DailyInspectionModal({ title, record, inspectorName, onClose, onSave, showToast }) {
  const [mode, setMode] = useState(/** @type {'input'|'view'} */ (record ? 'view' : 'input'))
  const [fromView, setFromView] = useState(false)
  const [items, setItems] = useState(/** @type {InspectionItems} */ ({}))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = mode === 'input'
  const signer = editing ? inspectorName : (record?.inspectorName || inspectorName)

  function startEdit() {
    setItems({ ...(record?.items || {}) })
    setNote(record?.actionNote || '')
    setFromView(true)
    setMode('input')
  }

  /** 같은 버튼을 다시 누르면 선택 취소. @param {string} key @param {'good'|'bad'} result */
  function toggleItem(key, result) {
    const next = { ...items }
    if (next[key] === result) delete next[key]
    else next[key] = result
    setItems(next)
  }

  /** 전부 양호인 상태에서 다시 누르면 전부 선택 취소. */
  function toggleAllGood() {
    const all = allGoodItems()
    const isAllGood = Object.keys(all).every((key) => items[key] === 'good')
    setItems(isAllGood ? {} : all)
  }

  function cancel() {
    if (fromView) { setMode('view'); setFromView(false); return }
    onClose()
  }

  async function save() {
    if (saving) return
    if (!isInspectionComplete(items)) { showToast?.(INCOMPLETE_TOAST); return }
    setSaving(true)
    const ok = await onSave({ items, actionNote: note })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="modal-overlay" onClick={editing ? undefined : onClose}>
      <div className="daily-inspection-modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="di-header">
          <button type="button" className="di-icon-btn" aria-label="닫기" onClick={onClose}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <h2 className="di-title">{title}</h2>
          {!editing ? (
            <button type="button" className="di-icon-btn" aria-label="수정" onClick={startEdit}>
              <svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
            </button>
          ) : <span className="di-icon-btn" aria-hidden="true"></span>}
        </div>

        {DAILY_INSPECTION_SECTIONS.map((section, index) => (
          <section key={section.no} className="di-section">
            <div className="di-section-head">
              <span className="di-badge">{section.no}</span>
              <h3>{section.title}</h3>
              {editing && index === 0 && (
                <button type="button" className="di-all-good" onClick={toggleAllGood}>모두 양호</button>
              )}
            </div>
            {section.items.map((item) => {
              const value = editing ? items[item.key] : record?.items[item.key]
              return (
                <div key={item.key} className="di-row">
                  <span className="di-label">{item.label}</span>
                  {editing ? (
                    <span className="di-choices">
                      {(/** @type {Array<'good'|'bad'>} */ (['good', 'bad'])).map((result) => (
                        <button
                          key={result}
                          type="button"
                          className={`di-choice ${result}${value === result ? ' is-selected' : ''}`}
                          aria-pressed={value === result}
                          onClick={() => toggleItem(item.key, result)}
                        >
                          {INSPECTION_RESULT_LABEL[result]}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className={`di-result ${value || ''}`}>{value ? INSPECTION_RESULT_LABEL[value] : '-'}</span>
                  )}
                </div>
              )
            })}
          </section>
        ))}

        <p className="di-sign">본인은 위 점검 내용을 사실대로 확인하였습니다.<br />점검자: {signer} (자동 서명)</p>
        <div className="di-note-label">불량상태 조치 기록</div>
        {editing ? (
          <textarea className="input-box di-note" placeholder="예: 창닦이기 불량 → 와이퍼 교체" value={note} onChange={(e) => setNote(e.target.value)} />
        ) : (
          <div className="di-note-view">{record?.actionNote || '-'}</div>
        )}

        {editing && (
          <div className="modal-btns">
            <button type="button" className="modal-btn cancel" onClick={cancel}>취소</button>
            <button type="button" className="modal-btn confirm" disabled={saving} onClick={() => { void save() }}>저장</button>
          </div>
        )}
      </div>
    </div>
  )
}
