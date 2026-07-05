'use client'
import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { getTrialBalance } from '@/lib/accounting'
import type { TrialBalanceRow, Nature } from '@/lib/types'

const NATURE_ORDER: Nature[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']
const NATURE_LABELS: Record<Nature, string> = {
  ASSET: 'Business Owned (Assets)',
  LIABILITY: 'Amount We Owe (Liabilities)',
  EQUITY: 'Owner Investment (Equity)',
  INCOME: 'Earnings (Income)',
  EXPENSE: 'Money Spent (Expenses)',
}

export default function TrialBalancePage() {
  const [rows, setRows] = useState<TrialBalanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState(new Date().toISOString().split('T')[0])

  async function load() {
    setLoading(true)
    try {
      const data = await getTrialBalance(fromDate || undefined, toDate || undefined)
      setRows(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const totalDr = rows.reduce((s, r) => s + r.total_dr, 0)
  const totalCr = rows.reduce((s, r) => s + r.total_cr, 0)
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01

  const grouped = NATURE_ORDER.reduce<Record<Nature, TrialBalanceRow[]>>(
    (acc, n) => { acc[n] = rows.filter(r => r.nature === n); return acc },
    {} as Record<Nature, TrialBalanceRow[]>
  )

  function fmt(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Trial Balance</h1>
          <p className="page-subtitle">Aggregate debit and credit balances of all ledgers</p>
        </div>
        <div className="page-actions">
          {isBalanced
            ? <span className="badge badge-success">✓ Balanced</span>
            : <span className="badge badge-danger">⚠ Out of Balance</span>
          }
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
            <Download size={14} /> Print
          </button>
        </div>
      </div>

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
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Apply'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Account Ledger</th>
                <th>Classification</th>
                <th style={{ textAlign: 'right' }}>Added (+)</th>
                <th style={{ textAlign: 'right' }}>Deducted (-)</th>
                <th style={{ textAlign: 'right' }}>Remaining Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="table-empty">No transactions found for the selected period.</td></tr>
              ) : (
                NATURE_ORDER.map(nature => {
                  const natRows = grouped[nature]
                  if (natRows.length === 0) return null
                  const natDr = natRows.reduce((s, r) => s + r.total_dr, 0)
                  const natCr = natRows.reduce((s, r) => s + r.total_cr, 0)
                  return (
                    <>
                      <tr key={`hdr-${nature}`} className="report-section-header">
                        <td colSpan={5}>{NATURE_LABELS[nature]}</td>
                      </tr>
                      {natRows.map(row => (
                        <tr key={row.ledger_id}>
                          <td style={{ paddingLeft: '2rem' }}>{row.ledger_name}</td>
                          <td className="text-muted text-sm">{row.group_name}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {row.total_dr > 0 ? fmt(row.total_dr) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {row.total_cr > 0 ? fmt(row.total_cr) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                            <span className={row.balance_type === 'Dr' ? 'amount-dr' : 'amount-cr'}>
                              {fmt(row.balance)} {row.balance_type === 'Dr' ? '(+)' : '(-)'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="report-total-row" key={`tot-${nature}`}>
                        <td colSpan={2}>Subtotal — {NATURE_LABELS[nature]}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(natDr)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(natCr)}</td>
                        <td></td>
                      </tr>
                    </>
                  )
                })
              )}
              {/* Grand Total */}
              {rows.length > 0 && (
                <tr className="report-grand-total">
                  <td colSpan={2}>GRAND TOTAL SUMMARY</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalDr)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCr)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {isBalanced ? '✓ Balanced' : `Difference: ${fmt(Math.abs(totalDr - totalCr))}`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
