'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, AlertCircle, BookOpen, Info, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { Ledger, VoucherType, Nature, Voucher } from '@/lib/types'
import { CURRENCIES } from '@/lib/types'

const TYPE_LABELS: Record<VoucherType, string> = {
  PURCHASE: 'Purchase', SALE: 'Sale', RECEIPT: 'Receipt',
  PAYMENT: 'Payment', JOURNAL: 'Journal',
  PURCHASE_RETURN: 'Purchase Return', SALES_RETURN: 'Sales Return',
}

const VOUCHER_EXPLANATIONS: Record<VoucherType, string> = {
  PURCHASE: 'Used to record inventory, fixed assets, or operational expense purchases from a vendor.',
  SALE: 'Used to record revenue generated from sales of services or goods to a customer.',
  RECEIPT: 'Used to record cash or bank funds received from customer settlements or capital injections.',
  PAYMENT: 'Used to record cash or bank disbursements to settle vendor dues or operational costs.',
  JOURNAL: 'Used for adjustment entries, depreciation, corrections, and non-cash general adjustments.',
  PURCHASE_RETURN: 'Used to record goods returned to a supplier, reducing accounts payable or receiving refunds.',
  SALES_RETURN: 'Used to record goods returned from customers, reducing accounts receivable or issuing refunds.',
}

const VOUCHER_CONFIG: Record<VoucherType, {
  debitLabel: string
  creditLabel: string
  debitNatures: Nature[]
  creditNatures: Nature[]
  partyLabel?: string
}> = {
  PURCHASE: {
    debitLabel:    'What was purchased? (Asset / Expense Category)',
    creditLabel:   'How did you pay? (Bank, Cash, or Credit Supplier)',
    debitNatures:  ['EXPENSE', 'ASSET'],
    creditNatures: ['ASSET', 'LIABILITY'],
    partyLabel:    'Supplier / Vendor Name',
  },
  SALE: {
    debitLabel:    'Where did you receive the money? (Bank, Cash, or Unpaid Customer)',
    creditLabel:   'What was the income category? (Sales / Revenue Account)',
    debitNatures:  ['ASSET', 'LIABILITY'],
    creditNatures: ['INCOME'],
    partyLabel:    'Customer Name',
  },
  RECEIPT: {
    debitLabel:    'Where was it deposited? (Bank / Cash)',
    creditLabel:   'Who paid you? (Customer Ledger)',
    debitNatures:  ['ASSET'],
    creditNatures: ['ASSET', 'LIABILITY'],
    partyLabel:    'Customer Name',
  },
  PAYMENT: {
    debitLabel:    'What was paid for? (Expense Category or Supplier)',
    creditLabel:   'Paid from which account? (Bank / Cash)',
    debitNatures:  ['EXPENSE', 'LIABILITY', 'ASSET'],
    creditNatures: ['ASSET'],
    partyLabel:    'Receiver / Payee Name',
  },
  JOURNAL: {
    debitLabel:    'Account to Increase / Add funds (+)',
    creditLabel:   'Account to Decrease / Remove funds (-)',
    debitNatures:  ['ASSET','LIABILITY','INCOME','EXPENSE','EQUITY'],
    creditNatures: ['ASSET','LIABILITY','INCOME','EXPENSE','EQUITY'],
  },
  PURCHASE_RETURN: {
    debitLabel:    'Supplier / Refund Account',
    creditLabel:   'Purchased item being returned',
    debitNatures:  ['LIABILITY','ASSET'],
    creditNatures: ['ASSET','EXPENSE'],
  },
  SALES_RETURN: {
    debitLabel:    'Sales return category',
    creditLabel:   'Customer account (deduct refund)',
    debitNatures:  ['INCOME'],
    creditNatures: ['ASSET','LIABILITY'],
  },
}

const voucherSchema = z.object({
  id:               z.string(),
  type:             z.string(),
  date:             z.string().min(1, 'Date is required'),
  party_name:       z.string().optional(),
  debit_ledger_id:  z.string().min(1, 'Select a ledger'),
  credit_ledger_id: z.string().min(1, 'Select a ledger'),
  amount:           z.coerce.number().positive('Amount must be greater than 0'),
  currency:         z.string().min(1),
  ref:              z.string().optional(),
  notes:            z.string().optional(),
})
type FormValues = z.infer<typeof voucherSchema>

function EditVoucherForm() {
  const router = useRouter()
  const params = useSearchParams()
  const idParam = params.get('id')

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [voucher, setVoucher] = useState<Voucher | null>(null)
  const [voucherType, setVoucherType] = useState<VoucherType>('PURCHASE')
  const [loading, setLoading] = useState(true)

  // Real-time account balances mapping
  const [balances, setBalances] = useState<Record<string, { balance: number; type: 'Dr' | 'Cr' }>>({})

  const config = VOUCHER_CONFIG[voucherType] ?? VOUCHER_CONFIG.PURCHASE

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(voucherSchema),
  })

  // Load ledgers, settings, voucher record, and ledger balances
  useEffect(() => {
    if (!idParam) return

    async function load() {
      setLoading(true)
      const [{ data: l }, { data: v }, { data: lines }] = await Promise.all([
        supabase.from('ledgers').select('*, group:groups(id,name,nature)').order('name'),
        supabase.from('vouchers').select('*, journal_lines(*)').eq('id', idParam).single(),
        supabase.from('journal_lines').select('ledger_id, type, amount'),
      ])

      const loadedLedgers = l ?? []
      setLedgers(loadedLedgers)

      if (v) {
        setVoucher(v)
        setVoucherType(v.type as VoucherType)

        // Find debit and credit accounts from journal lines
        const drLine = v.journal_lines?.find((line: any) => line.type === 'Dr')
        const crLine = v.journal_lines?.find((line: any) => line.type === 'Cr')

        setValue('id', v.id)
        setValue('type', v.type)
        setValue('date', v.date)
        setValue('ref', v.ref || '')
        setValue('party_name', v.party_name || '')
        setValue('amount', v.amount)
        setValue('currency', v.currency)
        if (drLine) setValue('debit_ledger_id', drLine.ledger_id)
        if (crLine) setValue('credit_ledger_id', crLine.ledger_id)
        setValue('notes', v.notes || '')
      }

      // Calculate balances locally for instant lookups
      const tempBalances: Record<string, { balance: number; type: 'Dr' | 'Cr' }> = {}
      for (const ledger of loadedLedgers) {
        let bal = Number(ledger.opening_balance ?? 0)
        let oType = ledger.opening_type ?? 'Dr'

        const ledgerLines = (lines ?? []).filter(line => line.ledger_id === ledger.id)
        for (const line of ledgerLines) {
          if (line.type === oType) {
            bal += Number(line.amount)
          } else {
            bal -= Number(line.amount)
          }
        }
        
        const finalType = bal >= 0 ? oType : (oType === 'Dr' ? 'Cr' : 'Dr')
        tempBalances[ledger.id] = {
          balance: Math.abs(bal),
          type: finalType,
        }
      }
      setBalances(tempBalances)
      setLoading(false)
    }
    load()
  }, [idParam, setValue])

  function filterLedgers(natures: Nature[]) {
    return ledgers.filter(l => natures.includes((l as any).group?.nature))
  }

  async function onSubmit(data: FormValues) {
    setSubmitError(null)
    try {
      const res = await fetch('/api/vouchers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        setSubmitError(err.error ?? 'Failed to update voucher.')
        return
      }
      router.push('/vouchers')
    } catch {
      setSubmitError('Network error. Please try again.')
    }
  }

  const debitLedgers  = filterLedgers(config.debitNatures)
  const creditLedgers = filterLedgers(config.creditNatures)

  const selectedDebitId = watch('debit_ledger_id')
  const selectedCreditId = watch('credit_ledger_id')
  const enteredAmount = Number(watch('amount') ?? 0)
  const selectedCurrency = watch('currency') ?? 'OMR'

  const debitLedger = ledgers.find(l => l.id === selectedDebitId)
  const creditLedger = ledgers.find(l => l.id === selectedCreditId)

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 450, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 350, borderRadius: 16 }} />
      </div>
    )
  }

  if (!voucher) {
    return (
      <div className="alert alert-danger">
        <AlertCircle size={16} />
        <span>Voucher not found or has been deleted.</span>
      </div>
    )
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/vouchers" className="btn btn-outline btn-sm" style={{ width: 36, height: 36, padding: 0, borderRadius: '50%' }}>
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="page-title">Edit Voucher: {voucher.voucher_number}</h1>
            <p className="page-subtitle">Modifying transaction details. Balanced ledgers will be recalculated automatically.</p>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* Left Column: Input Form Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Modify {TYPE_LABELS[voucherType]} Entries</div>
              <div className="card-subtitle">Ensure date and account alignments remain correct</div>
            </div>
            <span className={`badge voucher-badge-${voucherType}`}>{TYPE_LABELS[voucherType]}</span>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            <input type="hidden" {...register('id')} />
            <input type="hidden" {...register('type')} />
            
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {submitError && (
                <div className="alert alert-danger">
                  <AlertCircle size={16} />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label required">Posting Date</label>
                  <input type="date" className={`form-control ${errors.date ? 'error' : ''}`} {...register('date')} />
                  {errors.date && <span className="form-error">{errors.date.message}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Reference No.</label>
                  <input className="form-control" {...register('ref')} placeholder="Invoice / adjustment ref" />
                </div>
              </div>

              {config.partyLabel && (
                <div className="form-group">
                  <label className="form-label">{config.partyLabel}</label>
                  <input className="form-control" {...register('party_name')} placeholder={`Enter ${config.partyLabel.toLowerCase()}`} />
                </div>
              )}

              <div className="form-group">
                <label className="form-label required">{config.debitLabel}</label>
                <select className={`form-control ${errors.debit_ledger_id ? 'error' : ''}`} {...register('debit_ledger_id')}>
                  <option value="">— Select Account —</option>
                  {debitLedgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {errors.debit_ledger_id && <span className="form-error">{errors.debit_ledger_id.message}</span>}
              </div>

              <div className="form-group">
                <label className="form-label required">{config.creditLabel}</label>
                <select className={`form-control ${errors.credit_ledger_id ? 'error' : ''}`} {...register('credit_ledger_id')}>
                  <option value="">— Select Account —</option>
                  {creditLedgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {errors.credit_ledger_id && <span className="form-error">{errors.credit_ledger_id.message}</span>}
              </div>

              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label required">Amount</label>
                  <input
                    type="number" step="0.001" min="0"
                    className={`form-control ${errors.amount ? 'error' : ''}`}
                    {...register('amount')}
                    placeholder="0.000"
                  />
                  {errors.amount && <span className="form-error">{errors.amount.message}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label required">Transaction Currency</label>
                  <select className="form-control" {...register('currency')}>
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Memo Notes</label>
                <textarea className="form-control" {...register('notes')} placeholder="Optional description or remarks..." />
              </div>
            </div>

            <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Link href="/vouchers" className="btn btn-outline">Cancel</Link>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Saving Changes...' : 'Save Transaction'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Interactive Side Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Explanation */}
          <div className="card">
            <div className="card-header" style={{ border: 'none', paddingBottom: '0.5rem' }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-teal)' }}>
                <Info size={16} />
                <span>Transaction Blueprint</span>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              <p>{VOUCHER_EXPLANATIONS[voucherType]}</p>
            </div>
          </div>

          {/* Account Auditor */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Live Account Balances</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Debit */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="text-xs text-muted" style={{ fontWeight: 600 }}>RECEIVING ACCOUNT (VALUE ADDED)</span>
                {debitLedger ? (
                  <div style={{ background: 'var(--color-surface-alt)', padding: '0.75rem 1rem', borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{debitLedger.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '4px' }}>
                      <span className="text-muted">Current Balance:</span>
                      <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        OMR {(balances[debitLedger.id]?.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} {balances[debitLedger.id]?.type === 'Dr' ? '(+)' : '(-)'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted italic">No account selected.</span>
                )}
              </div>

              {/* Credit */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="text-xs text-muted" style={{ fontWeight: 600 }}>GIVING ACCOUNT (VALUE DEDUCTED)</span>
                {creditLedger ? (
                  <div style={{ background: 'var(--color-surface-alt)', padding: '0.75rem 1rem', borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{creditLedger.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '4px' }}>
                      <span className="text-muted">Current Balance:</span>
                      <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        OMR {(balances[creditLedger.id]?.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} {balances[creditLedger.id]?.type === 'Dr' ? '(+)' : '(-)'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted italic">No account selected.</span>
                )}
              </div>
            </div>
          </div>

          {/* Ledger Posting simulation preview */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={16} />
                <span>Simulation: How values move</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: '1rem 0' }}>
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th style={{ textAlign: 'right' }}>Added (+)</th>
                      <th style={{ textAlign: 'right' }}>Deducted (-)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debitLedger && (
                      <tr>
                        <td className="font-medium text-xs">{debitLedger.name}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)', fontWeight: 600, fontSize: '0.8rem' }}>
                          {selectedCurrency} {enteredAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</td>
                      </tr>
                    )}
                    {creditLedger && (
                      <tr>
                        <td className="font-medium text-xs">{creditLedger.name}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.8rem' }}>
                          {selectedCurrency} {enteredAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default function EditVoucherPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 450, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 350, borderRadius: 16 }} />
      </div>
    }>
      <EditVoucherForm />
    </Suspense>
  )
}
