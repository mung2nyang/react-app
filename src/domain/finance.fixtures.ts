import type { CarLike, DriverLinkLike, FinanceSettings, WorkDataByLogId } from './financeTypes.ts'
import type { ClientLike } from './clientTypes.ts'
import type { ExpenseItem } from './expenseTypes.ts'

// 픽스처는 FinanceSettings로 통하되, 소비 측(finance.test.js 등)이 cars/clients/
// driverLinks를 옵셔널 체크 없이 바로 쓰므로 그 3개만 필수로 좁힌다.
export type FixtureSettings = FinanceSettings & { cars: Array<CarLike>, clients: Array<ClientLike>, driverLinks: Array<DriverLinkLike> }

export const MONTH_KEY = '2026-05'

/** receivables-invoices.test.js 부분입금·전액수금 시나리오용 */
export const FIXTURE_DETAIL_ID_MAY10_MAIN: string = 'trp-fixture-may10-0'

export const FIXTURE_SETTINGS: FixtureSettings = {
  paymentOn: true,
  subPaymentOn: true,
  fixedOn: true,
  subFixedOn: true,
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
      shareRevenueWithOwner: true,
      commEnabled: true,
      commType: 'direct',
      commission: '20,000',
      driverName: '박기사',
      driverIncomeType: 'employee',
      insuranceOn: true,
      driverPayMode: 'salary',
      driverSalaryAmount: '2000000',
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

export const FIXTURE_WORK: WorkDataByLogId = {
  main: {
    '2026-05-10': {
      isOff: false,
      fixedCount: 2,
      palletCount: 3,
      callDetails: [
        {
          id: FIXTURE_DETAIL_ID_MAY10_MAIN,
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
          id: 'trp-fixture-may10-1',
          client: '한진',
          fare: '0',
          vatExempt: true,
          distanceType: '공차',
        },
        {
          id: 'trp-fixture-may10-2',
          client: '한진',
          fare: '20,000',
          distanceType: '혼짐',
          linkedLoadIndex: 'pending',
        },
        {
          id: 'trp-fixture-may10-3',
          client: '한진',
          fare: '10,000',
          distanceType: '혼짐',
          linkedLoadIndex: '0',
        },
      ],
      // 비용 필드는 finance.ts가 안 읽는다 — hydrate가 이 필드를 채운다는 별개 계약(hydrateMerge.test.js 등)의 예시라 남긴다.
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
        { id: 'trp-fixture-sub12-1', client: '대한', fare: 200000, insuranceFee: '3,000', workDate: '2026-05-12' },
      ],
      fixedCount: 1,
      fare: 250000,
    },
    '2026-04-01': {
      callDetails: [{ id: 'trp-fixture-sub12-2', client: '대한', fare: 999999 }],
    },
  },
  부산33나1111: {
    '2026-05-20': {
      callDetails: [{ id: 'trp-fixture-sub33-1', client: '직접', fare: 80000 }],
    },
  },
}

// getOwnerMonthlyFinanceDetail이 비용을 읽는 정본 expenses — 위 FIXTURE_WORK.main 비용 필드와 같은 날짜·금액이라 합계가 같은지 테스트가 확인한다.
export const FIXTURE_EXPENSES: Array<ExpenseItem> = [
  { id: 'fx-maint-1', kind: 'maint', date: '2026-05-10', name: '오일', cost: 30000 },
  { id: 'fx-fuel-1', kind: 'fuel', date: '2026-05-10', fuelType: '주유', cost: 80000, subsidy: 5000, liters: 40 },
  { id: 'fx-misc-1', kind: 'misc', date: '2026-05-10', name: '통행료', cost: 8000 },
  { id: 'fx-maint-2', kind: 'maint', date: '2026-05-11', name: '정비', cost: 20000 },
]
