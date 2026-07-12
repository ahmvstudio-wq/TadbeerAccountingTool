'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { numberToWords } from '@/lib/accounting'
import type { Ledger, Item } from '@/lib/types'
import { useUIStore } from '@/store/ui'

interface LineItem {
  item_id?: string
  ledger_id: string
  description: string
  amount: number
  vat_rate: number
  vat_amount: number
}

export default function PurchaseVoucherPage() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [supplierId, setSupplierId] = useState('')
  const [narration, setNarration] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([
    { item_id: '', ledger_id: '', description: '', amount: 0, vat_rate: 5, vat_amount: 0 },
  ])

  // Real-time Supplier balance
  const [supplierBalance, setSupplierBalance] = useState<{ balance: number; type: string } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ledg }, { data: itms }] = await Promise.all([
        (supabase as any).from('ledgers').select('*, group:groups(id, name, nature)').eq('company_id', companyId).order('name'),
        (supabase as any).from('items').select('*').eq('company_id', companyId).order('name')
      ])
      setLedgers(ledg ?? [])
      setItems(itms ?? [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])

  // Fetch supplier balance when selected
  useEffect(() => {
    async function fetchBalance() {
      if (!supplierId) { setSupplierBalance(null); return }
      const { data } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: supplierId })
      if (data && data.length > 0) {
        setSupplierBalance({ balance: Number(data[0].current_balance), type: data[0].balance_type })
      }
    }
    fetchBalance()
  }, [supplierId])

  const suppliers = ledgers.filter(l => {
    const gn = (l.group as any)?.name?.toLowerCase() || ''
    return gn.includes('creditor') || gn.includes('supplier')
  })
  const expenseAssetAccounts = ledgers.filter(l => {
    const n = (l.group as any)?.nature
    return n === 'EXPENSE' || n === 'ASSET'
  })
  const vatInputLedger = ledgers.find(l => l.name.toLowerCase().includes('vat') && (l.name.toLowerCase().includes('input') || l.name.toLowerCase().includes('receivable')))

  const subtotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
  const vatTotal = lines.reduce((s, l) => s + Number(l.vat_amount || 0), 0)
  const grandTotal = subtotal + vatTotal

  function updateLine(idx: number, field: keyof LineItem, value: any) {
    setLines(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }

      // Auto-populate from item selection
      if (field === 'item_id' && value) {
        const item = items.find(i => i.id === value)
        if (item) {
          next[idx].description = item.name
          next[idx].amount = Number(item.buy_price || 0)
          next[idx].vat_rate = Number(item.tax_rate || 5.00)
          next[idx].ledger_id = item.expense_ledger_id || ''
        }
      }

      // Auto-calc VAT
      if (field === 'amount' || field === 'vat_rate' || field === 'item_id') {
        const amt = Number(next[idx].amount || 0)
        const rate = Number(next[idx].vat_rate || 5.00)
        next[idx].vat_amount = Math.round(amt * rate / 100 * 100) / 100
      }
      return next
    })
  }

  function addLine() {
    setLines(prev => [...prev, { item_id: '', ledger_id: '', description: '', amount: 0, vat_rate: 5, vat_amount: 0 }])
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!supplierId) { setError('Select a supplier.'); return }
    if (!narration.trim()) { setError('Narration is required.'); return }
    
    // Validate ledgers
    if (lines.some(l => !l.ledger_id)) {
      setError('Please select an account ledger for all lines.')
      return
    }
    if (lines.some(l => l.amount <= 0)) { setError('All line items must have a positive amount.'); return }

    setSaving(true)
    try {
      const supplierLedger = ledgers.find(l => l.id === supplierId)
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PURCHASE',
          date,
          party_ledger_id: supplierId,
          party_name: supplierLedger?.name || '',
          subtotal,
          vat_total: vatTotal,
          grand_total: grandTotal,
          amount: grandTotal,
          narration: narration.trim(),
          notes: notes.trim() || null,
          company_id: companyId,
          vat_ledger_id: vatInputLedger?.id || null,
          lines: lines.map(l => ({
            ledger_id: l.ledger_id,
            description: l.description,
            amount: l.amount,
            vat_rate: l.vat_rate,
            vat_amount: l.vat_amount,
          })),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to save.')
        return
      }

      const voucher = await res.json()
      setSuccess(`Purchase Voucher ${voucher.voucher_number} posted successfully!`)
      
      // Refresh supplier balance
      const { data: balData } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: supplierId })
      if (balData && balData.length > 0) {
        setSupplierBalance({ balance: Number(balData[0].current_balance), type: balData[0].balance_type })
      }

      setSupplierId('')
      setNarration('')
      setNotes('')
      setLines([{ item_id: '', ledger_id: '', description: '', amount: 0, vat_rate: 5, vat_amount: 0 }])
    } catch (err: any) {
      setError(err.message || 'Network error.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}><div className="skeleton" style={{ height: 400, borderRadius: 12 }} /></div>
  }

  return (
    <div>
      <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/vouchers" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Purchase Voucher</h1>
              <p className="page-subtitle">Record a purchase — Dr Expense/Asset + VAT, Cr Supplier</p>
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
                <label className="form-label required">Supplier</label>
                <select className="form-control" value={supplierId} onChange={e => setSupplierId(e.target.value)} required>
                  <option value="">— Select Supplier —</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} [{s.account_code}]</option>
                  ))}
                </select>
                {supplierBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'block', marginTop: 4 }}>
                    Current Balance: OMR {supplierBalance.balance.toFixed(3)} {supplierBalance.type}
                  </span>
                )}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '3%' }}>#</th>
                    <th style={{ width: '22%' }}>Service Line (Optional)</th>
                    <th style={{ width: '22%' }}>Expense / Asset Account</th>
                    <th style={{ width: '18%' }}>Description</th>
                    <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>VAT %</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>VAT Amount</th>
                    <th style={{ width: '5%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <select className="form-control" value={line.item_id} onChange={e => updateLine(idx, 'item_id', e.target.value)} style={{ fontSize: '0.85rem' }}>
                          <option value="">— Select Service —</option>
                          {items.map(i => (
                            <option key={i.id} value={i.id}>{i.name} ({i.code || 'No Code'})</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select className="form-control" value={line.ledger_id} onChange={e => updateLine(idx, 'ledger_id', e.target.value)} style={{ fontSize: '0.85rem' }}>
                          <option value="">— Select Account —</option>
                          {expenseAssetAccounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="form-control" placeholder="Description" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} style={{ fontSize: '0.85rem' }} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.amount || ''} onChange={e => updateLine(idx, 'amount', e.target.value)} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.vat_rate} onChange={e => updateLine(idx, 'vat_rate', e.target.value)} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 500 }} value={line.vat_amount || ''} onChange={e => updateLine(idx, 'vat_amount', Number(e.target.value))} />
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
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{subtotal.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>VAT</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{vatTotal.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-teal)' }}>
                  <span>Grand Total</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {grandTotal > 0 && (
              <div style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                <strong>Amount in words:</strong> {numberToWords(grandTotal, 'OMR')}
              </div>
            )}

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label className="form-label required">Narration</label>
              <textarea className="form-control" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Being purchase of office supplies from XYZ Supplier" style={{ height: 60 }} required />
            </div>

            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <textarea className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." style={{ height: 40 }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingBottom: '2rem' }}>
          <Link href="/vouchers" className="btn btn-outline">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>
            {saving ? 'Posting...' : 'Post Purchase Voucher'}
          </button>
        </div>
      </form>
    </div>
  )
}
