'use client'
import React from 'react'
import type { Voucher, JournalLine } from '@/lib/types'
import { numberToWords } from '@/lib/accounting'

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
}

export function PrintableVoucher({ voucher, journalLines, voucherLines = [], companySettings, partyLedger }: PrintableVoucherProps) {
  const drTotal = journalLines
    .filter(l => l.type === 'Dr')
    .reduce((sum, l) => sum + Number(l.amount), 0)
  const crTotal = journalLines
    .filter(l => l.type === 'Cr')
    .reduce((sum, l) => sum + Number(l.amount), 0)

  const typeLabels: Record<string, string> = {
    PURCHASE: 'PURCHASE INVOICE',
    SALE: 'TAX INVOICE',
    RECEIPT: 'RECEIPT VOUCHER',
    PAYMENT: 'PAYMENT VOUCHER',
    JOURNAL: 'JOURNAL VOUCHER',
  }

  const voucherTitle = typeLabels[voucher.type] || 'JOURNAL ENTRY'
  const grandTotal = Number(voucher.grand_total || voucher.amount || 0)
  const isInvoice = voucher.type === 'SALE' || voucher.type === 'PURCHASE'

  return (
    <div id="printable-voucher" className="printable-voucher" style={{ background: '#FFFFFF', color: '#1F2421', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", padding: '2rem' }}>
      
      {/* 1. HEADER SECTION (Logo on Right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #163B40', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        {/* Left Side: Company Details */}
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#163B40', margin: '0 0 6px' }}>
            {companySettings?.company_name || 'Tadbeer Transformations'}
          </h2>
          <p style={{ margin: '0 0 2px', fontSize: '0.8rem', color: '#4A5568' }}>
            {companySettings?.address || 'Muscat, Sultanate of Oman'}
          </p>
          <p style={{ margin: '0 0 2px', fontSize: '0.8rem', color: '#4A5568' }}>
            Phone: {companySettings?.phone || '+968 7630 7656'} | Email: {companySettings?.email || 'operation@tadbeertt.com'}
          </p>
          {(companySettings?.vat_number || 'OM100000000') && (
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', fontWeight: 600, color: '#163B40' }}>
              <strong>VAT No:</strong> {companySettings?.vat_number || 'OM100000000'}
            </p>
          )}
        </div>

        {/* Right Side: Logo & Invoice Block */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          {companySettings?.logo_url ? (
            <img src={companySettings.logo_url} alt="Logo" style={{ width: 140, height: 140, objectFit: 'contain' }} />
          ) : (
            <img src="/Logo .png" alt="Logo" style={{ width: 140, height: 140, objectFit: 'contain', background: 'transparent' }} />
          )}
          
          <div style={{ textAlign: 'right', marginTop: '0.25rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#163B40', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
              {voucherTitle}
            </h1>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', marginLeft: 'auto' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '2px 8px', fontWeight: 600, border: '1px solid #E2E8F0', background: '#F7FAFC' }}>DATE</td>
                  <td style={{ padding: '2px 8px', border: '1px solid #E2E8F0' }}>{new Date(voucher.date).toLocaleDateString('en-GB')}</td>
                </tr>
                <tr>
                  <td style={{ padding: '2px 8px', fontWeight: 600, border: '1px solid #E2E8F0', background: '#F7FAFC' }}>
                    {voucher.type === 'SALE' ? 'INVOICE #' : 'VOUCHER #'}
                  </td>
                  <td style={{ padding: '2px 8px', border: '1px solid #E2E8F0', fontWeight: 700 }}>{voucher.voucher_number}</td>
                </tr>
                {voucher.ref && (
                  <tr>
                    <td style={{ padding: '2px 8px', fontWeight: 600, border: '1px solid #E2E8F0', background: '#F7FAFC' }}>REF NO.</td>
                    <td style={{ padding: '2px 8px', border: '1px solid #E2E8F0' }}>{voucher.ref}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 2. BILL TO / SHIP TO SECTION */}
      {isInvoice && (
        <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
          {/* Bill To */}
          <div style={{ flex: 1 }}>
            <div style={{ background: '#163B40', color: '#FFFFFF', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', borderRadius: '4px 4px 0 0' }}>
              {voucher.type === 'SALE' ? 'Bill To:' : 'Billed From / Vendor:'}
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderTop: 'none', padding: '10px', minHeight: '100px', fontSize: '0.8rem', lineHeight: 1.4 }}>
              <strong>{partyLedger?.name || voucher.party_name}</strong>
              {partyLedger?.address && <p style={{ margin: '4px 0 2px' }}>{partyLedger.address}</p>}
              {partyLedger?.phone && <p style={{ margin: '0' }}>Phone: {partyLedger.phone}</p>}
              {partyLedger?.email && <p style={{ margin: '0' }}>Email: {partyLedger.email}</p>}
              {partyLedger?.vat_number && <p style={{ margin: '4px 0 0', fontWeight: 600 }}>VAT No: {partyLedger.vat_number}</p>}
            </div>
          </div>
          {/* Ship To / Project Delivery */}
          <div style={{ flex: 1 }}>
            <div style={{ background: '#163B40', color: '#FFFFFF', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', borderRadius: '4px 4px 0 0' }}>
              Service Delivery / Project:
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderTop: 'none', padding: '10px', minHeight: '100px', fontSize: '0.8rem', lineHeight: 1.4 }}>
              <strong>{companySettings?.company_name || 'Tadbeer Transformations'}</strong>
              <p style={{ margin: '4px 0 2px' }}>Corporate Service Desk Delivery</p>
              <p style={{ margin: '0', fontStyle: 'italic', color: '#4A5568' }}>Project Context: {voucher.narration}</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. VOUCHER ATTRIBUTES ROW */}
      <div style={{ background: '#163B40', color: '#FFFFFF', display: 'flex', fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px', borderRadius: '4px', marginBottom: '1.5rem', textTransform: 'uppercase' }}>
        <div style={{ flex: 1 }}>Prepared By: <span style={{ fontWeight: 500, color: '#F4EBD0' }}>Admin Authorized</span></div>
        <div style={{ flex: 1 }}>Currency: <span style={{ fontWeight: 500, color: '#F4EBD0' }}>{voucher.currency}</span></div>
        <div style={{ flex: 2 }}>Terms / Method: <span style={{ fontWeight: 500, color: '#F4EBD0' }}>{voucher.type === 'SALE' ? 'Bank Transfer (30 Days)' : 'Immediate Payment'}</span></div>
        {voucher.ref && <div style={{ flex: 1 }}>Instrument: <span style={{ fontWeight: 500, color: '#F4EBD0' }}>{voucher.ref}</span></div>}
      </div>

      {/* 4. MAIN DETAILS GRID */}
      {isInvoice && voucherLines.length > 0 ? (
        /* Invoice Service Items Table */
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#163B40', color: '#FFFFFF', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700 }}>
              <th style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'left', width: '15%' }}>Code</th>
              <th style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'left', width: '45%' }}>Service Description</th>
              <th style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'center', width: '8%' }}>Qty</th>
              <th style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', width: '14%' }}>Unit Rate</th>
              <th style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', width: '18%' }}>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {voucherLines.map((line, idx) => (
              <tr key={line.id || idx}>
                <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>
                  {line.ledger?.account_code || '—'}
                </td>
                <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0' }}>
                  <strong>{line.description}</strong>
                  {line.vat_rate > 0 && <span style={{ fontSize: '0.7rem', color: '#4A5568', marginLeft: 8 }}>(VAT {line.vat_rate}%)</span>}
                </td>
                <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  1
                </td>
                <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(line.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {Number(line.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        /* Traditional Accounting Double-Entry Table (Dr/Cr) for Journal, Payment, Receipt */
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#163B40', color: '#FFFFFF', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700 }}>
              <th style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'left', width: '15%' }}>Code</th>
              <th style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'left', width: '45%' }}>Account Mapped</th>
              <th style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', width: '20%' }}>Debit ({voucher.currency})</th>
              <th style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', width: '20%' }}>Credit ({voucher.currency})</th>
            </tr>
          </thead>
          <tbody>
            {journalLines.map((line, idx) => (
              <tr key={line.id || idx}>
                <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0', fontFamily: 'monospace' }}>
                  {line.ledger?.account_code || '—'}
                </td>
                <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0' }}>
                  <strong>{line.ledger?.name || '—'}</strong>
                </td>
                <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {line.type === 'Dr' ? Number(line.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                </td>
                <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {line.type === 'Cr' ? Number(line.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                </td>
              </tr>
            ))}
            <tr style={{ background: '#F7FAFC', fontWeight: 700 }}>
              <td colSpan={2} style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right' }}>Total:</td>
              <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {drTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #E2E8F0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {crTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* 5. SUMMARY BLOCK & SPECIAL INSTRUCTIONS */}
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', marginTop: '1rem' }}>
        {/* Remarks / Notes Left Box */}
        <div style={{ flex: 1.2, border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.8rem', padding: '10px', background: '#F7FAFC' }}>
          <span style={{ fontWeight: 700, color: '#163B40', display: 'block', marginBottom: '6px', borderBottom: '1px solid #E2E8F0', paddingBottom: '2px' }}>
            Terms & Billing Remarks
          </span>
          <p style={{ margin: '0 0 6px' }}><strong>Narration:</strong> {voucher.narration}</p>
          {voucher.notes ? (
            <p style={{ margin: 0 }}><strong>Special Instructions:</strong> {voucher.notes}</p>
          ) : (
            <p style={{ margin: 0 }}>Please cite invoice number in all wire transfers. Bank payments are subject to a 30-day corporate credit term.</p>
          )}
        </div>

        {/* Totals Right Box */}
        <div style={{ flex: 0.8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <tbody>
              <tr>
                <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>Subtotal</td>
                <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(voucher.subtotal || voucher.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              {Number(voucher.vat_total) > 0 && (
                <tr>
                  <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0' }}>VAT Amount (5%)</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #E2E8F0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(voucher.vat_total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              <tr style={{ background: '#163B40', color: '#FFFFFF', fontWeight: 700, fontSize: '1rem' }}>
                <td style={{ padding: '8px', border: '1px solid #163B40' }}>Grand Total</td>
                <td style={{ padding: '8px', border: '1px solid #163B40', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  OMR {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Amount in words */}
      <div style={{ marginTop: '1rem', padding: '8px 12px', background: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.8rem', color: '#4A5568', fontStyle: 'italic' }}>
        <strong>Amount in words:</strong> {numberToWords(grandTotal, 'OMR')}
      </div>

      {/* Signature Lines */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', marginTop: '3rem', fontSize: '0.75rem', textAlign: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #718096', margin: '0 auto 4px', width: '80%' }} />
          <span>Prepared By</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #718096', margin: '0 auto 4px', width: '80%' }} />
          <span>Checked By</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #718096', margin: '0 auto 4px', width: '80%' }} />
          <span>Authorized Approval</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #718096', margin: '0 auto 4px', width: '80%' }} />
          <span>Receiver&apos;s Signature</span>
        </div>
      </div>

      {/* Footer thank you */}
      <div style={{ marginTop: '2.5rem', textAlign: 'center', fontSize: '0.75rem', color: '#4A5568', borderTop: '1px dashed #E2E8F0', paddingTop: '1rem' }}>
        <p style={{ margin: '0 0 4px' }}>If you have any questions about this invoice, please contact Billing Operations at billing@tadbeer.om</p>
        <p style={{ margin: 0, fontWeight: 700, fontStyle: 'italic', color: '#163B40' }}>Thank You For Your Business!</p>
      </div>

    </div>
  )
}
