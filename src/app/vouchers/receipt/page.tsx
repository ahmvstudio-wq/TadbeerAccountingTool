'use client'
import { useEffect, useState, useCallback } from 'react'
import { AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { numberToWords } from '@/lib/accounting'
import type { Ledger } from '@/lib/types'
import { useUIStore } from '@/store/ui'

export default function ReceiptVoucherPage() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [customerId, setCustomerId] = useState('')
  const [bankCashId, setBankCashId] = useState('')
  const [amount, setAmount] = useState<number>(0)
  const [ref, setRef] = useState('')
  const [narration, setNarration] = useState('')

  // Real-time ledger balances
  const [customerBalance, setCustomerBalance] = useState<{ balance: number; type: string } | null>(null)
  const [bankCashBalance, setBankCashBalance] = useState<{ balance: number; type: string } | null>(null)

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

  // Fetch balances when selections change
  useEffect(() => {
    async function fetchCustomerBal() {
      if (!customerId) { setCustomerBalance(null); return }
      const { data } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: customerId })
      if (data && data.length > 0) {
        setCustomerBalance({ balance: Number(data[0].current_balance), type: data[0].balance_type })
      }
    }
    fetchCustomerBal()
  }, [customerId])

  useEffect(() => {
    async function fetchBankCashBal() {
      if (!bankCashId) { setBankCashBalance(null); return }
      const { data } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: bankCashId })
      if (data && data.length > 0) {
        setBankCashBalance({ balance: Number(data[0].current_balance), type: data[0].balance_type })
      }
    }
    fetchBankCashBal()
  }, [bankCashId])

  const customers = ledgers.filter(l => {
    const gn = (l.group as any)?.name?.toLowerCase() || ''
    return gn.includes('debtor') || gn.includes('customer')
  })
  const bankCashAccounts = ledgers.filter(l => {
    const n = l.name.toLowerCase()
    return n.includes('cash') || n.includes('bank')
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!customerId) { setError('Select a customer.'); return }
    if (!bankCashId) { setError('Select payment method.'); return }
    if (amount <= 0) { setError('Enter a positive amount.'); return }
    if (!narration.trim()) { setError('Narration is required.'); return }

    setSaving(true)
    try {
      const customerLedger = ledgers.find(l => l.id === customerId)
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'RECEIPT',
          date,
          party_ledger_id: customerId,
          party_name: customerLedger?.name || '',
          amount,
          subtotal: amount,
          vat_total: 0,
          grand_total: amount,
          narration: narration.trim(),
          notes: ref.trim() ? `Receipt Ref: ${ref.trim()}` : null,
          company_id: companyId,
          lines: [
            {
              ledger_id: bankCashId, // Receives the Debit
              description: 'Receipt',
              amount,
              vat_rate: 0,
              vat_amount: 0,
            },
          ],
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to save.')
        return
      }

      const voucher = await res.json()
      setSuccess(`Receipt Voucher ${voucher.voucher_number} posted successfully!`)
      
      // Refresh balances
      const { data: cData } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: customerId })
      if (cData && cData.length > 0) {
        setCustomerBalance({ balance: Number(cData[0].current_balance), type: cData[0].balance_type })
      }
      const { data: bData } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: bankCashId })
      if (bData && bData.length > 0) {
        setBankCashBalance({ balance: Number(bData[0].current_balance), type: bData[0].balance_type })
      }

      setCustomerId('')
      setBankCashId('')
      setAmount(0)
      setRef('')
      setNarration('')
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
              <h1 className="page-title">Receipt Voucher</h1>
              <p className="page-subtitle">Record incoming funds — Dr Bank/Cash, Cr Customer</p>
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
                <label className="form-label required">Received In</label>
                <select className="form-control" value={bankCashId} onChange={e => setBankCashId(e.target.value)} required>
                  <option value="">— Select Account —</option>
                  {bankCashAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                  ))}
                </select>
                {bankCashId && bankCashBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'block', marginTop: 4 }}>
                    Current Balance: OMR {bankCashBalance.balance.toFixed(3)} {bankCashBalance.type}
                  </span>
                )}
              </div>
            </div>

            <div className="form-grid form-grid-2" style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label required">Customer / Debtor</label>
                <select className="form-control" value={customerId} onChange={e => setCustomerId(e.target.value)} required>
                  <option value="">— Select Customer —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} [{c.account_code}]</option>
                  ))}
                </select>
                {customerId && customerBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'block', marginTop: 4 }}>
                    Current Balance: OMR {customerBalance.balance.toFixed(3)} {customerBalance.type}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label required">Amount Received (OMR)</label>
                <input type="number" step="0.01" min="0.01" className="form-control" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} required />
              </div>
            </div>

            {amount > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                <strong>Amount in words:</strong> {numberToWords(amount, 'OMR')}
              </div>
            )}

            <div className="form-grid form-grid-2" style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Reference / Receipt Instrument</label>
                <input className="form-control" value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. Bank Transfer Ref, Chq Number" />
              </div>
              <div className="form-group">
                <label className="form-label required">Narration</label>
                <textarea className="form-control" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Being receipt of payment for invoice #1002" style={{ height: 42 }} required />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingBottom: '2rem' }}>
          <Link href="/vouchers" className="btn btn-outline">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>
            {saving ? 'Posting...' : 'Post Receipt'}
          </button>
        </div>
      </form>
    </div>
  )
}
