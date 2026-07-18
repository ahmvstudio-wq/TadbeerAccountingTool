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
import { OMRSymbol } from '@/components/ui/OMRSymbol'

interface LineItem {
  item_id?: string
  ledger_id: string
  description: string
  quantity: number
  rate: number
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

  const [companySettings, setCompanySettings] = useState<any>(null)

  const [postedVoucher, setPostedVoucher] = useState<Voucher | null>(null)
  const [postedJournalLines, setPostedJournalLines] = useState<JournalLine[]>([])
  const [postedVoucherLines, setPostedVoucherLines] = useState<any[]>([])
  const [loadingJournal, setLoadingJournal] = useState(false)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [customerId, setCustomerId] = useState('')
  const [currency, setCurrency] = useState('OMR')
  const [narration, setNarration] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([
    { item_id: '', ledger_id: '', description: '', quantity: 1, rate: 0, amount: 0, vat_rate: 5, vat_amount: 0 },
  ])

  const [customerBalance, setCustomerBalance] = useState<{ balance: number; type: string } | null>(null)

  // Quick-add state for particulars (income accounts)
  const [showQuickAddIncome, setShowQuickAddIncome] = useState(false)
  const [newIncomeName, setNewIncomeName] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ledg }, { data: sett }, { data: itms }] = await Promise.all([
        (supabase as any).from('ledgers').select('*, group:groups(id, name, nature)').eq('company_id', companyId).order('name'),
        (supabase as any).from('settings').select('*').eq('company_id', companyId).maybeSingle(),
        (supabase as any).from('items').select('*').eq('company_id', companyId).order('name')
      ])
      const fetchedLedgers = ledg ?? []
      const fetchedItems = itms ?? []
      setLedgers(fetchedLedgers)
      setCompanySettings(sett)
      setItems(fetchedItems)

      // Auto-select first customer
      const customerList = fetchedLedgers.filter((l: any) => {
        const gn = (l.group as any)?.name?.toLowerCase() || ''
        return gn.includes('debtor') || gn.includes('customer')
      })
      if (customerList.length > 0) {
        setCustomerId(customerList[0].id)
      }

      // Auto-select first service item in line
      if (fetchedItems.length > 0) {
        const firstItem = fetchedItems[0]
        setLines([
          { 
            item_id: firstItem.id, 
            ledger_id: firstItem.income_ledger_id || '', 
            description: firstItem.name, 
            quantity: 1, 
            rate: Number(firstItem.sell_price || 0), 
            amount: Number(firstItem.sell_price || 0), 
            vat_rate: Number(firstItem.tax_rate || 5.00), 
            vat_amount: Math.round(Number(firstItem.sell_price || 0) * Number(firstItem.tax_rate || 5.00) / 100 * 1000) / 1000 
          }
        ])
      }
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])

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

  const customers = ledgers.filter(l => {
    const gn = (l.group as any)?.name?.toLowerCase() || ''
    return gn.includes('debtor') || gn.includes('customer')
  })
  const incomeAccounts = ledgers.filter(l => (l.group as any)?.nature === 'INCOME')
  const vatOutputLedger = ledgers.find(l => l.name.toLowerCase().includes('vat') && (l.name.toLowerCase().includes('output') || l.name.toLowerCase().includes('payable')))

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
          next[idx].rate = Number(item.sell_price || 0)
          next[idx].quantity = 1
          next[idx].amount = Number(item.sell_price || 0)
          next[idx].vat_rate = Number(item.tax_rate || 5.00)
          next[idx].ledger_id = item.income_ledger_id || ''
        }
      }

      // Recalculate amount when quantity or rate changes
      if (field === 'quantity' || field === 'rate') {
        const qty = Number(next[idx].quantity || 0)
        const rate = Number(next[idx].rate || 0)
        next[idx].amount = Math.round(qty * rate * 1000) / 1000
      }

      // Auto-calc VAT
      if (field === 'amount' || field === 'vat_rate' || field === 'quantity' || field === 'rate' || field === 'item_id') {
        const amt = Number(next[idx].amount || 0)
        const vatRate = next[idx].vat_rate != null ? Number(next[idx].vat_rate) : 5
        next[idx].vat_amount = Math.round(amt * vatRate / 100 * 1000) / 1000
      }
      return next
    })
  }

  function addLine() {
    const defaultItem = items[0]
    setLines(prev => [...prev, { 
      item_id: defaultItem?.id || '', 
      ledger_id: defaultItem?.income_ledger_id || '', 
      description: defaultItem?.name || '', 
      quantity: 1, 
      rate: Number(defaultItem?.sell_price || 0), 
      amount: Number(defaultItem?.sell_price || 0), 
      vat_rate: Number(defaultItem?.tax_rate || 5.00), 
      vat_amount: Math.round(Number(defaultItem?.sell_price || 0) * Number(defaultItem?.tax_rate || 5.00) / 100 * 1000) / 1000 
    }])
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleQuickAddIncome(e: React.FormEvent) {
    e.preventDefault()
    if (!newIncomeName.trim()) return

    // Find or create the Income group, then create a ledger under it
    let incomeGroup = ledgers.find(l => (l.group as any)?.nature === 'INCOME')?.group
    if (!incomeGroup) {
      // Try to find a group with nature INCOME
      const { data: groups } = await (supabase as any).from('groups').select('*').eq('company_id', companyId).eq('nature', 'INCOME').limit(1)
      incomeGroup = groups?.[0]
    }

    if (!incomeGroup) {
      setError('No Income group found. Please create one first in Chart of Accounts.')
      return
    }

    const res = await fetch('/api/ledgers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newIncomeName.trim(),
        group_id: incomeGroup.id,
        opening_balance: 0,
        classification: 'Nominal',
        company_id: companyId,
      }),
    })

    if (res.ok) {
      const newLedger = await res.json()
      setLedgers(prev => [...prev, newLedger])
      setNewIncomeName('')
      setShowQuickAddIncome(false)
    } else {
      const err = await res.json()
      setError(err.error || 'Failed to create account.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!customerId) { setError('Select a customer.'); return }
    if (!narration.trim()) { setError('Narration is required.'); return }
    
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
          currency,
          lines: lines.map(l => ({
            ledger_id: l.ledger_id,
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
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
      
      const capturedLines = lines.map(l => ({
        id: crypto.randomUUID(),
        ledger_id: l.ledger_id,
        description: l.description,
        quantity: l.quantity,
        rate: l.rate,
        amount: l.amount,
        vat_rate: l.vat_rate,
        vat_amount: l.vat_amount,
        ledger: ledgers.find(led => led.id === l.ledger_id)
          ? { name: (ledgers.find(led => led.id === l.ledger_id) as any)?.name, account_code: (ledgers.find(led => led.id === l.ledger_id) as any)?.account_code }
          : undefined,
      }))

      setLoadingJournal(true)
      const { data: jLines } = await (supabase as any)
        .from('journal_lines')
        .select('*, ledger:ledgers(name, account_code, classification)')
        .eq('voucher_id', voucher.id)
        .order('type', { ascending: true })

      setPostedJournalLines(jLines ?? [])
      setPostedVoucherLines(capturedLines)
      setPostedVoucher(voucher)
      setSuccess(`Sales Invoice ${voucher.voucher_number} posted successfully!`)
      setLoadingJournal(false)

      const { data: balData } = await (supabase as any).rpc('get_ledger_balance', { p_ledger_id: customerId })
      if (balData && balData.length > 0) {
        setCustomerBalance({ balance: Number(balData[0].current_balance), type: balData[0].balance_type })
      }

      setCustomerId('')
      setNarration('')
      setNotes('')
      setLines([{ item_id: '', ledger_id: '', description: '', quantity: 1, rate: 0, amount: 0, vat_rate: 5, vat_amount: 0 }])

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
        .print-total-row { font-weight: 700; background: #f0f0f0; }
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
          jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        }
        await html2pdf().set(opt).from(element).save()
      }
    } catch (pdfErr) {
      console.error('Failed to generate PDF download:', pdfErr)
    }
    
    const emailBody = `Dear ${postedVoucher.party_name || 'Customer'},\n\n` +
      `Hope you are doing well.\n\n` +
      `Please find attached Tax Invoice ${postedVoucher.voucher_number} from Tadbeer Transformations.\n\n` +
      `Please let us know if you have any questions.\n\n` +
      `Thank you!\n\n` +
      `Tadbeer Transformations\n` +
      `Email: ${companySettings?.email || 'operation@tadbeertt.com'}\n` +
      `Phone: ${companySettings?.phone || '+968 7721 3606'}`;

    const subject = encodeURIComponent(`Tax Invoice ${postedVoucher.voucher_number} — Tadbeer Transformations`);
    const body = encodeURIComponent(emailBody);
    
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${emailTo}&su=${subject}&body=${body}`;
    
    setSuccess(`Invoice posted & PDF downloaded successfully! Please attach the downloaded 'Invoice-${postedVoucher.voucher_number}.pdf' to the pre-filled Gmail window.`);

    try {
      window.open(gmailUrl, '_blank');
    } catch {
      window.location.href = `mailto:${emailTo}?subject=${subject}&body=${body}`;
    }
  }

  function handleWhatsApp() {
    if (!postedVoucher) return
    const customerLedger = ledgers.find(l => l.name === postedVoucher.party_name)
    const phone = (customerLedger?.phone || '').replace(/\D/g, '')
    
    const message = `Dear ${postedVoucher.party_name || 'Customer'},\n\n` +
      `Hope you are doing well.\n\n` +
      `Please find details of your Tax Invoice *${postedVoucher.voucher_number}* from Tadbeer Transformations:\n` +
      `• Date: ${new Date(postedVoucher.date).toLocaleDateString('en-GB')}\n` +
      `• Total Amount: *OMR ${Number(postedVoucher.grand_total).toFixed(3)}*\n\n` +
      `Thank you!\n\n` +
      `Tadbeer Transformations`;
      
    const encodedText = encodeURIComponent(message)
    const waUrl = phone ? `https://wa.me/${phone}?text=${encodedText}` : `https://api.whatsapp.com/send?text=${encodedText}`
    window.open(waUrl, '_blank')
  }

  function startNewInvoice() {
    setPostedVoucher(null)
    setPostedJournalLines([])
    setSuccess(null)
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}><div className="skeleton" style={{ height: 400, borderRadius: 12 }} /></div>
  }

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
            
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Printer size={16} /> Print Invoice
              </button>
              <button className="btn btn-outline" onClick={handleEmail} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Mail size={16} /> Email Customer
              </button>
              <button className="btn btn-outline" onClick={handleWhatsApp} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#25D366', borderColor: '#25D366' }}>
                WhatsApp
              </button>
              <button className="btn btn-ghost" onClick={startNewInvoice} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-teal)' }}>
                <RefreshCw size={16} /> Post Another Invoice
              </button>
            </div>
          </div>
        </div>

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
              currency={currency}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/vouchers" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="page-title">Sales Invoice</h1>
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
            <div className="form-grid form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
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
              <div className="form-group">
                <label className="form-label required">Customer</label>
                <select className="form-control" value={customerId} onChange={e => setCustomerId(e.target.value)} required>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} [{c.account_code}]</option>
                  ))}
                </select>
                {customerBalance && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    Current Balance: <OMRSymbol size={12} /> {Number(customerBalance.balance).toFixed(3)} {customerBalance.type}
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
                    <th style={{ width: '25%' }}>Particulars</th>
                    <th style={{ width: '18%' }}>Description</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>Qty</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Rate</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>VAT %</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>VAT Amt</th>
                    <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                    <th style={{ width: '4%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <select className="form-control" value={line.item_id} onChange={e => updateLine(idx, 'item_id', e.target.value)} style={{ fontSize: '0.85rem', flex: 1 }}>
                            {items.map(i => (
                              <option key={i.id} value={i.id}>{i.name} ({i.code || 'No Code'})</option>
                            ))}
                          </select>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowQuickAddIncome(true)} style={{ padding: '2px 6px', fontSize: '0.9rem', fontWeight: 'bold' }} title="Create Ledger">+</button>
                        </div>
                      </td>
                      <td>
                        <input className="form-control" placeholder="Description" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} style={{ fontSize: '0.85rem' }} />
                      </td>
                      <td>
                        <input type="number" step="0.001" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} />
                      </td>
                      <td>
                        <input type="number" step="0.001" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.rate || ''} onChange={e => updateLine(idx, 'rate', Number(e.target.value))} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.vat_rate} onChange={e => updateLine(idx, 'vat_rate', Number(e.target.value))} />
                      </td>
                      <td>
                        <input type="number" step="0.001" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 500 }} value={line.vat_amount} onChange={e => updateLine(idx, 'vat_amount', Number(e.target.value))} />
                      </td>
                      <td>
                        <input type="number" step="0.001" min="0" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem' }} value={line.amount || ''} onChange={e => updateLine(idx, 'amount', Number(e.target.value))} />
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
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{subtotal.toFixed(3)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>VAT</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{vatTotal.toFixed(3)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-teal)', alignItems: 'center' }}>
                  <span>Grand Total</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <OMRSymbol size={14} /> {grandTotal.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>

            {grandTotal > 0 && (
              <div style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                <strong>Amount in words:</strong> {numberToWords(grandTotal, currency)}
              </div>
            )}

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

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingBottom: '2rem' }}>
          <Link href="/vouchers" className="btn btn-outline">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 160 }}>
            {saving ? 'Posting...' : 'Post Sales Invoice'}
          </button>
        </div>
      </form>

      {/* Quick Add Income Account Modal */}
      {showQuickAddIncome && (
        <div className="modal-overlay" onClick={() => setShowQuickAddIncome(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Quick Add Income Account</span>
              <button className="modal-close" onClick={() => setShowQuickAddIncome(false)}>&times;</button>
            </div>
            <form onSubmit={handleQuickAddIncome}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Account Name</label>
                  <input className="form-control" value={newIncomeName} onChange={e => setNewIncomeName(e.target.value)} placeholder="e.g. Digital Marketing Services" required autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowQuickAddIncome(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
