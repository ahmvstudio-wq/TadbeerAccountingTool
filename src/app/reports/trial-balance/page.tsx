'use client'
import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Calendar, Printer, AlertCircle, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import { useUIStore } from '@/store/ui'

interface TrialBalanceEntry {
  id: string
  name: string
  account_code: string
  group_name: string
  nature: string
  debit: number
  credit: number
}

export default function TrialBalanceReport() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companySettings, setCompanySettings] = useState<any>(null)

  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [entries, setEntries] = useState<TrialBalanceEntry[]>([])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: settings } = await (supabase as any)
        .from('settings').select('*').eq('company_id', companyId).maybeSingle()
      setCompanySettings(settings)

      // Fetch all ledgers
      const { data: ledgers, error: ledgErr } = await (supabase as any)
        .from('ledgers')
        .select('id, name, account_code, group_id, opening_balance, opening_type, group:groups(id, name, nature)')
        .eq('company_id', companyId)

      if (ledgErr) throw ledgErr

      // Fetch journal lines up to asOfDate
      const { data: jLines, error: jErr } = await (supabase as any)
        .from('journal_lines')
        .select('ledger_id, type, amount')
        .lte('date', asOfDate)

      if (jErr) throw jErr

      // Calculate balance per ledger
      const drTotals: Record<string, number> = {}
      const crTotals: Record<string, number> = {}

      for (const line of jLines ?? []) {
        if (line.type === 'Dr') {
          drTotals[line.ledger_id] = (drTotals[line.ledger_id] || 0) + Number(line.amount)
        } else {
          crTotals[line.ledger_id] = (crTotals[line.ledger_id] || 0) + Number(line.amount)
        }
      }

      const results: TrialBalanceEntry[] = []

      for (const ledger of ledgers ?? []) {
        const nature = (ledger.group as any)?.nature || 'ASSET'
        const opBal = Number(ledger.opening_balance || 0)
        const opType = ledger.opening_type || 'Dr'
        
        const drSum = drTotals[ledger.id] || 0
        const crSum = crTotals[ledger.id] || 0

        let netDr = 0, netCr = 0

        if (nature === 'ASSET' || nature === 'EXPENSE') {
          const net = (opType === 'Dr' ? opBal : -opBal) + drSum - crSum
          if (net >= 0) netDr = net
          else netCr = -net
        } else {
          const net = (opType === 'Cr' ? opBal : -opBal) + crSum - drSum
          if (net >= 0) netCr = net
          else netDr = -net
        }

        // Only show accounts with non-zero balances
        if (netDr > 0 || netCr > 0) {
          results.push({
            id: ledger.id,
            name: ledger.name,
            account_code: ledger.account_code,
            group_name: (ledger.group as any)?.name || '',
            nature,
            debit: netDr,
            credit: netCr,
          })
        }
      }

      results.sort((a, b) => a.account_code.localeCompare(b.account_code))
      setEntries(results)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to generate trial balance.')
    } finally {
      setLoading(false)
    }
  }, [companyId, asOfDate])

  useEffect(() => { loadReport() }, [loadReport])

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001

  const handlePrint = () => window.print()

  const formatOMR = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' OMR'

  return (
    <div style={{ paddingBottom: '4rem' }}>
      <div className="page-header no-print" style={{ background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/masters" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Trial Balance</h1>
              <p className="page-subtitle">Summary of all ledger balances as of selected date</p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={16} /> Print
          </button>
        </div>

        <div className="card" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={16} className="text-muted" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>As of:</span>
            </div>
            <input type="date" className="form-control form-control-sm" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} style={{ width: 160 }} />
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}><AlertCircle size={16} /> <span>{error}</span></div>}

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }}><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>
      ) : (
        <div className="printable-area" style={{ background: '#ffffff', color: '#1a1a1a', padding: '3rem', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: "'Inter', sans-serif" }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #163B40', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#163B40', margin: '0 0 6px' }}>
                {companySettings?.company_name || 'Tadbeer Transformations'}
              </h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568' }}>
                {companySettings?.address || 'Muscat, Sultanate of Oman'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#163B40', margin: '0 0 4px', textTransform: 'uppercase' }}>TRIAL BALANCE</h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>As of: {new Date(asOfDate).toLocaleDateString('en-GB')}</p>
            </div>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #163B40', textAlign: 'left', fontWeight: 700, color: '#163B40' }}>
                <th style={{ padding: '8px 12px', width: '12%' }}>Code</th>
                <th style={{ padding: '8px 12px' }}>Account Name</th>
                <th style={{ padding: '8px 12px', width: '20%' }}>Group</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', width: '18%' }}>Debit (Dr)</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', width: '18%' }}>Credit (Cr)</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{entry.account_code}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <Link href={`/reports/ledgers?ledger_id=${entry.id}`} className="no-print" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>{entry.name}</Link>
                    <span className="only-print">{entry.name}</span>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#718096', fontSize: '0.8rem' }}>{entry.group_name}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: entry.debit > 0 ? 600 : 400, color: entry.debit > 0 ? '#22c55e' : 'inherit', fontVariantNumeric: 'tabular-nums' }}>
                    {entry.debit > 0 ? formatOMR(entry.debit) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: entry.credit > 0 ? 600 : 400, color: entry.credit > 0 ? '#ef4444' : 'inherit', fontVariantNumeric: 'tabular-nums' }}>
                    {entry.credit > 0 ? formatOMR(entry.credit) : '—'}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #163B40', fontWeight: 800, background: '#f8fafc' }}>
                <td style={{ padding: '12px' }} colSpan={3}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span>TOTAL</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isBalanced ? '#22c55e' : '#ef4444' }}>
                      {isBalanced ? 'BALANCED' : `DIFFERENCE: ${formatOMR(Math.abs(totalDebit - totalCredit))}`}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{formatOMR(totalDebit)}</td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{formatOMR(totalCredit)}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '4rem', textAlign: 'center', fontSize: '0.75rem', color: '#718096' }}>
            *This is a computer generated report*
          </div>
        </div>
      )}
    </div>
  )
}
