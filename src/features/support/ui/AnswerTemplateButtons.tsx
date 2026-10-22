// 관리자 답변 칸 위 자주 쓰는 문구 버튼(로드맵 23-D). 문구를 바꾸려면 아래 목록을 고친다.
const ANSWER_TEMPLATES = [
  { label: '인사', text: '안녕하세요, 운행일지입니다.' },
  { label: '맺음', text: '이용해 주셔서 감사합니다.' },
  { label: '건의 감사', text: '소중한 의견 감사합니다. 검토 후 반영하겠습니다.' },
  { label: '오류 사과', text: '불편을 드려 죄송합니다. 확인 후 바로 고치겠습니다.' },
]

type Props = {
  disabled: boolean
  onPick: (text: string) => void
}

export default function AnswerTemplateButtons({ disabled, onPick }: Props) {
  return (
    <div className="admin-answer-templates" aria-label="자주 쓰는 문구">
      {ANSWER_TEMPLATES.map((item) => (
        <button
          key={item.label}
          type="button"
          className="admin-answer-template"
          disabled={disabled}
          onClick={() => onPick(item.text)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
