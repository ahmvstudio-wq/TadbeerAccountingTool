// ============================================================
// TADBEER MVP V1 — ACCOUNTING ENGINE
// Double-entry bookkeeping core + utility functions
// ============================================================

import type { EntryType, VoucherType } from '@/lib/types'

// ============================================================
// NUMBER TO WORDS (for amount in words on invoices)
// Supports OMR 3-decimal precision (baisa)
// ============================================================

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function convertHundreds(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convertHundreds(n % 100) : '')
}

// Currency decimal places: OMR/KWD/BHD use 3, others use 2
const CURRENCY_DECIMALS: Record<string, number> = {
  OMR: 3, KWD: 3, BHD: 3,
  SAR: 2, AED: 2, USD: 2, EUR: 2, GBP: 2, QAR: 2, INR: 2,
}

const CURRENCY_NAMES: Record<string, { major: string; minor: string }> = {
  SAR: { major: 'Saudi Riyal', minor: 'Halalas' },
  OMR: { major: 'Omani Rial', minor: 'Baisa' },
  AED: { major: 'UAE Dirham', minor: 'Fils' },
  USD: { major: 'US Dollar', minor: 'Cents' },
  EUR: { major: 'Euro', minor: 'Cents' },
  GBP: { major: 'British Pound', minor: 'Pence' },
  KWD: { major: 'Kuwaiti Dinar', minor: 'Fils' },
  BHD: { major: 'Bahraini Dinar', minor: 'Fils' },
  QAR: { major: 'Qatari Riyal', minor: 'Dirhams' },
  INR: { major: 'Indian Rupee', minor: 'Paise' },
}

export function numberToWords(num: number, currency = 'OMR'): string {
  if (num === 0) return 'Zero'
  
  const isNegative = num < 0
  num = Math.abs(num)
  
  const decimals = CURRENCY_DECIMALS[currency] ?? 2
  const divisor = Math.pow(10, decimals)
  
  const wholePart = Math.floor(num)
  // Round to the correct number of decimal places to avoid floating-point drift
  const minorPart = Math.round((num - wholePart) * divisor)
  
  const SCALE = ['', 'Thousand', 'Million', 'Billion']
  
  let result = ''
  let scaleIndex = 0
  let remaining = wholePart
  
  if (remaining === 0) {
    result = 'Zero'
  } else {
    while (remaining > 0) {
      const chunk = remaining % 1000
      if (chunk !== 0) {
        const chunkWords = convertHundreds(chunk)
        result = chunkWords + (SCALE[scaleIndex] ? ' ' + SCALE[scaleIndex] : '') + (result ? ', ' + result : '')
      }
      remaining = Math.floor(remaining / 1000)
      scaleIndex++
    }
  }
  
  const curr = CURRENCY_NAMES[currency] || { major: currency, minor: 'units' }
  
  // Format: "Omani Rials One Hundred Five Only"
  let words = (isNegative ? 'Negative ' : '') + curr.major + ' ' + result
  if (minorPart > 0) {
    if (decimals === 3) {
      words += ' and ' + minorPart + '/1000 ' + curr.minor
    } else {
      words += ' and ' + convertHundreds(minorPart) + ' ' + curr.minor
    }
  }
  words += ' Only'
  
  return words
}

// ============================================================
// VOUCHER → JOURNAL ENTRY RULES (Double-Entry)
// ============================================================

export interface JournalLineInput {
  voucher_id: string
  ledger_id: string
  type: EntryType
  amount: number
  date: string
  narration: string | null
  company_id: string
}

/**
 * Build journal entries for Sales voucher
 * Dr: Customer (grand_total)
 * Cr: Each income line (amount)  
 * Cr: VAT Output (vat_total) - if applicable
 */
export function buildSalesJournalLines(
  voucherId: string,
  customerId: string,
  lines: { ledger_id: string; amount: number }[],
  vatLedgerId: string | null,
  vatTotal: number,
  grandTotal: number,
  date: string,
  narration: string,
  companyId: string
): JournalLineInput[] {
  const entries: JournalLineInput[] = []
  
  // Dr: Customer
  entries.push({
    voucher_id: voucherId,
    ledger_id: customerId,
    type: 'Dr',
    amount: grandTotal,
    date,
    narration,
    company_id: companyId,
  })
  
  // Cr: Each income line
  for (const line of lines) {
    entries.push({
      voucher_id: voucherId,
      ledger_id: line.ledger_id,
      type: 'Cr',
      amount: line.amount,
      date,
      narration,
      company_id: companyId,
    })
  }
  
  // Cr: VAT Output (if applicable)
  if (vatLedgerId && vatTotal > 0) {
    entries.push({
      voucher_id: voucherId,
      ledger_id: vatLedgerId,
      type: 'Cr',
      amount: vatTotal,
      date,
      narration,
      company_id: companyId,
    })
  }
  
  return entries
}

/**
 * Build journal entries for Purchase voucher
 * Dr: Each expense/asset line (amount)
 * Dr: VAT Input (vat_total) - if applicable
 * Cr: Supplier (grand_total)
 */
export function buildPurchaseJournalLines(
  voucherId: string,
  supplierId: string,
  lines: { ledger_id: string; amount: number }[],
  vatLedgerId: string | null,
  vatTotal: number,
  grandTotal: number,
  date: string,
  narration: string,
  companyId: string
): JournalLineInput[] {
  const entries: JournalLineInput[] = []
  
  // Dr: Each expense line
  for (const line of lines) {
    entries.push({
      voucher_id: voucherId,
      ledger_id: line.ledger_id,
      type: 'Dr',
      amount: line.amount,
      date,
      narration,
      company_id: companyId,
    })
  }
  
  // Dr: VAT Input (if applicable)
  if (vatLedgerId && vatTotal > 0) {
    entries.push({
      voucher_id: voucherId,
      ledger_id: vatLedgerId,
      type: 'Dr',
      amount: vatTotal,
      date,
      narration,
      company_id: companyId,
    })
  }
  
  // Cr: Supplier
  entries.push({
    voucher_id: voucherId,
    ledger_id: supplierId,
    type: 'Cr',
    amount: grandTotal,
    date,
    narration,
    company_id: companyId,
  })
  
  return entries
}

/**
 * Build journal entries for Payment voucher
 * Dr: Payee/Supplier/Expense
 * Cr: Bank/Cash
 */
export function buildPaymentJournalLines(
  voucherId: string,
  payeeLines: { ledger_id: string; amount: number }[],
  bankCashLedgerId: string,
  totalAmount: number,
  date: string,
  narration: string,
  companyId: string
): JournalLineInput[] {
  const entries: JournalLineInput[] = []
  
  // Dr: Each payee line
  for (const line of payeeLines) {
    entries.push({
      voucher_id: voucherId,
      ledger_id: line.ledger_id,
      type: 'Dr',
      amount: line.amount,
      date,
      narration,
      company_id: companyId,
    })
  }
  
  // Cr: Bank/Cash
  entries.push({
    voucher_id: voucherId,
    ledger_id: bankCashLedgerId,
    type: 'Cr',
    amount: totalAmount,
    date,
    narration,
    company_id: companyId,
  })
  
  return entries
}

/**
 * Build journal entries for Receipt voucher
 * Dr: Bank/Cash
 * Cr: Customer
 */
export function buildReceiptJournalLines(
  voucherId: string,
  bankCashLedgerId: string,
  customerLedgerId: string,
  amount: number,
  date: string,
  narration: string,
  companyId: string
): JournalLineInput[] {
  return [
    {
      voucher_id: voucherId,
      ledger_id: bankCashLedgerId,
      type: 'Dr',
      amount,
      date,
      narration,
      company_id: companyId,
    },
    {
      voucher_id: voucherId,
      ledger_id: customerLedgerId,
      type: 'Cr',
      amount,
      date,
      narration,
      company_id: companyId,
    },
  ]
}

/**
 * Build journal entries for Journal voucher (user-defined Dr/Cr lines)
 * Must balance: total Dr === total Cr
 */
export function buildManualJournalLines(
  voucherId: string,
  lines: { ledger_id: string; type: EntryType; amount: number }[],
  date: string,
  narration: string,
  companyId: string
): JournalLineInput[] {
  return lines.map(line => ({
    voucher_id: voucherId,
    ledger_id: line.ledger_id,
    type: line.type,
    amount: line.amount,
    date,
    narration,
    company_id: companyId,
  }))
}

// ============================================================
// VOUCHER NUMBER PREFIXES
// ============================================================

export const VOUCHER_PREFIX: Record<VoucherType, string> = {
  PURCHASE: 'PUR',
  SALE: 'SAL',
  RECEIPT: 'REC',
  PAYMENT: 'PAY',
  JOURNAL: 'JRN',
}

export function formatVoucherNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(5, '0')}`
}

// ============================================================
// NATURE → ACCOUNT CODE PREFIX
// ============================================================

export const NATURE_CODE_PREFIX: Record<string, string> = {
  ASSET: '1',
  LIABILITY: '2',
  EQUITY: '3',
  INCOME: '4',
  EXPENSE: '5',
}
