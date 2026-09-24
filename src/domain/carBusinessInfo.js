// @ts-check
// 기사차량별 사업자정보·정산 계좌 — 입력폼 값 ↔ car.businessInfo / car.personalInfo 변환(순수).

/** @typedef {import('./financeTypes.js').CarLike} CarLike */

/**
 * @typedef {Object} CarBusinessForm
 * @property {boolean} sameAsOwner
 * @property {string} name
 * @property {string} bizNumber
 * @property {string} representative
 * @property {string} address
 * @property {string} bizType
 * @property {string} bizItem
 * @property {string} email
 * @property {string} bank
 * @property {string} account
 * @property {string} accountHolder
 */

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 차량 → 입력폼 초기값. businessInfo가 없거나 sameAsOwner면 "내 사업자 정보와 동일"(원본 getCarBusinessInfo와 같음).
 * @param {CarLike|null|undefined} car @returns {CarBusinessForm}
 */
export function carToBusinessForm(car) {
  const biz = car?.businessInfo
  const person = car?.personalInfo
  const same = !biz || !!biz.sameAsOwner
  return {
    sameAsOwner: same,
    name: same ? '' : text(biz?.name),
    bizNumber: same ? '' : text(biz?.bizNumber),
    representative: same ? '' : text(biz?.representative),
    address: same ? '' : text(biz?.address),
    bizType: same ? '' : text(biz?.bizType),
    bizItem: same ? '' : text(biz?.bizItem),
    email: same ? '' : text(biz?.email),
    bank: same ? '' : text(person?.bank),
    account: same ? '' : text(person?.account),
    accountHolder: same ? '' : text(person?.accountHolder),
  }
}

/**
 * 입력폼 → 차량. 동일 스위치 켜짐이면 businessInfo는 값을 복사하지 않고 플래그만 저장하고,
 * personalInfo의 사업자 6칸(기사 매입 계산서 상대방 정보)과 계좌 3칸은 비운다(차주 것을 따라감).
 * 꺼짐이면 입력값을 businessInfo에 저장하고 대표자→name·사업자번호·주소·업태·종목·이메일과
 * 계좌(그 사업자 명의)를 personalInfo에 복사한다. personalInfo의 그 밖 기존 값(driverName·phone 등)은 보존한다.
 * @param {CarLike} car @param {CarBusinessForm} form @returns {CarLike}
 */
export function applyBusinessForm(car, form) {
  const same = !!form.sameAsOwner
  const pick = (/** @type {string} */ value) => (same ? '' : text(value))
  return {
    ...car,
    businessInfo: {
      sameAsOwner: same,
      name: pick(form.name),
      bizNumber: pick(form.bizNumber),
      representative: pick(form.representative),
      address: pick(form.address),
      bizType: pick(form.bizType),
      bizItem: pick(form.bizItem),
      email: pick(form.email),
    },
    personalInfo: {
      ...car.personalInfo,
      name: pick(form.representative),
      bizNumber: pick(form.bizNumber),
      address: pick(form.address),
      bizType: pick(form.bizType),
      bizItem: pick(form.bizItem),
      email: pick(form.email),
      bank: pick(form.bank),
      account: pick(form.account),
      accountHolder: pick(form.accountHolder),
    },
  }
}
