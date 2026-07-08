'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw, Calendar, ArrowRight, BookOpen, X, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Ledger, JournalLine, Voucher, EntryType } from '@/lib/types'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useUIStore } from '@/store/ui'

export default function LedgerStatementPage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'
  const activeCompanyName = useUIStore(state => state.activeCompanyName) || 'Tadbeer Transformations'

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [selectedLedgerId, setSelectedLedgerId] = useState('')
  const [dateFilter, setDateFilter] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('MONTH')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [ledgerDetails, setLedgerDetails] = useState<Ledger | null>(null)
  const [lines, setLines] = useState<(JournalLine & { voucher?: Voucher })[]>([])
  const [loading, setLoading] = useState(false)

  // Selected voucher preview modal
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null)
  const [previewLines, setPreviewLines] = useState<(JournalLine & { ledger?: { name: string } })[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Set dates helper
  useEffect(() => {
    const today = new Date()
    if (dateFilter === 'TODAY') {
      const dateStr = today.toISOString().split('T')[0]
      setFromDate(dateStr)
      setToDate(dateStr)
    } else if (dateFilter === 'WEEK') {
      const prev = new Date(today)
      prev.setDate(today.getDate() - today.getDay())
      setFromDate(prev.toISOString().split('T')[0])
      setToDate(today.toISOString().split('T')[0])
    } else if (dateFilter === 'MONTH') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      setFromDate(startOfMonth.toISOString().split('T')[0])
      setToDate(today.toISOString().split('T')[0])
    }
  }, [dateFilter])

  // Load ledgers on mount
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('ledgers')
        .select('*, group:groups(id, name, nature)')
        .eq('company_id', currentCompanyId)
        .order('name')
      setLedgers(data ?? [])
    }
    load()
  }, [currentCompanyId])

  // Fetch statement records
  const loadStatement = useCallback(async () => {
    if (!selectedLedgerId) return
    setLoading(true)

    // 1. Fetch Ledger Details
    const { data: ledger } = await supabase
      .from('ledgers')
      .select('*, group:groups(id, name, nature)')
      .eq('id', selectedLedgerId)
      .single()
    setLedgerDetails(ledger)

    // 2. Fetch Journal Lines (including opening balances support)
    // To construct running balances chronologically, we query ALL records up to toDate
    let query = supabase
      .from('journal_lines')
      .select('*, voucher:vouchers(*)')
      .eq('ledger_id', selectedLedgerId)
      .eq('company_id', currentCompanyId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })

    if (toDate) {
      query = query.lte('date', toDate)
    }

    const { data: jLines } = await query
    setLines((jLines as any) ?? [])
    setLoading(false)
  }, [selectedLedgerId, toDate, currentCompanyId])

  useEffect(() => {
    loadStatement()
  }, [loadStatement])

  // Compute statement running logs
  const openingBalance = Number(ledgerDetails?.opening_balance ?? 0)
  const openingType = ledgerDetails?.opening_type ?? 'Dr'
  const nature = ledgerDetails?.group?.nature ?? 'ASSET'
  
  // Rules for normal balance:
  // ASSET / EXPENSE normal is Dr
  // LIABILITY / INCOME / EQUITY normal is Cr
  const normalBalanceType: EntryType = (nature === 'ASSET' || nature === 'EXPENSE') ? 'Dr' : 'Cr'

  // Pre-filter lines before fromDate to calculate initial opening balance for the selected range
  const priorLines = lines.filter(line => fromDate && line.date < fromDate)
  const rangeLines = lines.filter(line => !fromDate || line.date >= fromDate)

  // Calculate prior balance up to fromDate
  let runningPrior = openingBalance
  for (const line of priorLines) {
    if (line.type === openingType) {
      runningPrior += Number(line.amount)
    } else {
      runningPrior -= Number(line.amount)
    }
  }

  const rangeOpeningVal = Math.abs(runningPrior)
  const rangeOpeningType: EntryType = runningPrior >= 0 ? openingType : (openingType === 'Dr' ? 'Cr' : 'Dr')

  // Calculate rows for the visible range
  let balanceTracker = runningPrior
  const statementRows = rangeLines.map(line => {
    const amt = Number(line.amount)
    if (line.type === openingType) {
      balanceTracker += amt
    } else {
      balanceTracker -= amt
    }

    const currentBal = Math.abs(balanceTracker)
    const currentBalType: EntryType = balanceTracker >= 0 ? openingType : (openingType === 'Dr' ? 'Cr' : 'Dr')

    return {
      id: line.id,
      date: line.date,
      voucher_id: line.voucher_id,
      voucher_number: line.voucher?.voucher_number || '—',
      narration: line.narration || line.voucher?.narration || 'General posting',
      debit: line.type === 'Dr' ? amt : 0,
      credit: line.type === 'Cr' ? amt : 0,
      balance: currentBal,
      balanceType: currentBalType,
      voucherDetails: line.voucher,
    }
  })

  // Format Helper
  function fmt(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  }

  // Export CSV
  function exportCSV() {
    if (!ledgerDetails) return
    const headers = ['Date', 'Voucher No', 'Narration', 'Debit (Dr)', 'Credit (Cr)', 'Balance']
    const dataRows = statementRows.map(r => [
      r.date,
      r.voucher_number,
      `"${r.narration.replace(/"/g, '""')}"`,
      r.debit > 0 ? r.debit.toFixed(3) : '0.000',
      r.credit > 0 ? r.credit.toFixed(3) : '0.000',
      `${r.balance.toFixed(3)} ${r.balanceType}`
    ])

    // Include opening row
    const openingRow = [
      fromDate || 'Opening',
      '—',
      'Opening Balance',
      '0.000',
      '0.000',
      `${rangeOpeningVal.toFixed(3)} ${rangeOpeningType}`
    ]

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), openingRow.join(','), ...dataRows.map(e => e.join(','))].join('\n')
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${ledgerDetails.name}_Statement_${fromDate}_to_${toDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Load preview modal details
  useEffect(() => {
    async function fetchPreview() {
      if (!selectedVoucher) return
      setLoadingPreview(true)
      const { data } = await supabase
        .from('journal_lines')
        .select('*, ledger:ledgers(name)')
        .eq('voucher_id', selectedVoucher.id)
      setPreviewLines((data as any) ?? [])
      setLoadingPreview(false)
    }
    fetchPreview()
  }, [selectedVoucher])

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Ledger Statement</h1>
          <p className="page-subtitle">Inspect individual account entries, classifications, and transactions.</p>
        </div>
        <div className="page-actions">
          {ledgerDetails && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline btn-sm" onClick={exportCSV}>
                <Download size={14} /> Export CSV
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
                <Download size={14} /> Print / PDF
              </button>
            </div>
          )}
          <button className="btn btn-outline btn-sm" onClick={loadStatement} disabled={loading || !selectedLedgerId}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Date Filter & Search toolbar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div className="form-group" style={{ flex: 1, minWidth: 260, margin: 0 }}>
            <label className="form-label">Select Account Ledger</label>
            <SearchableSelect
              ledgers={ledgers}
              value={selectedLedgerId}
              onChange={setSelectedLedgerId}
              placeholder="Search by code or account name..."
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Date Preset</label>
            <select
              className="form-control"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as any)}
              style={{ height: 44 }}
            >
              <option value="TODAY">Today</option>
              <option value="WEEK">This Week</option>
              <option value="MONTH">This Month</option>
              <option value="CUSTOM">Custom Range</option>
            </select>
          </div>

          {dateFilter === 'CUSTOM' && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">From Date</label>
                <input type="date" className="form-control" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">To Date</label>
                <input type="date" className="form-control" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </>
          )}

          <button className="btn btn-primary" onClick={loadStatement} disabled={loading || !selectedLedgerId} style={{ height: 44 }}>
            Generate
          </button>

        </div>
      </div>

      {/* Statement Table Section */}
      {selectedLedgerId && ledgerDetails ? (
        <div className="card" style={{ padding: '1.5rem 0' }}>
          
          {/* Header standard print layout */}
          <div style={{ padding: '0 1.75rem 1.25rem', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-teal)' }}>
                {ledgerDetails.name}
              </h2>
              <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                Classification: <strong>{ledgerDetails.classification}</strong> • Under group: <strong>{ledgerDetails.group?.name} ({ledgerDetails.group?.nature})</strong>
              </p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              <div><strong>{activeCompanyName}</strong></div>
              <div>Report Date: {fromDate || 'Start'} to {toDate || 'Today'}</div>
              <div>Generated: {new Date().toLocaleString()}</div>
            </div>
          </div>

          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher No</th>
                  <th>Narration</th>
                  <th style={{ textAlign: 'right' }}>Debit (Dr)</th>
                  <th style={{ textAlign: 'right' }}>Credit (Cr)</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center' }}>Loading ledger logs...</td></tr>
                ) : (
                  <>
                    {/* Opening Balance Row */}
                    <tr style={{ background: 'var(--color-surface-alt)', fontStyle: 'italic' }}>
                      <td>{fromDate || '—'}</td>
                      <td>—</td>
                      <td style={{ fontWeight: 600 }}>Opening Balance</td>
                      <td style={{ textAlign: 'right' }}>—</td>
                      <td style={{ textAlign: 'right' }}>—</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                        {fmt(rangeOpeningVal)} {rangeOpeningType}
                      </td>
                    </tr>

                    {statementRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                          No postings found for this period.
                        </td>
                      </tr>
                    ) : (
                      statementRows.map(row => (
                        <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedVoucher(row.voucherDetails || null)}>
                          <td className="text-xs text-muted">{new Date(row.date).toLocaleDateString('en-GB')}</td>
                          <td style={{ fontWeight: 700, color: 'var(--color-teal)' }}>
                            {row.voucher_number}
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>{row.narration}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)' }}>
                            {row.debit > 0 ? fmt(row.debit) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)' }}>
                            {row.credit > 0 ? fmt(row.credit) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                            {fmt(row.balance)} {row.balanceType}
                          </td>
                        </tr>
                      ))
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <BookOpen size={36} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
          <p className="text-muted">Select an account ledger from the dropdown above to generate the statement log.</p>
        </div>
      )}

      {/* Voucher preview modal */}
      {selectedVoucher && (
        <div className="modal-overlay" onClick={() => setSelectedVoucher(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ border: '1px solid var(--color-border)' }}>
            <div className="modal-header">
              <div>
                <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={16} style={{ color: 'var(--color-teal)' }} />
                  <span>Journal Ledger Audit: {selectedVoucher.voucher_number}</span>
                </span>
              </div>
              <button className="modal-close" onClick={() => setSelectedVoucher(null)}><X size={18} /></button>
            </div>
            
            <div className="modal-body" style={{ gap: '1.5rem' }}>
              <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', background: 'var(--color-surface-alt)', padding: '1rem', borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
                <div>
                  <span className="text-xs text-muted" style={{ display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Classification</span>
                  <span className={`badge voucher-badge-${selectedVoucher.type}`}>{selectedVoucher.type}</span>
                </div>
                <div>
                  <span className="text-xs text-muted" style={{ display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Corporate Party</span>
                  <span className="font-semibold text-sm" style={{ marginTop: '2px', display: 'block' }}>{selectedVoucher.party_name || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted" style={{ display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Amount</span>
                  <span className="font-semibold text-sm" style={{ marginTop: '2px', display: 'block' }}>
                    {selectedVoucher.currency} {Number(selectedVoucher.amount).toLocaleString('en-US', { minimumFractionDigits: 3 })}
                  </span>
                </div>
              </div>

              <div style={{ padding: '0.5rem 1rem', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.85rem' }}>
                <strong>Narration:</strong> {selectedVoucher.narration}
              </div>

              <div className="table-wrapper">
                {loadingPreview ? (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>Loading ledger logs...</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th style={{ textAlign: 'right' }}>Debit (Dr)</th>
                        <th style={{ textAlign: 'right' }}>Credit (Cr)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewLines.map((line, i) => (
                        <tr key={line.id || i}>
                          <td className="font-medium">{line.ledger?.name || '—'}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)' }}>
                            {line.type === 'Dr' ? fmt(Number(line.amount)) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)' }}>
                            {line.type === 'Cr' ? fmt(Number(line.amount)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedVoucher(null)}>Dismiss Audit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
