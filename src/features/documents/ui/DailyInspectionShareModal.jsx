// @ts-check
// 일상점검표 보내기(9-D): 운송비 내역서와 같은 공용 창 — 문자 받는 사람은 문자 앱에서 직접 고름.
import ShareFileModal from './ShareFileModal.jsx'

/**
 * @param {Object} props
 * @param {number} props.month 0부터
 * @param {(type: 'pdf'|'image') => Promise<File>} props.buildFile
 * @param {() => void} props.onClose
 */
export default function DailyInspectionShareModal({ month, buildFile, onClose }) {
  const message = `안녕하세요. ${month + 1}월 일상점검표입니다. 확인 부탁드립니다.`
  return (
    <ShareFileModal
      title="점검표 보내기"
      kakaoHint="파일과 안내 문구를 함께 공유합니다."
      smsHint="파일을 저장한 뒤 문자 앱을 엽니다. 받는 사람을 직접 선택해 주세요."
      shareTitle="일상점검표"
      kakaoText={message}
      unsupportedToast="이 기기에서는 파일 공유를 지원하지 않습니다."
      logLabel="일상점검표"
      buildFile={buildFile}
      smsTarget={() => ({ phone: '', message })}
      onClose={onClose}
    />
  )
}
