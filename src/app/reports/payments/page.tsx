'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Voucher, JournalLine } from '@/lib/types'
import { useUIStore } from '@/store/ui'

export default function PaymentRegisterPage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'
  const activeCompanyName = useUIStore(state => state.activeCompanyName) || 'Tadbeer Transformations'

  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  
  // Date filter states
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])

  const loadData = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('vouchers')
      .select('*, journal_lines(*, ledger:ledgers(name))')
      .eq('type', 'PAYMENT')
      .eq('company_id', currentCompanyId)
      .order('date', { ascending: false })

    if (fromDate) query = query.gte('date', fromDate)
    if (toDate) query = query.lte('date', toDate)

    const { data } = await query
    setVouchers((data as any) || [])
    setLoading(false)
  }, [fromDate, toDate, currentCompanyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totalAmount = vouchers.reduce((sum, v) => sum + Number(v.amount), 0)

  function fmt(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  }

  // Export CSV
  function exportCSV() {
    const headers = ['Date', 'Voucher No', 'Paid From (Bank/Cash)', 'Paid To (Party)', 'Narration', 'Amount (OMR)']
    const dataRows = vouchers.map(v => {
      // Find the credit bank/cash account
      const crLine = v.journal_lines?.find((line: any) => line.type === 'Cr')
      const ledgerName = crLine?.ledger?.name || 'Bank/Cash'
      return [
        v.date,
        v.voucher_number || '—',
        ledgerName,
        v.party_name || '—',
        `"${(v.narration || '').replace(/"/g, '""')}"`,
        v.amount.toFixed(3)
      ]
    })
    const totalsRow = ['Totals', '', '', '', '', totalAmount.toFixed(3)]

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...dataRows.map(e => e.join(',')), totalsRow.join(',')].join('\n')
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Payment_Register_${fromDate || 'Start'}_to_${toDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment Register</h1>
          <p className="page-subtitle">Historical registry of all corporate disbursements and bank transfers</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={loading || vouchers.length === 0}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
            <Download size={14} /> Print / PDF
          </button>
          <button className="btn btn-outline btn-sm" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">From Date</label>
            <input type="date" className="form-control" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">To Date</label>
            <input type="date" className="form-control" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={loadData} disabled={loading} style={{ height: 44 }}>
            Apply filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: '1.5rem 0' }}>
        <div style={{ padding: '0 1.75rem 1.25rem', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-teal)' }}>
              Disbursement Registry (Payments)
            </h2>
            <p className="text-xs text-muted" style={{ marginTop: 2 }}>
              Entity: <strong>{activeCompanyName}</strong>
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            <div>Period: {fromDate || 'Start'} to {toDate}</div>
            <div>Generated: {new Date().toLocaleString()}</div>
          </div>
        </div>

        <div className="table-wrapper" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher No</th>
                <th>Paid From (Account)</th>
                <th>Paid To (Vendor)</th>
                <th>Narration</th>
                <th style={{ textAlign: 'right' }}>Amount (OMR)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center' }}>Loading register...</td></tr>
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={6} className="table-empty">No payments found.</td></tr>
              ) : (
                <>
                  {vouchers.map(v => {
                    const crLine = v.journal_lines?.find((line: any) => line.type === 'Cr')
                    const ledgerName = crLine?.ledger?.name || 'Bank/Cash'
                    return (
                      <tr key={v.id}>
                        <td className="text-xs text-muted">{new Date(v.date).toLocaleDateString('en-GB')}</td>
                        <td style={{ fontWeight: 700, color: 'var(--color-teal)' }}>{v.voucher_number}</td>
                        <td style={{ fontWeight: 500 }}>{ledgerName}</td>
                        <td style={{ fontWeight: 500 }}>{v.party_name || '—'}</td>
                        <td style={{ fontSize: '0.85rem' }}>{v.narration}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                          {fmt(Number(v.amount))}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="report-grand-total" style={{ borderTop: '2px double var(--color-border)', background: 'var(--color-surface-alt)', fontWeight: 800 }}>
                    <td colSpan={5}>TOTAL DISBURSEMENTS</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '1rem' }}>
                      {fmt(totalAmount)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
