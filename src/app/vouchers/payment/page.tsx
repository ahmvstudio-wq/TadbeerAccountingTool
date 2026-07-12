'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { numberToWords } from '@/lib/accounting'
import type { Ledger } from '@/lib/types'
import { useUIStore } from '@/store/ui'

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

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [bankCashId, setBankCashId] = useState('')
  const [ref, setRef] = useState('')
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState<PaymentLine[]>([
    { ledger_id: '', amount: 0 },
  ])

  // Real-time ledger balances map
  const [balances, setBalances] = useState<Record<string, { balance: number; type: string }>>({})

  const loadLedgers = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('ledgers')
      .select('*, group:groups(id, name, nature)')
      .eq('company_id', companyId)
      .order('name')
    setLedgers(data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadLedgers() }, [loadLedgers])

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
    if (bankCashId) {
      fetchBalance(bankCashId)
    }
  }, [bankCashId, fetchBalance])

  // Bank and Cash accounts
  const bankCashAccounts = ledgers.filter(l => {
    const n = l.name.toLowerCase()
    return n.includes('cash') || n.includes('bank')
  })
  // Payable accounts: suppliers, expenses, liabilities (exclude bank/cash)
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
          party_ledger_id: bankCashId,
          party_name: bankLedger?.name || '',
          amount: totalAmount,
          subtotal: totalAmount,
          vat_total: 0,
          grand_total: totalAmount,
          narration: narration.trim(),
          notes: ref.trim() ? `Ref/Cheque: ${ref.trim()}` : null,
          company_id: companyId,
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
      setSuccess(`Payment Voucher ${voucher.voucher_number} posted successfully!`)
      
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

  if (loading) {
    return <div style={{ padding: '2rem' }}><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>
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
            <div className="form-grid form-grid-2" style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label required">Date</label>
                <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
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

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Reference / Cheque No.</label>
              <input className="form-control" value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. CHQ-001234" />
            </div>

            {/* Payment lines */}
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '5%' }}>#</th>
                    <th style={{ width: '60%' }}>Paying To</th>
                    <th style={{ width: '25%', textAlign: 'right' }}>Amount</th>
                    <th style={{ width: '10%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <select className="form-control" value={line.ledger_id} onChange={e => updateLine(idx, 'ledger_id', e.target.value)} style={{ fontSize: '0.85rem' }}>
                          <option value="">— Select Account —</option>
                          {payableAccounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                          ))}
                        </select>
                        {line.ledger_id && balances[line.ledger_id] && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500, display: 'block', marginTop: 2 }}>
                            Current Balance: OMR {balances[line.ledger_id].balance.toFixed(3)} {balances[line.ledger_id].type}
                          </span>
                        )}
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.amount || ''} onChange={e => updateLine(idx, 'amount', e.target.value)} />
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
              <Plus size={14} /> Add Payee Line
            </button>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <div style={{ width: 300 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-teal)' }}>
                  <span>Total Paid</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {totalAmount > 0 && (
              <div style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                <strong>Amount in words:</strong> {numberToWords(totalAmount, 'OMR')}
              </div>
            )}

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label className="form-label required">Narration</label>
              <textarea className="form-control" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Being payment of office rent to landlord via bank transfer" style={{ height: 60 }} required />
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
