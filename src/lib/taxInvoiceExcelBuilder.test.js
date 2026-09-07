// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import ExcelJS from 'exceljs'
import { buildTaxInvoiceExcelFileName } from './taxInvoiceExcel.js'
import { buildTaxInvoiceWorkbook } from './taxInvoiceExcelBuilder.js'

/** @type {import('../domain/financeTypes.js').FinanceSettings} */
const settings = {
  bizName: '차주회사',
  bizNumber: '123-45-67890',
  bizRepresentative: '홍길동',
  bizAddress: '서울시',
  bizType: '운송',
  bizItem: '화물',
  bizEmail: 'owner@example.com',
  cars: [{ id: 'car-1', type: 'main', number: '12가3456' }],
}

const profile = { bankName: '국민', accountNumber: '123-456', name: '홍길동' }

/** @type {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} */
const salesItem = {
  id: 'sales|2026-05|c1',
  flow: 'sales',
  clientName: '한진/물류',
  clientBizNumber: '111-22-33333',
  clientRepresentative: '김거래',
  clientAddress: '부산시',
  clientBizType: '물류',
  clientBizItem: '운송',
  clientEmail: 'client@example.com',
  supplyAmount: 100000,
  taxAmount: 10000,
  totalAmount: 110000,
  itemName: '화물운송료',
  remark: '비고1',
  issueDate: '2026-05-31',
  carNumber: '12가3456',
}

describe('buildTaxInvoiceWorkbook', () => {
  /** @param {import('exceljs').Workbook} workbook @param {string} name */
  function sheetOf(workbook, name) {
    const sheet = workbook.getWorksheet(name)
    assert.ok(sheet, `${name} 시트가 없습니다`)
    return sheet
  }

  test('공급가액·세액·합계금액이 숫자로 정확한 셀에 들어간다', () => {
    const workbook = buildTaxInvoiceWorkbook(ExcelJS, salesItem, settings, profile, '2026-05')
    const sheet = sheetOf(workbook, '세금계산서')
    assert.equal(typeof sheet.getCell('C9').value, 'number')
    assert.equal(sheet.getCell('C9').value, 100000)
    assert.equal(typeof sheet.getCell('E9').value, 'number')
    assert.equal(sheet.getCell('E9').value, 10000)
    assert.equal(typeof sheet.getCell('A18').value, 'number')
    assert.equal(sheet.getCell('A18').value, 110000)
  })

  test('공급자 사업자번호·상호는 getTaxInvoiceSupplierBiz 결과와 일치한다', () => {
    const workbook = buildTaxInvoiceWorkbook(ExcelJS, salesItem, settings, profile, '2026-05')
    const sheet = sheetOf(workbook, '세금계산서')
    assert.equal(sheet.getCell('C3').value, '123-45-67890')
    assert.equal(sheet.getCell('C4').value, '차주회사')

    const withSupplierBiz = {
      ...salesItem,
      supplierBiz: {
        name: '차량사업자',
        bizNumber: '999-88-77777',
        representative: '이대표',
        address: '',
        bizType: '',
        bizItem: '',
        email: '',
      },
    }
    const workbook2 = buildTaxInvoiceWorkbook(ExcelJS, withSupplierBiz, settings, profile, '2026-05')
    const sheet2 = sheetOf(workbook2, '세금계산서')
    assert.equal(sheet2.getCell('C3').value, '999-88-77777')
    assert.equal(sheet2.getCell('C4').value, '차량사업자')
  })

  test('공급받는자(거래처) 사업자번호·상호가 일치하고 매입이면 supplier/buyer가 뒤바뀐다', () => {
    const salesBook = buildTaxInvoiceWorkbook(ExcelJS, salesItem, settings, profile, '2026-05')
    const salesSheet = sheetOf(salesBook, '세금계산서')
    assert.equal(salesSheet.getCell('H3').value, '111-22-33333')
    assert.equal(salesSheet.getCell('H4').value, '한진/물류')

    /** @type {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} */
    const purchaseItem = { ...salesItem, flow: 'purchase', id: 'purchase|2026-05|c1' }
    const purchaseBook = buildTaxInvoiceWorkbook(ExcelJS, purchaseItem, settings, profile, '2026-05')
    const purchaseSheet = sheetOf(purchaseBook, '세금계산서')
    assert.equal(purchaseSheet.getCell('C3').value, '111-22-33333')
    assert.equal(purchaseSheet.getCell('C4').value, '한진/물류')
    assert.equal(purchaseSheet.getCell('H3').value, '123-45-67890')
    assert.equal(purchaseSheet.getCell('H4').value, '차주회사')
  })

  test('입력자료 시트 2행이 헤더 순서로 실제 값을 담는다', () => {
    const workbook = buildTaxInvoiceWorkbook(ExcelJS, salesItem, settings, profile, '2026-05')
    const upload = sheetOf(workbook, '입력자료')
    assert.equal(upload.getCell(1, 1).value, '작성일자')
    assert.equal(upload.getCell(2, 1).value, '2026-05-31')
    assert.equal(upload.getCell(2, 2).value, '123-45-67890')
    assert.equal(upload.getCell(2, 3).value, '차주회사')
    assert.equal(upload.getCell(2, 9).value, '111-22-33333')
    assert.equal(upload.getCell(2, 10).value, '한진/물류')
    assert.equal(upload.getCell(2, 16).value, '화물운송료')
    assert.equal(upload.getCell(2, 18).value, 100000)
    assert.equal(upload.getCell(2, 19).value, 10000)
    assert.equal(upload.getCell(2, 20).value, 110000)
  })
})

describe('buildTaxInvoiceExcelFileName', () => {
  test('특수문자가 포함된 거래처명은 파일명에서 _ 로 치환된다', () => {
    const name = buildTaxInvoiceExcelFileName('2026-05', salesItem)
    assert.equal(name, '2026-05_한진_물류_매출 발행_계산서.xlsx')
    assert.equal(name.includes('/'), false)
  })
})
