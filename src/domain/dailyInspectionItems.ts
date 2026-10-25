// 운수종사자 일상점검표(화물자동차 운수사업법 시행규칙 별지 제14호의5서식) 점검 항목 — 서식 순서·문구 그대로 3묶음 11항목.
import type { JsonValue } from './jsonTypes.ts'

export type InspectionResult = 'good' | 'bad'
export type InspectionItems = Record<string, InspectionResult>

export const DAILY_INSPECTION_SECTIONS = [
  {
    no: '01',
    title: '외관 점검',
    items: [
      { key: 'plateGlassMirror', label: '번호판, 전면유리, 후사경 등의 청결상태' },
      { key: 'lamps', label: '후미등, 차폭등 등 등화장치 작동상태' },
      { key: 'wipers', label: '창닦이기 작동상태' },
      { key: 'cargoBodyGuards', label: '적재함(보조지지대 포함), 측면보호대, 후부반사판, 트레일러 연결장치의 부착상태 및 훼손 여부' },
    ],
  },
  {
    no: '02',
    title: '상태 점검',
    items: [
      { key: 'tires', label: '타이어 손상 및 마모(1.6mm 이상) 여부' },
      { key: 'cargoSecuring', label: '화물, 적재함 지지대(판스프링) 등의 고정상태' },
      { key: 'wheelNuts', label: '바퀴 너트 등 균열 여부' },
    ],
  },
  {
    no: '03',
    title: '기타',
    items: [
      { key: 'vehicleCondition', label: '냉각수, 공기압, 엔진오일 등 차량 이상 여부(계기판 확인)' },
      { key: 'seatBelts', label: '좌석안전띠 상태' },
      { key: 'extinguisher', label: '소화기 비치 여부' },
      { key: 'warningTriangle', label: '안전삼각대 등 비치 여부' },
    ],
  },
]

export const DAILY_INSPECTION_KEYS = DAILY_INSPECTION_SECTIONS.flatMap((section) => section.items.map((item) => item.key))

export const INSPECTION_RESULT_LABEL: Record<InspectionResult, string> = { good: '양호', bad: '불량' }

/** [모두 양호] — 11항목 전부 양호. */
export function allGoodItems(): InspectionItems {
  return Object.fromEntries(DAILY_INSPECTION_KEYS.map((key) => [key, 'good' as InspectionResult]))
}

/** 11항목이 모두 양호·불량 중 하나로 골라졌는지(저장 조건). */
export function isInspectionComplete(items: InspectionItems) {
  return DAILY_INSPECTION_KEYS.every((key) => items[key] === 'good' || items[key] === 'bad')
}

/** 11항목이 모두 비었는지(수정에서 다 비우고 저장하면 지우기). */
export function isInspectionEmpty(items: InspectionItems) {
  return DAILY_INSPECTION_KEYS.every((key) => items[key] !== 'good' && items[key] !== 'bad')
}

/** 서버에서 읽은 값을 아는 항목키·양호/불량만 남겨 좁힌다. */
export function sanitizeInspectionItems(raw: JsonValue | undefined): InspectionItems {
  const items: InspectionItems = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return items
  for (const key of DAILY_INSPECTION_KEYS) {
    const value = (raw as Record<string, JsonValue | undefined>)[key]
    if (value === 'good' || value === 'bad') items[key] = value
  }
  return items
}
