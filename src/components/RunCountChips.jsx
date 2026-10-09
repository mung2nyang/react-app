// @ts-check
// AppSettingsPage.jsx에서 분리 (200줄 제한, migration-audit-plan.md Step 2 부수 조치).
import { useEffect, useRef, useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'
import { addRunCountPreset, removeRunCountPreset, replaceRunCountPreset, RUN_COUNT_PRESET_MAX } from '../lib/practiceSettings.js'

/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */

// 길게 누르기 판정 시간·손가락 이동 허용 거리(넘으면 취소).
const LONG_PRESS_MS = 600
const MOVE_TOLERANCE_PX = 10

/**
 * @param {Object} props
 * @param {'main'|'sub'} props.scope
 * @param {FinanceSettings} props.settings
 * @param {(patch: Partial<FinanceSettings>) => void|Promise<void>} props.onPatch
 * @param {(message: string) => void} [props.showToast]
 */
export default function RunCountChips({ scope, settings, onPatch, showToast }) {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const presets = settings[key] || []
  const [pendingIndex, setPendingIndex] = useState(/** @type {number|null} */ (null))
  const press = useRef(/** @type {{ timer: ReturnType<typeof setTimeout>, x: number, y: number }|null} */ (null))

  function cancelPress() {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }
  useEffect(() => cancelPress, [])

  /** @param {number} index @param {{ clientX: number, clientY: number }} event */
  function startPress(index, event) {
    cancelPress()
    if (presets.length <= 1) return
    const timer = setTimeout(() => {
      press.current = null
      setPendingIndex(index)
    }, LONG_PRESS_MS)
    press.current = { timer, x: event.clientX || 0, y: event.clientY || 0 }
  }

  /** @param {{ clientX: number, clientY: number }} event */
  function movePress(event) {
    const start = press.current
    if (start && Math.hypot((event.clientX || 0) - start.x, (event.clientY || 0) - start.y) > MOVE_TOLERANCE_PX) cancelPress()
  }

  function confirmRemove() {
    if (pendingIndex !== null) onPatch(removeRunCountPreset(settings, scope, pendingIndex))
    setPendingIndex(null)
  }

  function addChip() {
    const result = addRunCountPreset(settings, scope)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    onPatch({ [key]: result.settings[key] })
  }

  return (
    <div className="setting-item run-count-preset-setting">
      <div className="run-count-preset-copy">
        <label>횟수 버튼 설정</label>
        <p>운행일지에 표시할 횟수 버튼을 설정합니다.<br />+ 버튼을 눌러 필요한 만큼 추가할 수 있으며(최대 {RUN_COUNT_PRESET_MAX}개), 버튼을 길게 누르면 삭제할 수 있습니다.</p>
      </div>
      <div className="run-count-preset-chips" aria-label={scope === 'sub' ? '기사 차량 고정 노선 횟수 버튼 설정' : '고정 노선 횟수 버튼 설정'}>
        {presets.map((count, index) => (
          <span key={`${count}-${index}`} className="run-count-preset-chip-wrap">
            <input
              type="number"
              className="run-count-preset-chip"
              inputMode="numeric"
              min="1"
              defaultValue={count}
              aria-label={`${index + 1}번째 횟수 버튼`}
              onBlur={(e) => onPatch(replaceRunCountPreset(settings, scope, index, e.target.value))}
              onPointerDown={(e) => startPress(index, e)}
              onPointerMove={movePress}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onContextMenu={(e) => e.preventDefault()}
            />
          </span>
        ))}
        {presets.length < RUN_COUNT_PRESET_MAX && (
          <span className="run-count-preset-chip-wrap">
            <button type="button" className="run-count-preset-add-chip" aria-label="횟수 버튼 추가" onClick={addChip}>+</button>
          </span>
        )}
      </div>
      {pendingIndex !== null && (
        <ConfirmModal
          title={`${presets[pendingIndex]}회 버튼을 삭제하시겠습니까?`}
          confirmLabel="삭제"
          danger
          onCancel={() => setPendingIndex(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  )
}
