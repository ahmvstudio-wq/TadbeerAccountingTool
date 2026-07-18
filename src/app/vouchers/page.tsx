'use client'
import { useEffect, useState, useCallback } from 'react'
import { Search, Eye, Trash2, AlertCircle, Printer, X, Mail } from 'lucide-react'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import type { Voucher, VoucherType, JournalLine } from '@/lib/types'
import { useUIStore } from '@/store/ui'
import { PrintableVoucher } from '@/components/voucher/PrintableVoucher'

const TYPE_LABELS: Record<VoucherType, string> = {
  PURCHASE: 'Purchase', SALE: 'Sale', RECEIPT: 'Receipt',
  PAYMENT: 'Payment', JOURNAL: 'Journal',
}
const TYPE_COLORS: Record<VoucherType, string> = {
  SALE: '#22c55e', PURCHASE: '#f59e0b', PAYMENT: '#ef4444',
  RECEIPT: '#3b82f6', JOURNAL: '#8b5cf6',
}
const ALL_TYPES = Object.keys(TYPE_LABELS) as VoucherType[]

export default function VouchersPage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<VoucherType | ''>('')

  // Preview modal
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null)
  const [journalLines, setJournalLines] = useState<(JournalLine & { ledger?: { name: string; account_code: string; classification: string } })[]>([])
  const [voucherLines, setVoucherLines] = useState<any[]>([])
  const [partyLedger, setPartyLedger] = useState<any | null>(null)
  const [loadingJournal, setLoadingJournal] = useState(false)
  const [companySettings, setCompanySettings] = useState<any>(null)

  // Attachment state
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)

  // Settlement state
  const [settlements, setSettlements] = useState<{ as_source: any[]; as_target: any[] }>({ as_source: [], as_target: [] })

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [voucherToDelete, setVoucherToDelete] = useState<string | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const loadVouchers = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('vouchers')
      .select('*')
      .eq('company_id', currentCompanyId)
      .order('date', { ascending: false })

    if (typeFilter) q = q.eq('type', typeFilter)
    const { data } = await q
    setVouchers(data ?? [])
    setLoading(false)
  }, [typeFilter, currentCompanyId])

  useEffect(() => { loadVouchers() }, [loadVouchers])

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase.from('settings').select('*').eq('company_id', currentCompanyId).single()
      setCompanySettings(data)
    }
    loadSettings()
  }, [currentCompanyId])

  async function viewJournal(voucher: Voucher) {
    setSelectedVoucher(voucher)
    setLoadingJournal(true)
    setPartyLedger(null)
    setAttachmentUrl((voucher as any).attachment_url || null)
    setSettlements({ as_source: [], as_target: [] })
    
    const [{ data: jLines }, { data: vLines }, { data: pLedger }, { data: vRow }, { data: settData }] = await Promise.all([
      supabase
        .from('journal_lines')
        .select('*, ledger:ledgers(name, account_code, classification)')
        .eq('voucher_id', voucher.id)
        .order('type', { ascending: true }),
      supabase
        .from('voucher_lines')
        .select('*, ledger:ledgers(name, account_code)')
        .eq('voucher_id', voucher.id),
      voucher.party_ledger_id ? supabase
        .from('ledgers')
        .select('name, phone, email, address, vat_number')
        .eq('id', voucher.party_ledger_id)
        .maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from('vouchers')
        .select('attachment_url')
        .eq('id', voucher.id)
        .maybeSingle(),
      // Load settlement data
      fetch(`/api/settlements?action=settlements&voucher_id=${voucher.id}`).then(r => r.json()).catch(() => ({ as_source: [], as_target: [] })),
    ])
    
    setJournalLines(jLines ?? [])
    setVoucherLines(vLines ?? [])
    if (pLedger?.data) {
      setPartyLedger(pLedger.data)
    }
    if (vRow) {
      setAttachmentUrl(vRow.attachment_url)
    }
    if (settData) {
      setSettlements(settData)
    }
    setLoadingJournal(false)
  }

  function openDeleteModal(id: string) {
    setVoucherToDelete(id)
    setDeleteReason('')
    setDeleteError(null)
    setDeleteModalOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!deleteReason.trim()) { setDeleteError('A deletion reason is required.'); return }
    try {
      const res = await fetch(`/api/vouchers?id=${voucherToDelete}&reason=${encodeURIComponent(deleteReason)}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteModalOpen(false)
        setVoucherToDelete(null)
        loadVouchers()
      } else {
        const err = await res.json()
        setDeleteError(err.error || 'Failed to delete.')
      }
    } catch { setDeleteError('Network error.') }
  }

  function handlePrint() {
    const el = document.getElementById('printable-voucher')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Print</title>
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

  function handleWhatsApp() {
    if (!selectedVoucher) return
    const phone = (partyLedger?.phone || '').replace(/\D/g, '')
    const label = selectedVoucher.type === 'SALE' ? 'Tax Invoice' : 'Voucher'
    
    const message = `Dear Customer / Supplier,\n\n` +
      `Hope you are doing well.\n\n` +
      `Please find details of your ${label} *${selectedVoucher.voucher_number}* from Tadbeer Transformations:\n` +
      `• Date: ${new Date(selectedVoucher.date).toLocaleDateString('en-GB')}\n` +
      `• Total Amount: *OMR ${Number(selectedVoucher.grand_total || selectedVoucher.amount).toFixed(3)}*\n\n` +
      `Thank you!\n\n` +
      `Tadbeer Transformations`;
      
    const encodedText = encodeURIComponent(message)
    const waUrl = phone ? `https://wa.me/${phone}?text=${encodedText}` : `https://api.whatsapp.com/send?text=${encodedText}`
    window.open(waUrl, '_blank')
  }

  async function handleEmail() {
    if (!selectedVoucher) return
    const emailTo = partyLedger?.email || ''
    const vNumber = selectedVoucher.voucher_number
    const vType = selectedVoucher.type

    // 1. Load html2pdf dynamically from CDN
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
          filename:     `Voucher-${vNumber}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true },
          jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        }
        await html2pdf().set(opt).from(element).save()
      }
    } catch (pdfErr) {
      console.error('Failed to generate PDF download:', pdfErr)
    }

    const label = vType === 'SALE' ? 'Tax Invoice' : 'Voucher'
    const emailBody = `Dear Customer / Supplier,\n\n` +
      `Hope you are doing well.\n\n` +
      `Please find attached ${label} ${vNumber} from Tadbeer Transformations.\n\n` +
      `Please let us know if you have any questions.\n\n` +
      `Thank you!\n\n` +
      `Tadbeer Transformations\n` +
      `Email: operation@tadbeertt.com\n` +
      `Phone: +968 7630 7656`;

    const subject = encodeURIComponent(`${label} ${vNumber} — Tadbeer Transformations`);
    const body = encodeURIComponent(emailBody);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${emailTo}&su=${subject}&body=${body}`;

    try {
      window.open(gmailUrl, '_blank');
    } catch {
      window.location.href = `mailto:${emailTo}?subject=${subject}&body=${body}`;
    }
  }

  const filtered = vouchers.filter(v => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      v.voucher_number?.toLowerCase().includes(q) ||
      v.party_name?.toLowerCase().includes(q) ||
      v.narration?.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Voucher Registry</h1>
          <p className="page-subtitle">All posted vouchers</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input className="form-control" placeholder="Search vouchers..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, height: 38 }} />
        </div>
        <select className="form-control" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} style={{ width: 160, height: 38 }}>
          <option value="">All Types</option>
          {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Voucher No.</th>
                <th>Type</th>
                <th>Date</th>
                <th>Party</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Narration</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No vouchers found</td></tr>
              ) : filtered.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v.voucher_number}</td>
                  <td>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: `${TYPE_COLORS[v.type as VoucherType]}15`, color: TYPE_COLORS[v.type as VoucherType],
                    }}>
                      {TYPE_LABELS[v.type as VoucherType] || v.type}
                    </span>
                  </td>
                  <td>{new Date(v.date).toLocaleDateString('en-GB')}</td>
                  <td>{v.party_name || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {Number(v.grand_total || v.amount).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {v.narration}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => viewJournal(v)} title="View"><Eye size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openDeleteModal(v.id)} title="Delete" style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Journal Modal */}
      {selectedVoucher && (
        <div className="modal-overlay" onClick={() => setSelectedVoucher(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h3>{selectedVoucher.voucher_number} — Journal Preview</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline btn-sm" onClick={handleEmail} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={14} /> Email</button>
                <button className="btn btn-outline btn-sm" onClick={handlePrint}><Printer size={14} /> Print</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedVoucher(null)}><X size={16} /></button>
              </div>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {loadingJournal ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>Loading journal entries...</div>
              ) : (
                <>
                  <PrintableVoucher 
                    voucher={selectedVoucher} 
                    journalLines={journalLines} 
                    voucherLines={voucherLines} 
                    companySettings={companySettings} 
                    partyLedger={partyLedger}
                  />

                  {/* Settlement Information */}
                  {(settlements.as_source.length > 0 || settlements.as_target.length > 0) && (
                    <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '1.5rem', marginTop: '1rem' }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#163B40', marginBottom: '0.5rem' }}>
                        Settlement History
                      </h4>

                      {/* Allocations made FROM this voucher (if it's a receipt/payment) */}
                      {settlements.as_source.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 0.5rem', fontWeight: 600 }}>
                            Allocated to invoices:
                          </p>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Invoice</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {settlements.as_source.map((s: any) => (
                                <tr key={s.id} style={{ borderBottom: '1px solid #f7fafc' }}>
                                  <td style={{ padding: '6px 8px', fontWeight: 600, fontFamily: 'monospace' }}>
                                    {s.is_on_account ? (
                                      <span style={{ color: '#f59e0b' }}>On Account</span>
                                    ) : (
                                      s.target_voucher_number || '—'
                                    )}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    {Number(s.allocated_amount).toFixed(3)}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <span style={{
                                      fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                      background: s.is_on_account ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                                      color: s.is_on_account ? '#f59e0b' : '#22c55e',
                                    }}>
                                      {s.is_on_account ? 'On Account' : 'Allocated'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Allocations made TO this voucher (if it's an invoice) */}
                      {settlements.as_target.length > 0 && (
                        <div>
                          <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 0.5rem', fontWeight: 600 }}>
                            Settlements received:
                          </p>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Voucher</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {settlements.as_target.map((s: any) => (
                                <tr key={s.id} style={{ borderBottom: '1px solid #f7fafc' }}>
                                  <td style={{ padding: '6px 8px', fontWeight: 600, fontFamily: 'monospace' }}>
                                    {s.source_voucher_number}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    {Number(s.allocated_amount).toFixed(3)}
                                  </td>
                                </tr>
                              ))}
                              <tr style={{ fontWeight: 700, background: '#f8fafc' }}>
                                <td style={{ padding: '6px 8px' }}>Total Settled</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>
                                  {settlements.as_target.reduce((sum: number, s: any) => sum + Number(s.allocated_amount), 0).toFixed(3)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '0.5rem 0 0', fontWeight: 600 }}>
                            Outstanding: {(Number(selectedVoucher.grand_total || selectedVoucher.amount || 0) - settlements.as_target.reduce((sum: number, s: any) => sum + Number(s.allocated_amount), 0)).toFixed(3)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attachment upload & display section */}
                  <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '1.5rem', marginTop: '1rem' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#163B40', marginBottom: '0.5rem' }}>
                      Receipt Image / Document Attachment
                    </h4>
                    
                    {attachmentUrl ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
                        {attachmentUrl.startsWith('data:image/') ? (
                          <div style={{ position: 'relative', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '4px', background: '#F7FAFC' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={attachmentUrl} 
                              alt="Attachment Preview" 
                              style={{ maxHeight: '240px', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px', cursor: 'pointer' }}
                              onClick={() => {
                                const win = window.open();
                                win?.document.write(`<img src="${attachmentUrl}" style="max-width:100%; height:auto;" />`);
                              }}
                            />
                          </div>
                        ) : (
                          <a href={attachmentUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                            View Attached File
                          </a>
                        )}
                        <button 
                          className="btn btn-sm btn-outline" 
                          style={{ borderColor: '#ef4444', color: '#ef4444' }}
                          onClick={async () => {
                            if (confirm('Are you sure you want to remove this attachment?')) {
                              setUploadingAttachment(true)
                              const { error } = await supabase
                                .from('vouchers')
                                .update({ attachment_url: null })
                                .eq('id', selectedVoucher.id)
                              if (!error) {
                                setAttachmentUrl(null)
                                setVouchers(prev => prev.map(v => v.id === selectedVoucher.id ? { ...v, attachment_url: null } : v))
                              }
                              setUploadingAttachment(false)
                            }
                          }}
                        >
                          Remove Attachment
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <input 
                          type="file" 
                          accept="image/*,application/pdf"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setUploadingAttachment(true)
                            
                            const reader = new FileReader()
                            reader.onloadend = async () => {
                              const base64Data = reader.result as string
                              const { error } = await supabase
                                .from('vouchers')
                                .update({ attachment_url: base64Data })
                                .eq('id', selectedVoucher.id)
                              if (!error) {
                                setAttachmentUrl(base64Data)
                                setVouchers(prev => prev.map(v => v.id === selectedVoucher.id ? { ...v, attachment_url: base64Data } : v))
                              } else {
                                alert('Failed to save attachment to database. Make sure column attachment_url is configured.')
                              }
                              setUploadingAttachment(false)
                            }
                            reader.readAsDataURL(file)
                          }}
                          disabled={uploadingAttachment}
                          style={{ fontSize: '0.8rem' }}
                        />
                        {uploadingAttachment && <span style={{ fontSize: '0.8rem', color: '#718096' }}>Uploading...</span>}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay" onClick={() => setDeleteModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header"><h3>Delete Voucher</h3></div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                This will reverse all journal entries. The voucher number will <strong>never be reused</strong>.
              </p>
              {deleteError && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}><AlertCircle size={14} /><span>{deleteError}</span></div>}
              <div className="form-group">
                <label className="form-label required">Reason for deletion</label>
                <textarea className="form-control" value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Why is this voucher being deleted?" style={{ height: 60 }} />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setDeleteModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDeleteConfirm} style={{ background: 'var(--color-danger)' }}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
