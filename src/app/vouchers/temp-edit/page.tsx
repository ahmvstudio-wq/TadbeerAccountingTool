'use client'
import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, Search, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useUIStore } from '@/store/ui'
import type { Ledger } from '@/lib/types'

export default function TempVoucherEditPage() {
  const searchParams = useSearchParams()
  const initialSearch = searchParams.get('search') || ''

  const activeCompanyId = useUIStore((s) => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [searchVoucherNo, setSearchVoucherNo] = useState(initialSearch)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  
  // Voucher state
  const [voucher, setVoucher] = useState<any>(null)
  const [journalLines, setJournalLines] = useState<any[]>([])

  useEffect(() => {
    if (initialSearch && companyId !== 'c0de0000-0000-0000-0000-000000000000') {
      executeSearch(initialSearch)
    }
  }, [initialSearch, companyId])

  useEffect(() => {
    async function fetchLedgers() {
      const { data } = await (supabase as any)
        .from('ledgers')
        .select('*')
        .eq('company_id', companyId)
        .order('name')
      if (data) setLedgers(data)
    }
    fetchLedgers()
  }, [companyId])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    executeSearch(searchVoucherNo)
  }

  async function executeSearch(voucherNo: string) {
    setError(null)
    setSuccess(null)
    setVoucher(null)
    setJournalLines([])
    
    if (!voucherNo.trim()) return

    setLoading(true)
    try {
      const { data: v, error: vErr } = await (supabase as any)
        .from('vouchers')
        .select('*')
        .eq('voucher_number', voucherNo.trim())
        .eq('company_id', companyId)
        .single()

      if (vErr || !v) {
        throw new Error('Voucher not found')
      }

      const { data: lines, error: lErr } = await (supabase as any)
        .from('journal_lines')
        .select('*')
        .eq('voucher_id', v.id)
        .order('type', { ascending: true })

      if (lErr) throw lErr

      setVoucher(v)
      setJournalLines(lines || [])
    } catch (err: any) {
      setError(err.message || 'Error fetching voucher.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const res = await fetch('/api/vouchers/edit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: voucher.id,
          company_id: voucher.company_id,
          date: voucher.date,
          ref: voucher.ref,
          narration: voucher.narration,
          notes: voucher.notes,
          amount: voucher.amount,
          subtotal: voucher.subtotal,
          vat_total: voucher.vat_total,
          grand_total: voucher.grand_total,
          journal_lines: journalLines,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save voucher')

      setSuccess(`Voucher ${voucher.voucher_number} updated successfully!`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const drTotal = journalLines.filter(l => l.type === 'Dr').reduce((s, l) => s + Number(l.amount), 0)
  const crTotal = journalLines.filter(l => l.type === 'Cr').reduce((s, l) => s + Number(l.amount), 0)
  const isBalanced = Math.abs(drTotal - crTotal) < 0.001

  return (
    <div>
      <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/vouchers" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Temporary Voucher Editor</h1>
              <p className="page-subtitle">Raw editing for existing vouchers</p>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ margin: '1rem 0' }}><AlertCircle size={16} /><span>{error}</span></div>}
      {success && <div className="alert alert-success" style={{ margin: '1rem 0' }}><CheckCircle size={16} /><span>{success}</span></div>}

      <div className="card" style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div className="card-body">
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Search Voucher Number</label>
              <input type="text" className="form-control" value={searchVoucherNo} onChange={e => setSearchVoucherNo(e.target.value)} placeholder="e.g. RCPT-1002" required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Search size={16} /> {loading ? 'Searching...' : 'Load'}
            </button>
          </form>
        </div>
      </div>

      {voucher && (
        <form onSubmit={handleSave}>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header"><h3 className="card-title">Voucher Header</h3></div>
            <div className="card-body">
              <div className="form-grid form-grid-3">
                <div className="form-group">
                  <label className="form-label required">Date</label>
                  <input type="date" className="form-control" value={voucher.date} onChange={e => setVoucher({ ...voucher, date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Reference</label>
                  <input type="text" className="form-control" value={voucher.ref || ''} onChange={e => setVoucher({ ...voucher, ref: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label required">Amount</label>
                  <input type="number" step="0.001" className="form-control" value={voucher.amount} onChange={e => setVoucher({ ...voucher, amount: Number(e.target.value) })} required />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label required">Narration</label>
                  <textarea className="form-control" value={voucher.narration} onChange={e => setVoucher({ ...voucher, narration: e.target.value })} required />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" value={voucher.notes || ''} onChange={e => setVoucher({ ...voucher, notes: e.target.value })} />
                </div>
                
                {/* Advanced amounts */}
                <div className="form-group">
                  <label className="form-label">Subtotal</label>
                  <input type="number" step="0.001" className="form-control" value={voucher.subtotal || ''} onChange={e => setVoucher({ ...voucher, subtotal: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">VAT Total</label>
                  <input type="number" step="0.001" className="form-control" value={voucher.vat_total || ''} onChange={e => setVoucher({ ...voucher, vat_total: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Grand Total</label>
                  <input type="number" step="0.001" className="form-control" value={voucher.grand_total || ''} onChange={e => setVoucher({ ...voucher, grand_total: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header"><h3 className="card-title">Journal Lines</h3></div>
            <div className="card-body">
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Ledger</th>
                    <th style={{ padding: '8px', width: '120px' }}>Type (Dr/Cr)</th>
                    <th style={{ padding: '8px', width: '150px' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {journalLines.map((line, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px' }}>
                        <select className="form-control" value={line.ledger_id} onChange={e => {
                          const newLines = [...journalLines]
                          newLines[idx].ledger_id = e.target.value
                          setJournalLines(newLines)
                        }}>
                          {ledgers.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <select className="form-control" value={line.type} onChange={e => {
                          const newLines = [...journalLines]
                          newLines[idx].type = e.target.value
                          setJournalLines(newLines)
                        }}>
                          <option value="Dr">Dr</option>
                          <option value="Cr">Cr</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input type="number" step="0.001" className="form-control" value={line.amount} onChange={e => {
                          const newLines = [...journalLines]
                          newLines[idx].amount = Number(e.target.value)
                          setJournalLines(newLines)
                        }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem', fontWeight: 600 }}>
                <div>Total Dr: {drTotal.toFixed(3)}</div>
                <div>Total Cr: {crTotal.toFixed(3)}</div>
                <div style={{ color: isBalanced ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  Diff: {Math.abs(drTotal - crTotal).toFixed(3)}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingBottom: '2rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving || !isBalanced}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
