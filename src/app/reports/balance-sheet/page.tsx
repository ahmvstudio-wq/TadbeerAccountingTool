'use client'
import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Calendar, Printer, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import { useUIStore } from '@/store/ui'

interface BalanceEntry {
  id: string
  name: string
  account_code: string
  balance: number
}

export default function BalanceSheetReport() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companySettings, setCompanySettings] = useState<any>(null)
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])

  const [assets, setAssets] = useState<BalanceEntry[]>([])
  const [liabilities, setLiabilities] = useState<BalanceEntry[]>([])
  const [equity, setEquity] = useState<BalanceEntry[]>([])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: settings } = await (supabase as any)
        .from('settings').select('*').eq('company_id', companyId).maybeSingle()
      setCompanySettings(settings)

      const { data: ledgers } = await (supabase as any)
        .from('ledgers')
        .select('id, name, account_code, opening_balance, opening_type, group:groups(id, name, nature)')
        .eq('company_id', companyId)

      const { data: jLines } = await (supabase as any)
        .from('journal_lines')
        .select('ledger_id, type, amount')
        .lte('date', asOfDate)

      const drTotals: Record<string, number> = {}
      const crTotals: Record<string, number> = {}
      for (const line of jLines ?? []) {
        if (line.type === 'Dr') drTotals[line.ledger_id] = (drTotals[line.ledger_id] || 0) + Number(line.amount)
        else crTotals[line.ledger_id] = (crTotals[line.ledger_id] || 0) + Number(line.amount)
      }

      const assetList: BalanceEntry[] = []
      const liabList: BalanceEntry[] = []
      const eqList: BalanceEntry[] = []

      for (const ledger of ledgers ?? []) {
        const nature = (ledger.group as any)?.nature
        const opBal = Number(ledger.opening_balance || 0)
        const opType = ledger.opening_type || 'Dr'
        const drSum = drTotals[ledger.id] || 0
        const crSum = crTotals[ledger.id] || 0

        let netVal = 0
        if (nature === 'ASSET' || nature === 'EXPENSE') {
          netVal = (opType === 'Dr' ? opBal : -opBal) + drSum - crSum
        } else {
          netVal = (opType === 'Cr' ? opBal : -opBal) + crSum - drSum
        }

        if (Math.abs(netVal) < 0.001) continue

        const entry: BalanceEntry = { id: ledger.id, name: ledger.name, account_code: ledger.account_code, balance: netVal }

        if (nature === 'ASSET') assetList.push(entry)
        else if (nature === 'LIABILITY') liabList.push(entry)
        else if (nature === 'EQUITY') eqList.push(entry)
        // Note: P&L accounts (INCOME/EXPENSE) would normally flow into retained earnings
        // For now, show them separately or include net income in equity
      }

      // Calculate net income (revenue - expenses from P&L)
      let totalIncome = 0
      let totalExpense = 0
      for (const ledger of ledgers ?? []) {
        const nature = (ledger.group as any)?.nature
        if (nature !== 'INCOME' && nature !== 'EXPENSE') continue
        const opBal = Number(ledger.opening_balance || 0)
        const opType = ledger.opening_type || 'Dr'
        const drSum = drTotals[ledger.id] || 0
        const crSum = crTotals[ledger.id] || 0
        let netVal = 0
        if (nature === 'INCOME') {
          netVal = (opType === 'Cr' ? opBal : -opBal) + crSum - drSum
        } else {
          netVal = (opType === 'Dr' ? opBal : -opBal) + drSum - crSum
        }
        if (nature === 'INCOME') totalIncome += netVal
        else totalExpense += netVal
      }
      const netIncome = totalIncome - totalExpense
      if (Math.abs(netIncome) > 0.001) {
        eqList.push({ id: 'net-income', name: 'Net Income (Current Period)', account_code: '3099', balance: netIncome })
      }

      assetList.sort((a, b) => a.account_code.localeCompare(b.account_code))
      liabList.sort((a, b) => a.account_code.localeCompare(b.account_code))
      eqList.sort((a, b) => a.account_code.localeCompare(b.account_code))

      setAssets(assetList)
      setLiabilities(liabList)
      setEquity(eqList)
    } catch (err: any) {
      setError(err.message || 'Failed to generate balance sheet.')
    } finally {
      setLoading(false)
    }
  }, [companyId, asOfDate])

  useEffect(() => { loadReport() }, [loadReport])

  const totalAssets = assets.reduce((s, e) => s + e.balance, 0)
  const totalLiabilities = liabilities.reduce((s, e) => s + e.balance, 0)
  const totalEquity = equity.reduce((s, e) => s + e.balance, 0)
  const totalLiabEq = totalLiabilities + totalEquity
  const isBalanced = Math.abs(totalAssets - totalLiabEq) < 0.01

  const formatOMR = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' OMR'
  const handlePrint = () => window.print()

  function renderSection(title: string, entries: BalanceEntry[], total: number, totalLabel: string) {
    return (
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#163B40', borderBottom: '1px solid #163B40', paddingBottom: '4px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{title}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={2} style={{ padding: '6px 8px', color: '#718096', fontStyle: 'italic' }}>No accounts.</td></tr>
            ) : entries.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f7fafc' }}>
                <td style={{ padding: '6px 8px' }}>
                  <Link href={`/reports/ledgers?ledger_id=${e.id}`} className="no-print" style={{ color: '#163B40', textDecoration: 'underline' }}>[{e.account_code}] {e.name}</Link>
                  <span className="only-print">[{e.account_code}] {e.name}</span>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{formatOMR(e.balance)}</td>
              </tr>
            ))}
            <tr style={{ background: '#f7fafc', fontWeight: 700 }}>
              <td style={{ padding: '8px' }}>{totalLabel}</td>
              <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatOMR(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: '4rem' }}>
      <div className="page-header no-print" style={{ background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/masters" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Balance Sheet</h1>
              <p className="page-subtitle">Statement of financial position as of selected date</p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handlePrint}><Printer size={16} /> Print</button>
        </div>
        <div className="card" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Calendar size={16} className="text-muted" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>As of:</span>
            <input type="date" className="form-control form-control-sm" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} style={{ width: 160 }} />
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}><AlertCircle size={16} /> <span>{error}</span></div>}

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }}><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>
      ) : (
        <div className="printable-area" style={{ background: '#ffffff', color: '#1a1a1a', padding: '3rem', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: "'Inter', sans-serif" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #163B40', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#163B40', margin: '0 0 6px' }}>{companySettings?.company_name || 'Tadbeer Transformations'}</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568' }}>{companySettings?.address || 'Muscat, Sultanate of Oman'}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#163B40', margin: '0 0 4px', textTransform: 'uppercase' }}>BALANCE SHEET</h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>As of: {new Date(asOfDate).toLocaleDateString('en-GB')}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {renderSection('Assets', assets, totalAssets, 'Total Assets (A)')}
            {renderSection('Liabilities', liabilities, totalLiabilities, 'Total Liabilities (B)')}
            {renderSection('Equity', equity, totalEquity, 'Total Equity (C)')}
          </div>

          {/* Verification */}
          <div style={{ marginTop: '2rem', padding: '12px', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '1.05rem', background: isBalanced ? '#163B40' : '#ef4444', color: '#fff' }}>
            <span>Assets (A): {formatOMR(totalAssets)}</span>
            <span>{isBalanced ? '=' : '≠'}</span>
            <span>Liabilities + Equity (B+C): {formatOMR(totalLiabEq)}</span>
          </div>

          <div style={{ marginTop: '4rem', textAlign: 'center', fontSize: '0.75rem', color: '#718096' }}>
            *This is a computer generated financial statement*
          </div>
        </div>
      )}
    </div>
  )
}
