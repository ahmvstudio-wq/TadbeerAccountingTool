'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, AlertCircle, BookOpen, Info, CheckCircle, Printer } from 'lucide-react'
import Link from 'next/link'
import { PrintableVoucher } from '@/components/voucher/PrintableVoucher'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import type { Ledger, VoucherType, Nature, Voucher } from '@/lib/types'
import { CURRENCIES } from '@/lib/types'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useUIStore } from '@/store/ui'

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
    partyLabel:    'Supplier / Vendor',
  },
  SALE: {
    debitLabel:    'Where did you receive the money? (Bank, Cash, or Unpaid Customer)',
    creditLabel:   'What was the income category? (Sales / Revenue Account)',
    debitNatures:  ['ASSET', 'LIABILITY'],
    creditNatures: ['INCOME'],
    debitCashOrBank: 'ALLOW',
    creditCashOrBank: 'EXCLUDE',
    partyLabel:    'Customer',
  },
  RECEIPT: {
    debitLabel:    'Where was it deposited? (Bank / Cash)',
    creditLabel:   'Who paid you? (Customer Ledger)',
    debitNatures:  ['ASSET'],
    creditNatures: ['ASSET', 'LIABILITY'],
    debitCashOrBank: 'ONLY',
    creditCashOrBank: 'EXCLUDE',
    partyLabel:    'Customer',
  },
  PAYMENT: {
    debitLabel:    'What was paid for? (Expense Category or Supplier)',
    creditLabel:   'Paid from which account? (Bank / Cash)',
    debitNatures:  ['EXPENSE', 'LIABILITY', 'ASSET'],
    creditNatures: ['ASSET'],
    debitCashOrBank: 'EXCLUDE',
    creditCashOrBank: 'ONLY',
    partyLabel:    'Receiver / Supplier',
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
    partyLabel:    'Supplier',
  },
  SALES_RETURN: {
    debitLabel:    'Sales return category',
    creditLabel:   'Customer account (deduct refund)',
    debitNatures:  ['INCOME'],
    creditNatures: ['ASSET','LIABILITY'],
    debitCashOrBank: 'EXCLUDE',
    creditCashOrBank: 'ALLOW',
    partyLabel:    'Customer',
  },
}

const voucherSchema = z.object({
  id:               z.string(),
  type:             z.string(),
  date:             z.string().min(1, 'Date is required'),
  party_ledger_id:  z.string().optional(),
  party_name:       z.string().optional(),
  debit_ledger_id:  z.string().min(1, 'Select a debit account'),
  credit_ledger_id: z.string().min(1, 'Select a credit account'),
  amount:           z.coerce.number().positive('Amount must be greater than 0'),
  currency:         z.string().min(1),
  ref:              z.string().optional(),
  notes:            z.string().optional(),
  narration:        z.string().min(1, 'Narration is required'),
})
type FormValues = z.infer<typeof voucherSchema>

function EditVoucherForm() {
  const router = useRouter()
  const params = useSearchParams()
  const idParam = params.get('id')

  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [voucher, setVoucher] = useState<Voucher | null>(null)
  const [voucherType, setVoucherType] = useState<VoucherType>('PURCHASE')
  const [loading, setLoading] = useState(true)

  // Real-time account balances mapping
  const [balances, setBalances] = useState<Record<string, { balance: number; type: 'Dr' | 'Cr' }>>({})

  const [createdVoucher, setCreatedVoucher] = useState<any>(null)
  const [createdVoucherLines, setCreatedVoucherLines] = useState<any[]>([])
  const [companySettings, setCompanySettings] = useState<any>(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [loadingPrintDetails, setLoadingPrintDetails] = useState(false)

  const config = VOUCHER_CONFIG[voucherType] ?? VOUCHER_CONFIG.PURCHASE

  const { handleSubmit, watch, setValue, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(voucherSchema) as any,
  })

  // Load ledgers, settings, voucher record, and ledger balances
  useEffect(() => {
    if (!idParam) return

    async function load() {
      setLoading(true)
      const [{ data: l }, { data: v }, { data: lines }] = await Promise.all([
        supabase.from('ledgers').select('*, group:groups(id,name,nature)').eq('company_id', currentCompanyId).order('name'),
        supabase.from('vouchers').select('*, journal_lines(*)').eq('id', idParam!).eq('company_id', currentCompanyId).single(),
        supabase.from('journal_lines').select('ledger_id, type, amount').eq('company_id', currentCompanyId),
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
        setValue('party_ledger_id', v.party_ledger_id || '')
        setValue('party_name', v.party_name || '')
        setValue('amount', v.amount)
        setValue('currency', v.currency)
        if (drLine) setValue('debit_ledger_id', drLine.ledger_id)
        if (crLine) setValue('credit_ledger_id', crLine.ledger_id)
        setValue('notes', v.notes || '')
        setValue('narration', v.narration || '')
      }

      // Calculate balances locally for instant lookups
      const tempBalances: Record<string, { balance: number; type: 'Dr' | 'Cr' }> = {}
      for (const ledger of loadedLedgers) {
        let bal = Number(ledger.opening_balance ?? 0)
        let oType = ledger.opening_type ?? 'Dr'

        const ledgerLines = (lines ?? []).filter((line: any) => line.ledger_id === ledger.id)
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
  }, [idParam, setValue, currentCompanyId])

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

  const partyLedgers = voucherType === 'PURCHASE' || voucherType === 'PAYMENT' || voucherType === 'PURCHASE_RETURN'
    ? ledgers.filter(l => l.group?.name.toLowerCase().includes('creditor') || l.group?.name.toLowerCase().includes('supplier') || l.group?.nature === 'LIABILITY')
    : ledgers.filter(l => l.group?.name.toLowerCase().includes('debtor') || l.group?.name.toLowerCase().includes('customer') || l.group?.nature === 'ASSET')

  async function onSubmit(data: FormValues) {
    setSubmitError(null)
    const selectedParty = ledgers.find(l => l.id === data.party_ledger_id)
    const payload = {
      ...data,
      party_name: selectedParty ? selectedParty.name : data.party_name,
      company_id: currentCompanyId,
    }
    try {
      const res = await fetch('/api/vouchers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        setSubmitError(err.error ?? 'Failed to update voucher.')
        return
      }
      const newVoucher = await res.json()
      setCreatedVoucher(newVoucher)
      setShowSuccessModal(true)

      setLoadingPrintDetails(true)
      try {
        const [{ data: lines }, { data: settings }] = await Promise.all([
          supabase
            .from('journal_lines')
            .select('*, ledger:ledgers(id, name, account_code, classification)')
            .eq('voucher_id', newVoucher.id),
          supabase
            .from('settings')
            .select('*')
            .eq('company_id', currentCompanyId)
            .single()
        ])
        setCreatedVoucherLines(lines || [])
        setCompanySettings(settings)
      } catch (err) {
        console.error('Failed to load printing details:', err)
      } finally {
        setLoadingPrintDetails(false)
      }
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

  if (loading) {
    return (
      <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '2rem' }}>
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

      <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '2rem', alignItems: 'flex-start' }}>
        
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
            <input type="hidden" {...control.register('id')} />
            <input type="hidden" {...control.register('type')} />
            
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
                  <Controller
                    control={control}
                    name="date"
                    render={({ field }) => (
                      <input type="date" className={`form-control ${errors.date ? 'error' : ''}`} {...field} />
                    )}
                  />
                  {errors.date && <span className="form-error">{errors.date.message}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Reference No.</label>
                  <Controller
                    control={control}
                    name="ref"
                    render={({ field }) => (
                      <input className="form-control" placeholder="Invoice / adjustment ref" {...field} />
                    )}
                  />
                </div>
              </div>

              {config.partyLabel && (
                <div className="form-group">
                  <label className="form-label required">{config.partyLabel} Account</label>
                  <Controller
                    control={control}
                    name="party_ledger_id"
                    render={({ field }) => (
                      <SearchableSelect
                        ledgers={partyLedgers}
                        value={field.value || ''}
                        onChange={(val) => {
                          field.onChange(val)
                          const matched = partyLedgers.find(l => l.id === val)
                          setValue('party_name', matched ? matched.name : '')
                        }}
                        placeholder={`Select ${config.partyLabel}`}
                        error={!!errors.party_ledger_id}
                      />
                    )}
                  />
                  {errors.party_ledger_id && <span className="form-error">{errors.party_ledger_id.message}</span>}
                </div>
              )}

              <div className="form-group">
                <label className="form-label required">{config.debitLabel}</label>
                <Controller
                  control={control}
                  name="debit_ledger_id"
                  render={({ field }) => (
                    <SearchableSelect
                      ledgers={debitLedgers}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select Debit Account"
                      error={!!errors.debit_ledger_id}
                    />
                  )}
                />
                {errors.debit_ledger_id && <span className="form-error">{errors.debit_ledger_id.message}</span>}
              </div>

              {/* Phase 11: Display bank/cash balances for Payments */}
              {voucherType === 'PAYMENT' && (
                <div style={{
                  background: 'var(--color-gold-pale)',
                  border: '1px solid var(--color-gold)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  fontSize: '0.8rem',
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--color-gold-dark)', marginBottom: '4px' }}>
                    Available Bank & Cash Balances:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {ledgers.filter(l => l.name.toLowerCase().includes('bank') || l.id === '10000000-0000-0000-0000-000000000002' || l.id === '10000000-0000-0000-0000-000000000001').map(bank => {
                      const bal = balances[bank.id]
                      return (
                        <div key={bank.id} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace' }}>
                          <span>{bank.name}</span>
                          <strong>OMR {bal ? bal.balance.toFixed(3) : '0.000'} {bal ? bal.type : 'Dr'}</strong>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label required">{config.creditLabel}</label>
                <Controller
                  control={control}
                  name="credit_ledger_id"
                  render={({ field }) => (
                    <SearchableSelect
                      ledgers={creditLedgers}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select Credit Account"
                      error={!!errors.credit_ledger_id}
                    />
                  )}
                />
                {errors.credit_ledger_id && <span className="form-error">{errors.credit_ledger_id.message}</span>}
              </div>

              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label required">Amount</label>
                  <Controller
                    control={control}
                    name="amount"
                    render={({ field }) => (
                      <input
                        type="number" step="0.001" min="0"
                        className={`form-control ${errors.amount ? 'error' : ''}`}
                        placeholder="0.000"
                        {...field}
                      />
                    )}
                  />
                  {errors.amount && <span className="form-error">{errors.amount.message}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label required">Transaction Currency</label>
                  <Controller
                    control={control}
                    name="currency"
                    render={({ field }) => (
                      <select className="form-control" {...field}>
                        {CURRENCIES.map(c => (
                          <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                        ))}
                      </select>
                    )}
                  />
                </div>
              </div>

              {/* Phase 2: Narration is Mandatory */}
              <div className="form-group">
                <label className="form-label required">Narration</label>
                <Controller
                  control={control}
                  name="narration"
                  render={({ field }) => (
                    <textarea
                      className={`form-control ${errors.narration ? 'error' : ''}`}
                      placeholder="e.g. Annual Elevator Maintenance (January–December 2026)"
                      style={{ height: 60, paddingTop: 10 }}
                      {...field}
                    />
                  )}
                />
                {errors.narration && <span className="form-error">{errors.narration.message}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Memo Notes (Optional)</label>
                <Controller
                  control={control}
                  name="notes"
                  render={({ field }) => (
                    <textarea className="form-control" placeholder="Optional description or remarks..." style={{ height: 60, paddingTop: 10 }} {...field} />
                  )}
                />
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

          <div className="card">
            <div className="card-header">
              <div className="card-title">Live Account Balances</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="text-xs text-muted" style={{ fontWeight: 600 }}>RECEIVING ACCOUNT (VALUE ADDED)</span>
                {debitLedger ? (
                  <div style={{ background: 'var(--color-surface-alt)', padding: '0.75rem 1rem', borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--color-gold-dark)', marginRight: 4 }}>[{debitLedger.account_code}]</span>
                      {debitLedger.name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '4px' }}>
                      <span className="text-muted">Current Balance:</span>
                      <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        OMR {(balances[debitLedger.id]?.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 3 })} {balances[debitLedger.id]?.type}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted italic">No account selected.</span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="text-xs text-muted" style={{ fontWeight: 600 }}>GIVING ACCOUNT (VALUE DEDUCTED)</span>
                {creditLedger ? (
                  <div style={{ background: 'var(--color-surface-alt)', padding: '0.75rem 1rem', borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--color-gold-dark)', marginRight: 4 }}>[{creditLedger.account_code}]</span>
                      {creditLedger.name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '4px' }}>
                      <span className="text-muted">Current Balance:</span>
                      <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        OMR {(balances[creditLedger.id]?.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 3 })} {balances[creditLedger.id]?.type}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted italic">No account selected.</span>
                )}
              </div>
            </div>
          </div>

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
                      <th style={{ textAlign: 'right' }}>Debit (Dr)</th>
                      <th style={{ textAlign: 'right' }}>Credit (Cr)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debitLedger && (
                      <tr>
                        <td className="font-medium text-xs">
                          <span style={{ color: 'var(--color-gold-dark)', marginRight: 4 }}>[{debitLedger.account_code}]</span>
                          {debitLedger.name}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)', fontWeight: 600, fontSize: '0.8rem' }}>
                          {selectedCurrency} {enteredAmount.toLocaleString('en-US', { minimumFractionDigits: 3 })}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</td>
                      </tr>
                    )}
                    {creditLedger && (
                      <tr>
                        <td className="font-medium text-xs">
                          <span style={{ color: 'var(--color-gold-dark)', marginRight: 4 }}>[{creditLedger.account_code}]</span>
                          {creditLedger.name}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.8rem' }}>
                          {selectedCurrency} {enteredAmount.toLocaleString('en-US', { minimumFractionDigits: 3 })}
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

      {showSuccessModal && createdVoucher && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '480px', border: '1px solid var(--color-border)' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={18} />
                <span>Voucher Updated Successfully</span>
              </span>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center', padding: '2rem 1.5rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-teal)' }}>
                {createdVoucher.voucher_number}
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                The double-entry general ledger logs have been generated and updated for this transaction.
              </p>
              {loadingPrintDetails && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>Loading printing details...</p>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                disabled={loadingPrintDetails}
                onClick={() => window.print()}
              >
                <Printer size={16} /> Print Voucher / Invoice
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%' }}
                onClick={() => router.push('/vouchers')}
              >
                Go to Registry
              </button>
            </div>
          </div>
          {!loadingPrintDetails && (
            <PrintableVoucher
              voucher={createdVoucher}
              journalLines={createdVoucherLines}
              companySettings={companySettings}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default function EditVoucherPage() {
  return (
    <Suspense fallback={
      <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 450, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 350, borderRadius: 16 }} />
      </div>
    }>
      <EditVoucherForm />
    </Suspense>
  )
}
