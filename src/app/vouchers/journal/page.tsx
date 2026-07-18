'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft, Scale, Printer, Mail, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { numberToWords } from '@/lib/accounting'
import type { Ledger, EntryType, Voucher, JournalLine as DBJournalLine } from '@/lib/types'
import { useUIStore } from '@/store/ui'
import { PrintableVoucher } from '@/components/voucher/PrintableVoucher'
import { OMRSymbol } from '@/components/ui/OMRSymbol'

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
  const [companySettings, setCompanySettings] = useState<any>(null)

  // Success view states
  const [postedVoucher, setPostedVoucher] = useState<Voucher | null>(null)
  const [postedJournalLines, setPostedJournalLines] = useState<any[]>([])
  const [loadingJournal, setLoadingJournal] = useState(false)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [currency, setCurrency] = useState('OMR')
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState<JournalLine[]>([
    { ledger_id: '', type: 'Dr', amount: 0 },
    { ledger_id: '', type: 'Cr', amount: 0 },
  ])

  // Quick Add state
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [newLedgerName, setNewLedgerName] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ledg }, { data: settings }] = await Promise.all([
        (supabase as any)
          .from('ledgers')
          .select('*, group:groups(id, name, nature)')
          .eq('company_id', companyId)
          .order('name'),
        (supabase as any)
          .from('settings')
          .select('*')
          .eq('company_id', companyId)
          .maybeSingle()
      ])
      const fetchedLedgers = ledg ?? []
      setLedgers(fetchedLedgers)
      setCompanySettings(settings)
      if (fetchedLedgers.length > 0) {
        setLines([
          { ledger_id: fetchedLedgers[0].id, type: 'Dr', amount: 0 },
          { ledger_id: fetchedLedgers[0].id, type: 'Cr', amount: 0 },
        ])
      }
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])

  const totalDr = lines.filter(l => l.type === 'Dr').reduce((s, l) => s + (parseFloat(String(l.amount)) || 0), 0)
  const totalCr = lines.filter(l => l.type === 'Cr').reduce((s, l) => s + (parseFloat(String(l.amount)) || 0), 0)
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0

  function updateLine(idx: number, field: keyof JournalLine, value: any) {
    setLines(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function addLine(type: EntryType) {
    const defaultLedger = ledgers[0]
    setLines(prev => [...prev, { ledger_id: defaultLedger?.id || '', type, amount: 0 }])
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newLedgerName.trim()) return

    // Find an EXPENSE group or default group
    let expenseGroup = ledgers.find(l => (l.group as any)?.nature === 'EXPENSE')?.group
    if (!expenseGroup) {
      const { data: groups } = await (supabase as any).from('groups').select('*').eq('company_id', companyId).limit(1)
      expenseGroup = groups?.[0]
    }

    if (!expenseGroup) {
      setError('No accounting groups found. Please create one first.')
      return
    }

    const res = await fetch('/api/ledgers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newLedgerName.trim(),
        group_id: expenseGroup.id,
        opening_balance: 0,
        classification: 'Nominal',
        company_id: companyId,
      }),
    })

    if (res.ok) {
      const newLedger = await res.json()
      setLedgers(prev => [...prev, newLedger])
      setNewLedgerName('')
      setShowQuickAdd(false)
    } else {
      const err = await res.json()
      setError(err.error || 'Failed to create account.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!narration.trim()) { setError('Narration is required.'); return }
    const parsedLines = lines.map(l => ({ ...l, amount: parseFloat(String(l.amount)) || 0 }))
    if (parsedLines.some(l => !l.ledger_id)) { setError('All lines must have an account selected.'); return }
    if (parsedLines.some(l => l.amount <= 0)) { setError('All lines must have a positive amount.'); return }
    const pDrTotal = parsedLines.filter(l => l.type === 'Dr').reduce((s, l) => s + l.amount, 0)
    const pCrTotal = parsedLines.filter(l => l.type === 'Cr').reduce((s, l) => s + l.amount, 0)
    if (Math.abs(pDrTotal - pCrTotal) >= 0.01 || pDrTotal <= 0) { setError(`Total Debits (${pDrTotal.toFixed(3)}) must equal Total Credits (${pCrTotal.toFixed(3)}).`); return }

    setSaving(true)
    try {
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'JOURNAL',
          date,
          amount: pDrTotal,
          grand_total: pDrTotal,
          subtotal: pDrTotal,
          vat_total: 0,
          narration: narration.trim(),
          company_id: companyId,
          currency,
          journal_lines: parsedLines.map(l => ({
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
      setPostedVoucher(voucher)
      setSuccess(`Journal Voucher ${voucher.voucher_number} posted successfully!`)
      
      // Load journal lines for printable preview
      setLoadingJournal(true)
      const { data: jLines } = await (supabase as any)
        .from('journal_lines')
        .select('*, ledger:ledgers(name, account_code, classification)')
        .eq('voucher_id', voucher.id)
        .order('type', { ascending: true })

      setPostedJournalLines(jLines ?? [])
      setLoadingJournal(false)

      setNarration('')
      const defaultLedger = ledgers[0]
      setLines([
        { ledger_id: defaultLedger?.id || '', type: 'Dr', amount: 0 },
        { ledger_id: defaultLedger?.id || '', type: 'Cr', amount: 0 },
      ])
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
      <html><head><title>Print Journal Voucher</title>
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
    setSuccess('Generating PDF and loading Gmail client...')

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
          filename:     `Journal-${postedVoucher.voucher_number}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true },
          jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        }
        await html2pdf().set(opt).from(element).save()
      }
    } catch (pdfErr) {
      console.error('Failed to generate PDF download:', pdfErr)
    }
    
    const emailBody = `Dear Accountant,\n\n` +
      `Please find attached Journal Voucher ${postedVoucher.voucher_number} from Tadbeer Transformations.\n\n` +
      `Thank you!\n\n` +
      `Tadbeer Transformations`;

    const subject = encodeURIComponent(`Journal Voucher ${postedVoucher.voucher_number} — Tadbeer Transformations`);
    const body = encodeURIComponent(emailBody);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`;
    
    setSuccess(`Voucher posted & PDF downloaded successfully! Please attach the downloaded file to the pre-filled Gmail window.`);
    try {
      window.open(gmailUrl, '_blank');
    } catch {
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }
  }

  function startNewVoucher() {
    setPostedVoucher(null)
    setPostedJournalLines([])
    setSuccess(null)
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>
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
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)', margin: 0 }}>Journal Voucher Posted</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: 0 }}>Voucher Number: <strong>{postedVoucher.voucher_number}</strong></p>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Printer size={16} /> Print Voucher
              </button>
              <button className="btn btn-outline" onClick={handleEmail} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Mail size={16} /> Email PDF
              </button>
              <button className="btn btn-ghost" onClick={startNewVoucher} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-teal)' }}>
                <RefreshCw size={16} /> Post Another JV
              </button>
            </div>
          </div>
        </div>

        {/* Printable Card Preview */}
        <div className="card" style={{ padding: '2.5rem', boxShadow: 'var(--shadow-lg)' }}>
          {loadingJournal ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>Loading preview...</div>
          ) : (
            <PrintableVoucher 
              voucher={postedVoucher} 
              journalLines={postedJournalLines} 
              companySettings={companySettings} 
              currency={postedVoucher.currency || 'OMR'}
            />
          )}
        </div>
      </div>
    )
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
            <div className="form-grid form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label required">Date</label>
                <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label required">Currency</label>
                <select className="form-control" value={currency} onChange={e => setCurrency(e.target.value)} required>
                  <option value="OMR">OMR (Omani Rial)</option>
                  <option value="AED">AED (UAE Dirham)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="SAR">SAR (Saudi Riyal)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
                </select>
              </div>
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
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <select className="form-control" value={line.ledger_id} onChange={e => updateLine(line.origIdx, 'ledger_id', e.target.value)} style={{ fontSize: '0.85rem', flex: 1 }}>
                            {ledgers.map(a => (
                              <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                            ))}
                          </select>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowQuickAdd(true)} style={{ padding: '2px 6px', fontSize: '0.9rem', fontWeight: 'bold' }} title="Create Ledger">+</button>
                        </div>
                      </td>
                      <td>
                        <input type="number" step="any" min="0.001" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.amount || ''} onChange={e => updateLine(line.origIdx, 'amount', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)} />
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
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <select className="form-control" value={line.ledger_id} onChange={e => updateLine(line.origIdx, 'ledger_id', e.target.value)} style={{ fontSize: '0.85rem', flex: 1 }}>
                            {ledgers.map(a => (
                              <option key={a.id} value={a.id}>{a.name} [{a.account_code}]</option>
                            ))}
                          </select>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowQuickAdd(true)} style={{ padding: '2px 6px', fontSize: '0.9rem', fontWeight: 'bold' }} title="Create Ledger">+</button>
                        </div>
                      </td>
                      <td>
                        <input type="number" step="any" min="0.001" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.amount || ''} onChange={e => updateLine(line.origIdx, 'amount', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)} />
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
                <div style={{ fontSize: '1.1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <OMRSymbol size={12} />{totalDr.toFixed(3)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Scale size={20} style={{ color: isBalanced ? 'var(--color-success)' : 'var(--color-danger)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>Total Credit</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <OMRSymbol size={12} />{totalCr.toFixed(3)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, color: isBalanced ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {isBalanced ? '✓ Balanced' : `⚠ Difference: ${Math.abs(totalDr - totalCr).toFixed(3)}`}
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
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>
            {saving ? 'Posting...' : 'Post Journal Voucher'}
          </button>
        </div>
      </form>

      {/* Quick Add Ledger Modal */}
      {showQuickAdd && (
        <div className="modal-overlay" onClick={() => setShowQuickAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Quick Add Account</span>
              <button className="modal-close" onClick={() => setShowQuickAdd(false)}>&times;</button>
            </div>
            <form onSubmit={handleQuickAdd}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Account Name</label>
                  <input className="form-control" value={newLedgerName} onChange={e => setNewLedgerName(e.target.value)} placeholder="e.g. Depreciation Account" required autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowQuickAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
