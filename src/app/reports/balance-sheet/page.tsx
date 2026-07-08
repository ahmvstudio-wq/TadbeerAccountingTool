'use client'
import { useEffect, useState } from 'react'
import { Download, RefreshCw, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { getBalanceSheet } from '@/lib/accounting'
import type { BalanceSheet } from '@/lib/types'
import { useUIStore } from '@/store/ui'

export default function BalanceSheetPage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'
  const activeCompanyName = useUIStore(state => state.activeCompanyName) || 'Tadbeer Transformations'

  const [bs, setBS] = useState<BalanceSheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
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
      const data = await getBalanceSheet(asOfDate)
      setBS(data)
    } finally {
      setLoading(false)
    }
  }

  function fmt(n: number) {
    return `${currency} ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
  }

  // Group by group_name
  function groupBy(rows: { group_name: string; ledger_name: string; amount: number }[]) {
    const map: Record<string, { ledger_name: string; amount: number }[]> = {}
    for (const r of rows) {
      if (!map[r.group_name]) map[r.group_name] = []
      map[r.group_name].push({ ledger_name: r.ledger_name, amount: r.amount })
    }
    return map
  }

  // Export CSV
  function exportCSV() {
    if (!bs) return
    const headers = ['Category', 'Group Name', 'Ledger Name', 'Amount (OMR)']
    const dataRows: string[][] = []

    bs.assets.forEach(r => {
      dataRows.push(['Assets', r.group_name, r.ledger_name, Math.abs(r.amount).toFixed(3)])
    })
    dataRows.push(['Total Assets', '', '', bs.total_assets.toFixed(3)])

    bs.liabilities.forEach(r => {
      dataRows.push(['Liabilities', r.group_name, r.ledger_name, Math.abs(r.amount).toFixed(3)])
    })
    bs.equity.forEach(r => {
      dataRows.push(['Equity', r.group_name, r.ledger_name, Math.abs(r.amount).toFixed(3)])
    })
    dataRows.push(['Total Liabilities & Equity', '', '', bs.total_liabilities_equity.toFixed(3)])

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...dataRows.map(e => e.join(','))].join('\n')
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Balance_Sheet_As_Of_${asOfDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Balance Sheet</h1>
          <p className="page-subtitle">The financial position of the company as of a date</p>
        </div>
        <div className="page-actions">
          {bs && (
            bs.is_balanced
              ? <span className="badge badge-success"><CheckCircle size={12} /> Balanced</span>
              : <span className="badge badge-danger"><AlertTriangle size={12} /> Out of Balance</span>
          )}
          <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={loading || !bs}>
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
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">As of Date</label>
            <input type="date" className="form-control" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading} style={{ height: 44 }}>
            Apply
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div className="skeleton" style={{ height: 400, borderRadius: 16 }} />
          <div className="skeleton" style={{ height: 400, borderRadius: 16 }} />
        </div>
      ) : bs ? (
        <>
          {/* Export/Print header */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '1.5rem 1.75rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-teal)' }}>
                  Balance Sheet Statement
                </h2>
                <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                  Active Entity: <strong>{activeCompanyName}</strong>
                </p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                <div>Reporting Date: As of {asOfDate}</div>
                <div>Generated: {new Date().toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {/* Assets */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Business Owned (Assets)</div>
                <span className="text-lg font-bold" style={{ color: 'var(--color-teal)' }}>
                  {fmt(bs.total_assets)}
                </span>
              </div>
              <BSSection groups={groupBy(bs.assets)} fmt={fmt} color="var(--color-teal)" />
              <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Total Value (Assets)</span>
                <span style={{ color: 'var(--color-teal)' }}>{fmt(bs.total_assets)}</span>
              </div>
            </div>

            {/* Liabilities + Equity */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Claims & Capital (Liabilities & Equity)</div>
                <span className="text-lg font-bold" style={{ color: 'var(--color-gold-dark)' }}>
                  {fmt(bs.total_liabilities_equity)}
                </span>
              </div>
              {bs.liabilities.length > 0 && (
                <>
                  <div style={{ padding: '0.5rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-warning)', background: 'var(--color-warning-pale)' }}>
                    Amounts We Owe (Liabilities)
                  </div>
                  <BSSection groups={groupBy(bs.liabilities)} fmt={fmt} color="var(--color-warning)" />
                </>
              )}
              {bs.equity.length > 0 && (
                <>
                  <div style={{ padding: '0.5rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-gold-dark)', background: 'var(--color-gold-pale)' }}>
                    Owner Investments (Equity)
                  </div>
                  <BSSection groups={groupBy(bs.equity)} fmt={fmt} color="var(--color-gold-dark)" />
                </>
              )}
              <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Total Claims & Capital</span>
                <span style={{ color: 'var(--color-gold-dark)' }}>{fmt(bs.total_liabilities_equity)}</span>
              </div>
            </div>
          </div>

          {/* Balance Check Warning banner */}
          <div className={`alert ${bs.is_balanced ? 'alert-success' : 'alert-danger'}`}>
            {bs.is_balanced ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>
              {bs.is_balanced
                ? `Company Worth balances. Total Value (${fmt(bs.total_assets)}) equals Total Claims & Capital (${fmt(bs.total_liabilities_equity)}).`
                : `⚠ Balance Sheet does NOT balance by ${fmt(Math.abs(bs.total_assets - bs.total_liabilities_equity))}. Check your ledger categories.`
              }
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}

function BSSection({
  groups, fmt, color
}: {
  groups: Record<string, { ledger_name: string; amount: number }[]>
  fmt: (n: number) => string
  color: string
}) {
  return (
    <div className="table-wrapper" style={{ border: 'none' }}>
      <table>
        <tbody>
          {Object.entries(groups).map(([groupName, ledgers]) => (
            <>
              <tr key={`grp-${groupName}`} style={{ background: 'var(--color-surface-alt)' }}>
                <td style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-text-secondary)', paddingLeft: '1rem' }} colSpan={2}>
                  {groupName}
                </td>
              </tr>
              {ledgers.map((l, i) => (
                <tr key={i}>
                  <td style={{ paddingLeft: '2rem' }}>{l.ledger_name}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color }}>{fmt(l.amount)}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
