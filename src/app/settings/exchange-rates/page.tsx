'use client'
import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import { CURRENCIES } from '@/lib/types'
import { useUIStore } from '@/store/ui'

interface ExchangeRate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  effective_date: string
  company_id: string
}

export default function ExchangeRatesPage() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [loading, setLoading] = useState(true)
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [fromCurrency, setFromCurrency] = useState('USD')
  const [toCurrency, setToCurrency] = useState('OMR')
  const [rate, setRate] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0])

  const loadRates = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error: qErr } = await (supabase as any)
        .from('exchange_rates')
        .select('*')
        .eq('company_id', companyId)
        .order('effective_date', { ascending: false })

      if (qErr && !qErr.message.includes('does not exist')) throw qErr
      setRates(data || [])
    } catch (err) {
      console.error(err)
      setRates([])
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadRates() }, [loadRates])

  async function handleAddRate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!rate || Number(rate) <= 0) {
      setError('Enter a valid exchange rate.')
      return
    }
    if (fromCurrency === toCurrency) {
      setError('From and To currencies must be different.')
      return
    }

    try {
      const { error: insErr } = await (supabase as any)
        .from('exchange_rates')
        .insert({
          from_currency: fromCurrency,
          to_currency: toCurrency,
          rate: Number(rate),
          effective_date: effectiveDate,
          company_id: companyId,
        })

      if (insErr) throw insErr

      setSuccess(`Exchange rate ${fromCurrency} → ${toCurrency} saved successfully.`)
      setRate('')
      loadRates()
    } catch (err: any) {
      setError(err.message || 'Failed to save exchange rate.')
    }
  }

  async function handleDeleteRate(id: string) {
    if (!confirm('Delete this exchange rate?')) return
    try {
      await (supabase as any).from('exchange_rates').delete().eq('id', id)
      loadRates()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div style={{ paddingBottom: '4rem' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link href="/settings" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
          <div>
            <h1 className="page-title">Exchange Rate Management</h1>
            <p className="page-subtitle">Manually configure exchange rates for multi-currency transactions</p>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ margin: '1rem 0' }}><AlertCircle size={16} /><span>{error}</span></div>}
      {success && <div className="alert alert-success" style={{ margin: '1rem 0' }}><CheckCircle size={16} /><span>{success}</span></div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem', alignItems: 'start' }}>
        {/* Add Rate Form */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={18} style={{ color: 'var(--color-teal)' }} />
              <div className="card-title">Add Exchange Rate</div>
            </div>
          </div>
          <form onSubmit={handleAddRate}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label required">From Currency</label>
                <select className="form-control" value={fromCurrency} onChange={e => setFromCurrency(e.target.value)} required>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label required">To Currency</label>
                <select className="form-control" value={toCurrency} onChange={e => setToCurrency(e.target.value)} required>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label required">Exchange Rate</label>
                <input type="number" step="0.000001" min="0" className="form-control" value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 0.385 (1 USD = 0.385 OMR)" required />
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>
                  Rate = amount of To Currency per 1 unit of From Currency
                </span>
              </div>
              <div className="form-group">
                <label className="form-label required">Effective Date</label>
                <input type="date" className="form-control" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} required />
              </div>
            </div>
            <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary"><Plus size={16} /> Add Rate</button>
            </div>
          </form>
        </div>

        {/* Rate History */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={18} style={{ color: 'var(--color-teal)' }} />
              <div className="card-title">Rate History</div>
            </div>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
            ) : rates.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                No exchange rates configured yet. Add your first rate above.
                <br /><br />
                <span style={{ fontSize: '0.8rem' }}>The system also has built-in static mid-market rates as fallback.</span>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>From</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>To</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate</th>
                      <th style={{ padding: '8px 10px' }}>Effective Date</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.from_currency}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.to_currency}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{Number(r.rate).toFixed(6)}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)' }}>{new Date(r.effective_date).toLocaleDateString('en-GB')}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteRate(r.id)} style={{ color: 'var(--color-danger)' }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
