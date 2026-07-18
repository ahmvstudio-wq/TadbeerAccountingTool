'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Printer, AlertCircle, BookOpen, ChevronRight, FileText, Eye, Mail, X, Download } from 'lucide-react'
import Link from 'next/link'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import { useUIStore } from '@/store/ui'
import type { Ledger, JournalLine, Voucher, VoucherType } from '@/lib/types'
import { PrintableVoucher } from '@/components/voucher/PrintableVoucher'

const TYPE_LABELS: Record<VoucherType, string> = {
  PURCHASE: 'Purchase', SALE: 'Sale', RECEIPT: 'Receipt',
  PAYMENT: 'Payment', JOURNAL: 'Journal',
}
const TYPE_COLORS: Record<VoucherType, string> = {
  SALE: '#22c55e', PURCHASE: '#f59e0b', PAYMENT: '#ef4444',
  RECEIPT: '#3b82f6', JOURNAL: '#8b5cf6',
}

interface RunningBalanceLine extends JournalLine {
  runningBalance: number
  runningType: 'Dr' | 'Cr'
  voucher?: Voucher
}

function LedgerReportContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const selectedLedgerId = searchParams.get('ledger_id') || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  // Data
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [currentLedger, setCurrentLedger] = useState<Ledger | null>(null)
  const [lines, setLines] = useState<RunningBalanceLine[]>([])
  
  // Totals & Balances
  const [opBalance, setOpBalance] = useState({ amount: 0, type: 'Dr' })
  const [totalDebit, setTotalDebit] = useState(0)
  const [totalCredit, setTotalCredit] = useState(0)
  const [closingBalance, setClosingBalance] = useState({ amount: 0, type: 'Dr' })

  // Voucher Preview Modal State
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null)
  const [previewJournalLines, setPreviewJournalLines] = useState<(JournalLine & { ledger?: { name: string; account_code: string; classification: string } })[]>([])
  const [previewVoucherLines, setPreviewVoucherLines] = useState<any[]>([])
  const [previewPartyLedger, setPreviewPartyLedger] = useState<any | null>(null)
  const [previewSettlements, setPreviewSettlements] = useState<{ as_source: any[]; as_target: any[] }>({ as_source: [], as_target: [] })
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [companySettings, setCompanySettings] = useState<any>(null)

  // 1. Load the list of all ledgers
  useEffect(() => {
    async function loadLedgers() {
      try {
        const { data, error: err } = await supabase
          .from('ledgers')
          .select('*, group:groups(id, name, nature)')
          .eq('company_id', companyId)
          .order('name')
        if (err) throw err
        setLedgers(data || [])
      } catch (err: any) {
        console.error(err)
        setError('Failed to load chart of accounts.')
      }
    }
    loadLedgers()
  }, [companyId])

  // 2. Load voucher preview configuration (settings)
  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase.from('settings').select('*').eq('company_id', companyId).maybeSingle()
      setCompanySettings(data)
    }
    loadSettings()
  }, [companyId])

  // 3. Load report details when ledger, date, or company changes
  const loadReport = useCallback(async () => {
    if (!selectedLedgerId) {
      setLoading(false)
      setCurrentLedger(null)
      setLines([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 3.1 Fetch all ledgers to find targets and details
      const { data: allLedg, error: allLedgErr } = await supabase
        .from('ledgers')
        .select('*, group:groups(id, name, nature)')
        .eq('company_id', companyId)
      if (allLedgErr) throw allLedgErr
      const fetchedLedgers = allLedg || []

      let ledgerIds: string[] = []
      let mockLedger: any = null
      let targetLedgers: Ledger[] = []

      if (selectedLedgerId === 'all') {
        mockLedger = {
          id: 'all',
          name: 'All Accounts (General Ledger)',
          account_code: 'GL',
          group: null
        }
        targetLedgers = fetchedLedgers
        ledgerIds = fetchedLedgers.map((l: any) => l.id)
      } else if (selectedLedgerId.startsWith('group_')) {
        const groupId = selectedLedgerId.substring(6)
        const groupLedgers = fetchedLedgers.filter((l: any) => (l.group as any)?.id === groupId)
        const groupObj = groupLedgers[0]?.group as any
        mockLedger = {
          id: selectedLedgerId,
          name: `Entire Group: ${groupObj?.name || 'Group'}`,
          account_code: 'GRP',
          group: groupObj
        }
        targetLedgers = groupLedgers
        ledgerIds = groupLedgers.map((l: any) => l.id)
      } else {
        const ledger = fetchedLedgers.find((l: any) => l.id === selectedLedgerId)
        if (!ledger) {
          setError('Ledger not found.')
          setLoading(false)
          return
        }
        mockLedger = ledger
        targetLedgers = [ledger]
        ledgerIds = [selectedLedgerId]
      }

      setCurrentLedger(mockLedger)

      // 3.2 Fetch all journal lines for these ledger IDs
      const { data: jLines, error: jErr } = await supabase
        .from('journal_lines')
        .select('*, ledger:ledgers(id, name, account_code), voucher:vouchers(*)')
        .in('ledger_id', ledgerIds)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
      if (jErr) throw jErr

      const dbLines = jLines || []

      // 3.3 Compute balances dynamically using signed ledger rules (Dr is positive, Cr is negative)
      let runningVal = 0

      // Sum opening balances of all target ledgers
      for (const led of targetLedgers) {
        const val = Number(led.opening_balance || 0)
        if (led.opening_type === 'Dr') {
          runningVal += val
        } else {
          runningVal -= val
        }
      }

      // Compute starting point prior to startDate
      let openingSignedVal = runningVal
      for (const line of dbLines) {
        if (line.date < startDate) {
          const amt = Number(line.amount || 0)
          if (line.type === 'Dr') {
            openingSignedVal += amt
          } else {
            openingSignedVal -= amt
          }
        }
      }

      // Format opening balance
      const opBalAmt = Math.abs(openingSignedVal)
      const opBalType = openingSignedVal >= 0 ? 'Dr' : 'Cr'
      setOpBalance({ amount: opBalAmt, type: opBalType })

      // Calculate lines in range and running balance
      let currentSigned = openingSignedVal
      let debitSum = 0
      let creditSum = 0
      const processedLines: RunningBalanceLine[] = []

      for (const line of dbLines) {
        const amt = Number(line.amount || 0)
        if (line.type === 'Dr') {
          currentSigned += amt
        } else {
          currentSigned -= amt
        }

        const inRange = line.date >= startDate && line.date <= endDate

        if (inRange) {
          if (line.type === 'Dr') debitSum += amt
          else creditSum += amt
        }

        const balVal = Math.abs(currentSigned)
        const balType = currentSigned >= 0 ? 'Dr' : 'Cr'

        if (inRange) {
          processedLines.push({
            ...line,
            runningBalance: balVal,
            runningType: balType
          })
        }
      }

      setLines(processedLines)
      setTotalDebit(debitSum)
      setTotalCredit(creditSum)

      // Calculate final closing balance
      const closeBalAmt = Math.abs(currentSigned)
      const closeBalType = currentSigned >= 0 ? 'Dr' : 'Cr'
      setClosingBalance({ amount: closeBalAmt, type: closeBalType })

    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to load ledger transactions.')
    } finally {
      setLoading(false)
    }
  }, [selectedLedgerId, companyId, startDate, endDate])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  // 4. Open Voucher Preview Modal
  const viewVoucherDetails = async (voucher: Voucher) => {
    setSelectedVoucher(voucher)
    setLoadingPreview(true)
    setPreviewPartyLedger(null)
    setPreviewSettlements({ as_source: [], as_target: [] })

    try {
      const [{ data: jLines }, { data: vLines }, { data: pLedger }, settData] = await Promise.all([
        supabase
          .from('journal_lines')
          .select('*, ledger:ledgers(name, account_code, classification)')
          .eq('voucher_id', voucher.id)
          .order('type', { ascending: true }),
        supabase
          .from('voucher_lines')
          .select('*, ledger:ledgers(name, account_code)')
          .eq('voucher_id', voucher.id),
        voucher.party_ledger_id ? supabase
          .from('ledgers')
          .select('name, phone, email, address, vat_number')
          .eq('id', voucher.party_ledger_id)
          .maybeSingle() : Promise.resolve({ data: null }),
        fetch(`/api/settlements?action=settlements&voucher_id=${voucher.id}`).then(r => r.json()).catch(() => ({ as_source: [], as_target: [] })),
      ])

      setPreviewJournalLines(jLines ?? [])
      setPreviewVoucherLines(vLines ?? [])
      if (pLedger?.data) {
        setPreviewPartyLedger(pLedger.data)
      }
      if (settData) {
        setPreviewSettlements(settData)
      }
    } catch (err) {
      console.error('Error loading voucher details:', err)
    } finally {
      setLoadingPreview(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportCSV = () => {
    if (!currentLedger || lines.length === 0) return

    const BOM = '\uFEFF' // UTF-8 BOM for Excel compatibility
    const isMultiAccount = selectedLedgerId === 'all' || selectedLedgerId.startsWith('group_')
    const headers = isMultiAccount
      ? ['Date', 'Voucher No', 'Account Code', 'Account Name', 'Type', 'Description', 'Debit (Dr)', 'Credit (Cr)', 'Running Balance', 'Balance Type']
      : ['Date', 'Voucher No', 'Type', 'Description', 'Debit (Dr)', 'Credit (Cr)', 'Running Balance', 'Balance Type']

    const rows = lines.map(line => {
      const baseRow = [
        new Date(line.date).toLocaleDateString('en-GB'),
        line.voucher?.voucher_number || '',
      ]
      if (isMultiAccount) {
        baseRow.push(line.ledger?.account_code || '', line.ledger?.name || '')
      }
      baseRow.push(
        line.voucher ? (TYPE_LABELS[line.type as VoucherType] || line.type) : '',
        (line.narration || line.voucher?.narration || '').replace(/,/g, ';'),
        line.type === 'Dr' ? Number(line.amount).toFixed(3) : '',
        line.type === 'Cr' ? Number(line.amount).toFixed(3) : '',
        Number(line.runningBalance).toFixed(3),
        line.runningType,
      )
      return baseRow
    })

    // Add summary rows
    const summaryOffset = isMultiAccount ? ['', '', '', ''] : []
    rows.push([])
    rows.push([...summaryOffset, '', '', '', 'Opening Balance', opBalance.type === 'Dr' ? opBalance.amount.toFixed(3) : '', opBalance.type === 'Cr' ? opBalance.amount.toFixed(3) : '', opBalance.amount.toFixed(3), opBalance.type])
    rows.push([...summaryOffset, '', '', '', 'Total Debits', totalDebit.toFixed(3), '', '', ''])
    rows.push([...summaryOffset, '', '', '', 'Total Credits', '', totalCredit.toFixed(3), '', ''])
    rows.push([...summaryOffset, '', '', '', 'Closing Balance', '', '', closingBalance.amount.toFixed(3), closingBalance.type])

    const csvContent = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Ledger_${currentLedger.name.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleVoucherPrint = () => {
    const el = document.getElementById('printable-voucher')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Print Voucher</title>
      <style>
        body { font-family: 'Inter', sans-serif; padding: 2rem; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 0.85rem; }
        th { background: #f8f8f8; font-weight: 600; }
        .print-header { display: flex; justify-content: space-between; margin-bottom: 1rem; }
        .print-company-name { font-size: 1.3rem; font-weight: 700; }
        .print-voucher-title { font-size: 1.1rem; font-weight: 700; text-transform: uppercase; }
        .print-total-row { font-weight: 700; background: #f0f0f0; }
        .print-signature-section { display: flex; justify-content: space-between; margin-top: 3rem; }
        .print-signature-box { text-align: center; width: 22%; }
        .print-signature-line { border-top: 1px solid #333; margin-bottom: 4px; }
        .print-divider { border: none; border-top: 2px solid #333; margin: 1rem 0; }
        @media print { body { padding: 0; } }
      </style></head><body>${el.innerHTML}</body></html>
    `)
    win.document.close()
    win.print()
  }

  const formatOMR = (val: number) => {
    return val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' OMR'
  }

  return (
    <div className="ledger-report-container" style={{ paddingBottom: '4rem' }}>
      {/* Header bar */}
      <div className="page-header no-print" style={{ background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/masters" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">General Ledger Report</h1>
              <p className="page-subtitle">Account audit trail, reference validation and cumulative running balance</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-outline" onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={16} /> Export CSV
            </button>
            <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={16} /> Print Ledger
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            {/* Account Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 280 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Account:</span>
              <select
                className="form-control form-control-sm"
                value={selectedLedgerId}
                onChange={e => {
                  const val = e.target.value
                  router.push(`/reports/ledgers?ledger_id=${val}`)
                }}
                style={{ height: 36, fontWeight: 600, color: 'var(--color-teal)' }}
              >
                <option value="">— Select Account Ledger —</option>
                <option value="all">All Accounts (General Ledger)</option>
                {(() => {
                  // Group ledgers by their group details for hierarchy display
                  const grouped: Record<string, { id: string; name: string; ledgers: typeof ledgers }> = {}
                  for (const l of ledgers) {
                    const groupName = (l.group as any)?.name || 'Other'
                    const groupId = (l.group as any)?.id || 'other'
                    if (!grouped[groupName]) {
                      grouped[groupName] = { id: groupId, name: groupName, ledgers: [] }
                    }
                    grouped[groupName].ledgers.push(l)
                  }
                  // Sort groups alphabetically
                  return Object.keys(grouped).sort().map(groupName => {
                    const grp = grouped[groupName]
                    return (
                      <optgroup key={groupName} label={`── ${groupName} ──`}>
                        {grp.id !== 'other' && (
                          <option key={`group_${grp.id}`} value={`group_${grp.id}`}>
                            ★ Entire Group: {groupName}
                          </option>
                        )}
                        {grp.ledgers.sort((a, b) => a.account_code.localeCompare(b.account_code)).map(l => (
                          <option key={l.id} value={l.id}>[{l.account_code}] {l.name}</option>
                        ))}
                      </optgroup>
                    )
                  })
                })()}
              </select>
            </div>

            {/* Dates */}
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
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {!selectedLedgerId ? (
        <div style={{ padding: '6rem 2rem', textAlign: 'center', color: 'var(--color-text-muted)', border: '2px dashed var(--color-border)', borderRadius: 12 }}>
          <BookOpen size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>No Account Selected</h3>
          <p style={{ fontSize: '0.85rem' }}>Select an account ledger from the dropdown above to view the ledger drill-down details.</p>
        </div>
      ) : loading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }}>
          <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
        </div>
      ) : (
        <div className="printable-area" style={{ background: '#ffffff', color: '#1a1a1a', padding: '3rem', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: "'Inter', sans-serif" }}>
          {/* Header block */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #163B40', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#163B40', margin: '0 0 6px' }}>
                {companySettings?.company_name || 'Tadbeer Transformations'}
              </h2>
              <p style={{ margin: '0 0 2px', fontSize: '0.85rem', color: '#4a5568' }}>
                {companySettings?.address || 'Muscat, Sultanate of Oman'}
              </p>
              <p style={{ margin: '0', fontSize: '0.85rem', color: '#4a5568', fontWeight: 600 }}>
                Account/Group: {currentLedger?.name} {currentLedger?.account_code && `(${currentLedger.account_code})`}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#163B40', margin: '0 0 4px', textTransform: 'uppercase' }}>
                GENERAL LEDGER
              </h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>
                For the period: {new Date(startDate).toLocaleDateString('en-GB')} to {new Date(endDate).toLocaleDateString('en-GB')}
              </p>
              {currentLedger?.group && (
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', fontWeight: 600, color: '#163B40' }}>
                  Group: {currentLedger.group.name} | Nature: {currentLedger.group.nature}
                </p>
              )}
            </div>
          </div>

          {/* Quick Balance Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: 6, background: '#f8fafc' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#718096', fontWeight: 600 }}>Opening Balance</span>
              <h4 style={{ margin: '0.25rem 0 0', color: '#163B40', fontSize: '1.2rem', fontWeight: 800 }}>
                {formatOMR(opBalance.amount)} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#718096' }}>({opBalance.type})</span>
              </h4>
            </div>
            <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: 6, background: '#f8fafc' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#718096', fontWeight: 600 }}>Total Debits (Dr)</span>
              <h4 style={{ margin: '0.25rem 0 0', color: '#22c55e', fontSize: '1.2rem', fontWeight: 800 }}>
                {formatOMR(totalDebit)}
              </h4>
            </div>
            <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: 6, background: '#f8fafc' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#718096', fontWeight: 600 }}>Total Credits (Cr)</span>
              <h4 style={{ margin: '0.25rem 0 0', color: '#ef4444', fontSize: '1.2rem', fontWeight: 800 }}>
                {formatOMR(totalCredit)}
              </h4>
            </div>
            <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: 6, background: '#163B40', color: '#ffffff' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#cbd5e1', fontWeight: 600 }}>Closing Balance</span>
              <h4 style={{ margin: '0.25rem 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                {formatOMR(closingBalance.amount)} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#cbd5e1' }}>({closingBalance.type})</span>
              </h4>
            </div>
          </div>

          {/* Transactions table */}
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #163B40', textAlign: 'left', fontWeight: 700, color: '#163B40' }}>
                  <th style={{ padding: '8px 12px' }}>Date</th>
                  <th style={{ padding: '8px 12px' }}>Voucher No / Ref</th>
                  <th style={{ padding: '8px 12px' }}>Description / Narration</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Debit (Dr)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Credit (Cr)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening Balance Line */}
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontStyle: 'italic' }}>
                  <td style={{ padding: '10px 12px' }}>{new Date(startDate).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>—</td>
                  <td style={{ padding: '10px 12px', color: '#4a5568' }}>Opening Balance Brought Forward</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {opBalance.type === 'Dr' && opBalance.amount > 0 ? formatOMR(opBalance.amount) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {opBalance.type === 'Cr' && opBalance.amount > 0 ? formatOMR(opBalance.amount) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                    {formatOMR(opBalance.amount)} {opBalance.type}
                  </td>
                </tr>

                {/* Journal lines */}
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#718096', fontStyle: 'italic' }}>
                      No transaction postings recorded in this period.
                    </td>
                  </tr>
                ) : (
                  lines.map(line => (
                    <tr key={line.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {new Date(line.date).toLocaleDateString('en-GB')}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {line.voucher ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <button
                              onClick={() => viewVoucherDetails(line.voucher!)}
                              className="no-print"
                              style={{
                                border: 'none',
                                background: 'none',
                                color: '#1d4ed8',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                textAlign: 'left',
                                padding: 0
                              }}
                              title="Click to view voucher detail"
                            >
                              {line.voucher.voucher_number}
                            </button>
                            <span className="only-print" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                              {line.voucher.voucher_number}
                            </span>
                            {line.voucher.ref && (
                              <span style={{ fontSize: '0.75rem', color: '#718096' }}>Ref: {line.voucher.ref}</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#718096' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#2d3748', fontSize: '0.8rem' }}>
                        {line.ledger && (
                          <div style={{ fontWeight: 700, color: 'var(--color-teal)', marginBottom: 2 }}>
                            [{line.ledger.account_code}] {line.ledger.name}
                          </div>
                        )}
                        <div>{line.narration || line.voucher?.narration || 'Journal entry posting'}</div>
                        {line.voucher?.party_name && (
                          <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: 2 }}>Party: {line.voucher.party_name}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: line.type === 'Dr' ? 600 : 400, color: line.type === 'Dr' ? '#22c55e' : 'inherit' }}>
                        {line.type === 'Dr' ? formatOMR(line.amount) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: line.type === 'Cr' ? 600 : 400, color: line.type === 'Cr' ? '#ef4444' : 'inherit' }}>
                        {line.type === 'Cr' ? formatOMR(line.amount) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#163B40' }}>
                        {formatOMR(line.runningBalance)} {line.runningType}
                      </td>
                    </tr>
                  ))
                )}

                {/* Final Closing Balance Line */}
                <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #163B40' }}>
                  <td style={{ padding: '12px' }}>Total Sums & Balance</td>
                  <td style={{ padding: '12px' }}>—</td>
                  <td style={{ padding: '12px' }}>Closing Cumulative Balance Summary</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#22c55e' }}>{formatOMR(totalDebit)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#ef4444' }}>{formatOMR(totalCredit)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontSize: '0.95rem', color: '#163B40' }}>
                    {formatOMR(closingBalance.amount)} {closingBalance.type}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Voucher Detail Preview Modal */}
      {selectedVoucher && (
        <div className="modal-overlay no-print" onClick={() => setSelectedVoucher(null)} style={{ zIndex: 100 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h3>{selectedVoucher.voucher_number} — Journal Preview</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline btn-sm" onClick={handleVoucherPrint}><Printer size={14} /> Print</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedVoucher(null)}><X size={16} /></button>
              </div>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {loadingPreview ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>Loading journal entries...</div>
              ) : (
                <>
                <PrintableVoucher 
                  voucher={selectedVoucher} 
                  journalLines={previewJournalLines} 
                  voucherLines={previewVoucherLines} 
                  companySettings={companySettings} 
                  partyLedger={previewPartyLedger}
                />

                {/* Settlement Information */}
                {(previewSettlements.as_source.length > 0 || previewSettlements.as_target.length > 0) && (
                  <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#163B40', marginBottom: '0.5rem' }}>Settlement Links</h4>
                    {previewSettlements.as_source.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 0.25rem', fontWeight: 600 }}>Allocated to:</p>
                        {previewSettlements.as_source.map((s: any) => (
                          <div key={s.id} style={{ fontSize: '0.8rem', padding: '4px 0' }}>
                            {s.is_on_account ? (
                              <span style={{ color: '#f59e0b' }}>On Account: {Number(s.allocated_amount).toFixed(3)}</span>
                            ) : (
                              <span><strong style={{ fontFamily: 'monospace' }}>{s.target_voucher_number}</strong> — {Number(s.allocated_amount).toFixed(3)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {previewSettlements.as_target.length > 0 && (
                      <div>
                        <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 0.25rem', fontWeight: 600 }}>Settled by:</p>
                        {previewSettlements.as_target.map((s: any) => (
                          <div key={s.id} style={{ fontSize: '0.8rem', padding: '4px 0' }}>
                            <strong style={{ fontFamily: 'monospace' }}>{s.source_voucher_number}</strong> — {Number(s.allocated_amount).toFixed(3)}
                          </div>
                        ))}
                        <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '0.25rem 0 0', fontWeight: 600 }}>
                          Outstanding: {(Number(selectedVoucher.grand_total || selectedVoucher.amount || 0) - previewSettlements.as_target.reduce((sum: number, s: any) => sum + Number(s.allocated_amount), 0)).toFixed(3)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LedgersReport() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Loading ledger report...</div>}>
      <LedgerReportContent />
    </Suspense>
  )
}
