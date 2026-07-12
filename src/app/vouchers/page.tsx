'use client'
import { useEffect, useState, useCallback } from 'react'
import { Search, Eye, Trash2, AlertCircle, Printer, X } from 'lucide-react'
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
    
    const [{ data: jLines }, { data: vLines }, { data: pLedger }] = await Promise.all([
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
        .maybeSingle() : Promise.resolve({ data: null })
    ])
    
    setJournalLines(jLines ?? [])
    setVoucherLines(vLines ?? [])
    if (pLedger?.data) {
      setPartyLedger(pLedger.data)
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
                    {Number(v.grand_total || v.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                <button className="btn btn-outline btn-sm" onClick={handlePrint}><Printer size={14} /> Print</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedVoucher(null)}><X size={16} /></button>
              </div>
            </div>
            <div className="modal-body">
              {loadingJournal ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>Loading journal entries...</div>
              ) : (
                <PrintableVoucher 
                  voucher={selectedVoucher} 
                  journalLines={journalLines} 
                  voucherLines={voucherLines} 
                  companySettings={companySettings} 
                  partyLedger={partyLedger}
                />
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
