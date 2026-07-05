'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, AlertCircle, BookOpen, Info, CheckCircle2, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { Ledger, VoucherType, Nature } from '@/lib/types'
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
  debitCashOrBank: 'ONLY' | 'EXCLUDE' | 'ALLOW'
  creditCashOrBank: 'ONLY' | 'EXCLUDE' | 'ALLOW'
  partyLabel?: string
}> = {
  PURCHASE: {
    debitLabel:    'What was purchased? (Asset / Expense Category)',
    creditLabel:   'How did you pay? (Bank, Cash, or Credit Supplier)',
    debitNatures:  ['EXPENSE', 'ASSET'],
    creditNatures: ['ASSET', 'LIABILITY'],
    debitCashOrBank: 'EXCLUDE',
    creditCashOrBank: 'ALLOW',
    partyLabel:    'Supplier / Vendor Name',
  },
  SALE: {
    debitLabel:    'Where did you receive the money? (Bank, Cash, or Unpaid Customer)',
    creditLabel:   'What was the income category? (Sales / Revenue Account)',
    debitNatures:  ['ASSET', 'LIABILITY'],
    creditNatures: ['INCOME'],
    debitCashOrBank: 'ALLOW',
    creditCashOrBank: 'EXCLUDE',
    partyLabel:    'Customer Name',
  },
  RECEIPT: {
    debitLabel:    'Where was it deposited? (Bank / Cash)',
    creditLabel:   'Who paid you? (Customer Ledger)',
    debitNatures:  ['ASSET'],
    creditNatures: ['ASSET', 'LIABILITY'],
    debitCashOrBank: 'ONLY',
    creditCashOrBank: 'EXCLUDE',
    partyLabel:    'Customer Name',
  },
  PAYMENT: {
    debitLabel:    'What was paid for? (Expense Category or Supplier)',
    creditLabel:   'Paid from which account? (Bank / Cash)',
    debitNatures:  ['EXPENSE', 'LIABILITY', 'ASSET'],
    creditNatures: ['ASSET'],
    debitCashOrBank: 'EXCLUDE',
    creditCashOrBank: 'ONLY',
    partyLabel:    'Receiver / Payee Name',
  },
  JOURNAL: {
    debitLabel:    'Account to Increase / Add funds (+)',
    creditLabel:   'Account to Decrease / Remove funds (-)',
    debitNatures:  ['ASSET','LIABILITY','INCOME','EXPENSE','EQUITY'],
    creditNatures: ['ASSET','LIABILITY','INCOME','EXPENSE','EQUITY'],
    debitCashOrBank: 'ALLOW',
    creditCashOrBank: 'ALLOW',
  },
  PURCHASE_RETURN: {
    debitLabel:    'Supplier / Refund Account',
    creditLabel:   'Purchased item being returned',
    debitNatures:  ['LIABILITY','ASSET'],
    creditNatures: ['ASSET','EXPENSE'],
    debitCashOrBank: 'ALLOW',
    creditCashOrBank: 'EXCLUDE',
  },
  SALES_RETURN: {
    debitLabel:    'Sales return category',
    creditLabel:   'Customer account (deduct refund)',
    debitNatures:  ['INCOME'],
    creditNatures: ['ASSET','LIABILITY'],
    debitCashOrBank: 'EXCLUDE',
    creditCashOrBank: 'ALLOW',
  },
}

const voucherSchema = z.object({
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

function NewVoucherForm() {
  const router = useRouter()
  const params = useSearchParams()
  const typeParam = (params.get('type') ?? 'PURCHASE') as VoucherType

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [baseCurrency, setBaseCurrency] = useState('OMR')
  
  // Real-time account balances mapping
  const [balances, setBalances] = useState<Record<string, { balance: number; type: 'Dr' | 'Cr' }>>({})
  const [loadingBalances, setLoadingBalances] = useState(false)

  const config = VOUCHER_CONFIG[typeParam] ?? VOUCHER_CONFIG.PURCHASE

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(voucherSchema) as any,
    defaultValues: {
      type:     typeParam,
      date:     new Date().toISOString().split('T')[0],
      currency: 'OMR',
    },
  })

  // Load ledgers and settings, then fetch current ledger balances
  useEffect(() => {
    async function load() {
      setLoadingBalances(true)
      const [{ data: l }, { data: s }, { data: lines }] = await Promise.all([
        supabase.from('ledgers').select('*, group:groups(id,name,nature)').order('name'),
        supabase.from('settings').select('base_currency').single(),
        supabase.from('journal_lines').select('ledger_id, type, amount'),
      ])
      
      const loadedLedgers = l ?? []
      setLedgers(loadedLedgers)
      
      if (s) {
        setBaseCurrency(s.base_currency)
        reset({
          type:     typeParam,
          date:     new Date().toISOString().split('T')[0],
          currency: s.base_currency,
        })
      }

      // Calculate balances locally for instant lookups
      const tempBalances: Record<string, { balance: number; type: 'Dr' | 'Cr' }> = {}
      for (const ledger of loadedLedgers) {
        let bal = Number(ledger.opening_balance ?? 0)
        let oType = ledger.opening_type ?? 'Dr'

        // sum journal lines
        const ledgerLines = (lines ?? []).filter(line => line.ledger_id === ledger.id)
        for (const line of ledgerLines) {
          if (line.type === oType) {
            bal += Number(line.amount)
          } else {
            bal -= Number(line.amount)
          }
        }
        
        // Handle negative flip
        const finalType = bal >= 0 ? oType : (oType === 'Dr' ? 'Cr' : 'Dr')
        tempBalances[ledger.id] = {
          balance: Math.abs(bal),
          type: finalType,
        }
      }
      setBalances(tempBalances)
      setLoadingBalances(false)
    }
    load()
  }, [typeParam, reset])

  function isCashOrBank(ledger: Ledger) {
    const name = ledger.name.toLowerCase()
    return (
      ledger.id === '10000000-0000-0000-0000-000000000001' || // Cash in Hand
      ledger.id === '10000000-0000-0000-0000-000000000002' || // Bank Account
      name.includes('cash') ||
      name.includes('bank') ||
      name.includes('petty')
    )
  }

  function filterLedgers(natures: Nature[], mode: 'ONLY' | 'EXCLUDE' | 'ALLOW') {
    return ledgers.filter(l => {
      const matchNature = natures.includes((l as any).group?.nature)
      if (!matchNature) return false
      
      const isCb = isCashOrBank(l)
      if (mode === 'ONLY') return isCb
      if (mode === 'EXCLUDE') return !isCb
      return true
    })
  }

  async function onSubmit(data: FormValues) {
    setSubmitError(null)
    try {
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        setSubmitError(err.error ?? 'Failed to save voucher.')
        return
      }
      router.push('/vouchers')
    } catch {
      setSubmitError('Network error. Please try again.')
    }
  }

  const debitLedgers  = filterLedgers(config.debitNatures, config.debitCashOrBank)
  const creditLedgers = filterLedgers(config.creditNatures, config.creditCashOrBank)

  const selectedDebitId = watch('debit_ledger_id')
  const selectedCreditId = watch('credit_ledger_id')
  const enteredAmount = Number(watch('amount') ?? 0)
  const selectedCurrency = watch('currency') ?? 'OMR'

  const debitLedger = ledgers.find(l => l.id === selectedDebitId)
  const creditLedger = ledgers.find(l => l.id === selectedCreditId)

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/vouchers" className="btn btn-outline btn-sm" style={{ width: 36, height: 36, padding: 0, borderRadius: '50%' }}>
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="page-title">New {TYPE_LABELS[typeParam]}</h1>
            <p className="page-subtitle">Fill in the details — the system handles the double-entry accounting</p>
          </div>
        </div>
      </div>

      {/* Type Selector Buttons */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {(Object.keys(TYPE_LABELS) as VoucherType[]).map(t => (
          <Link
            key={t}
            href={`/vouchers/new?type=${t}`}
            className={`btn btn-sm ${t === typeParam ? 'btn-primary' : 'btn-outline'}`}
          >
            {TYPE_LABELS[t]}
          </Link>
        ))}
      </div>

      {/* Two Column Layout: removes whitespace, adds interactive helper panels */}
      <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* Left Column: Input Form Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{TYPE_LABELS[typeParam]} Details</div>
              <div className="card-subtitle">Complete all mandatory fields highlighted in gold</div>
            </div>
            <span className={`badge voucher-badge-${typeParam}`}>{TYPE_LABELS[typeParam]}</span>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
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
                {isSubmitting ? 'Posting...' : `Post ${TYPE_LABELS[typeParam]}`}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Dynamic Interactive Helper Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Explanation panel */}
          <div className="card">
            <div className="card-header" style={{ border: 'none', paddingBottom: '0.5rem' }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-teal)' }}>
                <Info size={16} />
                <span>Transaction Blueprint</span>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              <p>{VOUCHER_EXPLANATIONS[typeParam]}</p>
            </div>
          </div>

          {/* Interactive Ledger Balances Monitor */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Live Account Balances</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Debit balance audit */}
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

              {/* Credit balance audit */}
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

          {/* Premium Double Entry Ledger Preview */}
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
                    {!debitLedger && !creditLedger && (
                      <tr>
                        <td colSpan={3} className="text-center text-xs text-muted italic" style={{ padding: '2rem' }}>
                          Complete form on left to simulate transaction flow
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

export default function NewVoucherPage() {
  return (
    <Suspense fallback={
      <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 450, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 350, borderRadius: 16 }} />
      </div>
    }>
      <NewVoucherForm />
    </Suspense>
  )
}
