'use client'
import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Calendar, Printer, AlertCircle, FileText, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useUIStore } from '@/store/ui'

interface AccountBalance {
  id: string
  name: string
  code: string
  category: 'Direct' | 'Indirect'
  balance: number
  group_name: string
}

export default function ProfitLossPage() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companySettings, setCompanySettings] = useState<any>(null)

  // Filters
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  // Data
  const [directIncomes, setDirectIncomes] = useState<AccountBalance[]>([])
  const [indirectIncomes, setIndirectIncomes] = useState<AccountBalance[]>([])
  const [directExpenses, setDirectExpenses] = useState<AccountBalance[]>([])
  const [indirectExpenses, setIndirectExpenses] = useState<AccountBalance[]>([])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch company settings
      const { data: settings } = await (supabase as any)
        .from('settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle()
      setCompanySettings(settings)

      // 2. Fetch all ledgers with their group nature
      const { data: ledgers, error: ledgErr } = await (supabase as any)
        .from('ledgers')
        .select('id, name, account_code, description, group_id, group:groups(id, name, nature, parent_id)')
        .eq('company_id', companyId)

      if (ledgErr) throw ledgErr

      // 2.1 Fetch all groups to resolve hierarchy recursively
      const { data: dbGroups } = await (supabase as any)
        .from('groups')
        .select('id, name, parent_id')
        .eq('company_id', companyId)

      const groupsMap = new Map<string, { name: string; parent_id: string | null }>()
      for (const g of dbGroups || []) {
        groupsMap.set(g.id, { name: g.name, parent_id: g.parent_id })
      }

      function checkIsDirect(groupId: string): boolean {
        let currentId: string | null = groupId
        let depth = 0
        while (currentId && depth < 10) {
          const g = groupsMap.get(currentId)
          if (!g) break
          const nameLower = g.name.toLowerCase()
          if (nameLower.includes('direct') || nameLower.includes('cost of goods') || nameLower.includes('cogs')) {
            return true
          }
          currentId = g.parent_id
          depth++
        }
        return false
      }

      // 3. Fetch all journal lines within date range
      const { data: jLines, error: jErr } = await (supabase as any)
        .from('journal_lines')
        .select('ledger_id, type, amount')
        .gte('date', startDate)
        .lte('date', endDate)

      if (jErr) throw jErr

      // 4. Calculate balances per ledger
      const balances: Record<string, number> = {}
      for (const line of jLines ?? []) {
        const amt = Number(line.amount || 0)
        // Dr increases assets/expenses, Cr increases liabilities/income/equity
        const multiplier = line.type === 'Dr' ? 1 : -1
        balances[line.ledger_id] = (balances[line.ledger_id] || 0) + (amt * multiplier)
      }

      // 5. Categorize ledgers and map balances
      const directInc: AccountBalance[] = []
      const indirectInc: AccountBalance[] = []
      const directExp: AccountBalance[] = []
      const indirectExp: AccountBalance[] = []

      for (const ledger of ledgers ?? []) {
        const nature = ledger.group?.nature
        if (nature !== 'INCOME' && nature !== 'EXPENSE') continue

        let balance = balances[ledger.id] || 0

        // Invert nominal balance signs for normal reporting:
        // INCOME normal balance is Cr (which is negative in raw double entry)
        // EXPENSE normal balance is Dr (which is positive in raw double entry)
        if (nature === 'INCOME') {
          balance = -balance
        }

        const groupName = ledger.group?.name || ''
        const gNameLower = groupName.toLowerCase()
        const lNameLower = ledger.name.toLowerCase()

        if (nature === 'INCOME') {
          const isDirect = checkIsDirect(ledger.group_id) || lNameLower.includes('sales') || lNameLower.includes('service')
          const item: AccountBalance = {
            id: ledger.id,
            name: ledger.name,
            code: ledger.account_code,
            category: isDirect ? 'Direct' : 'Indirect',
            balance,
            group_name: groupName
          }
          if (isDirect) directInc.push(item)
          else indirectInc.push(item)
        } else {
          // EXPENSE: Check if Direct or Indirect
          const isDirect = ledger.description?.startsWith('[Direct]') || checkIsDirect(ledger.group_id)

          const item: AccountBalance = {
            id: ledger.id,
            name: ledger.name,
            code: ledger.account_code,
            category: isDirect ? 'Direct' : 'Indirect',
            balance,
            group_name: groupName
          }
          if (isDirect) directExp.push(item)
          else indirectExp.push(item)
        }
      }

      setDirectIncomes(directInc)
      setIndirectIncomes(indirectInc)
      setDirectExpenses(directExp)
      setIndirectExpenses(indirectExp)

    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to generate statement.')
    } finally {
      setLoading(false)
    }
  }, [companyId, startDate, endDate])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const handlePrint = () => {
    window.print()
  }

  // Compute Totals
  const totalDirectIncome = directIncomes.reduce((sum, item) => sum + item.balance, 0)
  const totalDirectExpense = directExpenses.reduce((sum, item) => sum + item.balance, 0)
  const grossProfit = totalDirectIncome - totalDirectExpense

  const totalIndirectIncome = indirectIncomes.reduce((sum, item) => sum + item.balance, 0)
  const totalIndirectExpense = indirectExpenses.reduce((sum, item) => sum + item.balance, 0)
  const netProfit = grossProfit + totalIndirectIncome - totalIndirectExpense

  const formatOMR = (val: number) => {
    return val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' OMR'
  }

  return (
    <div className="profit-loss-container" style={{ paddingBottom: '4rem' }}>
      {/* Sticky Top Action Bar */}
      <div className="page-header no-print" style={{ background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/masters" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Profit & Loss Statement</h1>
              <p className="page-subtitle">Statement of financial performance distinguishing Direct & Indirect Expenses</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={16} /> Print Report
            </button>
          </div>
        </div>

        {/* Date Filters Row */}
        <div className="card" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={16} className="text-muted" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Period:</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>From</label>
              <input type="date" className="form-control form-control-sm" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: 140 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>To</label>
              <input type="date" className="form-control form-control-sm" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: 140 }} />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }}>
          <div className="skeleton" style={{ height: 250, borderRadius: 12 }} />
        </div>
      ) : (
        <div className="printable-area" style={{ background: '#ffffff', color: '#1a1a1a', padding: '3rem', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: "'Inter', sans-serif" }}>
          
          {/* Header block (Tadbeer Style) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #163B40', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#163B40', margin: '0 0 6px' }}>
                {companySettings?.company_name || 'Tadbeer Transformations'}
              </h2>
              <p style={{ margin: '0 0 2px', fontSize: '0.85rem', color: '#4a5568' }}>
                {companySettings?.address || 'Muscat, Sultanate of Oman'}
              </p>
              <p style={{ margin: '0', fontSize: '0.85rem', color: '#4a5568' }}>
                Financial Statement (Profit & Loss)
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#163B40', margin: '0 0 4px', textTransform: 'uppercase' }}>
                PROFIT & LOSS
              </h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>
                For the period: {new Date(startDate).toLocaleDateString('en-GB')} to {new Date(endDate).toLocaleDateString('en-GB')}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', fontWeight: 600, color: '#163B40' }}>
                All values in Omani Rial (OMR)
              </p>
            </div>
          </div>

          {/* MAIN STATEMENT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* 1. DIRECT INCOME */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#163B40', borderBottom: '1px solid #163B40', paddingBottom: '4px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                1. Revenue / Direct Income
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  {directIncomes.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ padding: '6px 8px', color: '#718096', fontStyle: 'italic' }}>No direct income recorded in this period.</td>
                    </tr>
                  ) : (
                    directIncomes.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f7fafc' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <Link href={`/reports/ledgers?ledger_id=${item.id}`} className="no-print" style={{ color: '#163B40', textDecoration: 'underline', fontWeight: 500 }} title="Click to view ledger details">
                            [{item.code}] {item.name}
                          </Link>
                          <span className="only-print">[{item.code}] {item.name}</span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>{formatOMR(item.balance)}</td>
                      </tr>
                    ))
                  )}
                  <tr style={{ background: '#f7fafc', fontWeight: 700 }}>
                    <td style={{ padding: '8px' }}>Total Direct Income (A)</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatOMR(totalDirectIncome)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 2. DIRECT EXPENSES */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#163B40', borderBottom: '1px solid #163B40', paddingBottom: '4px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                2. Cost of Sales / Direct Expenses
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  {directExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ padding: '6px 8px', color: '#718096', fontStyle: 'italic' }}>No direct expenses recorded in this period.</td>
                    </tr>
                  ) : (
                    directExpenses.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f7fafc' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <Link href={`/reports/ledgers?ledger_id=${item.id}`} className="no-print" style={{ color: '#163B40', textDecoration: 'underline', fontWeight: 500 }} title="Click to view ledger details">
                            [{item.code}] {item.name}
                          </Link>
                          <span className="only-print">[{item.code}] {item.name}</span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>{formatOMR(item.balance)}</td>
                      </tr>
                    ))
                  )}
                  <tr style={{ background: '#f7fafc', fontWeight: 700 }}>
                    <td style={{ padding: '8px' }}>Total Cost of Sales (B)</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatOMR(totalDirectExpense)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* GROSS PROFIT ROW */}
            <div style={{ background: '#163B40', color: '#ffffff', padding: '12px', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '1.05rem', margin: '0.5rem 0' }}>
              <span>GROSS PROFIT (A - B)</span>
              <span>{formatOMR(grossProfit)}</span>
            </div>

            {/* 3. INDIRECT INCOME */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#163B40', borderBottom: '1px solid #163B40', paddingBottom: '4px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                3. Indirect Income (Other Income)
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  {indirectIncomes.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ padding: '6px 8px', color: '#718096', fontStyle: 'italic' }}>No other indirect income recorded in this period.</td>
                    </tr>
                  ) : (
                    indirectIncomes.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f7fafc' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <Link href={`/reports/ledgers?ledger_id=${item.id}`} className="no-print" style={{ color: '#163B40', textDecoration: 'underline', fontWeight: 500 }} title="Click to view ledger details">
                            [{item.code}] {item.name}
                          </Link>
                          <span className="only-print">[{item.code}] {item.name}</span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>{formatOMR(item.balance)}</td>
                      </tr>
                    ))
                  )}
                  <tr style={{ background: '#f7fafc', fontWeight: 700 }}>
                    <td style={{ padding: '8px' }}>Total Indirect Income (C)</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatOMR(totalIndirectIncome)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 4. INDIRECT EXPENSES */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#163B40', borderBottom: '1px solid #163B40', paddingBottom: '4px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                4. Operating & Administrative / Indirect Expenses
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  {indirectExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ padding: '6px 8px', color: '#718096', fontStyle: 'italic' }}>No indirect expenses recorded in this period.</td>
                    </tr>
                  ) : (
                    indirectExpenses.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f7fafc' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <Link href={`/reports/ledgers?ledger_id=${item.id}`} className="no-print" style={{ color: '#163B40', textDecoration: 'underline', fontWeight: 500 }} title="Click to view ledger details">
                            [{item.code}] {item.name}
                          </Link>
                          <span className="only-print">[{item.code}] {item.name}</span>
                          {' '}<span style={{ color: '#718096', fontSize: '0.75rem' }}>({item.group_name})</span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>{formatOMR(item.balance)}</td>
                      </tr>
                    ))
                  )}
                  <tr style={{ background: '#f7fafc', fontWeight: 700 }}>
                    <td style={{ padding: '8px' }}>Total Indirect Expenses (D)</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatOMR(totalIndirectExpense)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* NET PROFIT ROW */}
            <div style={{ background: '#1d4ed8', color: '#ffffff', padding: '14px', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '1.15rem', marginTop: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp size={20} />
                <span>NET PROFIT (Gross Profit + C - D)</span>
              </div>
              <span>{formatOMR(netProfit)}</span>
            </div>

          </div>

          {/* Signatures */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '3rem', marginTop: '5rem', fontSize: '0.8rem', textAlign: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ borderTop: '1px solid #718096', margin: '0 auto 6px', width: '80%' }} />
              <span>Prepared By</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ borderTop: '1px solid #718096', margin: '0 auto 6px', width: '80%' }} />
              <span>Verified By</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ borderTop: '1px solid #718096', margin: '0 auto 6px', width: '80%' }} />
              <span>Chief Accountant / CFO</span>
            </div>
          </div>

          <div style={{ marginTop: '4rem', textAlign: 'center', fontSize: '0.75rem', color: '#718096', borderTop: '1px dashed #e2e8f0', paddingTop: '1rem' }}>
            <p style={{ margin: 0 }}>*This is a computer generated financial statement and requires authorized signatures for official audit filing.*</p>
          </div>

        </div>
      )}
    </div>
  )
}
