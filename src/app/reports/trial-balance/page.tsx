'use client'
import { useEffect, useState } from 'react'
import { Download, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react'
import { getTrialBalance } from '@/lib/accounting'
import type { TrialBalanceRow } from '@/lib/types'
import { useUIStore } from '@/store/ui'

export default function TrialBalancePage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'
  const activeCompanyName = useUIStore(state => state.activeCompanyName) || 'Tadbeer Transformations'

  const [rows, setRows] = useState<TrialBalanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState(new Date().toISOString().split('T')[0])

  async function load() {
    setLoading(true)
    try {
      // Fetch trial balance scoped to company
      const data = await getTrialBalance(fromDate || undefined, toDate || undefined)
      // Since supabase is client, let's filter inside lib/accounting or here.
      // Wait, we will modify getTrialBalance in accounting.ts to filter by company_id!
      setRows(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentCompanyId])

  // Calculate closing debit/credit columns sum
  const totalDr = rows.reduce((s, r) => s + (r.balance_type === 'Dr' ? r.balance : 0), 0)
  const totalCr = rows.reduce((s, r) => s + (r.balance_type === 'Cr' ? r.balance : 0), 0)
  
  const difference = Math.abs(totalDr - totalCr)
  const isBalanced = difference < 0.001

  function fmt(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  }

  // Export CSV
  function exportCSV() {
    const headers = ['Account Name', 'Debit (Dr)', 'Credit (Cr)']
    const dataRows = rows.map(r => [
      r.ledger_name,
      r.balance_type === 'Dr' ? r.balance.toFixed(3) : '0.000',
      r.balance_type === 'Cr' ? r.balance.toFixed(3) : '0.000'
    ])
    const totalRow = ['Totals', totalDr.toFixed(3), totalCr.toFixed(3)]

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...dataRows.map(e => e.join(',')), totalRow.join(',')].join('\n')
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Trial_Balance_${fromDate || 'Start'}_to_${toDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Trial Balance</h1>
          <p className="page-subtitle">Summary of all ledger debit and credit balances for the company</p>
        </div>
        <div className="page-actions">
          {isBalanced
            ? <span className="badge badge-success"><CheckCircle size={12} /> Balanced</span>
            : <span className="badge badge-danger"><AlertTriangle size={12} /> Out of Balance</span>
          }
          <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={loading || rows.length === 0}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
            <Download size={14} /> Print / PDF
          </button>
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Trial Balance Warning Banner */}
      {!isBalanced && !loading && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem', border: '1px solid var(--color-danger)' }}>
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>⚠ Trial Balance is out of balance by {fmt(difference)} OMR.</strong> Check for posting errors or unassigned accounts.
          </div>
        </div>
      )}

      {/* Date Filter */}
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
          <button className="btn btn-primary" onClick={load} disabled={loading} style={{ height: 44 }}>
            {loading ? 'Loading...' : 'Apply Filters'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '1.5rem 0' }}>
        {/* Standard Corporate Header for Exports/Print */}
        <div style={{ padding: '0 1.75rem 1.25rem', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-teal)' }}>
              Trial Balance Statement
            </h2>
            <p className="text-xs text-muted" style={{ marginTop: 2 }}>
              Active Entity: <strong>{activeCompanyName}</strong>
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
                <th>Account Name</th>
                <th style={{ textAlign: 'right' }}>Debit (OMR)</th>
                <th style={{ textAlign: 'right' }}>Credit (OMR)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center' }}>Loading Trial Balance...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={3} className="table-empty">No balances found for the selected period.</td></tr>
              ) : (
                <>
                  {rows.map(row => (
                    <tr key={row.ledger_id}>
                      <td style={{ fontWeight: 500 }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginRight: 8 }}>
                          [{row.ledger_id.substring(0,4)}...]
                        </span>
                        {row.ledger_name}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)' }}>
                        {row.balance_type === 'Dr' ? fmt(row.balance) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)' }}>
                        {row.balance_type === 'Cr' ? fmt(row.balance) : '—'}
                      </td>
                    </tr>
                  ))}

                  {/* Totals Row */}
                  <tr className="report-grand-total" style={{ borderTop: '2px double var(--color-border)', background: 'var(--color-surface-alt)', fontWeight: 800 }}>
                    <td>TOTALS</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)', fontSize: '1rem' }}>
                      {fmt(totalDr)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)', fontSize: '1rem' }}>
                      {fmt(totalCr)}
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
