import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { monthSettlementSummary } from './monthSettlement.js'

const YEAR = 2026
const MONTH = 8 // September (0-based)

/** @param {Record<string, unknown>} record */
function day(record) {
  return record
}

describe('monthSettlementSummary', () => {
  test('1. 고정노선 + 거래처 연동 없음 → fixedBaseFare, fareByClient 비어있음', () => {
    const workData = {
      '2026-09-01': day({ fixedCount: 3 }),
      '2026-09-02': day({ fixedCount: 2 }),
    }
    const result = monthSettlementSummary(workData, YEAR, MONTH, {
      unitPrice: 10000,
      fixedRouteClient: null,
      activeFixedOn: true,
    })
    assert.equal(result.trips, 5)
    assert.equal(result.fixedBaseFare, 50000)
    assert.equal(result.fare, 50000)
    assert.deepEqual(result.fareByClient, {})
    assert.equal(result.commissionTotal, 0)
  })

  test('2. 고정노선 + 거래처 연동 + 수수료 percent → fare/commission/label 반영', () => {
    const client = {
      id: 'c1',
      companyName: '한진',
      commEnabled: true,
      commType: 'percent',
      commValue: 10,
    }
    const result = monthSettlementSummary(
      { '2026-09-01': day({ fixedCount: 2 }) },
      YEAR,
      MONTH,
      { unitPrice: 50000, fixedRouteClient: client, activeFixedOn: true, clients: [client] },
    )
    assert.equal(result.fareByClient['한진'], 100000)
    assert.equal(result.commissionByClient['한진'], 10000)
    assert.equal(result.commissionLabelByClient['한진'], '10%')
    assert.equal(result.fixedBaseFare, 0)
    assert.equal(result.commissionTotal, 10000)
  })

  test('3. 콜상세 — 스냅샷 우선 / 폴백 / 미등록(defaultBaseFare)', () => {
    const clients = [
      { id: 'c1', companyName: '등록사', commEnabled: true, commType: 'percent', commValue: 5 },
    ]
    const workData = {
      '2026-09-01': day({
        callDetails: [
          {
            client: '등록사',
            fare: 100000,
            commissionSnapshot: { enabled: true, type: 'percent', value: 10 },
          },
          {
            client: '등록사',
            fare: 50000,
            // 스냅샷 없음 → 거래처 설정 5% 폴백
          },
          {
            client: '미등록사',
            fare: 30000,
          },
          {
            // 거래처명 없음
            fare: 20000,
          },
        ],
      }),
    }
    const result = monthSettlementSummary(workData, YEAR, MONTH, { clients })
    assert.equal(result.fareByClient['등록사'], 150000)
    assert.equal(result.commissionByClient['등록사'], 10000 + 2500)
    assert.equal(result.commissionLabelByClient['등록사'], '5%')
    assert.equal(result.defaultBaseFare, 50000)
    assert.equal(result.fare, 200000)
    assert.equal(result.callTrips, 4)
  })

  test('4. 파렛트 on/off 게이트 — 같은 데이터, activeFixedOn/palletOn 조합', () => {
    const client = {
      id: 'c1',
      companyName: '고정사',
      palletOn: true,
      palletPrice: 3000,
    }
    const workData = { '2026-09-01': day({ palletCount: 4 }) }
    const on = monthSettlementSummary(workData, YEAR, MONTH, {
      fixedRouteClient: client,
      activeFixedOn: true,
    })
    assert.equal(on.palletFare, 12000)

    const fixedOff = monthSettlementSummary(workData, YEAR, MONTH, {
      fixedRouteClient: client,
      activeFixedOn: false,
    })
    assert.equal(fixedOff.palletFare, 0)

    const palletOff = monthSettlementSummary(workData, YEAR, MONTH, {
      fixedRouteClient: { ...client, palletOn: false },
      activeFixedOn: true,
    })
    assert.equal(palletOff.palletFare, 0)
  })

  test('5. 서브차량 수수료 direct/percent + main이면 항상 0', () => {
    const workData = {
      '2026-09-01': day({
        fixedCount: 2,
        callDetails: [{ fare: 40000, client: 'A' }],
      }),
    }
    const percentCar = {
      number: '12가3456',
      type: 'sub',
      commEnabled: true,
      commType: 'percent',
      commission: 10,
    }
    const directCar = {
      number: '12가3456',
      type: 'sub',
      commEnabled: true,
      commType: 'direct',
      commission: 5000,
    }

    const main = monthSettlementSummary(workData, YEAR, MONTH, {
      logId: 'main',
      unitPrice: 10000,
      car: percentCar,
    })
    assert.equal(main.subCarComm, 0)

    // fare=2*10000+40000=60000, commission=0, workCount=2+1=3
    const pct = monthSettlementSummary(workData, YEAR, MONTH, {
      logId: '12가3456',
      unitPrice: 10000,
      car: percentCar,
    })
    assert.equal(pct.subCarComm, 6000)
    assert.match(pct.subCarCommLabel, /3456 차량 10%/)

    const dir = monthSettlementSummary(workData, YEAR, MONTH, {
      logId: '12가3456',
      unitPrice: 10000,
      car: directCar,
    })
    assert.equal(dir.subCarComm, 15000)
    assert.match(dir.subCarCommLabel, /3456 차량 건당 5,000원/)
  })

  test('6. 실거리 — 콜상세 distanceKm 있음 vs dailyDistance 폴백', () => {
    const withDetail = monthSettlementSummary(
      {
        '2026-09-01': day({
          dailyDistance: 999,
          callDetails: [{ fare: 0, distanceKm: '12.5' }, { fare: 0, distanceKm: '7.5' }],
        }),
      },
      YEAR,
      MONTH,
    )
    assert.equal(withDetail.distanceKm, 20)

    const fallback = monthSettlementSummary(
      {
        '2026-09-02': day({
          dailyDistance: 55,
          callDetails: [{ fare: 1000 }],
        }),
      },
      YEAR,
      MONTH,
    )
    assert.equal(fallback.distanceKm, 55)
  })

  test('7. 지출 3종 — 메인/서브 항목이 섞여도 logId로 분리', () => {
    const expenses = [
      { id: '1', kind: 'maint', date: '2026-09-01', cost: 10000 },
      { id: '2', kind: 'fuel', date: '2026-09-01', cost: 20000 },
      { id: '3', kind: 'misc', date: '2026-09-02', cost: 3000 },
      { id: '4', kind: 'maint', date: '2026-09-01', cost: 7000, vehicleNumber: '22나2222' },
      { id: '5', kind: 'fuel', date: '2026-09-01', cost: 8000, vehicleNumber: '22나2222' },
      { id: '6', kind: 'misc', date: '2026-09-03', cost: 1500, vehicleNumber: '22나2222' },
      { id: '7', kind: 'maint', date: '2026-08-31', cost: 99999 },
    ]
    const main = monthSettlementSummary({}, YEAR, MONTH, { logId: 'main', expenses })
    assert.equal(main.maint, 10000)
    assert.equal(main.fuel, 20000)
    assert.equal(main.misc, 3000)

    const sub = monthSettlementSummary({}, YEAR, MONTH, {
      logId: '22나2222',
      expenses,
      car: { number: '22나2222', type: 'sub' },
    })
    assert.equal(sub.maint, 7000)
    assert.equal(sub.fuel, 8000)
    assert.equal(sub.misc, 1500)
  })

  test('8. 부가세·합계 공식 — 손으로 계산한 기대값과 명시적 assert', () => {
    const client = {
      id: 'c1',
      companyName: '거래처A',
      commEnabled: true,
      commType: 'percent',
      commValue: 10,
    }
    const workData = {
      '2026-09-01': day({
        fixedCount: 1,
        palletCount: 2,
        callDetails: [{ client: '거래처A', fare: 40000 }],
      }),
    }
    const result = monthSettlementSummary(workData, YEAR, MONTH, {
      unitPrice: 100000,
      fixedRouteClient: { ...client, palletOn: true, palletPrice: 5000 },
      activeFixedOn: true,
      clients: [client],
    })
    // fare = 100000 + 40000 = 140000
    // pallet = 2 * 5000 = 10000
    // commission = floor(100000*0.1) + floor(40000*0.1) = 10000 + 4000 = 14000
    // vat = round((140000+10000)*0.1) = 15000
    // total = 140000 + 10000 - 14000 - 0 + 15000 = 151000
    assert.equal(result.fare, 140000)
    assert.equal(result.palletFare, 10000)
    assert.equal(result.commissionTotal, 14000)
    assert.equal(result.vat, 15000)
    assert.equal(result.total, 151000)
  })
})
