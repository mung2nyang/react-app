// hydrateEmployedDriver.ts에서 분리.
// 서버 RPC 행 → 화면용 차량 정보로 바꾸는 순수 변환만 담는다(네트워크 호출 없음).
import { driverIncomeFieldsFromDraft } from '../../domain/driverIncomeDeductions.ts'
import type { LocalCar } from './hydrateMergeTypes.ts'

export function carFromAssignedSummary(row: { id: string, number?: string, type?: string, tonnage?: string, driver_pay_mode?: string | null, driver_salary_amount?: number | string | null, comm_enabled?: boolean | null, comm_type?: string | null, comm_value?: string | number | null, insurance_on?: boolean | null, driver_income_type?: string | null, withholding_on?: boolean | null, expense_rate?: string | null, insurance_rate?: string | null, driver_share_base?: string | null }): LocalCar {
  return {
    id: `car-${row.id}`,
    number: row.number || '',
    type: row.type === 'main' ? 'main' : 'sub',
    tonnage: row.tonnage || '',
    supabaseId: row.id,
    driverPayMode: row.driver_pay_mode || 'revenue',
    driverSalaryAmount: row.driver_salary_amount ?? '',
    commEnabled: !!row.comm_enabled,
    commType: row.comm_type || 'percent',
    commission: row.comm_value ?? '',
    // 산재보험료·3.3% 원천징수 계산에 쓰는 4개 필드 — 차량 폼과 같은 정규화 함수로 이상한 값을 기본값으로 되돌린다.
    ...driverIncomeFieldsFromDraft({
      driverIncomeType: row.driver_income_type ?? undefined,
      insuranceOn: row.insurance_on === true,
      withholdingOn: row.withholding_on === true,
      expenseRate: row.expense_rate ?? undefined,
      insuranceRate: row.insurance_rate ?? undefined,
    }),
    // 매출제 기사 몫 기준(로드맵 61) — 서버 함수 0024부터 옴. 없거나 모르는 값이면 기본(운송료 전체).
    driverShareBase: row.driver_share_base === 'afterClientCommission' ? 'afterClientCommission' : 'gross',
    infoType: 'existing',
    driverName: '',
    driverPhone: '',
    driverLinkId: '',
  }
}
