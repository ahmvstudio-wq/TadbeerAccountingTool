'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft, Printer, RefreshCw, FileText } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { numberToWords } from '@/lib/accounting'
import type { Ledger, Voucher, JournalLine } from '@/lib/types'
import { useUIStore } from '@/store/ui'
import { PrintableVoucher } from '@/components/voucher/PrintableVoucher'
import { OMRSymbol } from '@/components/ui/OMRSymbol'

interface LineItem {
  ledger_id: string
  description: string
  quantity: number
  rate: number
  amount: number
  vat_rate: number
  vat_amount: number
}

export default function ReceiptVoucherPage() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [companySettings, setCompanySettings] = useState<any>(null)

  const [postedVoucher, setPostedVoucher] = useState<Voucher | null>(null)
  const [postedJournalLines, setPostedJournalLines] = useState<JournalLine[]>([])
  const [loadingJournal, setLoadingJournal] = useState(false)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [customerId, setCustomerId] = useState('')
  const [bankCashId, setBankCashId] = useState('')
  const [currency, setCurrency] = useState('OMR')
  const [ref, setRef] = useState('')
  const [narration, setNarration] = useState('')
  const [notes, setNotes] = useState('')

  const [lines, setLines] = useState<LineItem[]>([
    { ledger_id: '', description: '', quantity: 1, rate: 0, amount: 0, vat_rate: 0, vat_amount: 0 },
  ])

  // Unpaid invoices dropdown
  const [showUnpaid, setShowUnpaid] = useState(false)
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([])
  const [loadingUnpaid, setLoadingUnpaid] = useState(false)
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, number>>({})

  const [customerBalance, setCustomerBalance] = useState<{ balance: number; type: string } | null>(null)
  const [bankCashBalance, setBankCashBalance] = useState<{ balance: number; type: string } | null>(null)

  // Quick-add state for income accounts
  const [showQuickAddIncome, setShowQuickAddIncome] = useState(false)
  const [newIncomeName, setNewIncomeName] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ledg }, { data: settings }] = await Promise.all([
        (supabase as any).from('ledgers').select('*, group:groups(id, name, nature)').eq('company_id', companyId).order('name'),
        (supabase as any).from('settings').select('*').eq('company_id', companyId).maybeSingle(),
      ])
      const fetchedLedgers = ledg ?? []
      setLedgers(fetchedLedgers)
      setCompanySettings(settings)

      // Auto-select first customer
      const customersList = fetchedLedgers.filter((l: any) => { const gn = (l.group as any)?.name?.toLowerCase() || ''; return gn.includes('debtor') || gn.includes('customer') })
      if (customersList.length > 0) {
        setCustomerId(customersList[0].id)
      }

      // Auto-select first bank/cash
      const bankCashList = fetchedLedgers.filter((l: any) => { const n = l.name.toLowerCase(); return n.includes('cash') || n.includes('bank') })
      if (bankCashList.length > 0) {
        setBankCashId(bankCashList[0].id)
      }

      // Auto-select first income ledger for lines
      const incomeList = fetchedLedgers.filter((l: any) => { const n = (l.group as any)?.nature; return n === 'INCOME' || n === 'LIABILITY' })
      if (incomeList.length > 0) {
        setLines([
          { ledger_id: incomeList[0].id, description: 'Receipt', quantity: 1, rate: 0, amount: 0, vat_rate: 0, vat_amount: 0 }
        ])
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])

  // Fetch unpaid invoices
  async function fetchUnpaid() {
    if (!customerId) { setError('Select a customer first.'); return }
    setLoadingUnpaid(true)
    setShowUnpaid(true)
    try {
      const res = await fetch(`/api/settlements?action=outstanding&party_ledger_id=${customerId}&voucher_type=SALE&company_id=${companyId}`)
      if (res.ok) setUnpaidInvoices(await res.json())
    } catch (err) { console.error(err) }
    setLoadingUnpaid(false)
  }

  const subtotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
  const vatTotal = lines.reduce((s, l) => s + Number(l.vat_amount || 0), 0)
  const grandTotal = subtotal + vatTotal

  function selectInvoice(inv: any) {
    const alreadySelected = selectedInvoices[inv.id]
    if (alreadySelected) {
      const next = { ...selectedInvoices }
      delete next[inv.id]
      setSelectedInvoices(next)
    } else {
      const alreadyAllocated = Object.values(selectedInvoices).reduce((s, a) => s + a, 0)
      const remaining = Math.round((grandTotal - alreadyAllocated) * 1000) / 1000
      const allocAmount = Math.min(inv.outstanding_amount, remaining)
      setSelectedInvoices(prev => ({ ...prev, [inv.id]: allocAmount > 0 ? allocAmount : 0 }))
    }
  }

  function updateInvoiceAlloc(invId: string, val: number) {
    setSelectedInvoices(prev => {
      const next = { ...prev }
      if (val <= 0) delete next[invId]
      else next[invId] = Math.round(val * 1000) / 1000
      return next
    })
  }

  // Balances
  useEffect(() => {
    async function fetch() {
      if (!customerId) { setCustomerBalance(null); return }
      const { data } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: customerId })
      if (data && data.length > 0) setCustomerBalance({ balance: Number(data[0].current_balance), type: data[0].balance_type })
    }
    fetch()
  }, [customerId])

  useEffect(() => {
    async function fetch() {
      if (!bankCashId) { setBankCashBalance(null); return }
      const { data } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: bankCashId })
      if (data && data.length > 0) setBankCashBalance({ balance: Number(data[0].current_balance), type: data[0].balance_type })
    }
    fetch()
  }, [bankCashId])

  const customers = ledgers.filter(l => { const gn = (l.group as any)?.name?.toLowerCase() || ''; return gn.includes('debtor') || gn.includes('customer') })
  const bankCashAccounts = ledgers.filter(l => { const n = l.name.toLowerCase(); return n.includes('cash') || n.includes('bank') })
  const incomeAccounts = ledgers.filter(l => { const n = (l.group as any)?.nature; return n === 'INCOME' || n === 'LIABILITY' })

  const totalAllocated = Object.values(selectedInvoices).reduce((s, a) => s + a, 0)
  const unallocated = Math.round((grandTotal - totalAllocated) * 1000) / 1000

  function updateLine(idx: number, field: keyof LineItem, value: any) {
    setLines(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }

      if (field === 'quantity' || field === 'rate') {
        const qty = Number(next[idx].quantity || 0)
        const rate = Number(next[idx].rate || 0)
        next[idx].amount = Math.round(qty * rate * 1000) / 1000
      }

      if (field === 'amount' || field === 'vat_rate' || field === 'quantity' || field === 'rate') {
        const amt = Number(next[idx].amount || 0)
        const vatRate = next[idx].vat_rate != null ? Number(next[idx].vat_rate) : 0
        next[idx].vat_amount = Math.round(amt * vatRate / 100 * 1000) / 1000
      }
      return next
    })
  }

  function addLine() {
    const defaultIncome = incomeAccounts[0]
    setLines(prev => [...prev, { 
      ledger_id: defaultIncome?.id || '', 
      description: 'Receipt', 
      quantity: 1, 
      rate: 0, 
      amount: 0, 
      vat_rate: 0, 
      vat_amount: 0 
    }])
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleQuickAddIncome(e: React.FormEvent) {
    e.preventDefault()
    if (!newIncomeName.trim()) return

    let incomeGroup = ledgers.find(l => (l.group as any)?.nature === 'INCOME')?.group
    if (!incomeGroup) {
      const { data: groups } = await (supabase as any).from('groups').select('*').eq('company_id', companyId).eq('nature', 'INCOME').limit(1)
      incomeGroup = groups?.[0]
    }

    if (!incomeGroup) {
      setError('No Income group found. Please create one first.')
      return
    }

    const res = await fetch('/api/ledgers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newIncomeName.trim(),
        group_id: incomeGroup.id,
        opening_balance: 0,
        classification: 'Nominal',
        company_id: companyId,
      }),
    })

    if (res.ok) {
      const newLedger = await res.json()
      setLedgers(prev => [...prev, newLedger])
      setNewIncomeName('')
      setShowQuickAddIncome(false)
    } else {
      const err = await res.json()
      setError(err.error || 'Failed to create account.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSuccess(null)
    if (!customerId) { setError('Select a customer.'); return }
    if (!bankCashId) { setError('Select payment method.'); return }
    if (lines.some(l => !l.ledger_id)) { setError('Please select an account for all lines.'); return }
    if (grandTotal <= 0) { setError('Enter a positive amount.'); return }
    if (!narration.trim()) { setError('Narration is required.'); return }

    setSaving(true)
    try {
      const customerLedger = ledgers.find(l => l.id === customerId)
      const allocArray = Object.entries(selectedInvoices).filter(([, a]) => a > 0).map(([invId, amt]) => {
        const inv = unpaidInvoices.find(i => i.id === invId)
        return { target_voucher_id: invId, target_voucher_number: inv?.voucher_number || '', target_type: 'SALE', amount: amt }
      })

      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'RECEIPT', date,
          party_ledger_id: customerId, party_name: customerLedger?.name || '',
          bank_cash_ledger_id: bankCashId,
          amount: grandTotal, subtotal, vat_total: vatTotal, grand_total: grandTotal,
          narration: narration.trim(), notes: ref.trim() ? `Receipt Ref: ${ref.trim()}` : (notes.trim() || null),
          company_id: companyId, currency,
          allocations: allocArray,
          on_account_amount: unallocated > 0.001 ? unallocated : 0,
          lines: lines.map(l => ({ 
            ledger_id: l.ledger_id, 
            description: l.description || 'Receipt', 
            amount: l.amount, 
            quantity: l.quantity,
            rate: l.rate,
            vat_rate: l.vat_rate, 
            vat_amount: l.vat_amount 
          })),
        }),
      })

      if (!res.ok) { const err = await res.json(); setError(err.error || 'Failed to save.'); return }
      const voucher = await res.json()
      setPostedVoucher(voucher)
      setSuccess(`Receipt Voucher ${voucher.voucher_number} posted successfully!`)

      setLoadingJournal(true)
      const { data: jLines } = await (supabase as any)
        .from('journal_lines').select('*, ledger:ledgers(name, account_code, classification)')
        .eq('voucher_id', voucher.id).order('type', { ascending: true })
      setPostedJournalLines(jLines ?? [])
      setLoadingJournal(false)

      setRef(''); setNarration(''); setNotes('')
      const defaultIncome = incomeAccounts[0]
      setLines([{ ledger_id: defaultIncome?.id || '', description: 'Receipt', quantity: 1, rate: 0, amount: 0, vat_rate: 0, vat_amount: 0 }])
      setSelectedInvoices({}); setShowUnpaid(false); setUnpaidInvoices([])
    } catch (err: any) { setError(err.message || 'Network error.') }
    finally { setSaving(false) }
  }

  function handlePrint() {
    const el = document.getElementById('printable-voucher')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<html><head><title>Print</title><style>body{font-family:Inter,sans-serif;padding:2rem;color:#1a1a1a}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:8px 12px;border:1px solid #ddd;font-size:.85rem}@media print{body{padding:0}}</style></head><body>${el.innerHTML}</body></html>`)
    win.document.close(); win.print()
  }

  function startNew() { setPostedVoucher(null); setPostedJournalLines([]); setSuccess(null) }

  if (loading) return <div style={{ padding: '2rem' }}><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>

  if (postedVoucher) {
    return (
      <div style={{ maxWidth: 840, margin: '0 auto', padding: '1rem 0 3rem' }}>
        <div className="card" style={{ border: '1px solid var(--color-success)', background: 'var(--color-surface)', marginBottom: '1.5rem' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 40, height: 40, background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle size={22} /></div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)', margin: 0 }}>Receipt Posted</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: 0 }}>{postedVoucher.voucher_number}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-teal" onClick={handlePrint}><Printer size={16} /> Print</button>
              <button className="btn btn-ghost" onClick={startNew}><RefreshCw size={16} /> New</button>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: '2.5rem' }}>
          {loadingJournal ? <div style={{ textAlign: 'center', padding: '3rem' }}>Loading...</div> :
            <PrintableVoucher voucher={postedVoucher} journalLines={postedJournalLines} companySettings={companySettings} currency={postedVoucher.currency || 'OMR'} />}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link href="/vouchers" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
          <div><h1 className="page-title">Receipt Voucher</h1><p className="page-subtitle">Record incoming funds — Dr Bank/Cash, Cr Customer</p></div>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ margin: '1rem 0' }}><AlertCircle size={16} /><span>{error}</span></div>}
      {success && <div className="alert alert-success" style={{ margin: '1rem 0' }}><CheckCircle size={16} /><span>{success}</span></div>}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label required">Date</label>
                <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label required">Currency</label>
                <select className="form-control" value={currency} onChange={e => setCurrency(e.target.value)} required>
                  <option value="OMR">OMR Omani Rial</option>
                  <option value="AED">د.إ UAE Dirham</option>
                  <option value="USD">$ US Dollar</option>
                  <option value="SAR">﷼ Saudi Riyal</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label required">Received In</label>
                <select className="form-control" value={bankCashId} onChange={e => setBankCashId(e.target.value)} required>
                  {bankCashAccounts.map(a => <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>)}
                </select>
                {bankCashBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    Balance: <OMRSymbol size={12} /> {bankCashBalance.balance.toFixed(3)} {bankCashBalance.type}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label required">Customer</label>
                <select className="form-control" value={customerId} onChange={e => { setCustomerId(e.target.value); setShowUnpaid(false); setSelectedInvoices({}) }} required>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} [{c.account_code}]</option>)}
                </select>
                {customerBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    Balance: <OMRSymbol size={12} /> {customerBalance.balance.toFixed(3)} {customerBalance.type}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Reference</label>
                <input className="form-control" value={ref} onChange={e => setRef(e.target.value)} placeholder="Bank Transfer Ref, Cheque No" />
              </div>
            </div>

            {/* SELECT UNPAID SALES INVOICE BUTTON */}
            {customerId && (
              <div style={{ marginBottom: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={fetchUnpaid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' }}>
                  <FileText size={16} /> Select Unpaid Sales Invoice
                </button>

                {/* Allocated summary */}
                {Object.keys(selectedInvoices).length > 0 && (
                  <div style={{ padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>Allocated:</div>
                    {Object.entries(selectedInvoices).filter(([, a]) => a > 0).map(([invId, amt]) => {
                      const inv = unpaidInvoices.find(i => i.id === invId)
                      return <div key={invId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '2px 0' }}>
                        <span style={{ fontFamily: 'monospace' }}>{inv?.voucher_number}</span>
                        <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <OMRSymbol size={10} /> {amt.toFixed(3)}
                        </span>
                      </div>
                    })}
                    {unallocated > 0.001 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '2px 0', color: '#f59e0b', fontWeight: 600, borderTop: '1px solid #bbf7d0', marginTop: '4px', alignItems: 'center' }}>
                      <span>On Account (unallocated)</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <OMRSymbol size={10} /> {unallocated.toFixed(3)}
                      </span>
                    </div>}
                  </div>
                )}

                {/* Unpaid invoices dropdown */}
                {showUnpaid && (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '0.5rem 1rem', background: '#F7FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Unpaid Invoices</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowUnpaid(false)}>Close</button>
                    </div>
                    {loadingUnpaid ? (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#718096' }}>Loading...</div>
                    ) : unpaidInvoices.length === 0 ? (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#718096', fontSize: '0.85rem' }}>No unpaid invoices for this customer.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                              <th style={{ padding: '6px 8px', width: '4%' }}></th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Invoice No</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Date</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Particulars</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Total</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Outstanding</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Allocate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {unpaidInvoices.map(inv => (
                              <tr key={inv.id} style={{ borderBottom: '1px solid #f0f0f0', background: selectedInvoices[inv.id] ? '#f0fdf4' : 'transparent', cursor: 'pointer' }} onClick={() => selectInvoice(inv)}>
                                <td style={{ padding: '8px' }}>
                                  <input type="checkbox" checked={!!selectedInvoices[inv.id]} onChange={() => selectInvoice(inv)} onClick={e => e.stopPropagation()} />
                                </td>
                                <td style={{ padding: '8px', fontWeight: 600, fontFamily: 'monospace' }}>{inv.voucher_number}</td>
                                <td style={{ padding: '8px', color: '#718096', whiteSpace: 'nowrap' }}>{new Date(inv.date).toLocaleDateString('en-GB')}</td>
                                <td style={{ padding: '8px', color: '#4A5568', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.narration || '—'}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>OMR {(inv.total_amount || 0).toFixed(3)}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>OMR {inv.outstanding_amount.toFixed(3)}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                  <input type="number" step="0.001" min="0" max={inv.outstanding_amount} className="form-control" style={{ textAlign: 'right', width: 110, fontSize: '0.8rem' }}
                                    value={selectedInvoices[inv.id] || ''} onChange={e => updateInvoiceAlloc(inv.id, Number(e.target.value))} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Redesigned Receipt Lines Table - Matching Purchase design exactly */}
            <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '3%' }}>#</th>
                    <th style={{ width: '25%' }}>Particulars</th>
                    <th style={{ width: '18%' }}>Description</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>Qty</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Rate</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>VAT %</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>VAT Amt</th>
                    <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                    <th style={{ width: '4%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <select className="form-control" value={line.ledger_id} onChange={e => updateLine(idx, 'ledger_id', e.target.value)} style={{ fontSize: '0.85rem', flex: 1 }}>
                            {incomeAccounts.map(a => (
                              <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                            ))}
                          </select>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowQuickAddIncome(true)} style={{ padding: '2px 6px', fontSize: '0.9rem', fontWeight: 'bold' }} title="Create Ledger">+</button>
                        </div>
                      </td>
                      <td>
                        <input className="form-control" placeholder="Description" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} style={{ fontSize: '0.85rem' }} />
                      </td>
                      <td>
                        <input type="number" step="0.001" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} />
                      </td>
                      <td>
                        <input type="number" step="0.001" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.rate || ''} onChange={e => updateLine(idx, 'rate', Number(e.target.value))} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.vat_rate} onChange={e => updateLine(idx, 'vat_rate', Number(e.target.value))} />
                      </td>
                      <td>
                        <input type="number" step="0.001" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 500 }} value={line.vat_amount} onChange={e => updateLine(idx, 'vat_amount', Number(e.target.value))} />
                      </td>
                      <td>
                        <input type="number" step="0.001" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.amount || ''} onChange={e => updateLine(idx, 'amount', Number(e.target.value))} />
                      </td>
                      <td>
                        {lines.length > 1 && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(idx)} style={{ color: 'var(--color-danger)', padding: '4px' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className="btn btn-outline btn-sm" onClick={addLine} style={{ marginTop: '0.75rem' }}>
              <Plus size={14} /> Add Line Item
            </button>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <div style={{ width: 300 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>Subtotal</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{subtotal.toFixed(3)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>VAT</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{vatTotal.toFixed(3)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-teal)', alignItems: 'center' }}>
                  <span>Grand Total</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <OMRSymbol size={14} /> {grandTotal.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>

            {grandTotal > 0 && <div style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}><strong>Amount in words:</strong> {numberToWords(grandTotal, currency)}</div>}

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label className="form-label required">Narration</label>
              <textarea className="form-control" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Receipt from client for consultation services" style={{ height: 50 }} required />
            </div>

            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <textarea className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." style={{ height: 40 }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingBottom: '2rem' }}>
          <Link href="/vouchers" className="btn btn-outline">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>{saving ? 'Posting...' : 'Post Receipt'}</button>
        </div>
      </form>

      {/* Quick Add Income Account Modal */}
      {showQuickAddIncome && (
        <div className="modal-overlay" onClick={() => setShowQuickAddIncome(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Quick Add Account</span>
              <button className="modal-close" onClick={() => setShowQuickAddIncome(false)}>&times;</button>
            </div>
            <form onSubmit={handleQuickAddIncome}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Account Name</label>
                  <input className="form-control" value={newIncomeName} onChange={e => setNewIncomeName(e.target.value)} placeholder="e.g. Professional Fee" required autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowQuickAddIncome(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
