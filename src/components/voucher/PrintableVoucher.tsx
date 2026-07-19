'use client'
import React from 'react'
import type { Voucher, JournalLine } from '@/lib/types'

// Supported currencies with proper decimal precision
const CURRENCIES: Record<string, { symbol: string; decimals: number; minor: string; major: string }> = {
  OMR: { symbol: 'OMR', decimals: 3, minor: 'Baisa', major: 'Omani Rials' },
  KWD: { symbol: 'KWD', decimals: 3, minor: 'Fils', major: 'Kuwaiti Dinars' },
  BHD: { symbol: 'BHD', decimals: 3, minor: 'Fils', major: 'Bahraini Dinars' },
  AED: { symbol: 'AED', decimals: 2, minor: 'Fils', major: 'UAE Dirhams' },
  USD: { symbol: 'USD', decimals: 2, minor: 'Cents', major: 'US Dollars' },
  SAR: { symbol: 'SAR', decimals: 2, minor: 'Halalas', major: 'Saudi Riyals' },
  EUR: { symbol: 'EUR', decimals: 2, minor: 'Cents', major: 'Euros' },
  GBP: { symbol: 'GBP', decimals: 2, minor: 'Pence', major: 'British Pounds' },
  QAR: { symbol: 'QAR', decimals: 2, minor: 'Dirhams', major: 'Qatari Riyals' },
  INR: { symbol: 'INR', decimals: 2, minor: 'Paise', major: 'Indian Rupees' },
}

interface PrintableVoucherProps {
  voucher: Voucher
  journalLines: (JournalLine & { ledger?: { name: string; account_code: string; classification: string } })[]
  voucherLines?: {
    id: string
    ledger_id: string
    description: string
    quantity?: number
    rate?: number
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

// --- Number to words (OMR/multi-currency with correct decimal handling) ---
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

  // Format: "Omani Rials One Hundred Five Only"
  let amountWords = result
  if (minorPart > 0) {
    const minorStr = decimals === 3
      ? minorPart + '/1000'
      : minorPart.toString().padStart(2, '0') + '/100'
    amountWords += ' and ' + minorStr + ' ' + curr.minor
  }
  return curr.major + ' ' + amountWords + ' Only'
}

// --- OMR Symbol Component ---
function OMRSymbol({ size = 16 }: { size?: number }) {
  return (
    <span 
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        lineHeight: 1,
      }}
    >
      <img 
        src="/omrsymbol.png"
        alt="OMR"
        style={{
          width: size * 1.8,
          height: size * 1.8,
          objectFit: 'contain',
          display: 'block',
          marginLeft: -size * 0.35,
          marginRight: -size * 0.28,
          transform: 'translateY(-2%)'
        }}
      />
    </span>
  )
}

// --- Format amount WITH currency symbol (for totals/summary) ---
function fmt(amount: number, currencyCode = 'OMR'): string {
  const curr = CURRENCIES[currencyCode] || CURRENCIES.OMR
  return `${curr.symbol} ${Number(amount).toFixed(curr.decimals)}`
}

// --- Format amount without currency (for line items) ---
function fmtNum(amount: number, currencyCode = 'OMR'): string {
  const curr = CURRENCIES[currencyCode] || CURRENCIES.OMR
  return Number(amount).toFixed(curr.decimals)
}

// --- Voucher document title (correct terminology per type) ---
function getVoucherTitle(type: string): string {
  switch (type) {
    case 'SALE': return 'SALES INVOICE'
    case 'PURCHASE': return 'PURCHASE VOUCHER'
    case 'RECEIPT': return 'RECEIPT VOUCHER'
    case 'PAYMENT': return 'PAYMENT VOUCHER'
    case 'JOURNAL': return 'JOURNAL VOUCHER'
    default: return 'VOUCHER'
  }
}

function getPartyDetailsTitle(type: string): string {
  switch (type) {
    case 'SALE': return 'Customer Details'
    case 'PURCHASE': return 'Supplier Details'
    case 'PAYMENT': return 'Payee Details'
    case 'RECEIPT': return 'Customer Details'
    default: return 'Party Details'
  }
}

// --- Shared Signature & Stamp Footer ---
function SignatureFooter({ type }: { type: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
      <div style={{ width: '130px', textAlign: 'center' }}>
        <img src="/reference_signature.png" alt="Signature" style={{ width: 130, height: 'auto', display: 'block', margin: '0 auto' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '2rem' }}>
        <img src="/reference_stamp.png" alt="Company Stamp" style={{ width: 130, height: 'auto', display: 'block' }} />
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#718096', marginTop: '2px' }}>Company Stamp</span>
      </div>
    </div>
  )
}

export function PrintableVoucher({ voucher, journalLines, voucherLines = [], companySettings, partyLedger, currency = 'OMR' }: PrintableVoucherProps) {
  const cur = currency || voucher.currency || 'OMR'
  const grandTotal = Number(voucher.grand_total || voucher.amount || 0)
  const isSale = voucher.type === 'SALE'

  const primaryColor = '#163B40'
  const accentColor = '#0284c7'

  // Get company contact from settings (single source of truth)
  const companyPhone = companySettings?.phone || '+968 7721 3606'
  const companyEmail = companySettings?.email || 'operation@tadbeertt.com'
  const companyName = 'TADBEER TRANSFORMATIONS TRADING'

  // Standardize lines computation across ALL voucher types
  // Standardize lines computation across ALL voucher types
  let linesToRender: any[] = []
  if (voucherLines && voucherLines.length > 0) {
    // If we have voucher lines in DB, use them directly but filter out any VAT ledger lines
    linesToRender = voucherLines.filter(vl => {
      const name = vl.ledger?.name?.toLowerCase() || '';
      const isVat = vl.ledger_id === '10000000-0000-0000-0000-000000000022' || 
                    vl.ledger_id === '10000000-0000-0000-0000-000000000023' ||
                    name.includes('vat');
      return !isVat;
    })
  } else {
    // Fallback to journal lines if no voucher lines exist
    if (voucher.type === 'JOURNAL') {
      linesToRender = journalLines.map(jl => ({
        description: `${jl.type === 'Cr' ? 'To ' : ''}${jl.ledger?.name || '—'}${jl.type === 'Dr' ? ' (Dr)' : ''}`,
        quantity: 1,
        rate: Number(jl.amount),
        amount: Number(jl.amount),
        vat_amount: 0,
      }))
    } else {
      // Determine which side represents the offset / particulars details
      // For SALE/RECEIPT, the particulars are on the Credit side (revenue, liability, asset offset)
      // For PURCHASE/PAYMENT, the particulars are on the Debit side (expense, asset offset)
      const targetType = (voucher.type === 'PURCHASE' || voucher.type === 'PAYMENT') ? 'Dr' : 'Cr';
      
      linesToRender = journalLines
        .filter(jl => {
          if (jl.type !== targetType) return false;
          
          // Exclude the party ledger itself (e.g. customer/supplier ledger) if it's on this side
          if (jl.ledger_id === voucher.party_ledger_id) return false;
          
          // Exclude VAT Input and VAT Output ledger entries from particulars list
          const name = jl.ledger?.name?.toLowerCase() || '';
          const isVat = jl.ledger_id === '10000000-0000-0000-0000-000000000022' || 
                        jl.ledger_id === '10000000-0000-0000-0000-000000000023' ||
                        name.includes('vat');
          return !isVat;
        })
        .map(jl => ({
          description: jl.ledger?.name || 'Particulars',
          quantity: 1,
          rate: Number(jl.amount),
          amount: Number(jl.amount),
          vat_amount: 0,
        }))
    }
  }

  const showPartyBox = voucher.type !== 'JOURNAL' && (partyLedger?.name || voucher.party_name)

  return (
    <table id="printable-voucher" className="printable-voucher" style={{ width: '100%', borderCollapse: 'collapse', background: '#FFFFFF', color: '#1A202C', fontFamily: "'Inter', sans-serif", border: '1px solid #E2E8F0', fontSize: '0.82rem' }}>
      
      {/* Repeating Header */}
      <thead style={{ display: 'table-header-group' }}>
        <tr>
          <td style={{ padding: '1rem 1rem 0 1rem', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: primaryColor, margin: '0 0 4px', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                  {companyName}
                </h2>
                <p style={{ margin: '0 0 2px', fontSize: '0.72rem', color: '#4A5568', fontWeight: 600 }}>
                  {companySettings?.address || 'OFFICE NO: 113/114, 1ST FLOOR, AL NOOR PLAZA, MADINAT QABOOS, MUSCAT, SULTANATE OF OMAN'}
                </p>
                <p style={{ margin: '0 0 2px', fontSize: '0.72rem', color: '#4A5568' }}>Email: {companyEmail}</p>
                <p style={{ margin: '0 0 2px', fontSize: '0.72rem', color: '#4A5568' }}>Tel: {companyPhone}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                {companySettings?.logo_url
                  ? <img src={companySettings.logo_url} alt="Logo" style={{ width: 140, height: 'auto', display: 'block', objectFit: 'contain' }} />
                  : <img src="/reference_logo.png" alt="Logo" style={{ width: 140, height: 'auto', display: 'block', objectFit: 'contain' }} />
                }
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', fontWeight: 700, color: '#1A202C' }}>
                  CR NO: {companySettings?.vat_number || '1613378'}
                </p>
                {cur !== 'OMR' && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: '#718096', fontWeight: 600 }}>
                    Currency: {cur}
                  </p>
                )}
              </div>
            </div>

            {/* Title Bar */}
            <div style={{ textAlign: 'center', borderTop: `2px solid ${accentColor}`, borderBottom: `2px solid ${accentColor}`, padding: '3px 0', marginBottom: '1rem' }}>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0284c7', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {getVoucherTitle(voucher.type)}
              </h1>
            </div>
          </td>
        </tr>
      </thead>

      {/* Main content body */}
      <tbody>
        {/* Row 1: Details (Customer/Supplier details & Voucher details) */}
        <tr style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <td style={{ padding: '0 1rem', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '1rem' }}>
              {showPartyBox ? (
                <div style={{ flex: 1.2, border: '1px solid #E2E8F0', borderRadius: '4px' }}>
                  <div style={{ background: '#EDF2F7', padding: '5px 8px', fontSize: '0.72rem', fontWeight: 700, borderBottom: '1px solid #E2E8F0' }}>
                    {getPartyDetailsTitle(voucher.type)}
                  </div>
                  <div style={{ padding: '6px 8px', lineHeight: '1.3' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{partyLedger?.name || voucher.party_name}</div>
                    {partyLedger?.email && <div style={{ color: '#4A5568', fontSize: '0.72rem' }}>{partyLedger.email}</div>}
                    {partyLedger?.address && <div style={{ color: '#4A5568', fontSize: '0.72rem' }}>{partyLedger.address}</div>}
                    <div style={{ marginTop: '4px', fontWeight: 600, color: '#4A5568', fontSize: '0.72rem' }}>
                      VATIN: <span style={{ color: partyLedger?.vat_number ? '#1A202C' : '#A0AEC0' }}>{partyLedger?.vat_number || '#N/A'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1.2, border: '1px solid #E2E8F0', borderRadius: '4px' }}>
                  <div style={{ background: '#EDF2F7', padding: '5px 8px', fontSize: '0.72rem', fontWeight: 700, borderBottom: '1px solid #E2E8F0' }}>
                    Voucher Details
                  </div>
                  <div style={{ padding: '6px 8px', lineHeight: '1.3' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{companyName}</div>
                    <div style={{ color: '#4A5568', fontSize: '0.72rem' }}>Adjustment and General Journal Entry</div>
                  </div>
                </div>
              )}

              <div style={{ flex: 0.8, border: '1px solid #E2E8F0', borderRadius: '4px', alignSelf: 'flex-start' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '5px 6px', fontWeight: 600, color: '#4A5568' }}>
                        {voucher.type === 'SALE' ? 'Invoice No:' : 'Voucher No:'}
                      </td>
                      <td style={{ padding: '5px 6px', fontWeight: 700, textAlign: 'right' }}>{voucher.voucher_number}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '5px 6px', fontWeight: 600, color: '#4A5568' }}>
                        {voucher.type === 'SALE' ? 'Invoice Date:' : 'Voucher Date:'}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right' }}>{new Date(voucher.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-')}</td>
                    </tr>
                    {!isSale && (voucher as any).supplier_invoice_ref && (
                      <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '5px 6px', fontWeight: 600, color: '#4A5568' }}>Supplier Ref:</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 600 }}>{(voucher as any).supplier_invoice_ref}</td>
                      </tr>
                    )}
                    {isSale && (
                      <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '5px 6px', fontWeight: 600, color: '#4A5568' }}>Proposal Ref:</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right' }}>{voucher.ref || '—'}</td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '5px 6px', fontWeight: 600, color: '#4A5568' }}>Currency:</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>
                        {cur === 'OMR' ? <><OMRSymbol size={12} /> OMR</> : cur}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px 6px', fontWeight: 600, color: '#4A5568' }}>Location:</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right' }}>Muscat, Oman</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>

        {/* Row 2: Particulars Table */}
        <tr style={{ pageBreakInside: 'auto', breakInside: 'auto' }}>
          <td style={{ padding: '0 1rem', border: 'none' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#EDF2F7', borderTop: '1px solid #CBD5E0', borderBottom: '2px solid #CBD5E0' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#2D3748', width: '3%' }}>#</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#2D3748' }}>Particulars</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#2D3748', width: '10%' }}>Qty</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#2D3748', width: '15%' }}>Rate</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#2D3748', width: '10%' }}>VAT</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#2D3748', width: '17%' }}>Amount <OMRSymbol size={11} /></th>
                </tr>
              </thead>
              <tbody>
                {linesToRender && linesToRender.length > 0 ? (
                  linesToRender.map((line: any, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top', color: '#718096' }}>{idx + 1}</td>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{line.description || 'Service'}</div>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                        {Number(line.quantity || 1).toFixed(1)}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNum(line.rate || line.amount || 0, cur)}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNum(line.vat_amount || 0, cur)}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNum(Number(line.amount) + Number(line.vat_amount || 0), cur)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 8px', verticalAlign: 'top', color: '#718096' }}>1</td>
                    <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600 }}>{voucher.narration || 'Service'}</div>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>1.0</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>{fmtNum(voucher.subtotal || voucher.amount || 0, cur)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>{fmtNum(voucher.vat_total || 0, cur)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top', fontWeight: 700 }}>{fmtNum(grandTotal, cur)}</td>
                  </tr>
                )}
                <tr style={{ height: '6px' }}><td colSpan={6} style={{ border: 'none' }} /></tr>
              </tbody>
            </table>
          </td>
        </tr>

        {/* Row 3: Notes & Summary Grid */}
        <tr style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <td style={{ padding: '0 1rem', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1.1 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textDecoration: 'underline', marginBottom: '3px' }}>Additional Notes:</div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#4A5568', lineHeight: '1.3' }}>{voucher.narration}</p>
                {voucher.notes && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#4A5568', lineHeight: '1.3' }}>
                    <strong>Notes:</strong> {voucher.notes}
                  </p>
                )}
              </div>
              <div style={{ flex: 0.9 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                      <td style={{ padding: '4px 6px', fontWeight: 700 }}>Total value of supply</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(voucher.subtotal || voucher.amount || 0, cur)}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                      <td style={{ padding: '4px 6px', fontWeight: 700 }}>VAT</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtNum(voucher.vat_total || 0, cur)}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #CBD5E0', background: '#F7FAFC' }}>
                      <td style={{ padding: '4px 6px', fontWeight: 800 }}>Amount including VAT</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                        <OMRSymbol size={12} /> {fmtNum(grandTotal, cur)}
                      </td>
                    </tr>
                    <tr style={{ borderTop: '2px solid #2D3748', background: '#EDF2F7' }}>
                      <td style={{ padding: '5px 6px', fontWeight: 900 }}>Balance Amount</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                        <OMRSymbol size={12} /> {fmtNum(grandTotal, cur)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>

        {/* Row 4: Amounts in Words */}
        <tr style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <td style={{ padding: '0 1rem', border: 'none' }}>
            <div style={{ borderTop: '1px solid #CBD5E0', paddingTop: '6px', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.75rem', textDecoration: 'underline' }}>Amounts in Words</span>
              <div style={{ marginTop: '2px', fontStyle: 'italic', fontWeight: 600, fontSize: '0.75rem' }}>
                ( {numberToWordsOMR(grandTotal, cur)} )
              </div>
            </div>
          </td>
        </tr>

        {/* Row 5: Payment Instructions */}
        {isSale && (
          <tr style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <td style={{ padding: '0 1rem', border: 'none' }}>
              <div style={{ marginBottom: '0.75rem', maxWidth: '380px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.75rem', textDecoration: 'underline', marginBottom: '4px' }}>Payment Instructions</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #CBD5E0', fontSize: '0.72rem' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                      <td style={{ padding: '3px 5px', fontWeight: 700, background: '#EDF2F7', width: '35%' }}>Account No</td>
                      <td style={{ padding: '3px 5px', fontWeight: 600 }}>0332-07960213-0017</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                      <td style={{ padding: '3px 5px', fontWeight: 700, background: '#EDF2F7' }}>Account Name</td>
                      <td style={{ padding: '3px 5px', fontWeight: 600 }}>TADBEER TRANSFORMATIONS</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #CBD5E0' }}>
                      <td style={{ padding: '3px 5px', fontWeight: 700, background: '#EDF2F7' }}>Bank Name</td>
                      <td style={{ padding: '3px 5px', fontWeight: 600 }}>Bank Muscat</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '3px 5px', fontWeight: 700, background: '#EDF2F7' }}>Branch</td>
                      <td style={{ padding: '3px 5px', fontWeight: 600 }}>Main Branch</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        )}
        {/* Row 6: Signature Section (Appears only once at the end) */}
        <tr style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <td style={{ padding: '0 1rem 0.5rem 1rem', border: 'none' }}>
            <SignatureFooter type={voucher.type} />
            <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#718096', borderTop: '1px dashed #E2E8F0', paddingTop: '4px', marginTop: '0.75rem' }}>
              *This is a computer generated document*
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}
