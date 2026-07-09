import React from 'react'
import type { Voucher, JournalLine } from '@/lib/types'

interface PrintableVoucherProps {
  voucher: Voucher
  journalLines: (JournalLine & { ledger?: { name: string; account_code: string; classification: string } })[]
  companySettings?: {
    company_name: string
    address?: string | null
    phone?: string | null
    email?: string | null
    logo_url?: string | null
  }
}

export function PrintableVoucher({ voucher, journalLines, companySettings }: PrintableVoucherProps) {
  // Calculate total debit and credit
  const drTotal = journalLines
    .filter(l => l.type === 'Dr')
    .reduce((sum, l) => sum + Number(l.amount), 0)
  const crTotal = journalLines
    .filter(l => l.type === 'Cr')
    .reduce((sum, l) => sum + Number(l.amount), 0)

  const typeLabels: Record<string, string> = {
    PURCHASE: 'Purchase Voucher',
    SALE: 'Sales Invoice / Voucher',
    RECEIPT: 'Receipt Voucher',
    PAYMENT: 'Payment Voucher',
    JOURNAL: 'Journal Voucher',
    PURCHASE_RETURN: 'Purchase Return Note',
    SALES_RETURN: 'Sales Return Note',
  }

  const voucherTitle = typeLabels[voucher.type] || 'Journal Entry'

  return (
    <div id="printable-voucher" className="printable-voucher">
      {/* Header */}
      <div className="print-header">
        <div className="company-info">
          {companySettings?.logo_url ? (
            <img src={companySettings.logo_url} alt="Logo" className="print-logo" />
          ) : (
            <div className="print-logo-fallback">T</div>
          )}
          <div>
            <h2 className="print-company-name">{companySettings?.company_name || 'Tadbeer Transformations'}</h2>
            <p className="print-company-details">{companySettings?.address || 'Muscat, Sultanate of Oman'}</p>
            <p className="print-company-details">
              {companySettings?.phone ? `Phone: ${companySettings.phone}` : ''}
              {companySettings?.phone && companySettings?.email ? ' | ' : ''}
              {companySettings?.email ? `Email: ${companySettings.email}` : ''}
            </p>
          </div>
        </div>
        <div className="print-title-box">
          <h1 className="print-voucher-title">{voucherTitle.toUpperCase()}</h1>
          <table className="print-meta-table">
            <tbody>
              <tr>
                <td><strong>Voucher No:</strong></td>
                <td>{voucher.voucher_number}</td>
              </tr>
              <tr>
                <td><strong>Date:</strong></td>
                <td>{new Date(voucher.date).toLocaleDateString('en-GB')}</td>
              </tr>
              {voucher.ref && (
                <tr>
                  <td><strong>Reference:</strong></td>
                  <td>{voucher.ref}</td>
                </tr>
              )}
              <tr>
                <td><strong>Currency:</strong></td>
                <td>{voucher.currency}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <hr className="print-divider" />

      {/* Party / Description */}
      <div className="print-party-section">
        {voucher.party_name && (
          <div className="print-party-row">
            <strong>Corporate Party / Ledger:</strong> <span>{voucher.party_name}</span>
          </div>
        )}
        <div className="print-party-row">
          <strong>General Narration:</strong> <span>{voucher.narration}</span>
        </div>
      </div>

      {/* Accounting Entries Table */}
      <table className="print-entries-table">
        <thead>
          <tr>
            <th style={{ width: '15%' }}>Code</th>
            <th style={{ width: '45%' }}>Account Name</th>
            <th style={{ width: '20%', textAlign: 'right' }}>Debit ({voucher.currency})</th>
            <th style={{ width: '20%', textAlign: 'right' }}>Credit ({voucher.currency})</th>
          </tr>
        </thead>
        <tbody>
          {journalLines.map((line, idx) => {
            const rate = voucher.exchange_rate || 1
            const txAmount = Number(line.amount) / rate

            return (
              <tr key={line.id || idx}>
                <td>{line.ledger?.account_code || '—'}</td>
                <td>
                  <div className="print-ledger-name">{line.ledger?.name || '—'}</div>
                  <div className="print-ledger-type">({line.ledger?.classification || 'Nominal'})</div>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {line.type === 'Dr' ? txAmount.toLocaleString('en-US', { minimumFractionDigits: 3 }) : '—'}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {line.type === 'Cr' ? txAmount.toLocaleString('en-US', { minimumFractionDigits: 3 }) : '—'}
                </td>
              </tr>
            )
          })}
          {/* Total Row */}
          <tr className="print-total-row">
            <td colSpan={2} style={{ textAlign: 'right' }}><strong>Total:</strong></td>
            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              <strong>{(drTotal / (voucher.exchange_rate || 1)).toLocaleString('en-US', { minimumFractionDigits: 3 })}</strong>
            </td>
            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              <strong>{(crTotal / (voucher.exchange_rate || 1)).toLocaleString('en-US', { minimumFractionDigits: 3 })}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {voucher.notes && (
        <div className="print-notes-section">
          <strong>Remarks / Notes:</strong>
          <p>{voucher.notes}</p>
        </div>
      )}

      {/* Signature Section */}
      <div className="print-signature-section">
        <div className="print-signature-box">
          <div className="print-signature-line" />
          <span>Prepared By</span>
        </div>
        <div className="print-signature-box">
          <div className="print-signature-line" />
          <span>Checked By</span>
        </div>
        <div className="print-signature-box">
          <div className="print-signature-line" />
          <span>Authorized Approval</span>
        </div>
        <div className="print-signature-box">
          <div className="print-signature-line" />
          <span>Receiver's Signature</span>
        </div>
      </div>
    </div>
  )
}
