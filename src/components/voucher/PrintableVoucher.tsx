'use client'
import React from 'react'
import type { Voucher, JournalLine } from '@/lib/types'

// Supported currencies
const CURRENCIES: Record<string, { symbol: string; decimals: number; minor: string }> = {
  OMR: { symbol: 'OMR', decimals: 3, minor: 'Baisa' },
  AED: { symbol: 'AED', decimals: 2, minor: 'Fils' },
  USD: { symbol: 'USD', decimals: 2, minor: 'Cents' },
  SAR: { symbol: 'SAR', decimals: 2, minor: 'Halalas' },
  EUR: { symbol: 'EUR', decimals: 2, minor: 'Cents' },
  GBP: { symbol: 'GBP', decimals: 2, minor: 'Pence' },
}

interface PrintableVoucherProps {
  voucher: Voucher
  journalLines: (JournalLine & { ledger?: { name: string; account_code: string; classification: string } })[]
  voucherLines?: {
    id: string
    ledger_id: string
    description: string
    amount: number
    vat_rate: number
    vat_amount: number
    ledger?: { name: string; account_code: string }
  }[]
  companySettings?: {
    company_name: string
    address?: string | null
    phone?: string | null
    email?: string | null
    logo_url?: string | null
    vat_number?: string | null
  }
  partyLedger?: {
    name: string
    phone?: string | null
    email?: string | null
    address?: string | null
    vat_number?: string | null
  } | null
  currency?: string
}

// --- Number to words (OMR/multi-currency) ---
function numberToWordsOMR(num: number, currencyCode = 'OMR'): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convertHundreds(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convertHundreds(n % 100) : '')
  }

  if (num === 0) return 'Zero'

  const curr = CURRENCIES[currencyCode] || CURRENCIES.OMR
  const decimals = curr.decimals
  const divisor = Math.pow(10, decimals)

  const wholePart = Math.floor(num)
  const minorPart = Math.round((num - wholePart) * divisor)

  const scale = ['', 'Thousand', 'Million', 'Billion']
  let result = ''
  let scaleIndex = 0
  let remaining = wholePart

  if (remaining > 0) {
    while (remaining > 0) {
      const chunk = remaining % 1000
      if (chunk !== 0) {
        const chunkWords = convertHundreds(chunk)
        result = chunkWords + (scale[scaleIndex] ? ' ' + scale[scaleIndex] : '') + (result ? ', ' + result : '')
      }
      remaining = Math.floor(remaining / 1000)
      scaleIndex++
    }
  } else {
    result = 'Zero'
  }

  let words = result + ' ' + currencyCode
  if (minorPart > 0) {
    const minorStr = decimals === 3
      ? minorPart.toString().padStart(3, '0') + '/1000'
      : minorPart.toString().padStart(2, '0') + '/100'
    words += ` & ${curr.minor} ${minorStr}`
  }
  return words + ' Only'
}

// --- Format amount with currency symbol ---
function fmt(amount: number, currencyCode = 'OMR'): string {
  const curr = CURRENCIES[currencyCode] || CURRENCIES.OMR
  return `${curr.symbol} ${Number(amount).toFixed(curr.decimals)}`
}

// --- Shared Signature & Stamp Footer ---
function SignatureFooter({ type }: { type: string }) {
  const isPayment = type === 'PAYMENT'
  const isInvoice = type === 'SALE' || type === 'PURCHASE'

  if (isInvoice) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2.5rem' }}>
        {/* Approved by signature */}
        <div style={{ width: '180px', textAlign: 'center' }}>
          <img src="/reference_signature.png" alt="Approved by" style={{ width: 140, height: 'auto', display: 'block', margin: '0 auto' }} />
        </div>
        {/* Company Stamp */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '2rem' }}>
          <img src="/reference_stamp.png" alt="Company Stamp" style={{ width: 95, height: 'auto', display: 'block' }} />
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#718096', marginTop: '4px' }}>Company Stamp</span>
        </div>
      </div>
    )
  }

  // Receipt / Payment / Journal — show sig image on the Authorised Signatory slot
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-end', fontSize: '0.72rem', textAlign: 'center', marginTop: '3rem' }}>
      {isPayment && (
        <div style={{ flex: 1 }}>
          <div style={{ height: '40px' }} />
          <div style={{ borderTop: '1px solid #000', margin: '0 auto 4px', width: '85%' }} />
          <span>Receiver&apos;s Signature</span>
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ height: '40px' }} />
        <div style={{ borderTop: '1px solid #000', margin: '0 auto 4px', width: '85%' }} />
        <span>Prepared by</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ height: '40px' }} />
        <div style={{ borderTop: '1px solid #000', margin: '0 auto 4px', width: '85%' }} />
        <span>Checked by</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ height: '40px' }} />
        <div style={{ borderTop: '1px solid #000', margin: '0 auto 4px', width: '85%' }} />
        <span>Verified by</span>
      </div>
      {/* Authorised Signatory with actual signature */}
      <div style={{ flex: 1, textAlign: 'center' }}>
        <img src="/reference_signature.png" alt="Authorised Signature" style={{ width: 80, height: 'auto', display: 'block', margin: '0 auto' }} />
        <div style={{ borderTop: '1px solid #000', margin: '2px auto 4px', width: '85%' }} />
        <span>Authorised Signatory</span>
      </div>
      {/* Company Stamp */}
      <div style={{ flex: 0, textAlign: 'center' }}>
        <img src="/reference_stamp.png" alt="Company Stamp" style={{ width: 65, height: 'auto', display: 'block', margin: '0 auto' }} />
        <span style={{ fontSize: '0.65rem' }}>Company Stamp</span>
      </div>
    </div>
  )
}

export function PrintableVoucher({ voucher, journalLines, voucherLines = [], companySettings, partyLedger, currency = 'OMR' }: PrintableVoucherProps) {
  const cur = currency || voucher.currency || 'OMR'
  
  const drTotal = journalLines.filter(l => l.type === 'Dr').reduce((sum, l) => sum + Number(l.amount), 0)
  const crTotal = journalLines.filter(l => l.type === 'Cr').reduce((sum, l) => sum + Number(l.amount), 0)

  const grandTotal = Number(voucher.grand_total || voucher.amount || 0)
  const isInvoice = voucher.type === 'SALE' || voucher.type === 'PURCHASE'

  const primaryColor = '#163B40'
  const accentColor = '#0284c7'
  const lightBg = '#F7FAFC'

  // ─── COMMERCIAL INVOICE (SALE / PURCHASE) ────────────────────────────────
  if (isInvoice) {
    return (
      <div id="printable-voucher" className="printable-voucher" style={{ background: '#FFFFFF', color: '#1A202C', fontFamily: "'Inter', sans-serif", padding: '1.5rem', border: '1px solid #E2E8F0', fontSize: '0.85rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: primaryColor, margin: '0 0 4px', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
              TADBEER TRANSFORMATION TRADING
            </h2>
            <p style={{ margin: '0 0 2px', fontSize: '0.75rem', color: '#4A5568', fontWeight: 600 }}>OFFICE NO: 113/114, 1st FLOOR, AL NOOR PLAZA,</p>
            <p style={{ margin: '0 0 2px', fontSize: '0.75rem', color: '#4A5568', fontWeight: 600 }}>MADINAT QABOOS, MUSCAT, SULTANATE OF OMAN</p>
            <p style={{ margin: '0 0 2px', fontSize: '0.75rem', color: '#4A5568' }}>operation@tadbeertt.com</p>
            <p style={{ margin: '0 0 2px', fontSize: '0.75rem', color: '#4A5568' }}>+968 7721 3606 / 9639 6357</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
            {companySettings?.logo_url
              ? <img src={companySettings.logo_url} alt="Logo" style={{ width: 140, height: 'auto', display: 'block', objectFit: 'contain' }} />
              : <img src="/reference_logo.png" alt="Logo" style={{ width: 160, height: 'auto', display: 'block', objectFit: 'contain' }} />
            }
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', fontWeight: 700, color: '#1A202C' }}>
              CR NO: {companySettings?.vat_number || '1613378'}
            </p>
            {cur !== 'OMR' && (
              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#718096', fontWeight: 600 }}>
                Currency: {cur}
              </p>
            )}
          </div>
        </div>

        {/* Title Bar */}
        <div style={{ textAlign: 'center', borderTop: `2px solid ${accentColor}`, borderBottom: `2px solid ${accentColor}`, padding: '4px 0', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284c7', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {voucher.type === 'SALE' ? 'COMMERCIAL INVOICE' : 'PURCHASE COMMERCIAL INVOICE'}
          </h1>
        </div>

        {/* Customer & Invoice Details */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1.2, border: '1px solid #E2E8F0', borderRadius: '4px' }}>
            <div style={{ background: '#EDF2F7', padding: '6px 10px', fontSize: '0.75rem', fontWeight: 700, borderBottom: '1px solid #E2E8F0' }}>
              {voucher.type === 'SALE' ? 'Customer details' : 'Supplier details'}
            </div>
            <div style={{ padding: '8px 10px', lineHeight: '1.4' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{partyLedger?.name || voucher.party_name}</div>
              {partyLedger?.email && <div style={{ color: '#4A5568' }}>{partyLedger.email}</div>}
              {partyLedger?.address && <div style={{ color: '#4A5568' }}>{partyLedger.address}</div>}
              <div style={{ marginTop: '6px', fontWeight: 600, color: '#4A5568' }}>
                VATIN: <span style={{ color: partyLedger?.vat_number ? '#1A202C' : '#A0AEC0' }}>{partyLedger?.vat_number || '#N/A'}</span>
              </div>
            </div>
          </div>
          <div style={{ flex: 0.8, border: '1px solid #E2E8F0', borderRadius: '4px', alignSelf: 'flex-start' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4A5568' }}>Invoice No:</td>
                  <td style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>{voucher.voucher_number}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4A5568' }}>Invoice Date:</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{new Date(voucher.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4A5568' }}>Proposal Ref:</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{voucher.ref || '—'}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4A5568' }}>Currency:</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: cur !== 'OMR' ? '#0284c7' : '#1A202C' }}>{cur}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4A5568' }}>Location:</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>Muscat, Oman</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Particulars Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#EDF2F7', borderTop: '1px solid #CBD5E0', borderBottom: '2px solid #CBD5E0' }}>
              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#2D3748' }}>Particulars</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#2D3748', width: '17%' }}>Rate ({cur})</th>
              <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#2D3748', width: '10%' }}>Qty</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#2D3748', width: '12%' }}>VAT</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#2D3748', width: '18%' }}>Amount ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {voucherLines && voucherLines.length > 0 ? (
              voucherLines.map((line, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '12px 10px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 600 }}>{line.description || 'Service'}</div>
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(line.amount, cur)}
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', verticalAlign: 'top' }}>1.00</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(line.vat_amount || 0, cur)}
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', verticalAlign: 'top', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(Number(line.amount) + Number(line.vat_amount || 0), cur)}
                  </td>
                </tr>
              ))
            ) : (
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '12px 10px', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 600 }}>{voucher.narration || 'Service'}</div>
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'right', verticalAlign: 'top' }}>{fmt(voucher.subtotal || voucher.amount || 0, cur)}</td>
                <td style={{ padding: '12px 10px', textAlign: 'center', verticalAlign: 'top' }}>1.00</td>
                <td style={{ padding: '12px 10px', textAlign: 'right', verticalAlign: 'top' }}>{fmt(voucher.vat_total || 0, cur)}</td>
                <td style={{ padding: '12px 10px', textAlign: 'right', verticalAlign: 'top', fontWeight: 700 }}>{fmt(grandTotal, cur)}</td>
              </tr>
            )}
            <tr style={{ height: '80px' }}><td colSpan={5} /></tr>
          </tbody>
        </table>

        {/* Notes & Summary Grid */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1.1 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, textDecoration: 'underline', marginBottom: '4px' }}>Additional Notes:</div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#4A5568', lineHeight: '1.4' }}>{voucher.narration}</p>
            {voucher.notes && (
              <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#4A5568', lineHeight: '1.4' }}>
                <strong>Notes:</strong> {voucher.notes}
              </p>
            )}
          </div>
          <div style={{ flex: 0.9 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 700 }}>Total value of supply</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(voucher.subtotal || voucher.amount || 0, cur)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 700 }}>VAT (5%)</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {Number(voucher.vat_total || 0) > 0 ? fmt(voucher.vat_total || 0, cur) : '-'}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #CBD5E0', background: '#F7FAFC' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 800 }}>Amount including VAT</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(grandTotal, cur)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 700 }}>Advance received</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#A0AEC0' }}>-</td>
                </tr>
                <tr style={{ borderTop: '2px solid #2D3748', background: '#EDF2F7' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 900 }}>Balance Amount</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{fmt(grandTotal, cur)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Amounts in Words */}
        <div style={{ borderTop: '1px solid #CBD5E0', paddingTop: '8px', marginBottom: '1.5rem' }}>
          <span style={{ fontWeight: 700, fontSize: '0.8rem', textDecoration: 'underline' }}>Amounts in Words</span>
          <div style={{ marginTop: '4px', fontStyle: 'italic', fontWeight: 600 }}>
            ( {numberToWordsOMR(grandTotal, cur)} )
          </div>
        </div>

        {/* Payment Instructions */}
        <div style={{ marginBottom: '2.5rem', maxWidth: '380px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.8rem', textDecoration: 'underline', marginBottom: '6px' }}>Payment Instructions</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #CBD5E0', fontSize: '0.75rem' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                <td style={{ padding: '4px 6px', fontWeight: 700, background: '#EDF2F7', width: '35%' }}>Account No</td>
                <td style={{ padding: '4px 6px', fontWeight: 600 }}>0332-07960213-0017</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                <td style={{ padding: '4px 6px', fontWeight: 700, background: '#EDF2F7' }}>Account Name</td>
                <td style={{ padding: '4px 6px', fontWeight: 600 }}>TADBEER TRANSFORMATION TRADING</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                <td style={{ padding: '4px 6px', fontWeight: 700, background: '#EDF2F7' }}>Bank Name</td>
                <td style={{ padding: '4px 6px', fontWeight: 600 }}>Bank Muscat</td>
              </tr>
              <tr>
                <td style={{ padding: '4px 6px', fontWeight: 700, background: '#EDF2F7' }}>Branch</td>
                <td style={{ padding: '4px 6px', fontWeight: 600 }}>Main Branch</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Signature & Stamp */}
        <SignatureFooter type={voucher.type} />

        {/* Computer generated notice */}
        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.7rem', color: '#718096', borderTop: '1px dashed #E2E8F0', paddingTop: '8px' }}>
          *This is a computer generated document*
        </div>
      </div>
    )
  }

  // ─── JOURNAL VOUCHER ────────────────────────────────────────────────────
  if (voucher.type === 'JOURNAL') {
    return (
      <div id="printable-voucher" className="printable-voucher" style={{ background: '#FFFFFF', color: '#1A202C', fontFamily: "'Inter', sans-serif", padding: '1.5rem', border: '1px solid #CBD5E0', fontSize: '0.85rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', color: '#1A202C' }}>
            {companySettings?.company_name || 'Tadbeer Transformations'}
          </h2>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#4A5568' }}>
            E-Mail: {companySettings?.email || 'operation@tadbeertt.com'} | VATIN OM {companySettings?.vat_number || '1613378'}
          </p>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '1rem 0 0.5rem', textTransform: 'uppercase', borderBottom: '1px solid #000', paddingBottom: '0.5rem', display: 'inline-block', width: '220px' }}>
            Journal Voucher
          </h1>
        </div>

        {/* Voucher Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
          <div>No. : <strong style={{ fontSize: '0.9rem' }}>{voucher.voucher_number}</strong></div>
          <div>Currency: <strong>{cur}</strong></div>
          <div>Dated : <strong>{new Date(voucher.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-')}</strong></div>
        </div>

        {/* Dr/Cr Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #000', marginBottom: '1rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>
              <th style={{ padding: '6px 10px', textAlign: 'left', borderRight: '1px solid #E2E8F0' }}>Particulars</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', width: '22%', borderRight: '1px solid #E2E8F0' }}>Debit ({cur})</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', width: '22%' }}>Credit ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {journalLines.map((line, idx) => {
              const isCredit = line.type === 'Cr'
              return (
                <tr key={line.id || idx} style={{ minHeight: '35px' }}>
                  <td style={{ padding: '6px 10px', borderRight: '1px solid #E2E8F0', paddingLeft: isCredit ? '2.5rem' : '10px' }}>
                    {isCredit ? 'To ' : ''}{line.ledger?.name || '—'}
                    {!isCredit ? <span style={{ float: 'right', fontWeight: 600 }}>Dr</span> : ''}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', borderRight: '1px solid #E2E8F0', fontVariantNumeric: 'tabular-nums' }}>
                    {!isCredit ? fmt(line.amount, cur) : ''}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {isCredit ? fmt(line.amount, cur) : ''}
                  </td>
                </tr>
              )
            })}
            <tr style={{ height: '60px' }}>
              <td style={{ borderRight: '1px solid #E2E8F0' }} /><td style={{ borderRight: '1px solid #E2E8F0' }} /><td />
            </tr>
            <tr style={{ borderTop: '2px solid #000', fontWeight: 700, background: lightBg }}>
              <td style={{ padding: '6px 10px', borderRight: '1px solid #E2E8F0', textAlign: 'right' }}>Total:</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', borderRight: '1px solid #E2E8F0', fontVariantNumeric: 'tabular-nums' }}>{fmt(drTotal, cur)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(crTotal, cur)}</td>
            </tr>
          </tbody>
        </table>

        {/* Narration */}
        <div style={{ marginBottom: '4rem', fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>On Account of :</div>
          <p style={{ margin: 0, paddingLeft: '10px', color: '#2D3748', fontStyle: 'italic' }}>{voucher.narration}</p>
        </div>

        {/* Signature & Stamp */}
        <SignatureFooter type={voucher.type} />
      </div>
    )
  }

  // ─── RECEIPT / PAYMENT VOUCHER ───────────────────────────────────────────
  const isPayment = voucher.type === 'PAYMENT'
  const sourceAccount = journalLines.find(l => isPayment ? l.type === 'Cr' : l.type === 'Dr')?.ledger?.name || 'Cash/Bank Ledger'
  const offsetAccounts = journalLines.filter(l => isPayment ? l.type === 'Dr' : l.type === 'Cr')

  return (
    <div id="printable-voucher" className="printable-voucher" style={{ background: '#FFFFFF', color: '#1A202C', fontFamily: "'Inter', sans-serif", padding: '1.5rem', border: '1px solid #CBD5E0', fontSize: '0.85rem' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', color: '#1A202C' }}>
          {companySettings?.company_name || 'Tadbeer Transformations'}
        </h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#4A5568' }}>
          E-Mail: {companySettings?.email || 'operation@tadbeertt.com'} | VATIN OM {companySettings?.vat_number || '1613378'}
        </p>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '1rem 0 0.5rem', textTransform: 'uppercase', borderBottom: '1px solid #000', paddingBottom: '0.5rem', display: 'inline-block', width: '220px' }}>
          {isPayment ? 'Payment Voucher' : 'Receipt Voucher'}
        </h1>
      </div>

      {/* Voucher Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
        <div>No. : <strong style={{ fontSize: '0.9rem' }}>{voucher.voucher_number}</strong></div>
        <div>Currency: <strong>{cur}</strong></div>
        <div>Dated : <strong>{new Date(voucher.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-')}</strong></div>
      </div>

      {/* Account particulars */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #000', marginBottom: '1rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #000', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>
            <th style={{ padding: '6px 10px', textAlign: 'left', borderRight: '1px solid #E2E8F0' }}>Particulars</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', width: '25%' }}>Amount ({cur})</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', fontWeight: 700, borderRight: '1px solid #E2E8F0' }}>Account :</td>
            <td style={{ borderRight: 'none' }} />
          </tr>
          {offsetAccounts.map((line, idx) => (
            <tr key={line.id || idx}>
              <td style={{ padding: '4px 10px 4px 2rem', borderRight: '1px solid #E2E8F0' }}>
                <span style={{ fontWeight: 600 }}>{line.ledger?.name || '—'}</span>
              </td>
              <td style={{ padding: '4px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(line.amount, cur)}
              </td>
            </tr>
          ))}
          <tr style={{ height: '40px' }}>
            <td style={{ borderRight: '1px solid #E2E8F0' }} /><td />
          </tr>
          <tr style={{ borderTop: '1px solid #CBD5E0' }}>
            <td style={{ padding: '8px 10px', borderRight: '1px solid #E2E8F0' }}>
              <strong>Through :</strong>
              <span style={{ marginLeft: '10px', color: '#4A5568' }}>{sourceAccount}</span>
            </td>
            <td />
          </tr>
          <tr style={{ borderTop: '1px solid #CBD5E0' }}>
            <td style={{ padding: '8px 10px', borderRight: '1px solid #E2E8F0', verticalAlign: 'top' }}>
              <strong>On Account of :</strong>
              <div style={{ marginTop: '4px', paddingLeft: '1rem', color: '#4A5568', fontStyle: 'italic', fontSize: '0.8rem' }}>
                {voucher.narration}
              </div>
            </td>
            <td />
          </tr>
          <tr style={{ borderTop: '1px solid #CBD5E0' }}>
            <td style={{ padding: '8px 10px', borderRight: '1px solid #E2E8F0' }}>
              <strong>Amount (in words) :</strong>
              <div style={{ marginTop: '4px', paddingLeft: '1rem', fontWeight: 600 }}>
                {numberToWordsOMR(grandTotal, cur)}
              </div>
            </td>
            <td />
          </tr>
          <tr style={{ borderTop: '2px solid #000', fontWeight: 700, background: lightBg }}>
            <td style={{ padding: '6px 10px', borderRight: '1px solid #E2E8F0', textAlign: 'right' }}>Total:</td>
            <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(grandTotal, cur)}</td>
          </tr>
        </tbody>
      </table>

      {/* Signature & Stamp */}
      <SignatureFooter type={voucher.type} />
    </div>
  )
}
