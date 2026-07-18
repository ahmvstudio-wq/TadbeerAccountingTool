'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircle, AlertCircle, Loader2, ExternalLink, DollarSign } from 'lucide-react'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import type { Voucher } from '@/lib/types'

interface OutstandingInvoice {
  id: string
  voucher_number: string
  date: string
  grand_total: number
  total_amount: number
  settled_amount: number
  outstanding_amount: number
}

interface Allocation {
  target_voucher_id: string
  target_voucher_number: string
  target_type: string
  amount: number
}

interface SettlementAllocatorProps {
  sourceVoucher: Voucher
  companyId: string
  currency: string
  onComplete?: () => void
}

export function SettlementAllocator({ sourceVoucher, companyId, currency, onComplete }: SettlementAllocatorProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([])
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  const [onAccountMode, setOnAccountMode] = useState(false)
  const [saved, setSaved] = useState(false)

  const isReceipt = sourceVoucher.type === 'RECEIPT'
  const sourceAmount = Number(sourceVoucher.grand_total || sourceVoucher.amount || 0)
  const partyName = sourceVoucher.party_name || ''

  // Fetch outstanding invoices for this party
  const loadOutstanding = useCallback(async () => {
    if (!sourceVoucher.party_ledger_id) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const voucherType = isReceipt ? 'SALE' : 'PURCHASE'
      const res = await fetch(
        `/api/settlements?action=outstanding&party_ledger_id=${sourceVoucher.party_ledger_id}&voucher_type=${voucherType}&company_id=${companyId}`
      )
      if (res.ok) {
        const data = await res.json()
        setOutstandingInvoices(data)
      }
    } catch (err) {
      console.error('Failed to load outstanding invoices:', err)
    }
    setLoading(false)
  }, [sourceVoucher.party_ledger_id, companyId, isReceipt])

  useEffect(() => { loadOutstanding() }, [loadOutstanding])

  // Calculate totals
  const totalAllocated = Object.values(allocations).reduce((sum, amt) => sum + amt, 0)
  const onAccountAmount = Math.round((sourceAmount - totalAllocated) * 1000) / 1000
  const isValid = Math.abs(totalAllocated - sourceAmount) < 0.001 || onAccountMode

  function updateAllocation(invoiceId: string, amount: number) {
    setAllocations(prev => {
      const next = { ...prev }
      if (amount <= 0) {
        delete next[invoiceId]
      } else {
        next[invoiceId] = Math.round(amount * 1000) / 1000
      }
      return next
    })
  }

  function allocateFull(invoiceId: string, outstanding: number) {
    // Allocate up to the outstanding amount, but not more than what's remaining in the receipt
    const remaining = Math.round((sourceAmount - totalAllocated) * 1000) / 1000
    const allocAmount = Math.min(outstanding, remaining)
    updateAllocation(invoiceId, allocAmount)
  }

  async function handleSave() {
    setError(null)
    setSuccess(null)

    if (outstandingInvoices.length === 0 && !onAccountMode) {
      // No outstanding invoices — mark entire receipt as on-account
      setOnAccountMode(true)
    }

    if (!onAccountMode && totalAllocated <= 0) {
      setError('Please allocate an amount to at least one invoice, or select On Account.')
      return
    }

    if (!onAccountMode && totalAllocated > sourceAmount + 0.001) {
      setError(`Total allocation (${totalAllocated.toFixed(3)}) cannot exceed receipt amount (${sourceAmount.toFixed(3)}).`)
      return
    }

    setSaving(true)
    try {
      const allocArray: Allocation[] = Object.entries(allocations)
        .filter(([, amt]) => amt > 0)
        .map(([invId, amt]) => {
          const inv = outstandingInvoices.find(i => i.id === invId)
          return {
            target_voucher_id: invId,
            target_voucher_number: inv?.voucher_number || '',
            target_type: isReceipt ? 'SALE' : 'PURCHASE',
            amount: amt,
          }
        })

      const effectiveOnAccount = onAccountMode ? sourceAmount : (onAccountAmount > 0.001 ? onAccountAmount : 0)

      const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_voucher_id: sourceVoucher.id,
          source_voucher_number: sourceVoucher.voucher_number,
          source_type: sourceVoucher.type,
          party_ledger_id: sourceVoucher.party_ledger_id,
          party_name: partyName,
          source_amount: sourceAmount,
          allocations: allocArray,
          on_account_amount: effectiveOnAccount,
          company_id: companyId,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to save settlement.')
        return
      }

      setSuccess(onAccountMode 
        ? `Receipt marked as On Account (${sourceAmount.toFixed(3)} ${currency}).`
        : `Settlement saved successfully! Total allocated: ${totalAllocated.toFixed(3)} ${currency}.`
      )
      setSaved(true)
      onComplete?.()
    } catch (err: any) {
      setError(err.message || 'Network error.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div style={{ padding: '1rem', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', fontWeight: 600, marginBottom: '0.5rem' }}>
          <CheckCircle size={18} />
          Settlement Recorded
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#4A5568' }}>{success}</p>
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', marginTop: '1rem' }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.25rem', background: '#F7FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#163B40' }}>
            {isReceipt ? 'Allocate Against Sales Invoices' : 'Allocate Against Purchase Vouchers'}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#718096' }}>
            {partyName} — {sourceVoucher.voucher_number} — {sourceAmount.toFixed(3)} {currency}
          </p>
        </div>
        <DollarSign size={20} style={{ color: '#0284c7' }} />
      </div>

      {/* Content */}
      <div style={{ padding: '1rem 1.25rem' }}>
        {error && (
          <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#ef4444' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <div>Loading outstanding invoices...</div>
          </div>
        ) : outstandingInvoices.length === 0 && !onAccountMode ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', background: '#F7FAFC', borderRadius: 6, marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#4A5568' }}>
              No outstanding {isReceipt ? 'sales invoices' : 'purchase vouchers'} found for {partyName}.
            </p>
            <button 
              className="btn btn-outline btn-sm" 
              onClick={() => setOnAccountMode(true)}
              style={{ marginTop: '0.75rem' }}
            >
              Mark as On Account
            </button>
          </div>
        ) : (
          <>
            {/* Invoice allocation table */}
            {outstandingInvoices.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#4A5568', width: '5%' }}></th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#4A5568' }}>Invoice No.</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#4A5568' }}>Date</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#4A5568', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#4A5568', textAlign: 'right' }}>Paid</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#4A5568', textAlign: 'right' }}>Outstanding</th>
                      <th style={{ padding: '8px 10px', fontWeight: 700, color: '#163B40', textAlign: 'right' }}>Allocate</th>
                      <th style={{ padding: '8px 10px', width: '6%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingInvoices.map(inv => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #F0F0F0', background: allocations[inv.id] ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="checkbox"
                            checked={!!allocations[inv.id]}
                            onChange={e => {
                              if (e.target.checked) {
                                allocateFull(inv.id, inv.outstanding_amount)
                              } else {
                                updateAllocation(inv.id, 0)
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, fontFamily: 'monospace' }}>{inv.voucher_number}</td>
                        <td style={{ padding: '8px 10px', color: '#718096' }}>{new Date(inv.date).toLocaleDateString('en-GB')}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inv.total_amount.toFixed(3)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#718096', fontVariantNumeric: 'tabular-nums' }}>{inv.settled_amount.toFixed(3)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{inv.outstanding_amount.toFixed(3)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            max={inv.outstanding_amount}
                            className="form-control"
                            style={{ textAlign: 'right', width: 110, fontSize: '0.85rem', fontWeight: 600 }}
                            value={allocations[inv.id] || ''}
                            onChange={e => updateAllocation(inv.id, Number(e.target.value))}
                            placeholder="0.000"
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => allocateFull(inv.id, inv.outstanding_amount)}
                            title="Allocate full outstanding"
                            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                          >
                            Fill
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* On Account option */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '0.75rem', background: onAccountMode ? 'rgba(245,158,11,0.05)' : '#FAFAFA', border: `1px solid ${onAccountMode ? 'rgba(245,158,11,0.3)' : '#E2E8F0'}`, borderRadius: 6 }}>
              <input
                type="checkbox"
                checked={onAccountMode}
                onChange={e => {
                  setOnAccountMode(e.target.checked)
                  if (e.target.checked) setAllocations({})
                }}
                style={{ cursor: 'pointer' }}
              />
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>On Account</span>
                <span style={{ fontSize: '0.8rem', color: '#718096', marginLeft: 8 }}>
                  {onAccountMode 
                    ? `Entire amount (${sourceAmount.toFixed(3)} ${currency}) will be recorded as on-account`
                    : 'Record without allocating to specific invoices'
                  }
                </span>
              </div>
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#F7FAFC', borderRadius: 6, border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '2rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 600 }}>Receipt Amount</span>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{sourceAmount.toFixed(3)} {currency}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 600 }}>Allocated</span>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: totalAllocated > 0 ? '#22c55e' : '#718096' }}>{totalAllocated.toFixed(3)} {currency}</div>
                </div>
                {!onAccountMode && onAccountAmount > 0.001 && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 600 }}>Unallocated</span>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f59e0b' }}>{onAccountAmount.toFixed(3)} {currency}</div>
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || (!onAccountMode && totalAllocated <= 0)}
                style={{ minWidth: 140 }}
              >
                {saving ? 'Saving...' : 'Save Allocation'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
