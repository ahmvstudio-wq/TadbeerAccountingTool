'use client'
import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, Wallet, Building2, FileText, ShoppingCart, CreditCard, Receipt, Calendar, Filter } from 'lucide-react'
import Link from 'next/link'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import { useUIStore } from '@/store/ui'
import { OMRSymbol } from '@/components/ui/OMRSymbol'

interface KPI {
  label: string
  value: string
  icon: React.ReactNode
  color: string
  bgColor: string
  href?: string
  isCurrency?: boolean
}

const MONTH_NAMES: Record<string, string> = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December'
}

export default function DashboardPage() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<KPI[]>([])
  const [recentVouchers, setRecentVouchers] = useState<any[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL') // Default 'ALL' or specific YYYY-MM

  // Fetch available transaction months for filter
  useEffect(() => {
    async function fetchMonths() {
      try {
        const { data } = await (supabase as any)
          .from('vouchers')
          .select('date')
          .eq('company_id', companyId)
          .order('date', { ascending: false })
        
        if (data && data.length > 0) {
          const monthsSet = new Set<string>()
          data.forEach((v: any) => {
            if (v.date) monthsSet.add(v.date.slice(0, 7))
          })
          const sorted = Array.from(monthsSet).sort().reverse()
          setAvailableMonths(sorted)
        }
      } catch (e) {
        console.error(e)
      }
    }
    fetchMonths()
  }, [companyId])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      let monthStart = ''
      let monthEnd = ''

      if (selectedMonth && selectedMonth !== 'ALL') {
        const [yearStr, monthStr] = selectedMonth.split('-')
        const y = parseInt(yearStr)
        const m = parseInt(monthStr)
        monthStart = `${selectedMonth}-01`
        const lastDay = new Date(y, m, 0).getDate()
        monthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`
      }

      // Build queries based on selected month filter
      let jLinesQuery = (supabase as any)
        .from('journal_lines')
        .select('ledger_id, type, amount, date, ledger:ledgers(group:groups(nature))')

      if (monthStart && monthEnd) {
        jLinesQuery = jLinesQuery.gte('date', monthStart).lte('date', monthEnd)
      }

      const { data: jLines } = await jLinesQuery

      // Fetch ALL journal lines for balance calculation
      const { data: allLines } = await (supabase as any)
        .from('journal_lines')
        .select('ledger_id, type, amount, ledger:ledgers(group:groups(nature))')

      // Fetch ledgers for balance calculation
      const { data: ledgers } = await (supabase as any)
        .from('ledgers')
        .select('id, opening_balance, opening_type, group:groups(nature)')
        .eq('company_id', companyId)

      // Calculate Period Income & Expenses
      let periodIncome = 0
      let periodExpense = 0
      for (const line of jLines ?? []) {
        const nature = (line.ledger as any)?.group?.nature
        const amt = Number(line.amount)
        if (nature === 'INCOME' && line.type === 'Cr') periodIncome += amt
        if (nature === 'EXPENSE' && line.type === 'Dr') periodExpense += amt
      }

      // Count vouchers for period
      let salesCountQuery = (supabase as any)
        .from('vouchers').select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('type', 'SALE')
      let purchaseCountQuery = (supabase as any)
        .from('vouchers').select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('type', 'PURCHASE')

      if (monthStart && monthEnd) {
        salesCountQuery = salesCountQuery.gte('date', monthStart).lte('date', monthEnd)
        purchaseCountQuery = purchaseCountQuery.gte('date', monthStart).lte('date', monthEnd)
      }

      const { count: salesCount } = await salesCountQuery
      const { count: purchaseCount } = await purchaseCountQuery

      // Receivables & Payables (accumulated up to selected period or overall)
      let receivables = 0
      let payables = 0
      for (const ledger of ledgers ?? []) {
        const nature = (ledger.group as any)?.nature
        const opBal = Number(ledger.opening_balance || 0)
        const opType = ledger.opening_type || 'Dr'
        const drSum = (allLines ?? []).filter((l: any) => l.ledger_id === ledger.id && l.type === 'Dr').reduce((s: number, l: any) => s + Number(l.amount), 0)
        const crSum = (allLines ?? []).filter((l: any) => l.ledger_id === ledger.id && l.type === 'Cr').reduce((s: number, l: any) => s + Number(l.amount), 0)
        
        if (nature === 'ASSET' && (opType === 'Dr' ? opBal : -opBal) + drSum - crSum > 0) {
          receivables += (opType === 'Dr' ? opBal : -opBal) + drSum - crSum
        }
        if (nature === 'LIABILITY' && (opType === 'Cr' ? opBal : -opBal) + crSum - drSum > 0) {
          payables += (opType === 'Cr' ? opBal : -opBal) + crSum - drSum
        }
      }

      const formatVal = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

      const periodLabel = selectedMonth === 'ALL'
        ? 'All Time'
        : (() => {
            const [y, m] = selectedMonth.split('-')
            return `${MONTH_NAMES[m]} ${y}`
          })()

      setKpis([
        { label: `Income (${periodLabel})`, value: formatVal(periodIncome), icon: <TrendingUp size={20} />, color: '#22c55e', bgColor: 'rgba(34,197,94,0.1)', href: '/reports/profit-loss', isCurrency: true },
        { label: `Expenses (${periodLabel})`, value: formatVal(periodExpense), icon: <TrendingDown size={20} />, color: '#ef4444', bgColor: 'rgba(239,68,68,0.1)', href: '/reports/profit-loss', isCurrency: true },
        { label: 'Total Receivables', value: formatVal(receivables), icon: <Receipt size={20} />, color: '#3b82f6', bgColor: 'rgba(59,130,246,0.1)', isCurrency: true },
        { label: 'Total Payables', value: formatVal(payables), icon: <CreditCard size={20} />, color: '#f59e0b', bgColor: 'rgba(245,158,11,0.1)', isCurrency: true },
        { label: `Sales Invoices (${periodLabel})`, value: String(salesCount ?? 0), icon: <FileText size={20} />, color: '#8b5cf6', bgColor: 'rgba(139,92,246,0.1)', href: '/vouchers?type=SALE' },
        { label: `Purchases (${periodLabel})`, value: String(purchaseCount ?? 0), icon: <ShoppingCart size={20} />, color: '#f59e0b', bgColor: 'rgba(245,158,11,0.1)', href: '/vouchers?type=PURCHASE' },
      ])

      // Recent vouchers query for selected month
      let recentQuery = (supabase as any)
        .from('vouchers')
        .select('*')
        .eq('company_id', companyId)
        .order('date', { ascending: false })

      if (monthStart && monthEnd) {
        recentQuery = recentQuery.gte('date', monthStart).lte('date', monthEnd)
      }

      const { data: recent } = await recentQuery.limit(10)
      setRecentVouchers(recent ?? [])

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [companyId, selectedMonth])

  useEffect(() => { loadData() }, [loadData])

  const TYPE_LABELS: Record<string, string> = { PURCHASE: 'Purchase', SALE: 'Sale', RECEIPT: 'Receipt', PAYMENT: 'Payment', JOURNAL: 'Journal' }
  const TYPE_COLORS: Record<string, string> = { SALE: '#22c55e', PURCHASE: '#f59e0b', PAYMENT: '#ef4444', RECEIPT: '#3b82f6', JOURNAL: '#8b5cf6' }

  return (
    <div>
      {/* Header with Month Filter */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Management overview — analyze key metrics by month</p>
        </div>

        {/* Month Selector Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-bg-card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <Calendar size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Period:</label>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              fontSize: '0.85rem', 
              fontWeight: 700, 
              color: 'var(--color-primary)', 
              cursor: 'pointer',
              outline: 'none',
              paddingRight: '4px'
            }}
          >
            <option value="ALL">All Time / Complete Overview</option>
            {availableMonths.map(m => {
              const [y, mn] = m.split('-')
              return (
                <option key={m} value={m}>
                  {MONTH_NAMES[mn]} {y}
                </option>
              )
            })}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12 }} />)}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
            {kpis.map((kpi, i) => (
              <div key={i} className="card" style={{ cursor: kpi.href ? 'pointer' : 'default' }}>
                {kpi.href ? (
                  <Link href={kpi.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '1.25rem' }}>
                    <KpiContent kpi={kpi} />
                  </Link>
                ) : (
                  <div style={{ padding: '1.25rem' }}>
                    <KpiContent kpi={kpi} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Financial Reports Quick Access */}
          <div style={{ marginTop: '2.5rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text)' }}>Financial Statements & Reports</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Quick access to key accounting statements and summaries</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>Trial Balance</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>Summarizes debit and credit balances for all accounts to verify arithmetic accuracy.</p>
                </div>
                <Link href="/reports/trial-balance" className="btn btn-outline btn-sm" style={{ marginTop: '1rem', alignSelf: 'flex-start' }}>View Trial Balance</Link>
              </div>
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>Profit & Loss</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>Presents revenues, expenses, and net profit or loss metrics for your selected period.</p>
                </div>
                <Link href="/reports/profit-loss" className="btn btn-outline btn-sm" style={{ marginTop: '1rem', alignSelf: 'flex-start' }}>View Profit & Loss</Link>
              </div>
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>Balance Sheet</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>Displays the company assets, liabilities, and equity at a specific point in time.</p>
                </div>
                <Link href="/reports/balance-sheet" className="btn btn-outline btn-sm" style={{ marginTop: '1rem', alignSelf: 'flex-start' }}>View Balance Sheet</Link>
              </div>
            </div>
          </div>

          {/* Recent Vouchers */}
          <div className="card" style={{ marginTop: '2.5rem' }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Transactions ({selectedMonth === 'ALL' ? 'All Time' : `${MONTH_NAMES[selectedMonth.split('-')[1]]} ${selectedMonth.split('-')[0]}`})
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Showing up to 10 latest entries</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Voucher No.</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Party</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Narration</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVouchers.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No transactions found for the selected period</td></tr>
                  ) : recentVouchers.map(v => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v.voucher_number}</td>
                      <td>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: `${TYPE_COLORS[v.type]}15`, color: TYPE_COLORS[v.type] }}>
                          {TYPE_LABELS[v.type] || v.type}
                        </span>
                      </td>
                      <td>{new Date(v.date).toLocaleDateString('en-GB')}</td>
                      <td>{v.party_name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        <OMRSymbol size={14} style={{ marginRight: 4 }} />
                        {Number(v.grand_total || v.amount).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {v.narration || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KpiContent({ kpi }: { kpi: KPI }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{kpi.label}</span>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: kpi.bgColor, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {kpi.icon}
        </div>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
        {kpi.isCurrency && <OMRSymbol size={20} style={{ marginRight: 6 }} />}
        {kpi.value}
      </div>
    </>
  )
}
