'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, AlertCircle, CheckCircle, Printer, Mail, ArrowLeft, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { numberToWords } from '@/lib/accounting'
import type { Ledger, Voucher, JournalLine, Item } from '@/lib/types'
import { useUIStore } from '@/store/ui'
import { PrintableVoucher } from '@/components/voucher/PrintableVoucher'

interface LineItem {
  item_id?: string
  ledger_id: string
  description: string
  amount: number
  vat_rate: number
  vat_amount: number
}

export default function SalesVoucherPage() {
  const router = useRouter()
  const activeCompanyId = useUIStore(s => s.activeCompanyId)
  const companyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Settings
  const [companySettings, setCompanySettings] = useState<any>(null)

  // Success print view state
  const [postedVoucher, setPostedVoucher] = useState<Voucher | null>(null)
  const [postedJournalLines, setPostedJournalLines] = useState<JournalLine[]>([])
  const [postedVoucherLines, setPostedVoucherLines] = useState<any[]>([])
  const [loadingJournal, setLoadingJournal] = useState(false)

  // Form fields
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [customerId, setCustomerId] = useState('')
  const [narration, setNarration] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([
    { item_id: '', ledger_id: '', description: '', amount: 0, vat_rate: 5, vat_amount: 0 },
  ])

  // Real-time Customer balance
  const [customerBalance, setCustomerBalance] = useState<{ balance: number; type: string } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ledg }, { data: sett }, { data: itms }] = await Promise.all([
        (supabase as any).from('ledgers').select('*, group:groups(id, name, nature)').eq('company_id', companyId).order('name'),
        (supabase as any).from('settings').select('*').eq('company_id', companyId).maybeSingle(),
        (supabase as any).from('items').select('*').eq('company_id', companyId).order('name')
      ])
      setLedgers(ledg ?? [])
      setCompanySettings(sett)
      setItems(itms ?? [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])

  // Fetch customer balance in real-time when selected
  useEffect(() => {
    async function fetchBalance() {
      if (!customerId) { setCustomerBalance(null); return }
      const { data } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: customerId })
      if (data && data.length > 0) {
        setCustomerBalance({ balance: Number(data[0].current_balance), type: data[0].balance_type })
      }
    }
    fetchBalance()
  }, [customerId])

  // Filter ledgers by nature
  const customers = ledgers.filter(l => {
    const gn = (l.group as any)?.name?.toLowerCase() || ''
    return gn.includes('debtor') || gn.includes('customer')
  })
  const incomeAccounts = ledgers.filter(l => (l.group as any)?.nature === 'INCOME')
  const vatOutputLedger = ledgers.find(l => l.name.toLowerCase().includes('vat') && (l.name.toLowerCase().includes('output') || l.name.toLowerCase().includes('payable')))

  // Compute totals
  const subtotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
  const vatTotal = lines.reduce((s, l) => s + Number(l.vat_amount || 0), 0)
  const grandTotal = subtotal + vatTotal

  function updateLine(idx: number, field: keyof LineItem, value: any) {
    setLines(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }

      // Auto-populate from item selection
      if (field === 'item_id' && value) {
        const item = items.find(i => i.id === value)
        if (item) {
          next[idx].description = item.name
          next[idx].amount = Number(item.sell_price || 0)
          next[idx].vat_rate = Number(item.tax_rate || 5.00)
          next[idx].ledger_id = item.income_ledger_id || ''
        }
      }

      // Auto-calc VAT (only if vat_amount is not manually changed, or recalculating on price/rate update)
      if (field === 'amount' || field === 'vat_rate' || field === 'item_id') {
        const amt = Number(next[idx].amount || 0)
        const rate = Number(next[idx].vat_rate || 5.00)
        next[idx].vat_amount = Math.round(amt * rate / 100 * 100) / 100
      }
      return next
    })
  }

  function addLine() {
    setLines(prev => [...prev, { item_id: '', ledger_id: '', description: '', amount: 0, vat_rate: 5, vat_amount: 0 }])
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!customerId) { setError('Select a customer.'); return }
    if (!narration.trim()) { setError('Narration is required.'); return }
    
    // Validate ledgers
    if (lines.some(l => !l.ledger_id)) {
      setError('Please select an account ledger for all lines.')
      return
    }
    if (lines.some(l => l.amount <= 0)) { setError('All line items must have a positive amount.'); return }

    setSaving(true)
    try {
      const customerLedger = ledgers.find(l => l.id === customerId)
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SALE',
          date,
          party_ledger_id: customerId,
          party_name: customerLedger?.name || '',
          subtotal,
          vat_total: vatTotal,
          grand_total: grandTotal,
          amount: grandTotal,
          narration: narration.trim(),
          notes: notes.trim() || null,
          company_id: companyId,
          vat_ledger_id: vatOutputLedger?.id || null,
          lines: lines.map(l => ({
            ledger_id: l.ledger_id,
            description: l.description,
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
      
      // Load journal lines and voucher lines for printable preview
      setLoadingJournal(true)
      const [{ data: jLines }, { data: vLines }] = await Promise.all([
        (supabase as any)
          .from('journal_lines')
          .select('*, ledger:ledgers(name, account_code, classification)')
          .eq('voucher_id', voucher.id)
          .order('type', { ascending: true }),
        (supabase as any)
          .from('voucher_lines')
          .select('*, ledger:ledgers(name, account_code)')
          .eq('voucher_id', voucher.id)
      ])

      setPostedJournalLines(jLines ?? [])
      setPostedVoucherLines(vLines ?? [])
      setPostedVoucher(voucher)
      setSuccess(`Sales Invoice ${voucher.voucher_number} posted successfully!`)
      setLoadingJournal(false)

      // Refresh customer balance
      const { data: balData } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: customerId })
      if (balData && balData.length > 0) {
        setCustomerBalance({ balance: Number(balData[0].current_balance), type: balData[0].balance_type })
      }

      // Reset form fields
      setCustomerId('')
      setNarration('')
      setNotes('')
      setLines([{ item_id: '', ledger_id: '', description: '', amount: 0, vat_rate: 5, vat_amount: 0 }])

    } catch (err: any) {
      setError(err.message || 'Network error.')
    } finally {
      setSaving(false)
    }
  }

  function handlePrint() {
    const el = document.getElementById('printable-voucher')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Print Tax Invoice</title>
      <style>
        body { font-family: 'Inter', sans-serif; padding: 2rem; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 0.85rem; }
        th { background: #f8f8f8; font-weight: 600; }
        .print-header { display: flex; justify-content: space-between; margin-bottom: 1rem; }
        .print-company-name { font-size: 1.3rem; font-weight: 700; }
        .print-voucher-title { font-size: 1.1rem; font-weight: 700; text-transform: uppercase; }
        .print-total-row { font-weight: 700; background: #f0f0f0; }
        .print-signature-section { display: flex; justify-content: space-between; margin-top: 3rem; }
        .print-signature-box { text-align: center; width: 22%; }
        .print-signature-line { border-top: 1px solid #333; margin-bottom: 4px; }
        .print-divider { border: none; border-top: 2px solid #333; margin: 1rem 0; }
        @media print { body { padding: 0; } }
      </style></head><body>${el.innerHTML}</body></html>
    `)
    win.document.close()
    win.print()
  }

  async function handleEmail() {
    if (!postedVoucher) return
    const customerLedger = ledgers.find(l => l.name === postedVoucher.party_name)
    const emailTo = customerLedger?.email || ''

    setSuccess('Generating PDF Invoice and loading Gmail client...')

    // 1. Load html2pdf from CDN dynamically
    const loadHtml2Pdf = () => {
      return new Promise((resolve) => {
        if ((window as any).html2pdf) {
          resolve((window as any).html2pdf)
          return
        }
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
        script.onload = () => resolve((window as any).html2pdf)
        document.head.appendChild(script)
      })
    }

    try {
      const html2pdf: any = await loadHtml2Pdf()
      const element = document.getElementById('printable-voucher')
      if (element) {
        const opt = {
          margin:       0.3,
          filename:     `Invoice-${postedVoucher.voucher_number}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true },
          jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        }
        // Save PDF locally to downloads folder
        await html2pdf().set(opt).from(element).save()
      }
    } catch (pdfErr) {
      console.error('Failed to generate PDF download:', pdfErr)
    }
    
    const emailBody = `Dear ${postedVoucher.party_name || 'Customer'},\n\n` +
      `Hope you are doing well.\n\n` +
      `Please find attached Tax Invoice ${postedVoucher.voucher_number} from Tadbeer Transformations (attached as Invoice-${postedVoucher.voucher_number}.pdf from Downloads).\n\n` +
      `Please let us know if you have any questions.\n\n` +
      `Thank you!\n\n` +
      `Tadbeer Transformations\n` +
      `Email: operation@tadbeertt.com\n` +
      `Phone: +968 7630 7656`;

    const subject = encodeURIComponent(`Tax Invoice ${postedVoucher.voucher_number} — Tadbeer Transformations`);
    const body = encodeURIComponent(emailBody);
    
    // Direct Gmail Compose Window link
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${emailTo}&su=${subject}&body=${body}`;
    
    setSuccess(`Invoice posted & PDF downloaded successfully! Please attach the downloaded 'Invoice-${postedVoucher.voucher_number}.pdf' to the pre-filled Gmail window.`);

    // Open in a new tab (or fallback to mailto)
    try {
      window.open(gmailUrl, '_blank');
    } catch {
      window.location.href = `mailto:${emailTo}?subject=${subject}&body=${body}`;
    }
  }

  function startNewInvoice() {
    setPostedVoucher(null)
    setPostedJournalLines([])
    setSuccess(null)
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}><div className="skeleton" style={{ height: 400, borderRadius: 12 }} /></div>
  }

  // Success view with Printable Preview
  if (postedVoucher) {
    return (
      <div style={{ maxWidth: 840, margin: '0 auto', padding: '1rem 0 3rem' }}>
        <div className="card" style={{ border: '1px solid var(--color-success)', background: 'var(--color-surface)', marginBottom: '1.5rem' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 40, height: 40, background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)', margin: 0 }}>Invoice Posted Successfully</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: 0 }}>Voucher Number: <strong>{postedVoucher.voucher_number}</strong></p>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Printer size={16} /> Print Invoice
              </button>
              <button className="btn btn-outline" onClick={handleEmail} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Mail size={16} /> Email Customer
              </button>
              <button className="btn btn-ghost" onClick={startNewInvoice} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-teal)' }}>
                <RefreshCw size={16} /> Post Another Invoice
              </button>
            </div>
          </div>
        </div>

        {/* Printable Card Preview */}
        <div className="card" style={{ padding: '2.5rem', boxShadow: 'var(--shadow-lg)' }}>
          {loadingJournal ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>Loading invoice preview...</div>
          ) : (
            <PrintableVoucher 
              voucher={postedVoucher} 
              journalLines={postedJournalLines} 
              voucherLines={postedVoucherLines}
              companySettings={companySettings} 
              partyLedger={ledgers.find(l => l.name === postedVoucher.party_name)}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Sticky Header */}
      <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/vouchers" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Sales Voucher</h1>
              <p className="page-subtitle">Record a sales invoice — Dr Customer, Cr Income + VAT</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ margin: '1rem 0' }}>
          <AlertCircle size={16} /><span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
            {/* Top fields */}
            <div className="form-grid form-grid-2" style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label required">Date</label>
                <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label required">Customer</label>
                <select className="form-control" value={customerId} onChange={e => setCustomerId(e.target.value)} required>
                  <option value="">— Select Customer —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} [{c.account_code}]</option>
                  ))}
                </select>
                {customerBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'block', marginTop: 4 }}>
                    Current Balance: OMR {customerBalance.balance.toFixed(3)} {customerBalance.type}
                  </span>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '3%' }}>#</th>
                    <th style={{ width: '22%' }}>Service Line (Optional)</th>
                    <th style={{ width: '22%' }}>Income Account</th>
                    <th style={{ width: '18%' }}>Description</th>
                    <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>VAT %</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>VAT Amount</th>
                    <th style={{ width: '5%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <select className="form-control" value={line.item_id} onChange={e => updateLine(idx, 'item_id', e.target.value)} style={{ fontSize: '0.85rem' }}>
                          <option value="">— Select Service —</option>
                          {items.map(i => (
                            <option key={i.id} value={i.id}>{i.name} ({i.code || 'No Code'})</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select className="form-control" value={line.ledger_id} onChange={e => updateLine(idx, 'ledger_id', e.target.value)} style={{ fontSize: '0.85rem' }}>
                          <option value="">— Select Account —</option>
                          {incomeAccounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="form-control" placeholder="Description" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} style={{ fontSize: '0.85rem' }} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.amount || ''} onChange={e => updateLine(idx, 'amount', e.target.value)} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.vat_rate} onChange={e => updateLine(idx, 'vat_rate', e.target.value)} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 500 }} value={line.vat_amount || ''} onChange={e => updateLine(idx, 'vat_amount', Number(e.target.value))} />
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

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <div style={{ width: 300 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>Subtotal</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{subtotal.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>VAT</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{vatTotal.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-teal)' }}>
                  <span>Grand Total</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Amount in Words */}
            {grandTotal > 0 && (
              <div style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                <strong>Amount in words:</strong> {numberToWords(grandTotal, 'OMR')}
              </div>
            )}

            {/* Narration */}
            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label className="form-label required">Narration</label>
              <textarea className="form-control" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Being sales invoice for web development services to XYZ Company" style={{ height: 60 }} required />
            </div>

            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <textarea className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment terms, additional notes..." style={{ height: 40 }} />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingBottom: '2rem' }}>
          <Link href="/vouchers" className="btn btn-outline">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>
            {saving ? 'Posting...' : 'Post Sales Invoice'}
          </button>
        </div>
      </form>
    </div>
  )
}
