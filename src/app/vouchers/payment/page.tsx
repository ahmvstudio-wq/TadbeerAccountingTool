'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft, Printer, RefreshCw, FileText, Download } from 'lucide-react'
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

export default function PaymentVoucherPage() {
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
  const [downloading, setDownloading] = useState(false)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [bankCashId, setBankCashId] = useState('')
  const [currency, setCurrency] = useState('OMR')
  const [ref, setRef] = useState('')
  const [narration, setNarration] = useState('')
  const [notes, setNotes] = useState('')
  
  const [lines, setLines] = useState<LineItem[]>([
    { ledger_id: '', description: '', quantity: 1, rate: 0, amount: 0, vat_rate: 0, vat_amount: 0 },
  ])

  // Supplier
  const [supplierId, setSupplierId] = useState('')
  const [supplierBalance, setSupplierBalance] = useState<{ balance: number; type: string } | null>(null)

  // Unpaid purchase vouchers dropdown
  const [showUnpaid, setShowUnpaid] = useState(false)
  const [unpaidPurchases, setUnpaidPurchases] = useState<any[]>([])
  const [loadingUnpaid, setLoadingUnpaid] = useState(false)
  const [selectedPurchases, setSelectedPurchases] = useState<Record<string, number>>({})

  const [bankBalance, setBankBalance] = useState<{ balance: number; type: string } | null>(null)

  // Quick-add state for ledger accounts
  const [showQuickAddExpense, setShowQuickAddExpense] = useState(false)
  const [newExpenseName, setNewExpenseName] = useState('')

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

      // Auto-select first bank/cash account
      const bankCashList = fetchedLedgers.filter((l: any) => { const n = l.name.toLowerCase(); return n.includes('cash') || n.includes('bank') })
      if (bankCashList.length > 0) {
        setBankCashId(bankCashList[0].id)
      }

      // Auto-select first supplier
      const suppliersList = fetchedLedgers.filter((l: any) => { const gn = (l.group as any)?.name?.toLowerCase() || ''; return gn.includes('creditor') || gn.includes('supplier') })
      if (suppliersList.length > 0) {
        setSupplierId(suppliersList[0].id)
      }

      // Auto-select first expense ledger for line
      const expenseList = fetchedLedgers.filter((l: any) => { const n = (l.group as any)?.nature; return n === 'EXPENSE' || n === 'LIABILITY' })
      if (expenseList.length > 0) {
        setLines([
          { ledger_id: expenseList[0].id, description: 'Payment', quantity: 1, rate: 0, amount: 0, vat_rate: 0, vat_amount: 0 }
        ])
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])

  const fetchBalance = useCallback(async (ledgerId: string) => {
    if (!ledgerId) return null
    const { data } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: ledgerId })
    if (data && data.length > 0) return { balance: Number(data[0].current_balance), type: data[0].balance_type }
    return null
  }, [])

  useEffect(() => {
    if (!bankCashId) { setBankBalance(null); return }
    fetchBalance(bankCashId).then(b => { if (b) setBankBalance(b) })
  }, [bankCashId, fetchBalance])

  useEffect(() => {
    if (!supplierId) { setSupplierBalance(null); return }
    fetchBalance(supplierId).then(b => { if (b) setSupplierBalance(b) })
  }, [supplierId, fetchBalance])

  // Fetch unpaid purchase vouchers
  async function fetchUnpaid() {
    if (!supplierId) { setError('Select a supplier first.'); return }
    setLoadingUnpaid(true)
    setShowUnpaid(true)
    try {
      const res = await fetch(`/api/settlements?action=outstanding&party_ledger_id=${supplierId}&voucher_type=PURCHASE&company_id=${companyId}`)
      if (res.ok) setUnpaidPurchases(await res.json())
    } catch (err) { console.error(err) }
    setLoadingUnpaid(false)
  }

  function selectPurchase(inv: any) {
    if (selectedPurchases[inv.id]) {
      const next = { ...selectedPurchases }; delete next[inv.id]; setSelectedPurchases(next)
    } else {
      const totalPayment = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
      const alreadyAllocated = Object.values(selectedPurchases).reduce((s, a) => s + a, 0)
      const remaining = Math.round((totalPayment - alreadyAllocated) * 1000) / 1000
      const allocAmount = Math.min(inv.outstanding_amount, remaining)
      setSelectedPurchases(prev => ({ ...prev, [inv.id]: allocAmount > 0 ? allocAmount : 0 }))
    }
  }

  function updatePurchaseAlloc(invId: string, val: number) {
    setSelectedPurchases(prev => {
      const next = { ...prev }
      if (val <= 0) delete next[invId]
      else next[invId] = Math.round(val * 1000) / 1000
      return next
    })
  }

  const bankCashAccounts = ledgers.filter(l => { const n = l.name.toLowerCase(); return n.includes('cash') || n.includes('bank') })
  const suppliers = ledgers.filter(l => { const gn = (l.group as any)?.name?.toLowerCase() || ''; return gn.includes('creditor') || gn.includes('supplier') })
  const expenseAccounts = ledgers.filter(l => { const n = (l.group as any)?.nature; return n === 'EXPENSE' || n === 'LIABILITY' })

  const subtotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
  const vatTotal = lines.reduce((s, l) => s + Number(l.vat_amount || 0), 0)
  const grandTotal = subtotal + vatTotal

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
    const defaultExpense = expenseAccounts[0]
    setLines(prev => [...prev, { 
      ledger_id: defaultExpense?.id || '', 
      description: 'Payment', 
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

  async function handleQuickAddExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!newExpenseName.trim()) return

    let expenseGroup = ledgers.find(l => (l.group as any)?.nature === 'EXPENSE')?.group
    if (!expenseGroup) {
      const { data: groups } = await (supabase as any).from('groups').select('*').eq('company_id', companyId).eq('nature', 'EXPENSE').limit(1)
      expenseGroup = groups?.[0]
    }

    if (!expenseGroup) {
      setError('No Expense group found. Please create one first.')
      return
    }

    const res = await fetch('/api/ledgers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newExpenseName.trim(),
        group_id: expenseGroup.id,
        opening_balance: 0,
        classification: 'Nominal',
        company_id: companyId,
      }),
    })

    if (res.ok) {
      const newLedger = await res.json()
      setLedgers(prev => [...prev, newLedger])
      setNewExpenseName('')
      setShowQuickAddExpense(false)
    } else {
      const err = await res.json()
      setError(err.error || 'Failed to create account.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSuccess(null)
    if (!bankCashId) { setError('Select a bank/cash account.'); return }
    if (!narration.trim()) { setError('Narration is required.'); return }
    if (lines.some(l => !l.ledger_id)) { setError('Please select an account for all lines.'); return }
    if (grandTotal <= 0) { setError('Enter at least one payment amount.'); return }

    setSaving(true)
    try {
      const supplierLedger = ledgers.find(l => l.id === supplierId)
      const allocArray = Object.entries(selectedPurchases).filter(([, a]) => a > 0).map(([invId, amt]) => {
        const inv = unpaidPurchases.find(i => i.id === invId)
        return { target_voucher_id: invId, target_voucher_number: inv?.voucher_number || '', target_type: 'PURCHASE', amount: amt }
      })

      const partyLedgerId = supplierId || lines[0]?.ledger_id || ''
      const partyName = supplierLedger?.name || ledgers.find(l => l.id === lines[0]?.ledger_id)?.name || ''

      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PAYMENT', date,
          party_ledger_id: partyLedgerId,
          party_name: partyName,
          bank_cash_ledger_id: bankCashId,
          amount: grandTotal, subtotal, vat_total: vatTotal, grand_total: grandTotal,
          narration: narration.trim(), notes: ref.trim() ? `Ref: ${ref.trim()}` : (notes.trim() || null),
          company_id: companyId, currency,
          allocations: allocArray,
          on_account_amount: (grandTotal - Object.values(selectedPurchases).reduce((s, a) => s + a, 0)) > 0.001
            ? grandTotal - Object.values(selectedPurchases).reduce((s, a) => s + a, 0) : 0,
          lines: lines.map(l => ({ 
            ledger_id: l.ledger_id, 
            description: l.description || 'Payment', 
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
      setSuccess(`Payment Voucher ${voucher.voucher_number} posted!`)

      setLoadingJournal(true)
      const { data: jLines } = await (supabase as any)
        .from('journal_lines').select('*, ledger:ledgers(name, account_code, classification)')
        .eq('voucher_id', voucher.id).order('type', { ascending: true })
      setPostedJournalLines(jLines ?? [])
      setLoadingJournal(false)

      setRef(''); setNarration(''); setNotes('')
      const defaultExpense = expenseAccounts[0]
      setLines([{ ledger_id: defaultExpense?.id || '', description: 'Payment', quantity: 1, rate: 0, amount: 0, vat_rate: 0, vat_amount: 0 }])
      setSelectedPurchases({}); setShowUnpaid(false); setUnpaidPurchases([])
    } catch (err: any) { setError(err.message || 'Network error.') }
    finally { setSaving(false) }
  }

  async function handleDownload() {
    if (!postedVoucher) return
    setDownloading(true)
    const vNumber = postedVoucher.voucher_number
    
    const loadHtml2Pdf = () => {
      return new Promise((resolve) => {
        if ((window as any).html2pdf) {
          resolve((window as any).html2pdf)
          return
        }
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
        script.onload = () => resolve((window as any).html2pdf)
        document.head.appendChild(script)
      })
    }

    try {
      const html2pdf: any = await loadHtml2Pdf()
      const element = document.getElementById('printable-voucher')
      if (element) {
        const opt = {
          margin:       0.3,
          filename:     `Payment-${vNumber}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true },
          jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        }
        await html2pdf().set(opt).from(element).save()
      }
    } catch (pdfErr) {
      console.error('Failed to generate PDF download:', pdfErr)
    } finally {
      setDownloading(false)
    }
  }

  function handlePrint() {
    const el = document.getElementById('printable-voucher')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Print</title>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          body { margin: 0; padding: 0; }
          #printable-voucher { border: none !important; }
        }
      </style></head><body>${el.outerHTML}</body></html>
    `)
    win.document.close()
    win.print()
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
              <div><h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)', margin: 0 }}>Payment Posted</h3><p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: 0 }}>{postedVoucher.voucher_number}</p></div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-teal" onClick={handleDownload} disabled={downloading}><Download size={16} /> Download</button>
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
          <div><h1 className="page-title">Payment Voucher</h1><p className="page-subtitle">Record a payment — Dr Supplier, Cr Bank/Cash</p></div>
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
                <label className="form-label required">Paid From</label>
                <select className="form-control" value={bankCashId} onChange={e => setBankCashId(e.target.value)} required>
                  {bankCashAccounts.map(a => <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>)}
                </select>
                {bankBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    Balance: <OMRSymbol size={12} /> {bankBalance.balance.toFixed(3)} {bankBalance.type}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label required">Supplier / Payee</label>
                <select className="form-control" value={supplierId} onChange={e => { setSupplierId(e.target.value); setShowUnpaid(false); setSelectedPurchases({}) }} required>
                  <option value="">— Select Supplier / Payee —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} [{s.account_code}]</option>)}
                </select>
                {supplierBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    Balance: <OMRSymbol size={12} /> {supplierBalance.balance.toFixed(3)} {supplierBalance.type}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Reference</label>
                <input className="form-control" value={ref} onChange={e => setRef(e.target.value)} placeholder="Bank Transfer Ref, Cheque No" />
              </div>
            </div>

            {/* Unpaid purchase vouchers dropdown */}
            {supplierId && (
              <div style={{ marginBottom: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={fetchUnpaid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' }}>
                  <FileText size={16} /> Select Outstanding Purchase Voucher
                </button>

                {Object.keys(selectedPurchases).length > 0 && (
                  <div style={{ padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>Allocated:</div>
                    {Object.entries(selectedPurchases).filter(([, a]) => a > 0).map(([invId, amt]) => {
                      const inv = unpaidPurchases.find(i => i.id === invId)
                      return <div key={invId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '2px 0' }}>
                        <span style={{ fontFamily: 'monospace' }}>{inv?.voucher_number}</span>
                        <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <OMRSymbol size={10} /> {amt.toFixed(3)}
                        </span>
                      </div>
                    })}
                  </div>
                )}

                {showUnpaid && (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '0.5rem 1rem', background: '#F7FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Outstanding Purchases</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowUnpaid(false)}>Close</button>
                    </div>
                    {loadingUnpaid ? (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#718096' }}>Loading...</div>
                    ) : unpaidPurchases.length === 0 ? (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#718096', fontSize: '0.85rem' }}>No outstanding purchase vouchers for this supplier.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                              <th style={{ padding: '6px 8px', width: '4%' }}></th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Voucher No</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Date</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Particulars</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Total</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Outstanding</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Allocate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {unpaidPurchases.map(inv => (
                              <tr key={inv.id} style={{ borderBottom: '1px solid #f0f0f0', background: selectedPurchases[inv.id] ? '#f0fdf4' : 'transparent', cursor: 'pointer' }} onClick={() => selectPurchase(inv)}>
                                <td style={{ padding: '8px' }}>
                                  <input type="checkbox" checked={!!selectedPurchases[inv.id]} onChange={() => selectPurchase(inv)} onClick={e => e.stopPropagation()} />
                                </td>
                                <td style={{ padding: '8px', fontWeight: 600, fontFamily: 'monospace' }}>{inv.voucher_number}</td>
                                <td style={{ padding: '8px', color: '#718096', whiteSpace: 'nowrap' }}>{new Date(inv.date).toLocaleDateString('en-GB')}</td>
                                <td style={{ padding: '8px', color: '#4A5568', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.narration || '—'}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>OMR {(inv.total_amount || 0).toFixed(3)}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>OMR {inv.outstanding_amount.toFixed(3)}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                  <input type="number" step="0.001" min="0" max={inv.outstanding_amount} className="form-control" style={{ textAlign: 'right', width: 110, fontSize: '0.8rem' }}
                                    value={selectedPurchases[inv.id] || ''} onChange={e => updatePurchaseAlloc(inv.id, Number(e.target.value))} />
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

            {/* Redesigned Payment Lines Table - Matching Purchase design exactly */}
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
                            {expenseAccounts.map(a => (
                              <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                            ))}
                          </select>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowQuickAddExpense(true)} style={{ padding: '2px 6px', fontSize: '0.9rem', fontWeight: 'bold' }} title="Create Ledger">+</button>
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
              <textarea className="form-control" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Payment for monthly office rent" style={{ height: 50 }} required />
            </div>

            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <textarea className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." style={{ height: 40 }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingBottom: '2rem' }}>
          <Link href="/vouchers" className="btn btn-outline">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>{saving ? 'Posting...' : 'Post Payment'}</button>
        </div>
      </form>

      {/* Quick Add Expense Account Modal */}
      {showQuickAddExpense && (
        <div className="modal-overlay" onClick={() => setShowQuickAddExpense(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Quick Add Account</span>
              <button className="modal-close" onClick={() => setShowQuickAddExpense(false)}>&times;</button>
            </div>
            <form onSubmit={handleQuickAddExpense}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Account Name</label>
                  <input className="form-control" value={newExpenseName} onChange={e => setNewExpenseName(e.target.value)} placeholder="e.g. Rent Expense" required autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowQuickAddExpense(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
