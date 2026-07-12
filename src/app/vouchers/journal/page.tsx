'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft, Scale } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { numberToWords } from '@/lib/accounting'
import type { Ledger, EntryType } from '@/lib/types'
import { useUIStore } from '@/store/ui'

interface JournalLine {
  ledger_id: string
  type: EntryType
  amount: number
}

export default function JournalVoucherPage() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState<JournalLine[]>([
    { ledger_id: '', type: 'Dr', amount: 0 },
    { ledger_id: '', type: 'Cr', amount: 0 },
  ])

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

  const totalDr = lines.filter(l => l.type === 'Dr').reduce((s, l) => s + Number(l.amount || 0), 0)
  const totalCr = lines.filter(l => l.type === 'Cr').reduce((s, l) => s + Number(l.amount || 0), 0)
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0

  function updateLine(idx: number, field: keyof JournalLine, value: any) {
    setLines(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function addLine(type: EntryType) {
    setLines(prev => [...prev, { ledger_id: '', type, amount: 0 }])
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!narration.trim()) { setError('Narration is required.'); return }
    if (lines.some(l => !l.ledger_id || l.amount <= 0)) { setError('All lines must have an account and positive amount.'); return }
    if (!isBalanced) { setError('Total Debits must equal Total Credits.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'JOURNAL',
          date,
          amount: totalDr,
          grand_total: totalDr,
          subtotal: totalDr,
          vat_total: 0,
          narration: narration.trim(),
          company_id: companyId,
          journal_lines: lines.map(l => ({
            ledger_id: l.ledger_id,
            type: l.type,
            amount: l.amount,
          })),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to save.')
        return
      }

      const voucher = await res.json()
      setSuccess(`Journal Voucher ${voucher.voucher_number} posted successfully!`)
      setNarration('')
      setLines([
        { ledger_id: '', type: 'Dr', amount: 0 },
        { ledger_id: '', type: 'Cr', amount: 0 },
      ])
    } catch (err: any) {
      setError(err.message || 'Network error.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>
  }

  const drLines = lines.map((l, i) => ({ ...l, origIdx: i })).filter(l => l.type === 'Dr')
  const crLines = lines.map((l, i) => ({ ...l, origIdx: i })).filter(l => l.type === 'Cr')

  return (
    <div>
      <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/vouchers" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Journal Voucher</h1>
              <p className="page-subtitle">Adjustments, corrections, depreciation — free-form Dr/Cr entries</p>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ margin: '1rem 0' }}><AlertCircle size={16} /><span>{error}</span></div>}
      {success && <div className="alert alert-success" style={{ margin: '1rem 0' }}><CheckCircle size={16} /><span>{success}</span></div>}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
            <div className="form-group" style={{ maxWidth: 300, marginBottom: '1.5rem' }}>
              <label className="form-label required">Date</label>
              <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
            </div>

            {/* Debit section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-success)', marginBottom: '0.5rem' }}>Debit Entries (Dr)</h3>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '5%' }}>#</th>
                    <th style={{ width: '65%' }}>Account</th>
                    <th style={{ width: '22%', textAlign: 'right' }}>Amount</th>
                    <th style={{ width: '8%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {drLines.map((line, displayIdx) => (
                    <tr key={line.origIdx}>
                      <td>{displayIdx + 1}</td>
                      <td>
                        <select className="form-control" value={line.ledger_id} onChange={e => updateLine(line.origIdx, 'ledger_id', e.target.value)} style={{ fontSize: '0.85rem' }}>
                          <option value="">— Select Account —</option>
                          {ledgers.map(a => (
                            <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.amount || ''} onChange={e => updateLine(line.origIdx, 'amount', Number(e.target.value))} />
                      </td>
                      <td>
                        {lines.length > 2 && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(line.origIdx)} style={{ color: 'var(--color-danger)', padding: '4px' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => addLine('Dr')} style={{ marginTop: '0.5rem' }}>
                <Plus size={14} /> Add Debit Line
              </button>
            </div>

            {/* Credit section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-danger)', marginBottom: '0.5rem' }}>Credit Entries (Cr)</h3>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '5%' }}>#</th>
                    <th style={{ width: '65%' }}>Account</th>
                    <th style={{ width: '22%', textAlign: 'right' }}>Amount</th>
                    <th style={{ width: '8%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {crLines.map((line, displayIdx) => (
                    <tr key={line.origIdx}>
                      <td>{displayIdx + 1}</td>
                      <td>
                        <select className="form-control" value={line.ledger_id} onChange={e => updateLine(line.origIdx, 'ledger_id', e.target.value)} style={{ fontSize: '0.85rem' }}>
                          <option value="">— Select Account —</option>
                          {ledgers.map(a => (
                            <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.amount || ''} onChange={e => updateLine(line.origIdx, 'amount', Number(e.target.value))} />
                      </td>
                      <td>
                        {lines.length > 2 && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(line.origIdx)} style={{ color: 'var(--color-danger)', padding: '4px' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => addLine('Cr')} style={{ marginTop: '0.5rem' }}>
                <Plus size={14} /> Add Credit Line
              </button>
            </div>

            {/* Balance indicator */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: '2rem',
              padding: '1rem', borderRadius: 'var(--radius-md)',
              background: isBalanced ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${isBalanced ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>Total Debit</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)' }}>{totalDr.toFixed(2)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Scale size={20} style={{ color: isBalanced ? 'var(--color-success)' : 'var(--color-danger)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>Total Credit</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)' }}>{totalCr.toFixed(2)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, color: isBalanced ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {isBalanced ? '✓ Balanced' : `⚠ Difference: ${Math.abs(totalDr - totalCr).toFixed(2)}`}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label className="form-label required">Narration</label>
              <textarea className="form-control" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Being depreciation adjustment for FY 2024" style={{ height: 60 }} required />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingBottom: '2rem' }}>
          <Link href="/vouchers" className="btn btn-outline">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving || !isBalanced} style={{ minWidth: 160 }}>
            {saving ? 'Posting...' : 'Post Journal Voucher'}
          </button>
        </div>
      </form>
    </div>
  )
}
