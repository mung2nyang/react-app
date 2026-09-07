// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildDetailReport,
  buildDetailReportFileName,
  buildReportFileName,
  detailReportClientOptions,
} from './report.js'

describe('buildReportFileName', () => {
  test('연·월 조합을 원본 패턴으로 만든다', () => {
    assert.equal(buildReportFileName(2026, 8), '2026년_9월_운송비내역서.pdf')
    assert.equal(buildReportFileName(2025, 11), '2025년_12월_운송비내역서.pdf')
  })

  test('한 자리 월은 0으로 패딩하지 않는다(원본과 동일)', () => {
    assert.equal(buildReportFileName(2026, 0), '2026년_1월_운송비내역서.pdf')
    assert.equal(buildReportFileName(2024, 4), '2024년_5월_운송비내역서.pdf')
  })
})

describe('buildDetailReportFileName', () => {
  test('ALL이면 전체, 아니면 거래처명이 파일명에 들어간다', () => {
    assert.equal(buildDetailReportFileName(2026, 8, 'ALL'), '2026년_9월_운송비내역서(세부)_전체.pdf')
    assert.equal(buildDetailReportFileName(2026, 0, '한진'), '2026년_1월_운송비내역서(세부)_한진.pdf')
  })
})

describe('detailReportClientOptions', () => {
  test('등록 거래처 + 해당 월 콜상세 + 미지정 + ALL 선행', () => {
    const clients = [{ id: 'c1', companyName: '한진' }]
    const workData = {
      '2026-05-10': {
        callDetails: [
          { id: 'd1', client: '미등록업체', fare: '10000' },
          { id: 'd2', client: '한진', fare: '20000' },
        ],
      },
      '2026-06-01': {
        callDetails: [{ id: 'd3', client: '다른달', fare: '90000' }],
      },
    }
    const options = detailReportClientOptions(workData, 2026, 4, clients)
    assert.equal(options[0], 'ALL')
    assert.ok(options.includes('한진'))
    assert.ok(options.includes('미등록업체'))
    assert.ok(options.includes('미지정'))
    assert.equal(options.includes('다른달'), false)
    assert.equal(options[options.length - 1], '미지정')
  })
})

describe('buildDetailReport', () => {
  const clients = [
    { id: 'c1', companyName: '한진', commEnabled: true, commType: 'percent', commValue: 10 },
    { id: 'c2', companyName: '동부', commEnabled: true, commType: 'direct', commValue: '3000' },
  ]
  const workData = {
    '2026-05-05': {
      fixedCount: 2,
      callDetails: [
        { id: 'a', client: '한진', fare: '100000', loadLoc: '서울', unloadLoc: '부산' },
        { id: 'b', client: '미등록', fare: '20000', loadLoc: '인천', unloadLoc: '수원' },
      ],
    },
    '2026-05-06': {
      isOff: true,
      callDetails: [{ id: 'off', client: '한진', fare: '50000' }],
    },
    '2026-05-07': {
      callDetails: [
        { id: 'c', client: '동부', fare: '50000', loadLoc: '대전', unloadLoc: '광주' },
        { id: 'd', fare: '8000' },
      ],
    },
  }

  test('ALL이면 콜상세만 포함하고 고정노선은 안 섞인다', () => {
    const report = buildDetailReport(workData, 2026, 4, 'ALL', { clients })
    assert.equal(report.items.length, 4)
    assert.equal(report.items.some((item) => item.fare === 2), false)
    assert.equal(report.totalFare, 100000 + 20000 + 50000 + 8000)
  })

  test('특정 거래처로 필터하면 그 거래처만 나온다', () => {
    const report = buildDetailReport(workData, 2026, 4, '한진', { clients })
    assert.equal(report.items.length, 1)
    assert.equal(report.items[0].client, '한진')
    assert.equal(report.totalFare, 100000)
  })

  test('등록 거래처는 monthFareByClient, 미등록/미지정은 defaultBaseFare', () => {
    const report = buildDetailReport(workData, 2026, 4, 'ALL', { clients })
    assert.equal(report.monthFareByClient['한진'], 100000)
    assert.equal(report.monthFareByClient['동부'], 50000)
    assert.equal(report.defaultBaseFare, 20000 + 8000)
  })

  test('commissionSnapshot이 있으면 우선, 없으면 현재 거래처 설정 폴백', () => {
    const data = {
      '2026-05-10': {
        callDetails: [
          {
            id: 'snap',
            client: '한진',
            fare: '100000',
            commissionSnapshot: { enabled: true, type: 'direct', value: '7000' },
          },
          {
            id: 'fallback',
            client: '한진',
            fare: '100000',
          },
        ],
      },
    }
    const report = buildDetailReport(data, 2026, 4, 'ALL', { clients })
    assert.equal(report.totalCommission, 7000 + 10000)
    assert.equal(report.clientCommLabels['한진'], '10%')
  })

  test('isOff 레코드는 완전히 제외된다', () => {
    const report = buildDetailReport(workData, 2026, 4, 'ALL', { clients })
    assert.equal(report.items.some((item) => item.fare === 50000 && item.client === '한진'), false)
  })
})
