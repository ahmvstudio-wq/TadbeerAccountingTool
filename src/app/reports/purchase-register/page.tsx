'use client'
import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Calendar, Printer, AlertCircle, Download, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import { useUIStore } from '@/store/ui'

interface PurchaseEntry {
  id: string
  voucher_number: string
  date: string
  party_name: string
  amount: number
  subtotal: number
  vat_total: number
  grand_total: number
  currency: string
  narration: string
  supplier_invoice_ref?: string | null
}

export default function PurchaseRegisterPage() {
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companySettings, setCompanySettings] = useState<any>(null)

  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [supplierFilter, setSupplierFilter] = useState('')

  const [purchases, setPurchases] = useState<PurchaseEntry[]>([])
  const [suppliers, setSuppliers] = useState<string[]>([])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: settings } = await (supabase as any)
        .from('settings').select('*').eq('company_id', companyId).maybeSingle()
      setCompanySettings(settings)

      let q = (supabase as any)
        .from('vouchers')
        .select('*')
        .eq('company_id', companyId)
        .eq('type', 'PURCHASE')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })

      if (supplierFilter) q = q.eq('party_name', supplierFilter)

      const { data, error: qErr } = await q
      if (qErr) throw qErr
      setPurchases(data || [])

      const { data: allPurchases } = await (supabase as any)
        .from('vouchers')
        .select('party_name')
        .eq('company_id', companyId)
        .eq('type', 'PURCHASE')
      const uniqueNames = [...new Set((allPurchases || []).map((s: any) => s.party_name).filter(Boolean))] as string[]
      setSuppliers(uniqueNames.sort())

    } catch (err: any) {
      setError(err.message || 'Failed to load purchase register.')
    } finally {
      setLoading(false)
    }
  }, [companyId, startDate, endDate, supplierFilter])

  useEffect(() => { loadReport() }, [loadReport])

  const totalSubtotal = purchases.reduce((s, v) => s + Number(v.subtotal || 0), 0)
  const totalVAT = purchases.reduce((s, v) => s + Number(v.vat_total || 0), 0)
  const totalGrand = purchases.reduce((s, v) => s + Number(v.grand_total || v.amount || 0), 0)

  const formatOMR = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' OMR'

  const handlePrint = () => window.print()

  const handleExportCSV = () => {
    const BOM = '\uFEFF'
    const headers = ['Voucher No', 'Date', 'Supplier', 'Supplier Ref', 'Subtotal', 'VAT', 'Total', 'Currency', 'Narration']
    const rows = purchases.map(v => [
      v.voucher_number || '',
      new Date(v.date).toLocaleDateString('en-GB'),
      (v.party_name || '').replace(/,/g, ';'),
      v.supplier_invoice_ref || '',
      Number(v.subtotal || 0).toFixed(3),
      Number(v.vat_total || 0).toFixed(3),
      Number(v.grand_total || v.amount || 0).toFixed(3),
      v.currency || 'OMR',
      (v.narration || '').replace(/,/g, ';'),
    ])
    rows.push([])
    rows.push(['', '', 'TOTAL', '', totalSubtotal.toFixed(3), totalVAT.toFixed(3), totalGrand.toFixed(3), '', ''])

    const csvContent = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Purchase_Register_${startDate}_to_${endDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ paddingBottom: '4rem' }}>
      <div className="page-header no-print" style={{ background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/reports/ledgers" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Purchase Register</h1>
              <p className="page-subtitle">All purchase vouchers within the selected period</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-outline" onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={16} /> Export CSV
            </button>
            <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={16} /> Print
            </button>
          </div>
        </div>

        <div className="card" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={16} className="text-muted" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Period:</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>From</label>
              <input type="date" className="form-control form-control-sm" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: 140 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>To</label>
              <input type="date" className="form-control form-control-sm" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: 140 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Supplier</label>
              <select className="form-control form-control-sm" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} style={{ width: 180 }}>
                <option value="">All Suppliers</option>
                {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}><AlertCircle size={16} /> <span>{error}</span></div>}

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }}><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>
      ) : (
        <div className="printable-area" style={{ background: '#ffffff', color: '#1a1a1a', padding: '3rem', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: "'Inter', sans-serif" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #163B40', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#163B40', margin: '0 0 6px' }}>{companySettings?.company_name || 'Tadbeer Transformations'}</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568' }}>{companySettings?.address || 'Muscat, Sultanate of Oman'}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#163B40', margin: '0 0 4px', textTransform: 'uppercase' }}>PURCHASE REGISTER</h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>Period: {new Date(startDate).toLocaleDateString('en-GB')} to {new Date(endDate).toLocaleDateString('en-GB')}</p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #163B40', textAlign: 'left', fontWeight: 700, color: '#163B40' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>Voucher No</th>
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>Supplier</th>
                <th style={{ padding: '8px 10px' }}>Supplier Ref</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>VAT</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#718096', fontStyle: 'italic' }}>No purchase vouchers found for this period.</td></tr>
              ) : purchases.map((v, idx) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                  <td style={{ padding: '8px 10px', color: '#718096' }}>{idx + 1}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600, fontFamily: 'monospace' }}>{v.voucher_number}</td>
                  <td style={{ padding: '8px 10px' }}>{new Date(v.date).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: '8px 10px' }}>{v.party_name || '—'}</td>
                  <td style={{ padding: '8px 10px', color: '#718096', fontFamily: 'monospace', fontSize: '0.8rem' }}>{v.supplier_invoice_ref || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatOMR(Number(v.subtotal || 0))}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatOMR(Number(v.vat_total || 0))}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatOMR(Number(v.grand_total || v.amount || 0))}</td>
                </tr>
              ))}
              {purchases.length > 0 && (
                <tr style={{ borderTop: '2px solid #163B40', fontWeight: 800, background: '#f8fafc' }}>
                  <td style={{ padding: '12px 10px' }} colSpan={5}>TOTAL ({purchases.length} vouchers)</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: '#163B40', fontVariantNumeric: 'tabular-nums' }}>{formatOMR(totalSubtotal)}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: '#163B40', fontVariantNumeric: 'tabular-nums' }}>{formatOMR(totalVAT)}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: '#163B40', fontVariantNumeric: 'tabular-nums' }}>{formatOMR(totalGrand)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: '4rem', textAlign: 'center', fontSize: '0.75rem', color: '#718096' }}>
            *This is a computer generated purchase register*
          </div>
        </div>
      )}
    </div>
  )
}
