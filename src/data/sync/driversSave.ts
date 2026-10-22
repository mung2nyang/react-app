// 기사 저장(saveDrivers→commitDrivers). 화면 읽기는 useOwnerDrivers / readOwnerDrivers, 계산 규칙은 domain/drivers.ts.
import { commitDrivers } from '../store/commitHelpers.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'

export function saveDrivers(ownerKey: string, items: DriverRecord[]) {
  commitDrivers(ownerKey, items)
}
