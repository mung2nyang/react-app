// @ts-check
// 사업자번호 10자리를 다 쳤는데 검증번호가 안 맞으면 칸 아래 안내만 띄운다(저장은 막지 않음).
import { isBizNumberChecksumOk } from '../../domain/formatPhone.js'

/** @param {{ value: string|undefined }} props */
export default function BizNumberHint({ value }) {
  if (isBizNumberChecksumOk(value || '')) return null
  return <p className="biz-number-hint">* 사업자등록번호를 다시 확인해 주세요</p>
}
