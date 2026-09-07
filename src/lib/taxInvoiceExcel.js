// @ts-check
import { getTaxInvoiceFlowMeta } from '../domain/financeTaxInvoiceEntries.js'
import { buildTaxInvoiceWorkbook } from './taxInvoiceExcelBuilder.js'

/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */

/**
 * @param {string} monthKey
 * @param {InvoiceLike} item
 */
export function buildTaxInvoiceExcelFileName(monthKey, item) {
  const label = getTaxInvoiceFlowMeta(/** @type {'sales'|'purchase'|'commission'} */ (item.flow || 'sales')).label
  return `${monthKey}_${item.clientName || ''}_${label}_계산서.xlsx`.replace(/[\\/:*?"<>|]/g, '_')
}

/**
 * @param {InvoiceLike} item
 * @param {FinanceSettings} settings
 * @param {{ bankName?: string, accountNumber?: string, name?: string }} profile
 * @param {string} monthKey
 */
export async function exportTaxInvoiceExcel(item, settings, profile, monthKey) {
  const mod = await import('exceljs')
  const ExcelJS = /** @type {typeof import('exceljs')} */ (mod.default || mod)
  const workbook = buildTaxInvoiceWorkbook(ExcelJS, item, settings, profile, monthKey)
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  const link = document.createElement('a')
  link.href = url
  link.download = buildTaxInvoiceExcelFileName(monthKey, item)
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
