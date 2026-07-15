'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft, Printer, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { numberToWords } from '@/lib/accounting'
import type { Ledger, Voucher, JournalLine } from '@/lib/types'
import { useUIStore } from '@/store/ui'
import { PrintableVoucher } from '@/components/voucher/PrintableVoucher'

interface PaymentLine {
  ledger_id: string
  amount: number
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

  // Success view states
  const [postedVoucher, setPostedVoucher] = useState<Voucher | null>(null)
  const [postedJournalLines, setPostedJournalLines] = useState<JournalLine[]>([])
  const [loadingJournal, setLoadingJournal] = useState(false)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [bankCashId, setBankCashId] = useState('')
  const [currency, setCurrency] = useState('OMR')
  const [ref, setRef] = useState('')
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState<PaymentLine[]>([
    { ledger_id: '', amount: 0 },
  ])

  // Real-time ledger balances map
  const [balances, setBalances] = useState<Record<string, { balance: number; type: string }>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ledg }, { data: settings }] = await Promise.all([
        (supabase as any)
          .from('ledgers')
          .select('*, group:groups(id, name, nature)')
          .eq('company_id', companyId)
          .order('name'),
        (supabase as any)
          .from('settings')
          .select('*')
          .eq('company_id', companyId)
          .maybeSingle()
      ])
      setLedgers(ledg ?? [])
      setCompanySettings(settings)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])

  // Helper to fetch ledger balance dynamically
  const fetchBalance = useCallback(async (ledgerId: string) => {
    if (!ledgerId) return
    const { data } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: ledgerId })
    if (data && data.length > 0) {
      setBalances(prev => ({
        ...prev,
        [ledgerId]: { balance: Number(data[0].current_balance), type: data[0].balance_type }
      }))
    }
  }, [])

  useEffect(() => {
    if (bankCashId) fetchBalance(bankCashId)
  }, [bankCashId, fetchBalance])

  // Paid From accounts
  const bankCashAccounts = ledgers.filter(l => {
    const n = l.name.toLowerCase()
    return n.includes('cash') || n.includes('bank')
  })
  
  // Payable accounts
  const payableAccounts = ledgers.filter(l => {
    const n = (l.group as any)?.nature
    const lName = l.name.toLowerCase()
    return (n === 'EXPENSE' || n === 'LIABILITY' || n === 'ASSET') && !lName.includes('cash') && !lName.includes('bank')
  })

  const totalAmount = lines.reduce((s, l) => s + Number(l.amount || 0), 0)

  function updateLine(idx: number, field: keyof PaymentLine, value: any) {
    setLines(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
    if (field === 'ledger_id' && value) {
      fetchBalance(value)
    }
  }

  function addLine() {
    setLines(prev => [...prev, { ledger_id: '', amount: 0 }])
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!bankCashId) { setError('Select a bank/cash account.'); return }
    if (!narration.trim()) { setError('Narration is required.'); return }
    if (lines.some(l => !l.ledger_id)) { setError('Select a ledger for all lines.'); return }
    if (lines.some(l => l.amount <= 0)) { setError('All payment lines must have positive amounts.'); return }

    setSaving(true)
    try {
      const bankLedger = ledgers.find(l => l.id === bankCashId)
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PAYMENT',
          date,
          party_ledger_id: lines[0]?.ledger_id || '',
          party_name: bankLedger?.name || '',
          bank_cash_ledger_id: bankCashId,
          amount: totalAmount,
          subtotal: totalAmount,
          vat_total: 0,
          grand_total: totalAmount,
          narration: narration.trim(),
          notes: ref.trim() ? `Ref/Cheque: ${ref.trim()}` : null,
          company_id: companyId,
          currency,
          lines: lines.map(l => ({
            ledger_id: l.ledger_id,
            description: 'Payment',
            amount: l.amount,
            vat_rate: 0,
            vat_amount: 0,
          })),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to save.')
        return
      }

      const voucher = await res.json()
      setPostedVoucher(voucher)
      setSuccess(`Payment Voucher ${voucher.voucher_number} posted successfully!`)
      
      // Load journal lines for printable preview
      setLoadingJournal(true)
      const { data: jLines } = await (supabase as any)
        .from('journal_lines')
        .select('*, ledger:ledgers(name, account_code, classification)')
        .eq('voucher_id', voucher.id)
        .order('type', { ascending: true })

      setPostedJournalLines(jLines ?? [])
      setLoadingJournal(false)

      // Refresh balances
      fetchBalance(bankCashId)
      lines.forEach(l => { if (l.ledger_id) fetchBalance(l.ledger_id) })

      setBankCashId('')
      setRef('')
      setNarration('')
      setLines([{ ledger_id: '', amount: 0 }])
    } catch (err: any) {
      setError(err.message || 'Network error.')
    } finally {
      setSaving(false)
    }
  }

  function handlePrint() {
    const el = document.getElementById('printable-voucher')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Print Payment Voucher</title>
      <style>
        body { font-family: 'Inter', sans-serif; padding: 2rem; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 0.85rem; }
        th { background: #f8f8f8; font-weight: 600; }
        .print-total-row { font-weight: 700; background: #f0f0f0; }
        @media print { body { padding: 0; } }
      </style></head><body>${el.innerHTML}</body></html>
    `)
    win.document.close()
    win.print()
  }

  function startNewVoucher() {
    setPostedVoucher(null)
    setPostedJournalLines([])
    setSuccess(null)
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>
  }

  if (postedVoucher) {
    return (
      <div style={{ maxWidth: 840, margin: '0 auto', padding: '1rem 0 3rem' }}>
        <div className="card" style={{ border: '1px solid var(--color-success)', background: 'var(--color-surface)', marginBottom: '1.5rem' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 40, height: 40, background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)', margin: 0 }}>Payment Voucher Posted</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: 0 }}>Voucher Number: <strong>{postedVoucher.voucher_number}</strong></p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-teal" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Printer size={16} /> Print Payment
              </button>
              <button className="btn btn-ghost" onClick={startNewVoucher} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-teal)' }}>
                <RefreshCw size={16} /> Post Another Payment
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '2.5rem', boxShadow: 'var(--shadow-lg)' }}>
          {loadingJournal ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>Loading payment preview...</div>
          ) : (
            <PrintableVoucher 
              voucher={postedVoucher} 
              journalLines={postedJournalLines} 
              companySettings={companySettings}
              currency={postedVoucher.currency || 'OMR'}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/vouchers" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Payment Voucher</h1>
              <p className="page-subtitle">Record a payment — Dr Payee, Cr Bank/Cash</p>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ margin: '1rem 0' }}><AlertCircle size={16} /><span>{error}</span></div>}
      {success && <div className="alert alert-success" style={{ margin: '1rem 0' }}><CheckCircle size={16} /><span>{success}</span></div>}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
            <div className="form-grid form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label required">Date</label>
                <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label required">Currency</label>
                <select className="form-control" value={currency} onChange={e => setCurrency(e.target.value)} required>
                  <option value="OMR">OMR (Omani Rial)</option>
                  <option value="AED">AED (UAE Dirham)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="SAR">SAR (Saudi Riyal)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label required">Paid From</label>
                <select className="form-control" value={bankCashId} onChange={e => setBankCashId(e.target.value)} required>
                  <option value="">— Select Account —</option>
                  {bankCashAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                  ))}
                </select>
                {bankCashId && balances[bankCashId] && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'block', marginTop: 4 }}>
                    Current Balance: OMR {balances[bankCashId].balance.toFixed(3)} {balances[bankCashId].type}
                  </span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span className="form-label" style={{ margin: 0 }}>Debits (Payment Details)</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={addLine}>+ Add Line</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {lines.map((line, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ flex: 2 }}>
                      <select className="form-control" value={line.ledger_id} onChange={e => updateLine(idx, 'ledger_id', e.target.value)} required>
                        <option value="">— Select Ledger —</option>
                        {payableAccounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                        ))}
                      </select>
                      {line.ledger_id && balances[line.ledger_id] && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: 2 }}>
                          Balance: OMR {balances[line.ledger_id].balance.toFixed(3)} {balances[line.ledger_id].type}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input type="number" step="0.001" min="0.001" className="form-control" placeholder="Amount" value={line.amount || ''} onChange={e => updateLine(idx, 'amount', Number(e.target.value))} required />
                    </div>
                    {lines.length > 1 && (
                      <button type="button" className="btn btn-ghost text-danger" onClick={() => removeLine(idx)} style={{ padding: 8 }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {totalAmount > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                <strong>Amount in words:</strong> {numberToWords(totalAmount, currency)}
              </div>
            )}

            <div className="form-grid form-grid-2" style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Reference / Instrument</label>
                <input className="form-control" value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. Cheque No, Bank Transfer Ref" />
              </div>
              <div className="form-group">
                <label className="form-label required">Narration</label>
                <textarea className="form-control" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Paid consulting fees" style={{ height: 42 }} required />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingBottom: '2rem' }}>
          <Link href="/vouchers" className="btn btn-outline">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>
            {saving ? 'Posting...' : 'Post Payment'}
          </button>
        </div>
      </form>
    </div>
  )
}
