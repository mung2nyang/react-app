// @ts-check
// 원본 finance.js:525-697 세금계산서 엑셀 양식 — 셀 주소·병합이 한 덩어라 §6 응집도 우선(~250+ 허용).
import { getTaxInvoiceFlowMeta, getTaxInvoiceSupplierBiz } from '../domain/financeTaxInvoiceEntries.js'

/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */

/**
 * @param {typeof import('exceljs')} ExcelJS
 * @param {InvoiceLike} item
 * @param {FinanceSettings} settings
 * @param {{ bankName?: string, accountNumber?: string, name?: string }} profile
 * @param {string} monthKey
 */
export function buildTaxInvoiceWorkbook(ExcelJS, item, settings, profile, monthKey) {
  const resolvedSupplierBiz = getTaxInvoiceSupplierBiz(item, settings)
  const companyParty = {
    bizNumber: resolvedSupplierBiz.bizNumber || '',
    name: resolvedSupplierBiz.name || '',
    representative: resolvedSupplierBiz.representative || '',
    address: resolvedSupplierBiz.address || '',
    bizType: resolvedSupplierBiz.bizType || '',
    bizItem: resolvedSupplierBiz.bizItem || '',
    email: resolvedSupplierBiz.email || '',
  }
  const otherParty = {
    bizNumber: item.clientBizNumber || '',
    name: item.clientName || '',
    representative: item.clientRepresentative || '',
    address: item.clientAddress || '',
    bizType: item.clientBizType || '',
    bizItem: item.clientBizItem || '',
    email: item.clientEmail || '',
  }
  const supplier = item.flow === 'purchase' ? otherParty : companyParty
  const buyer = item.flow === 'purchase' ? companyParty : otherParty
  const issueDate = item.issueDate || `${monthKey}-01`
  const flowMeta = getTaxInvoiceFlowMeta(/** @type {'sales'|'purchase'|'commission'} */ (item.flow || 'sales'))

  const workbook = new ExcelJS.Workbook()
  workbook.creator = settings.bizName || '운행일지'
  workbook.created = new Date()
  workbook.subject = `${monthKey} ${item.itemName || flowMeta.itemName}`

  const sheet = workbook.addWorksheet('세금계산서', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 },
    },
    views: [{ showGridLines: false }],
  })
  const widths = [5, 10, 18, 10, 14, 5, 10, 18, 10, 14]
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.properties.defaultRowHeight = 21
  sheet.pageSetup.printArea = 'A1:J19'

  const thinBlue = /** @type {import('exceljs').Border} */ ({ style: 'thin', color: { argb: 'FF8EA9D6' } })
  const mediumBlue = /** @type {import('exceljs').Border} */ ({ style: 'medium', color: { argb: 'FF365B9D' } })
  const allThin = /** @type {Partial<import('exceljs').Borders>} */ ({ top: thinBlue, left: thinBlue, bottom: thinBlue, right: thinBlue })
  const supplierFill = 'FFFFFFFF'
  const supplierSectionFill = 'FFFFD9D9'
  const supplierLabelFill = 'FFFFF2F2'
  const buyerFill = 'FFFFFFFF'
  const buyerSectionFill = 'FFC2D9F2'
  const buyerLabelFill = 'FFF2F5FF'
  const headerFill = 'FFF1F3F7'
  const baseFont = { name: '맑은 고딕', size: 10, color: { argb: 'FF222222' } }

  sheet.mergeCells('A1:E2')
  sheet.getCell('A1').value = '전자세금계산서'
  sheet.getCell('A1').font = { ...baseFont, size: 18, bold: true }
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.mergeCells('F1:G1'); sheet.getCell('F1').value = '승인번호'
  sheet.mergeCells('H1:J1'); sheet.getCell('H1').value = '홈택스 발급 후 입력'
  sheet.mergeCells('F2:G2'); sheet.getCell('F2').value = '작성 구분'
  sheet.mergeCells('H2:J2'); sheet.getCell('H2').value = Number(item.taxAmount) > 0 ? '일반 과세' : '면세'

  sheet.mergeCells('A3:A7'); sheet.getCell('A3').value = '공\n급\n자'
  sheet.mergeCells('F3:F7'); sheet.getCell('F3').value = '공\n급\n받\n는\n자'
  sheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: supplierSectionFill } }
  sheet.getCell('F3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: buyerSectionFill } }
  sheet.getCell('A3').font = { ...baseFont, bold: true, color: { argb: 'FFCA3333' } }
  sheet.getCell('F3').font = { ...baseFont, bold: true, color: { argb: 'FF2468A6' } }
  sheet.getCell('A3').alignment = sheet.getCell('F3').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

  /**
   * @param {string} address
   * @param {unknown} value
   * @param {string} fill
   * @param {boolean} [bold]
   */
  const setTaxCell = (address, value, fill, bold = false) => {
    const cell = sheet.getCell(address)
    cell.value = /** @type {import('exceljs').CellValue} */ (value)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    cell.font = { ...baseFont, bold }
    cell.alignment = { horizontal: bold ? 'center' : 'left', vertical: 'middle', wrapText: true }
  }
  ;[3, 4, 5, 6, 7].forEach((row) => {
    ;['B', 'D'].forEach((col) => setTaxCell(`${col}${row}`, '', supplierLabelFill, true))
    ;['C', 'E'].forEach((col) => setTaxCell(`${col}${row}`, '', supplierFill))
    ;['G', 'I'].forEach((col) => setTaxCell(`${col}${row}`, '', buyerLabelFill, true))
    ;['H', 'J'].forEach((col) => setTaxCell(`${col}${row}`, '', buyerFill))
  })
  setTaxCell('B3', '등록번호', supplierLabelFill, true); setTaxCell('C3', supplier.bizNumber, supplierFill)
  setTaxCell('D3', '종사업자\n번호', supplierLabelFill, true); setTaxCell('E3', '', supplierFill)
  setTaxCell('B4', '상호\n(법인명)', supplierLabelFill, true); setTaxCell('C4', supplier.name, supplierFill)
  setTaxCell('D4', '대표자', supplierLabelFill, true); setTaxCell('E4', supplier.representative, supplierFill)
  setTaxCell('B5', '사업장 주소', supplierLabelFill, true); sheet.mergeCells('C5:E5'); setTaxCell('C5', supplier.address, supplierFill)
  setTaxCell('B6', '업태', supplierLabelFill, true); setTaxCell('C6', supplier.bizType, supplierFill)
  setTaxCell('D6', '종목', supplierLabelFill, true); setTaxCell('E6', supplier.bizItem, supplierFill)
  setTaxCell('B7', '이메일', supplierLabelFill, true); sheet.mergeCells('C7:E7'); setTaxCell('C7', supplier.email, supplierFill)

  setTaxCell('G3', '등록번호', buyerLabelFill, true); setTaxCell('H3', buyer.bizNumber, buyerFill)
  setTaxCell('I3', '종사업자\n번호', buyerLabelFill, true); setTaxCell('J3', '', buyerFill)
  setTaxCell('G4', '상호\n(법인명)', buyerLabelFill, true); setTaxCell('H4', buyer.name, buyerFill)
  setTaxCell('I4', '대표자', buyerLabelFill, true); setTaxCell('J4', buyer.representative, buyerFill)
  setTaxCell('G5', '사업장 주소', buyerLabelFill, true); sheet.mergeCells('H5:J5'); setTaxCell('H5', buyer.address, buyerFill)
  setTaxCell('G6', '업태', buyerLabelFill, true); setTaxCell('H6', buyer.bizType, buyerFill)
  setTaxCell('I6', '종목', buyerLabelFill, true); setTaxCell('J6', buyer.bizItem, buyerFill)
  setTaxCell('G7', '이메일', buyerLabelFill, true); sheet.mergeCells('H7:J7'); setTaxCell('H7', buyer.email, buyerFill)

  sheet.mergeCells('A8:B8'); sheet.getCell('A8').value = '작성일자'
  sheet.mergeCells('C8:D8'); sheet.getCell('C8').value = '공급가액'
  sheet.mergeCells('E8:F8'); sheet.getCell('E8').value = '세액'
  sheet.mergeCells('G8:J8'); sheet.getCell('G8').value = '수정사유'
  sheet.mergeCells('A9:B9'); sheet.getCell('A9').value = issueDate
  sheet.mergeCells('C9:D9'); sheet.getCell('C9').value = Number(item.supplyAmount)
  sheet.mergeCells('E9:F9'); sheet.getCell('E9').value = Number(item.taxAmount)
  sheet.mergeCells('G9:J9'); sheet.getCell('G9').value = ''
  sheet.mergeCells('A10:B10'); sheet.getCell('A10').value = '비고'
  const invoiceCar = item.carNumber
    ? (settings.cars || []).find((car) => car.number === item.carNumber)
    : (settings.cars || []).find((car) => car.type === 'main')
  const accountMemo = `${profile?.bankName || '-'} ${profile?.accountNumber || '-'} / ${profile?.name || '-'} / ${invoiceCar?.number || '-'}`
  sheet.mergeCells('C10:J10'); sheet.getCell('C10').value = accountMemo

  ;['A11', 'B11', 'C11', 'D11', 'E11', 'F11', 'H11', 'I11', 'J11'].forEach((address, index) => {
    sheet.getCell(address).value = ['월', '일', '품목', '규격', '수량', '단가', '공급가액', '세액', '비고'][index]
  })
  sheet.mergeCells('F11:G11')
  const [, month, day] = issueDate.split('-')
  sheet.getRow(12).values = [month, day, item.itemName || '화물운송료', '', 1, Number(item.supplyAmount), '', Number(item.supplyAmount), Number(item.taxAmount), item.remark || '']
  sheet.mergeCells('F12:G12')
  for (let row = 13; row <= 16; row += 1) {
    sheet.getRow(row).values = ['', '', '', '', '', '', '', '', '', '']
    sheet.mergeCells(`F${row}:G${row}`)
  }

  sheet.mergeCells('A17:B17'); sheet.getCell('A17').value = '합계금액'
  sheet.getCell('C17').value = '현금'; sheet.getCell('D17').value = '수표'; sheet.getCell('E17').value = '어음'
  sheet.mergeCells('F17:G17'); sheet.getCell('F17').value = '외상미수금'
  sheet.mergeCells('H17:J17'); sheet.getCell('H17').value = '청구 구분'
  sheet.mergeCells('A18:B18'); sheet.getCell('A18').value = Number(item.totalAmount)
  sheet.getCell('C18').value = ''; sheet.getCell('D18').value = ''; sheet.getCell('E18').value = ''
  sheet.mergeCells('F18:G18'); sheet.getCell('F18').value = Number(item.totalAmount)
  sheet.mergeCells('H18:J18'); sheet.getCell('H18').value = '이 금액을 청구함'
  sheet.mergeCells('A19:J19'); sheet.getCell('A19').value = '※ 본 문서는 세금계산서 작성 및 확인을 위한 자료입니다. 실제 발급 여부는 홈택스에서 확인해 주세요.'

  for (let row = 1; row <= 19; row += 1) {
    for (let col = 1; col <= 10; col += 1) {
      const cell = sheet.getCell(row, col)
      cell.border = allThin
      if (!cell.font || !cell.font.name) cell.font = baseFont
      cell.alignment = { ...(cell.alignment || {}), vertical: 'middle', wrapText: true }
    }
  }
  for (let col = 1; col <= 10; col += 1) {
    sheet.getCell(1, col).border = { ...sheet.getCell(1, col).border, top: mediumBlue }
    sheet.getCell(19, col).border = { ...sheet.getCell(19, col).border, bottom: mediumBlue }
  }
  for (let row = 1; row <= 19; row += 1) {
    sheet.getCell(row, 1).border = { ...sheet.getCell(row, 1).border, left: mediumBlue }
    sheet.getCell(row, 10).border = { ...sheet.getCell(row, 10).border, right: mediumBlue }
  }
  const supplierBorder = /** @type {import('exceljs').Border} */ ({ style: 'thin', color: { argb: 'FFFFD9D9' } })
  const buyerBorder = /** @type {import('exceljs').Border} */ ({ style: 'thin', color: { argb: 'FFC2D9F2' } })
  const supplierOuterBorder = /** @type {import('exceljs').Border} */ ({ style: 'medium', color: { argb: 'FFFFD9D9' } })
  const buyerOuterBorder = /** @type {import('exceljs').Border} */ ({ style: 'medium', color: { argb: 'FFC2D9F2' } })
  for (let row = 3; row <= 7; row += 1) {
    for (let col = 1; col <= 5; col += 1) sheet.getCell(row, col).border = { top: supplierBorder, left: supplierBorder, bottom: supplierBorder, right: supplierBorder }
    for (let col = 6; col <= 10; col += 1) sheet.getCell(row, col).border = { top: buyerBorder, left: buyerBorder, bottom: buyerBorder, right: buyerBorder }
    sheet.getCell(row, 1).border = { ...sheet.getCell(row, 1).border, left: supplierOuterBorder }
    sheet.getCell(row, 5).border = { ...sheet.getCell(row, 5).border, right: supplierOuterBorder }
    sheet.getCell(row, 6).border = { ...sheet.getCell(row, 6).border, left: buyerOuterBorder }
    sheet.getCell(row, 10).border = { ...sheet.getCell(row, 10).border, right: buyerOuterBorder }
  }
  for (let col = 1; col <= 5; col += 1) {
    sheet.getCell(3, col).border = { ...sheet.getCell(3, col).border, top: supplierOuterBorder }
    sheet.getCell(7, col).border = { ...sheet.getCell(7, col).border, bottom: supplierOuterBorder }
  }
  for (let col = 6; col <= 10; col += 1) {
    sheet.getCell(3, col).border = { ...sheet.getCell(3, col).border, top: buyerOuterBorder }
    sheet.getCell(7, col).border = { ...sheet.getCell(7, col).border, bottom: buyerOuterBorder }
  }
  for (let row = 1; row <= 19; row += 1) {
    sheet.getCell(row, 10).border = { ...sheet.getCell(row, 10).border, right: mediumBlue }
  }
  ;['B3', 'D3', 'B4', 'D4', 'B5', 'B6', 'D6', 'B7'].forEach((address) => {
    sheet.getCell(address).font = { ...baseFont, bold: true, color: { argb: 'FFAF5F5F' } }
  })
  ;['G3', 'I3', 'G4', 'I4', 'G5', 'G6', 'I6', 'G7'].forEach((address) => {
    sheet.getCell(address).font = { ...baseFont, bold: true, color: { argb: 'FF3A77A2' } }
  })
  ;[8, 11, 17].forEach((row) => {
    sheet.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFill } }
      cell.font = { ...baseFont, bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
  })
  ;[1, 2].forEach((row) => {
    for (let col = 1; col <= 10; col += 1) sheet.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFill } }
  })
  ;['F1', 'F2', 'A8', 'C8', 'E8', 'G8', 'A10', 'A11', 'B11', 'C11', 'D11', 'E11', 'F11', 'H11', 'I11', 'J11', 'A17', 'C17', 'D17', 'E17', 'F17', 'H17'].forEach((address) => {
    sheet.getCell(address).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    sheet.getCell(address).font = { ...baseFont, bold: true }
  })
  ;['C9', 'E9', 'F12', 'H12', 'I12', 'A18', 'F18'].forEach((address) => {
    sheet.getCell(address).numFmt = '#,##0'
    sheet.getCell(address).alignment = { horizontal: 'right', vertical: 'middle' }
  })
  sheet.getCell('H18').font = { ...baseFont, bold: true }
  sheet.getCell('H18').alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getCell('A19').font = { ...baseFont, size: 8, color: { argb: 'FF777777' } }
  sheet.getCell('A19').alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 25
  sheet.getRow(2).height = 25
  sheet.getRow(3).height = 32
  sheet.getRow(4).height = 32
  sheet.getRow(5).height = 34
  sheet.getRow(19).height = 24

  const uploadSheet = workbook.addWorksheet('입력자료', { views: [{ state: 'frozen', ySplit: 1 }] })
  const uploadHeaders = ['작성일자', '공급자등록번호', '공급자상호', '공급자대표자', '공급자주소', '공급자업태', '공급자종목', '공급자이메일', '공급받는자등록번호', '공급받는자상호', '공급받는자대표자', '공급받는자주소', '공급받는자업태', '공급받는자종목', '공급받는자이메일', '품목', '수량', '공급가액', '세액', '합계금액', '비고']
  const uploadRow = [issueDate, supplier.bizNumber, supplier.name, supplier.representative, supplier.address, supplier.bizType, supplier.bizItem, supplier.email, buyer.bizNumber, buyer.name, buyer.representative, buyer.address, buyer.bizType, buyer.bizItem, buyer.email, item.itemName || flowMeta.itemName, 1, Number(item.supplyAmount), Number(item.taxAmount), Number(item.totalAmount), item.remark]
  uploadSheet.addRow(uploadHeaders)
  uploadSheet.addRow(uploadRow)
  uploadSheet.getRow(1).font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  uploadSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF365B9D' } }
  uploadSheet.columns.forEach((column, index) => { column.width = index === 0 ? 13 : 18 })
  ;[18, 19, 20].forEach((col) => { uploadSheet.getCell(2, col).numFmt = '#,##0' })

  return workbook
}
