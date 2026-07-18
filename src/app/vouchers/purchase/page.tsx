'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { numberToWords } from '@/lib/accounting'
import type { Ledger, Item } from '@/lib/types'
import { useUIStore } from '@/store/ui'
import { OMRSymbol } from '@/components/ui/OMRSymbol'

interface LineItem {
  item_id?: string
  ledger_id: string
  description: string
  quantity: number
  rate: number
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
  const [supplierInvoiceRef, setSupplierInvoiceRef] = useState('')
  const [narration, setNarration] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([
    { item_id: '', ledger_id: '', description: '', quantity: 1, rate: 0, amount: 0, vat_rate: 5, vat_amount: 0 },
  ])

  const [supplierBalance, setSupplierBalance] = useState<{ balance: number; type: string } | null>(null)

  // Quick-add state for expense accounts
  const [showQuickAddExpense, setShowQuickAddExpense] = useState(false)
  const [newExpenseName, setNewExpenseName] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ledg }, { data: itms }] = await Promise.all([
        (supabase as any).from('ledgers').select('*, group:groups(id, name, nature)').eq('company_id', companyId).order('name'),
        (supabase as any).from('items').select('*').eq('company_id', companyId).order('name')
      ])
      const fetchedLedgers = ledg ?? []
      const fetchedItems = itms ?? []
      setLedgers(fetchedLedgers)
      setItems(fetchedItems)

      // Auto-select first supplier
      const suppliersList = fetchedLedgers.filter((l: any) => {
        const gn = (l.group as any)?.name?.toLowerCase() || ''
        return gn.includes('creditor') || gn.includes('supplier')
      })
      if (suppliersList.length > 0) {
        setSupplierId(suppliersList[0].id)
      }

      // Auto-select first service item in line
      if (fetchedItems.length > 0) {
        const firstItem = fetchedItems[0]
        setLines([
          { 
            item_id: firstItem.id, 
            ledger_id: firstItem.expense_ledger_id || '', 
            description: firstItem.name, 
            quantity: 1, 
            rate: Number(firstItem.buy_price || 0), 
            amount: Number(firstItem.buy_price || 0), 
            vat_rate: Number(firstItem.tax_rate || 5.00), 
            vat_amount: Math.round(Number(firstItem.buy_price || 0) * Number(firstItem.tax_rate || 5.00) / 100 * 1000) / 1000 
          }
        ])
      }
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])

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

      if (field === 'item_id' && value) {
        const item = items.find(i => i.id === value)
        if (item) {
          next[idx].description = item.name
          next[idx].rate = Number(item.buy_price || 0)
          next[idx].quantity = 1
          next[idx].amount = Number(item.buy_price || 0)
          next[idx].vat_rate = Number(item.tax_rate || 5.00)
          next[idx].ledger_id = item.expense_ledger_id || ''
        }
      }

      // Recalculate amount when quantity or rate changes
      if (field === 'quantity' || field === 'rate') {
        const qty = Number(next[idx].quantity || 0)
        const rate = Number(next[idx].rate || 0)
        next[idx].amount = Math.round(qty * rate * 1000) / 1000
      }

      // Auto-calc VAT (supports 0% VAT correctly)
      if (field === 'amount' || field === 'vat_rate' || field === 'quantity' || field === 'rate' || field === 'item_id') {
        const amt = Number(next[idx].amount || 0)
        const vatRate = next[idx].vat_rate != null ? Number(next[idx].vat_rate) : 5
        next[idx].vat_amount = Math.round(amt * vatRate / 100 * 1000) / 1000
      }
      return next
    })
  }

  function addLine() {
    const defaultItem = items[0]
    setLines(prev => [...prev, { 
      item_id: defaultItem?.id || '', 
      ledger_id: defaultItem?.expense_ledger_id || '', 
      description: defaultItem?.name || '', 
      quantity: 1, 
      rate: Number(defaultItem?.buy_price || 0), 
      amount: Number(defaultItem?.buy_price || 0), 
      vat_rate: Number(defaultItem?.tax_rate || 5.00), 
      vat_amount: Math.round(Number(defaultItem?.buy_price || 0) * Number(defaultItem?.tax_rate || 5.00) / 100 * 1000) / 1000 
    }])
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleQuickAddExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!newExpenseName.trim()) return

    // Find an EXPENSE group
    let expenseGroup = ledgers.find(l => (l.group as any)?.nature === 'EXPENSE')?.group
    if (!expenseGroup) {
      const { data: groups } = await (supabase as any).from('groups').select('*').eq('company_id', companyId).eq('nature', 'EXPENSE').limit(1)
      expenseGroup = groups?.[0]
    }

    if (!expenseGroup) {
      setError('No Expense group found. Please create one first in Chart of Accounts.')
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
    setError(null)
    setSuccess(null)

    if (!supplierId) { setError('Select a supplier.'); return }
    if (!narration.trim()) { setError('Narration is required.'); return }
    
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
          supplier_invoice_ref: supplierInvoiceRef.trim() || null,
          lines: lines.map(l => ({
            ledger_id: l.ledger_id,
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
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
      
      const { data: balData } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: supplierId })
      if (balData && balData.length > 0) {
        setSupplierBalance({ balance: Number(balData[0].current_balance), type: balData[0].balance_type })
      }

      setSupplierInvoiceRef('')
      setNarration('')
      setNotes('')
      const defaultItem = items[0]
      setLines([{ 
        item_id: defaultItem?.id || '', 
        ledger_id: defaultItem?.expense_ledger_id || '', 
        description: defaultItem?.name || '', 
        quantity: 1, 
        rate: Number(defaultItem?.buy_price || 0), 
        amount: Number(defaultItem?.buy_price || 0), 
        vat_rate: Number(defaultItem?.tax_rate || 5.00), 
        vat_amount: Math.round(Number(defaultItem?.buy_price || 0) * Number(defaultItem?.tax_rate || 5.00) / 100 * 1000) / 1000 
      }])
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label required">Date</label>
                <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label required">Supplier</label>
                <select className="form-control" value={supplierId} onChange={e => setSupplierId(e.target.value)} required>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} [{s.account_code}]</option>
                  ))}
                </select>
                {supplierBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    Current Balance: <OMRSymbol size={12} /> {Number(supplierBalance.balance).toFixed(3)} {supplierBalance.type}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Supplier Invoice Ref</label>
                <input className="form-control" value={supplierInvoiceRef} onChange={e => setSupplierInvoiceRef(e.target.value)} placeholder="e.g. SUP-INV-8472" />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
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
                          <select className="form-control" value={line.item_id} onChange={e => updateLine(idx, 'item_id', e.target.value)} style={{ fontSize: '0.85rem', flex: 1 }}>
                            {items.map(i => (
                              <option key={i.id} value={i.id}>{i.name} ({i.code || 'No Code'})</option>
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

      {/* Quick Add Expense Account Modal */}
      {showQuickAddExpense && (
        <div className="modal-overlay" onClick={() => setShowQuickAddExpense(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Quick Add Expense Account</span>
              <button className="modal-close" onClick={() => setShowQuickAddExpense(false)}>&times;</button>
            </div>
            <form onSubmit={handleQuickAddExpense}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Account Name</label>
                  <input className="form-control" value={newExpenseName} onChange={e => setNewExpenseName(e.target.value)} placeholder="e.g. Digital Production Cost" required autoFocus />
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
