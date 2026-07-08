'use client'
import { useEffect, useState } from 'react'
import { Download, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import { getProfitAndLoss } from '@/lib/accounting'
import type { PLStatement } from '@/lib/types'
import { useUIStore } from '@/store/ui'

export default function ProfitLossPage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'
  const activeCompanyName = useUIStore(state => state.activeCompanyName) || 'Tadbeer Transformations'

  const [pl, setPL] = useState<PLStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const currentYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${currentYear}-04-01`)
  const [toDate,   setToDate]   = useState(`${currentYear + 1}-03-31`)
  const [currency, setCurrency] = useState('OMR')

  useEffect(() => {
    import('@/lib/supabase/client').then(({ supabase }) => {
      (supabase.from('settings').select('base_currency').eq('company_id', currentCompanyId).single() as any).then(({ data }: any) => {
        if (data) setCurrency(data.base_currency)
      })
    })
    load()
  }, [currentCompanyId])

  async function load() {
    setLoading(true)
    try {
      const data = await getProfitAndLoss(fromDate, toDate)
      setPL(data)
    } finally {
      setLoading(false)
    }
  }

  function fmt(n: number) {
    return `${currency} ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
  }

  // Export CSV helper
  function exportCSV() {
    if (!pl) return
    const headers = ['Type', 'Ledger Name', 'Amount (OMR)']
    const dataRows: string[][] = []

    pl.income.forEach(r => {
      dataRows.push(['Income', r.ledger_name, Math.abs(r.amount).toFixed(3)])
    })
    dataRows.push(['Total Income', '', pl.total_income.toFixed(3)])

    pl.expenses.forEach(r => {
      dataRows.push(['Expenses', r.ledger_name, Math.abs(r.amount).toFixed(3)])
    })
    dataRows.push(['Total Expenses', '', pl.total_expenses.toFixed(3)])
    dataRows.push([pl.is_profit ? 'Net Profit' : 'Net Loss', '', Math.abs(pl.net_profit).toFixed(3)])

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...dataRows.map(e => e.join(','))].join('\n')
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Profit_and_Loss_${fromDate}_to_${toDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Profit & Loss</h1>
          <p className="page-subtitle">Income vs Expenses statement for the active company</p>
        </div>
        <div className="page-actions">
          {pl && (
            <span className={`badge ${pl.is_profit ? 'badge-success' : 'badge-danger'}`}>
              {pl.is_profit ? 'Net Profit' : 'Net Loss'}
            </span>
          )}
          <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={loading || !pl}>
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
            Apply
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div className="skeleton" style={{ height: 300, borderRadius: 16 }} />
          <div className="skeleton" style={{ height: 300, borderRadius: 16 }} />
        </div>
      ) : pl ? (
        <>
          {/* Print/Export Corporate Header */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '1.5rem 1.75rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-teal)' }}>
                  Profit & Loss Statement
                </h2>
                <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                  Entity Name: <strong>{activeCompanyName}</strong>
                </p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                <div>Reporting period: {fromDate} to {toDate}</div>
                <div>Generated: {new Date().toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {/* Income */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={18} style={{ color: 'var(--color-success)' }} />
                  <div className="card-title">Income</div>
                </div>
                <span className="text-lg font-bold" style={{ color: 'var(--color-success)' }}>
                  {fmt(pl.total_income)}
                </span>
              </div>
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table>
                  <tbody>
                    {pl.income.length === 0 ? (
                      <tr><td className="table-empty" style={{ padding: '2rem' }}>No income entries</td></tr>
                    ) : pl.income.map((row, i) => (
                      <tr key={i}>
                        <td>{row.ledger_name}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)' }}>
                          {fmt(row.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="report-total-row">
                      <td>Total Income</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)' }}>
                        {fmt(pl.total_income)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expenses */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingDown size={18} style={{ color: 'var(--color-danger)' }} />
                  <div className="card-title">Expenses</div>
                </div>
                <span className="text-lg font-bold" style={{ color: 'var(--color-danger)' }}>
                  {fmt(pl.total_expenses)}
                </span>
              </div>
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table>
                  <tbody>
                    {pl.expenses.length === 0 ? (
                      <tr><td className="table-empty" style={{ padding: '2rem' }}>No expense entries</td></tr>
                    ) : pl.expenses.map((row, i) => (
                      <tr key={i}>
                        <td>{row.ledger_name}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)' }}>
                          {fmt(row.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="report-total-row">
                      <td>Total Expenses</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)' }}>
                        {fmt(pl.total_expenses)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Net Result */}
          <div className="card">
            <div style={{
              padding: '1.5rem 2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: pl.is_profit ? 'var(--color-success-pale)' : 'var(--color-danger-pale)',
              borderRadius: 16,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: pl.is_profit ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  Net {pl.is_profit ? 'Profit' : 'Loss'}
                </div>
                <div className="text-sm text-muted">For the period {fromDate} to {toDate}</div>
              </div>
              <div style={{
                fontSize: '2rem', fontWeight: 700,
                color: pl.is_profit ? 'var(--color-success)' : 'var(--color-danger)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fmt(pl.net_profit)}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
