// @ts-check
// 재감사 10차(FAIL 지적 4번) — 이 파일도 이제 // @ts-check 대상이다.
/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./financeTypes.js').DriverLinkLike} DriverLinkLike */
/** @typedef {import('./clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */

// 픽스처는 FinanceSettings로 통하되, 소비 측(finance.test.js 등)이 cars/clients/
// driverLinks를 옵셔널 체크 없이 바로 쓰므로 그 3개만 필수로 좁힌다.
/** @typedef {FinanceSettings & { cars: Array<CarLike>, clients: Array<ClientLike>, driverLinks: Array<DriverLinkLike> }} FixtureSettings */

export const MONTH_KEY = '2026-05'

/** @type {FixtureSettings} */
export const FIXTURE_SETTINGS = {
  paymentOn: true,
  subPaymentOn: true,
  fixedOn: true,
  subFixedOn: true,
  defaultDriverSettlementMode: 'company',
  driverInvoiceBasis: 'net',
  bizName: '보리운수',
  bizNumber: '123-45-67890',
  userName: '차주',
  clients: [
    {
      id: 'client-hanjin',
      companyName: '한진',
      fixedRouteLinked: true,
      fixedUnitPrice: '250,000',
      palletOn: true,
      palletPrice: '10,000',
      commEnabled: true,
      commType: 'percent',
      commValue: '10',
    },
  ],
  cars: [
    { type: 'main', number: '서울00가0000' },
    {
      type: 'sub',
      number: '서울12가3456',
      settlementMode: 'company',
      commEnabled: true,
      commType: 'percent',
      commission: '15',
      insuranceOn: true,
      shareRevenueWithOwner: true,
      driverName: '김기사',
    },
    {
      type: 'sub',
      number: '부산33나1111',
      settlementMode: 'driver_direct',
      shareRevenueWithOwner: true,
      commEnabled: true,
      commType: 'direct',
      commission: '20,000',
    },
  ],
  driverLinks: [
    {
      id: 'link-1',
      vehicleNumber: '서울12가3456',
      assignmentStart: '2026-05-01',
      assignmentEnd: '2026-05-31',
      status: 'linked',
    },
  ],
}

/** @type {WorkDataByLogId} */
export const FIXTURE_WORK = {
  main: {
    '2026-05-10': {
      isOff: false,
      fixedCount: 2,
      palletCount: 3,
      callDetails: [
        {
          client: '한진',
          fare: '100,000',
          vatExempt: false,
          distanceType: '편도',
          distanceKm: '40',
          departureTime: '08:00',
          arrivalTime: '10:30',
          paymentDueDate: '2026-04-01',
          payments: [],
        },
        {
          client: '한진',
          fare: '0',
          vatExempt: true,
          distanceType: '공차',
        },
        {
          client: '한진',
          fare: '20,000',
          distanceType: '혼짐',
          linkedLoadIndex: 'pending',
        },
        {
          client: '한진',
          fare: '10,000',
          distanceType: '혼짐',
          linkedLoadIndex: '0',
        },
      ],
      // maintItems/fuelItems/miscItems는 더 이상 finance.js가 안 읽는다(재감사 FAIL
      // 지적 2번 — 비용은 canonical expenses 배열이 정본이다, 아래 FIXTURE_EXPENSES).
      // 그래도 여기 남겨 둔 이유: hydrateMerge.test.js 등 다른 곳에서 여전히 "클라우드
      // hydrate가 day record에 이 필드를 채워 넣는다"는 별개 계약을 테스트하고,
      // FIXTURE_WORK 자체가 그 계약의 예시 데이터이기도 하다.
      maintItems: [{ name: '오일', fare: '30,000' }],
      fuelItems: [{ type: '주유', cost: '80,000', subsidy: '5,000', liter: 40 }],
      miscItems: [{ name: '통행료', fare: '8,000' }],
    },
    '2026-05-11': {
      isOff: true,
      maintItems: [{ name: '정비', fare: '20,000' }],
    },
  },
  서울12가3456: {
    '2026-05-12': {
      callDetails: [
        { client: '대한', fare: 200000, insuranceFee: '3,000', workDate: '2026-05-12' },
      ],
      fixedCount: 1,
      fare: 250000,
    },
    '2026-04-01': {
      callDetails: [{ client: '대한', fare: 999999 }],
    },
  },
  부산33나1111: {
    '2026-05-20': {
      callDetails: [{ client: '직접', fare: 80000 }],
    },
  },
}

// 재감사(FAIL 지적 2번) — getOwnerMonthlyFinanceDetail이 비용을 읽는 canonical
// expenses 배열. 위 FIXTURE_WORK.main의 maintItems/fuelItems/miscItems와 같은 날짜·
// 금액으로 맞춰 뒀다(부기: finance.js는 더 이상 그 필드들을 안 읽는다 — 여기서
// 값이 같은 건 "합계가 같아야 정상"이라는 걸 테스트가 확인하기 위해서일 뿐,
// finance.js가 두 곳을 같이 읽는다는 뜻이 아니다).
/** @type {Array<ExpenseItem>} */
export const FIXTURE_EXPENSES = [
  { id: 'fx-maint-1', kind: 'maint', date: '2026-05-10', name: '오일', cost: 30000 },
  { id: 'fx-fuel-1', kind: 'fuel', date: '2026-05-10', fuelType: '주유', cost: 80000, subsidy: 5000, liters: 40 },
  { id: 'fx-misc-1', kind: 'misc', date: '2026-05-10', name: '통행료', cost: 8000 },
  { id: 'fx-maint-2', kind: 'maint', date: '2026-05-11', name: '정비', cost: 20000 },
]

/** @type {Array<DriverLinkLike>} */
export const OVERLAP_LINKS = [
  {
    id: 'a',
    vehicleNumber: '서울12가3456',
    assignmentStart: '2026-05-01',
    assignmentEnd: '2026-05-31',
    status: 'pending',
  },
  {
    id: 'b',
    vehicleNumber: '서울12가3456',
    assignmentStart: '2026-06-01',
    assignmentEnd: '',
    status: 'linked',
  },
  {
    id: 'c',
    vehicleNumber: '서울12가3456',
    assignmentStart: '2026-05-10',
    assignmentEnd: '2026-05-20',
    status: 'disconnected',
  },
]
