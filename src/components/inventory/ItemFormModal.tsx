'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Item, Ledger } from '@/lib/types'

const serviceSchema = z.object({
  name:                z.string().min(2, 'Service name is required'),
  code:                z.string().optional(),
  unit:                z.string().min(1, 'Billing unit is required'),
  sell_price:          z.coerce.number().min(0),
  buy_price:           z.coerce.number().min(0).optional(),
  tax_rate:            z.coerce.number().min(0),
  income_ledger_id:    z.string().min(1, 'Select default sales account'),
  expense_ledger_id:   z.string().optional().nullable(),
})

type ServiceFormData = z.infer<typeof serviceSchema>

interface ItemFormModalProps {
  companyId: string
  itemToEdit?: Item
  onClose: () => void
  onSaved: () => void
}

export function ItemFormModal({ companyId, itemToEdit, onClose, onSaved }: ItemFormModalProps) {
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loadingLedgers, setLoadingLedgers] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema) as any,
    defaultValues: itemToEdit ? {
      name:                itemToEdit.name,
      code:                itemToEdit.code || '',
      unit:                itemToEdit.unit,
      sell_price:          itemToEdit.sell_price,
      buy_price:           itemToEdit.buy_price || 0,
      tax_rate:            itemToEdit.tax_rate,
      income_ledger_id:    itemToEdit.income_ledger_id || '',
      expense_ledger_id:   itemToEdit.expense_ledger_id || '',
    } : {
      unit:         'Fixed / Project',
      sell_price:   0,
      buy_price:    0,
      tax_rate:     5.00,
    }
  })

  useEffect(() => {
    async function loadLedgers() {
      const { data } = await (supabase as any)
        .from('ledgers')
        .select('*, group:groups(id, name, nature)')
        .eq('company_id', companyId)
        .order('name')
      setLedgers(data ?? [])
      setLoadingLedgers(false)
    }
    loadLedgers()
  }, [companyId])

  // Filter ledgers
  const incomeLedgers = ledgers.filter(l => (l.group as any)?.nature === 'INCOME')
  const expenseLedgers = ledgers.filter(l => (l.group as any)?.nature === 'EXPENSE' || (l.group as any)?.nature === 'ASSET')

  async function onSubmit(data: ServiceFormData) {
    setApiError(null)
    const isEdit = !!itemToEdit
    const url = '/api/items'
    const method = isEdit ? 'PUT' : 'POST'
    
    // Services have no opening stock inventory or opening balance, so we set them to 0
    const payload = {
      ...data,
      opening_quantity: 0,
      opening_rate: 0,
      opening_value: 0,
      stock_quantity: 0,
      inventory_ledger_id: null,
      id: itemToEdit?.id,
      company_id: companyId,
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        onSaved()
      } else {
        const errData = await res.json()
        setApiError(errData.error || 'Failed to save service.')
      }
    } catch (e: any) {
      setApiError(e.message || 'An error occurred.')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <span className="modal-title">{itemToEdit ? 'Edit Service Line' : 'Create New Service Line'}</span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {apiError && (
              <div className="alert alert-danger" style={{ fontSize: '0.85rem' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{apiError}</span>
              </div>
            )}

            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '0.5rem 0.75rem', background: 'var(--color-teal-pale)', border: '1px solid var(--color-teal-muted)', borderRadius: 'var(--radius-md)' }}>
              Configure corporate services, billing rates, VAT categories, and default ledger postings.
            </div>

            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label className="form-label required font-semibold">Service Name</label>
                <input className={`form-control ${errors.name ? 'error' : ''}`} {...register('name')} placeholder="e.g. Business Strategy Consulting" />
                {errors.name && <span className="form-error">{errors.name.message}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Service Code (Optional)</label>
                <input className="form-control" {...register('code')} placeholder="Auto-generated if empty" />
              </div>
            </div>

            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label className="form-label required">Billing Unit / Frequency</label>
                <select className="form-control" {...register('unit')}>
                  <option value="Fixed / Project">Fixed / Project-based</option>
                  <option value="Hourly Rate">Hourly Rate</option>
                  <option value="Monthly Retainer">Monthly Retainer</option>
                  <option value="Daily Rate">Daily Rate</option>
                  <option value="Per Person">Per Person</option>
                  <option value="Units / Deliverables">Units / Deliverables</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Default VAT Rate (%)</label>
                <input type="number" step="0.01" className="form-control" {...register('tax_rate')} placeholder="5.00" />
              </div>
            </div>

            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label className="form-label required">Default Selling Price (OMR)</label>
                <input type="number" step="0.001" className="form-control" {...register('sell_price')} placeholder="0.000" />
              </div>
              <div className="form-group">
                <label className="form-label">Delivery Cost / Buy Cost (optional)</label>
                <input type="number" step="0.001" className="form-control" {...register('buy_price')} placeholder="0.000" />
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0.5rem 0' }} />
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--color-teal)' }}>Account Ledgers Mapping</h4>

            <div className="form-group">
              <label className="form-label required">Default Sales Income Account</label>
              <select className={`form-control ${errors.income_ledger_id ? 'error' : ''}`} {...register('income_ledger_id')}>
                <option value="">— Select Sales Ledger —</option>
                {incomeLedgers.map(l => <option key={l.id} value={l.id}>{l.name} [{l.account_code}]</option>)}
              </select>
              {errors.income_ledger_id && <span className="form-error">{errors.income_ledger_id.message}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Default Purchase / Expense Account (optional)</label>
              <select className="form-control" {...register('expense_ledger_id')}>
                <option value="">— Select Expense Ledger —</option>
                {expenseLedgers.map(l => <option key={l.id} value={l.id}>{l.name} [{l.account_code}]</option>)}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Service Line'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
