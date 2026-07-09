'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Eye, X, BookOpen, AlertCircle,
  TrendingUp, ShoppingCart, ArrowDownCircle, ArrowUpCircle, Pencil, Trash2
} from 'lucide-react'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import type { Voucher, VoucherType, JournalLine } from '@/lib/types'
import { ROLE_PERMISSIONS } from '@/lib/types'
import { useUIStore } from '@/store/ui'
import { PrintableVoucher } from '@/components/voucher/PrintableVoucher'

const TYPE_LABELS: Record<VoucherType, string> = {
  PURCHASE: 'Purchase', SALE: 'Sale', RECEIPT: 'Receipt',
  PAYMENT: 'Payment', JOURNAL: 'Journal',
  PURCHASE_RETURN: 'Purchase Return', SALES_RETURN: 'Sales Return',
}
const ALL_TYPES = Object.keys(TYPE_LABELS) as VoucherType[]

export default function VouchersPage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'
  const userRole = useUIStore(state => state.userRole) || 'Admin'

  // Permissions based on Role
  const permissions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.Admin

  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [typeFilter, setTypeFilter] = useState<VoucherType | ''>('')
  
  // Selected voucher journal preview modal
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null)
  const [journalLines, setJournalLines] = useState<(JournalLine & { ledger?: { name: string; account_code: string; classification: string } })[]>([])
  const [loadingJournal, setLoadingJournal] = useState(false)
  const [companySettings, setCompanySettings] = useState<any>(null)

  // Deletion modal state
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
      const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('company_id', currentCompanyId)
        .single()
      setCompanySettings(data)
    }
    loadSettings()
  }, [currentCompanyId])

  const openDeleteModal = (id: string) => {
    setVoucherToDelete(id)
    setDeleteReason('')
    setDeleteError(null)
    setDeleteModalOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!deleteReason.trim()) {
      setDeleteError('A deletion reason is required.')
      return
    }
    try {
      const res = await fetch(`/api/vouchers?id=${voucherToDelete}&reason=${encodeURIComponent(deleteReason)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setDeleteModalOpen(false)
        setVoucherToDelete(null)
        loadVouchers()
      } else {
        const err = await res.json()
        setDeleteError(err.error || 'Failed to delete voucher.')
      }
    } catch {
      setDeleteError('Network error. Try again.')
    }
  }

  // Fetch journal lines on select
  useEffect(() => {
    async function fetchJournal() {
      if (!selectedVoucher) return
      setLoadingJournal(true)
      const { data } = await supabase
        .from('journal_lines')
        .select('*, ledger:ledgers(id, name, account_code, classification)')
        .eq('voucher_id', selectedVoucher.id)
      setJournalLines((data as any) ?? [])
      setLoadingJournal(false)
    }
    fetchJournal()
  }, [selectedVoucher])

  const filtered = vouchers.filter(v =>
    !search ||
    v.party_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.voucher_number?.toLowerCase().includes(search.toLowerCase()) ||
    v.notes?.toLowerCase().includes(search.toLowerCase()) ||
    v.narration?.toLowerCase().includes(search.toLowerCase())
  )

  // Calculate local statistics based on currently loaded vouchers
  const stats = vouchers.reduce(
    (acc, v) => {
      const amt = Number(v.amount)
      if (v.type === 'SALE') acc.sales += amt
      if (v.type === 'PURCHASE') acc.purchases += amt
      if (v.type === 'RECEIPT') acc.receipts += amt
      if (v.type === 'PAYMENT') acc.payments += amt
      return acc
    },
    { sales: 0, purchases: 0, receipts: 0, payments: 0 }
  )

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Voucher Registry</h1>
          <p className="page-subtitle">Track, filter, and inspect financial transactions and audit entries.</p>
        </div>
        {permissions.createVouchers && (
          <Link href="/vouchers/new" className="btn btn-primary">
            <Plus size={15} /> New Voucher
          </Link>
        )}
      </div>

      {/* Mini Stats Banner */}
      <div className="grid-mobile-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        <MiniStatCard title="Total Sales volume" value={stats.sales} icon={<TrendingUp size={16} />} color="var(--color-success)" />
        <MiniStatCard title="Total Purchases volume" value={stats.purchases} icon={<ShoppingCart size={16} />} color="#1D4ED8" />
        <MiniStatCard title="Liquidity Inflow" value={stats.receipts} icon={<ArrowDownCircle size={16} />} color="var(--color-teal)" />
        <MiniStatCard title="Liquidity Outflow" value={stats.payments} icon={<ArrowUpCircle size={16} />} color="var(--color-danger)" />
      </div>

      {/* Filter Toolbar Card */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          
          {/* Left search + filter */}
          <div className="flex-mobile-col" style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                className="form-control"
                placeholder="Search by party, ID, or narration..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 38, height: 38 }}
              />
            </div>
            <select
              className="form-control"
              style={{ minWidth: 180, height: 38 }}
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as VoucherType | '')}
            >
              <option value="">All Voucher Types</option>
              {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>

          {/* Right quick shortcut creator buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {permissions.createVouchers && ALL_TYPES.slice(0, 4).map(t => (
              <Link key={t} href={`/vouchers/new?type=${t}`} className="btn btn-outline btn-sm">
                <Plus size={13} /> {TYPE_LABELS[t]}
              </Link>
            ))}
          </div>

        </div>
      </div>

      {/* Data Card */}
      <div className="card">
        <div className="table-wrapper" style={{ border: 'none' }}>
          {loading ? (
            <div style={{ padding: '2rem' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 18, marginBottom: 12, borderRadius: 4 }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="table-empty">
              <AlertCircle size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
              <p>No vouchers match your filter criteria.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Voucher ID</th>
                  <th>Date</th>
                  <th>Classification</th>
                  <th>Corporate Party</th>
                  <th>Narration</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedVoucher(v)}>
                    <td className="font-semibold text-sm" style={{ color: 'var(--color-teal)' }}>
                      {v.voucher_number}
                    </td>
                    <td className="text-muted text-xs">{new Date(v.date).toLocaleDateString('en-GB')}</td>
                    <td>
                      <span className={`badge voucher-badge-${v.type}`}>{TYPE_LABELS[v.type]}</span>
                    </td>
                    <td className="font-medium">{v.party_name || <span className="text-muted">—</span>}</td>
                    <td className="text-xs text-muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.narration || '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                      {v.currency} {Number(v.amount).toLocaleString('en-US', { minimumFractionDigits: 3 })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0 }} title="Inspect Journal lines" onClick={() => setSelectedVoucher(v)}>
                          <Eye size={13} />
                        </button>
                        
                        {/* Phase 2 & 13 Permission restrictions */}
                        {permissions.editVouchers ? (
                          <Link href={`/vouchers/edit?id=${v.id}`} className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Edit transaction">
                            <Pencil size={12} style={{ color: 'var(--color-teal)' }} />
                          </Link>
                        ) : null}
                        
                        {permissions.deleteVouchers ? (
                          <button className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0 }} title="Delete transaction" onClick={() => openDeleteModal(v.id)}>
                            <Trash2 size={12} style={{ color: 'var(--color-danger)' }} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Journal Inspector Modal */}
      {selectedVoucher && (
        <div className="modal-overlay" onClick={() => setSelectedVoucher(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ border: '1px solid var(--color-border)' }}>
            <div className="modal-header">
              <div>
                <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={16} style={{ color: 'var(--color-teal)' }} />
                  <span>Journal Ledger Audit: {selectedVoucher.voucher_number}</span>
                </span>
                <p className="card-subtitle" style={{ fontSize: '0.75rem' }}>Auto-generated double entry records for this transaction</p>
              </div>
              <button className="modal-close" onClick={() => setSelectedVoucher(null)}><X size={18} /></button>
            </div>
            
            <div className="modal-body" style={{ gap: '1.5rem' }}>
              <div className="grid-mobile-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', background: 'var(--color-surface-alt)', padding: '1rem', borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
                <div>
                  <span className="text-xs text-muted" style={{ display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Classification</span>
                  <span className={`badge voucher-badge-${selectedVoucher.type}`} style={{ marginTop: '2px' }}>{TYPE_LABELS[selectedVoucher.type]}</span>
                </div>
                <div>
                  <span className="text-xs text-muted" style={{ display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Corporate Party</span>
                  <span className="font-semibold text-sm" style={{ marginTop: '2px', display: 'block' }}>{selectedVoucher.party_name || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted" style={{ display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Transaction Amount</span>
                  <span className="font-semibold text-sm" style={{ marginTop: '2px', display: 'block' }}>
                    {selectedVoucher.currency} {Number(selectedVoucher.amount).toLocaleString('en-US', { minimumFractionDigits: 3 })}
                  </span>
                </div>
              </div>

              <div style={{ padding: '0.5rem 1rem', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.85rem' }}>
                <strong>Narration:</strong> {selectedVoucher.narration}
              </div>

              <div className="table-wrapper">
                {loadingJournal ? (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>Loading ledger logs...</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th style={{ textAlign: 'right' }}>Debit (Dr)</th>
                        <th style={{ textAlign: 'right' }}>Credit (Cr)</th>
                        <th>Narrative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journalLines.map((line, i) => (
                        <tr key={line.id || i}>
                          <td className="font-medium">{line.ledger?.name || '—'}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-danger)' }}>
                            {line.type === 'Dr' ? Number(line.amount).toLocaleString('en-US', { minimumFractionDigits: 3 }) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-success)' }}>
                            {line.type === 'Cr' ? Number(line.amount).toLocaleString('en-US', { minimumFractionDigits: 3 }) : '—'}
                          </td>
                          <td className="text-xs text-muted">{selectedVoucher.narration || 'General posting'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', width: '100%' }}>
              <button className="btn btn-primary" onClick={() => window.print()}>
                Print Voucher
              </button>
              <button className="btn btn-outline" onClick={() => setSelectedVoucher(null)}>Dismiss Audit</button>
            </div>
          </div>
          <PrintableVoucher
            voucher={selectedVoucher}
            journalLines={journalLines as any}
            companySettings={companySettings}
          />
        </div>
      )}

      {/* Phase 2: Deletion Confirmation with Reason Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay" onClick={() => setDeleteModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: 'var(--color-danger)' }}>Confirm Voucher Deletion</span>
              <button className="modal-close" onClick={() => setDeleteModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.9rem' }}>
                Are you sure you want to delete this voucher? This action will permanently remove all balancing ledger postings.
              </p>
              {deleteError && (
                <div className="alert alert-danger" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                  <span>{deleteError}</span>
                </div>
              )}
              <div className="form-group">
                <label className="form-label required">Reason for Deletion</label>
                <textarea
                  className="form-control"
                  placeholder="Explain why this transaction is being deleted..."
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  style={{ height: 80, paddingTop: 8 }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDeleteModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--color-danger)' }} onClick={handleDeleteConfirm}>
                Delete Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStatCard({ title, value, icon, color }: {
  title: string; value: number; icon: React.ReactNode; color: string;
}) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '0.85rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      boxShadow: 'var(--shadow-xs)',
    }}>
      <div style={{
        width: 32, height: 32,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface-alt)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, border: '1px solid var(--color-border-light)'
      }}>
        {icon}
      </div>
      <div>
        <span className="text-xs text-muted" style={{ display: 'block', fontWeight: 600 }}>{title}</span>
        <span className="font-semibold text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          OMR {value.toLocaleString('en-US', { minimumFractionDigits: 3 })}
        </span>
      </div>
    </div>
  )
}
