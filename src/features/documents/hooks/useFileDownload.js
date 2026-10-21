// @ts-check
// 서류 내려받기(운송비 내역서·일상점검표) — 파일을 만들어 링크로 내려받고 알림. 저장 중 상태가 하나라 그동안 두 버튼이 함께 막힌다.
import { useState } from 'react'
import { downloadFile } from '../api/reportExport.js'
import { useToast } from '../../../shared/hooks/useToast.js'

/**
 * @param {(type: 'pdf'|'image') => Promise<File>} buildFile
 * @param {string} logLabel 콘솔 오류 앞말(예: '일상점검표')
 */
export default function useFileDownload(buildFile, logLabel) {
  const showToast = useToast()
  const [saving, setSaving] = useState(/** @type {'pdf'|'image'|null} */ (null))

  /** @param {'pdf'|'image'} type */
  async function download(type) {
    if (saving) return
    setSaving(type)
    try {
      downloadFile(await buildFile(type))
      showToast?.(type === 'pdf' ? 'PDF를 저장했습니다.' : '이미지를 저장했습니다.')
    } catch (error) {
      console.error(`${logLabel} 내보내기 실패:`, error)
      showToast?.(type === 'pdf' ? 'PDF 저장에 실패했습니다. 다시 시도해 주세요.' : '이미지 저장에 실패했습니다.')
    } finally {
      setSaving(null)
    }
  }

  return { saving, download }
}
