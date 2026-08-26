export const MONTH_KEY = '2026-05'

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
