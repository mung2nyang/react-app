// ClientLike/ClientDraft 타입 정본(타입 전용 모듈).
export type ClientLike = {
  id: string
  companyName: string
  managerName?: string
  phone?: string
  bizNumber?: string
  paymentTerm?: string
  paymentTermValue?: string
  isPinned?: boolean
  taxInvoiceEnabled?: boolean
  scopedToVehicleNumber?: string
  commEnabled?: boolean
  commType?: string
  commValue?: string | number
  fixedRouteLinked?: boolean
  palletOn?: boolean
  palletPrice?: string | number
  fixedUnitPrice?: string | number
  taxRepresentative?: string
  taxEmail?: string
  taxAddress?: string
  taxBizType?: string
  taxBizItem?: string
  supabaseId?: string | number
}

/** upsertClient가 받는 입력 폼 값 — 아직 정규화 전이라 전부 느슨한 문자열/불리언이다. */
export type ClientDraft = {
  companyName?: string
  managerName?: string
  phone?: string
  bizNumber?: string
  paymentTerm?: string
  paymentTermValue?: string | number
  taxRepresentative?: string
  taxEmail?: string
  taxAddress?: string
  taxBizType?: string
  taxBizItem?: string
  isPinned?: boolean
  scopedToVehicleNumber?: string
  commEnabled?: boolean
  commType?: string
  commValue?: string | number
  fixedRouteLinked?: boolean
  fixedUnitPrice?: string | number
  palletOn?: boolean
  palletPrice?: string | number
  id?: string
  supabaseId?: string
}
