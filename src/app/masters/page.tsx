'use client'
import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, AlertCircle, X, UserPlus, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Group, Ledger, Nature } from '@/lib/types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useUIStore } from '@/store/ui'

const NATURE_LABELS: Record<Nature, string> = {
  ASSET: 'Owned (Asset)',
  LIABILITY: 'Owed (Liability)',
  INCOME: 'Earned (Income)',
  EXPENSE: 'Spent (Expense)',
  EQUITY: 'Capital (Equity)',
}
const NATURE_BADGE: Record<Nature, string> = {
  ASSET: 'badge-teal', LIABILITY: 'badge-warning', INCOME: 'badge-success',
  EXPENSE: 'badge-danger', EQUITY: 'badge-gold',
}

const CLASSIFICATION_COLOR: Record<string, string> = {
  Personal: 'var(--color-gold-dark)',
  Real: 'var(--color-teal)',
  Nominal: 'var(--color-text-secondary)',
}

// ---- Schemas ----
const groupSchema = z.object({
  name:      z.string().min(2, 'Name is required'),
  parent_id: z.string().optional().nullable(),
  nature:    z.enum(['ASSET','LIABILITY','INCOME','EXPENSE','EQUITY']),
})

const ledgerSchema = z.object({
  name:            z.string().min(2, 'Name is required'),
  group_id:        z.string().min(1, 'Select a group'),
  opening_balance: z.coerce.number(),
  description:     z.string().optional(),
  classification:  z.enum(['Personal','Real','Nominal']).optional(),
  phone:           z.string().optional(),
  email:           z.string().optional(),
  vat_number:      z.string().optional(),
  country:         z.string().optional(),
  address:         z.string().optional(),
  expense_category: z.string().optional(),
})

type GroupForm  = z.infer<typeof groupSchema>
type LedgerForm = z.infer<typeof ledgerSchema>

export default function MastersPage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [groups,  setGroups]  = useState<Group[]>([])
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<'group' | 'ledger' | 'edit-group' | 'edit-ledger' | 'customer' | 'supplier' | null>(null)
  
  const [activeGroup, setActiveGroup] = useState<Group | null>(null)
  const [activeLedger, setActiveLedger] = useState<Ledger | null>(null)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: g }, { data: l }] = await Promise.all([
      (supabase as any).from('groups').select('*').eq('company_id', currentCompanyId).order('sort_order'),
      (supabase as any).from('ledgers').select('*, group:groups(id,name,nature)').eq('company_id', currentCompanyId).order('name'),
    ])
    setGroups(g ?? [])
    setLedgers(l ?? [])
    setLoading(false)
  }, [currentCompanyId])

  useEffect(() => { loadData() }, [loadData])

  // Build tree
  const rootGroups = groups.filter(g => !g.parent_id)
  function childGroups(parentId: string) { return groups.filter(g => g.parent_id === parentId) }
  function groupLedgers(groupId: string) { return ledgers.filter(l => l.group_id === groupId) }

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function deleteGroup(id: string) {
    const hasLedgers = ledgers.some(l => l.group_id === id)
    const hasChildren = groups.some(g => g.parent_id === id)
    if (hasLedgers || hasChildren) {
      setError('Cannot delete: this group contains child subgroups or linked accounts.')
      return
    }
    const res = await fetch(`/api/groups?id=${id}&company_id=${currentCompanyId}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      setError(err.error || 'Failed to delete group.')
    } else {
      loadData()
    }
  }

  async function deleteLedger(id: string) {
    const { count } = await (supabase as any)
      .from('journal_lines')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_id', id)
      .eq('company_id', currentCompanyId)
    if ((count ?? 0) > 0) {
      setError('Cannot delete: this account has transaction records posted to it.')
      return
    }
    const res = await fetch(`/api/ledgers?id=${id}&company_id=${currentCompanyId}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      setError(err.error || 'Failed to delete ledger.')
    } else {
      loadData()
    }
  }

  function handleEditGroup(group: Group) {
    setActiveGroup(group)
    setModal('edit-group')
  }

  function handleEditLedger(ledger: Ledger) {
    setActiveLedger(ledger)
    setModal('edit-ledger')
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Accounts Ledger Setup</h1>
          <p className="page-subtitle">Configure your custom corporate categories, account folders, and opening balances.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Quick creation buttons */}
          <button className="btn btn-outline btn-sm" onClick={() => setModal('customer')} style={{ borderStyle: 'dashed' }}>
            <UserPlus size={14} /> Quick Add Customer
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setModal('supplier')} style={{ borderStyle: 'dashed' }}>
            <UserCheck size={14} /> Quick Add Supplier
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => { setActiveGroup(null); setModal('group') }}>
            <Plus size={14} /> Add New Group
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setActiveLedger(null); setModal('ledger') }}>
            <Plus size={14} /> Add Account Ledger
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 48, borderRadius: 10 }} />
          ))}
        </div>
      ) : (
        <div className="account-tree">
          {rootGroups.map(root => (
            <GroupNode
              key={root.id}
              group={root}
              childGroups={childGroups}
              groupLedgers={groupLedgers}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onDeleteGroup={deleteGroup}
              onDeleteLedger={deleteLedger}
              onEditGroup={handleEditGroup}
              onEditLedger={handleEditLedger}
              depth={0}
            />
          ))}
        </div>
      )}

      {/* Group Modal (Create/Edit) */}
      {(modal === 'group' || modal === 'edit-group') && (
        <GroupFormModal
          groups={groups}
          companyId={currentCompanyId}
          groupToEdit={activeGroup || undefined}
          onClose={() => { setModal(null); setActiveGroup(null) }}
          onSaved={() => { setModal(null); setActiveGroup(null); loadData() }}
        />
      )}

      {/* Ledger Modal (Create/Edit) */}
      {(modal === 'ledger' || modal === 'edit-ledger') && (
        <LedgerFormModal
          groups={groups}
          companyId={currentCompanyId}
          ledgerToEdit={activeLedger || undefined}
          onClose={() => { setModal(null); setActiveLedger(null) }}
          onSaved={() => { setModal(null); setActiveLedger(null); loadData() }}
        />
      )}

      {/* Quick Add Customer/Supplier Modal */}
      {(modal === 'customer' || modal === 'supplier') && (
        <QuickPartyModal
          type={modal}
          groups={groups}
          companyId={currentCompanyId}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData() }}
        />
      )}
    </div>
  )
}

// ---- Tree Node ----
function GroupNode({
  group, childGroups, groupLedgers, expanded, toggleExpand,
  onDeleteGroup, onDeleteLedger, onEditGroup, onEditLedger, depth
}: {
  group: Group
  childGroups: (id: string) => Group[]
  groupLedgers: (id: string) => Ledger[]
  expanded: Record<string, boolean>
  toggleExpand: (id: string) => void
  onDeleteGroup: (id: string) => void
  onDeleteLedger: (id: string) => void
  onEditGroup: (group: Group) => void
  onEditLedger: (ledger: Ledger) => void
  depth: number
}) {
  const children = childGroups(group.id)
  const ledgers  = groupLedgers(group.id)
  const isOpen   = expanded[group.id] !== false
  const hasItems = children.length > 0 || ledgers.length > 0

  if (depth === 0) {
    return (
      <div className="tree-group-card" style={{ marginBottom: '1.25rem' }}>
        <div className="tree-group-card-header" onClick={() => toggleExpand(group.id)}>
          <div className="tree-group-card-title">
            {hasItems && (isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />)}
            <span>{group.name}</span>
            <span className={`badge ${NATURE_BADGE[group.nature]}`}>{NATURE_LABELS[group.nature]}</span>
          </div>
          {!group.is_system && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={e => { e.stopPropagation(); onEditGroup(group) }}
                title="Edit group"
                style={{ color: 'var(--color-teal)', width: 28, height: 28, padding: 0 }}
              >
                <Pencil size={13} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={e => { e.stopPropagation(); onDeleteGroup(group.id) }}
                title="Delete group"
                style={{ color: 'var(--color-danger)', width: 28, height: 28, padding: 0 }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        {isOpen && (
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '1.25rem' }}>
            {children.length === 0 && ledgers.length === 0 ? (
              <div className="text-xs text-muted italic" style={{ padding: '0.5rem 0.25rem' }}>
                No subgroups or accounts created under this classification.
              </div>
            ) : (
              <>
                {children.map(child => (
                  <GroupNode
                    key={child.id}
                    group={child}
                    childGroups={childGroups}
                    groupLedgers={groupLedgers}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    onDeleteGroup={onDeleteGroup}
                    onDeleteLedger={onDeleteLedger}
                    onEditGroup={onEditGroup}
                    onEditLedger={onEditLedger}
                    depth={depth + 1}
                  />
                ))}
                {ledgers.map(ledger => (
                  <div key={ledger.id} className="tree-ledger-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Link href={`/reports/ledgers?ledger_id=${ledger.id}`} style={{ display: 'inline-flex', gap: 8, textDecoration: 'none', color: 'inherit' }} title="Click to view ledger breakdown">
                        <strong style={{ color: 'var(--color-gold-dark)', fontSize: '0.8rem', cursor: 'pointer' }}>
                          [{ledger.account_code}]
                        </strong>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}>{ledger.name}</span>
                      </Link>
                      {Number(ledger.opening_balance) > 0 && (
                        <span className="text-muted text-xs">
                          (Start: {Number(ledger.opening_balance).toLocaleString('en-US', { minimumFractionDigits: 3 })} {ledger.opening_type})
                        </span>
                      )}
                      {(ledger.phone || ledger.email) && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          • {ledger.phone || ledger.email}
                        </span>
                      )}
                    </div>
                    {!ledger.is_system && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => onEditLedger(ledger)}
                          title="Edit account"
                          style={{ color: 'var(--color-teal)', width: 28, height: 28, padding: 0 }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => onDeleteLedger(ledger.id)}
                          title="Delete account"
                          style={{ color: 'var(--color-danger)', width: 28, height: 28, padding: 0 }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // Nested levels (depth > 0)
  return (
    <div className="tree-connector-line">
      <div className="tree-subgroup-header" onClick={() => toggleExpand(group.id)}>
        <div className="tree-subgroup-name">
          {hasItems && (isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
          <span>{group.name}</span>
        </div>
        {!group.is_system && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onEditGroup(group) }}
              title="Edit group"
              style={{ color: 'var(--color-teal)', width: 26, height: 26, padding: 0 }}
            >
              <Pencil size={12} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onDeleteGroup(group.id) }}
              title="Delete group"
              style={{ color: 'var(--color-danger)', width: 26, height: 26, padding: 0 }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {children.map(child => (
            <GroupNode
              key={child.id}
              group={child}
              childGroups={childGroups}
              groupLedgers={groupLedgers}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onDeleteGroup={onDeleteGroup}
              onDeleteLedger={onDeleteLedger}
              onEditGroup={onEditGroup}
              onEditLedger={onEditLedger}
              depth={depth + 1}
            />
          ))}
          {ledgers.map(ledger => (
            <div key={ledger.id} className="tree-connector-line">
              <div className="tree-ledger-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Link href={`/reports/ledgers?ledger_id=${ledger.id}`} style={{ display: 'inline-flex', gap: 8, textDecoration: 'none', color: 'inherit' }} title="Click to view ledger breakdown">
                    <strong style={{ color: 'var(--color-gold-dark)', fontSize: '0.75rem', cursor: 'pointer' }}>
                      [{ledger.account_code}]
                    </strong>
                    <span style={{ fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}>{ledger.name}</span>
                  </Link>
                  {Number(ledger.opening_balance) > 0 && (
                    <span className="text-muted text-xs">
                      (Start: {Number(ledger.opening_balance).toLocaleString('en-US', { minimumFractionDigits: 3 })} {ledger.opening_type})
                    </span>
                  )}
                </div>
                {!ledger.is_system && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onEditLedger(ledger)}
                      title="Edit account"
                      style={{ color: 'var(--color-teal)', width: 26, height: 26, padding: 0 }}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onDeleteLedger(ledger.id)}
                      title="Delete account"
                      style={{ color: 'var(--color-danger)', width: 26, height: 26, padding: 0 }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Group Form Modal ----
function GroupFormModal({ groups, companyId, groupToEdit, onClose, onSaved }: {
  groups: Group[]
  companyId: string
  groupToEdit?: Group
  onClose: () => void
  onSaved: () => void
}) {
  const [apiError, setApiError] = useState<string | null>(null)
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<GroupForm>({
    resolver: zodResolver(groupSchema),
    defaultValues: groupToEdit ? {
      name: groupToEdit.name,
      parent_id: groupToEdit.parent_id,
      nature: groupToEdit.nature,
    } : { nature: 'ASSET' },
  })

  async function onSubmit(data: GroupForm) {
    setApiError(null)
    const isEdit = !!groupToEdit
    const url = '/api/groups'
    const method = isEdit ? 'PUT' : 'POST'
    let payload: any = isEdit ? { ...data, id: groupToEdit.id, company_id: companyId } : { ...data, company_id: companyId }

    if (!isEdit) {
      const { data: { user } } = await (supabase as any).auth.getUser()
      if (user) payload.created_by = user.id
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        onSaved()
      } else {
        const errData = await res.json()
        setApiError(errData.error || 'Failed to save group.')
      }
    } catch (e: any) {
      setApiError(e.message || 'An error occurred.')
    }
  }

  const selectedNature = watch('nature')

  // Only allow parents with the same nature (no cross-nature nesting)
  // Exclude the group being edited itself to prevent self-parenting
  const sameNatureCandidates = groups.filter(g =>
    g.nature === selectedNature &&
    (!groupToEdit || g.id !== groupToEdit.id)
  )

  // Build indented display for parent dropdown showing hierarchy
  function buildParentOptions(parentId: string | null | undefined, depth: number): React.ReactNode[] {
    const children = sameNatureCandidates.filter(g => (g.parent_id ?? null) === (parentId ?? null))
    return children.flatMap(g => [
      <option key={g.id} value={g.id}>
        {'\u3000'.repeat(depth)}{depth > 0 ? '\u2514 ' : ''}{g.name}
      </option>,
      ...buildParentOptions(g.id, depth + 1)
    ])
  }

  const NATURE_DESCRIPTIONS: Record<string, string> = {
    ASSET:     'Things the business owns — cash, receivables, inventory, fixed assets',
    LIABILITY: 'Amounts the business owes — loans, payables, accruals',
    INCOME:    'Revenue earned — sales, service fees, commission income',
    EXPENSE:   'Money spent on operations — salaries, rent, utilities, COGS',
    EQUITY:    'Owner\'s stake — capital contributed, retained earnings',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{groupToEdit ? 'Edit Group Settings' : 'Create New Account Group'}</span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {apiError && (
              <div className="alert alert-danger" style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{apiError}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label required">Group / Folder Name</label>
              <input
                className={`form-control ${errors.name ? 'error' : ''}`}
                {...register('name')}
                placeholder="e.g. Office Expenses, Fixed Assets, Bank Loans"
              />
              {errors.name && <span className="form-error">{errors.name.message}</span>}
            </div>

            <div className="form-group">
              <label className="form-label required">Nature</label>
              <select className={`form-control ${errors.nature ? 'error' : ''}`} {...register('nature')}>
                <option value="ASSET">Business Owned (Asset)</option>
                <option value="LIABILITY">Amount We Owe (Liability)</option>
                <option value="INCOME">Money Earned (Income)</option>
                <option value="EXPENSE">Money Spent (Expense)</option>
                <option value="EQUITY">Owner Capital (Equity)</option>
              </select>
              {selectedNature && (
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 4, display: 'block' }}>
                  {NATURE_DESCRIPTIONS[selectedNature]}
                </span>
              )}
              {errors.nature && <span className="form-error">{errors.nature.message}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">
                Parent Group{' '}
                <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional — leave blank for top-level)</span>
              </label>
              <select className="form-control" {...register('parent_id')}>
                <option value="">— Root Level ({selectedNature ? NATURE_LABELS[selectedNature as Nature] : 'Group'}) —</option>
                {buildParentOptions(null, 0)}
              </select>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>
                Only shows existing groups of the same nature selected above.
              </span>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (groupToEdit ? 'Update Group' : 'Create Group')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Ledger Form Modal ----
function LedgerFormModal({ groups, companyId, ledgerToEdit, onClose, onSaved }: {
  groups: Group[]
  companyId: string
  ledgerToEdit?: Ledger
  onClose: () => void
  onSaved: () => void
}) {
  const [apiError, setApiError] = useState<string | null>(null)

  // Parse description for category (Direct/Indirect expense prefix)
  let defaultCategory = ''
  let defaultDesc = ledgerToEdit?.description || ''
  if (ledgerToEdit?.description) {
    const match = ledgerToEdit.description.match(/^\[(Direct|Indirect)\]\s*(.*)$/)
    if (match) {
      defaultCategory = match[1]
      defaultDesc = match[2]
    }
  }

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<LedgerForm>({
    resolver: zodResolver(ledgerSchema) as any,
    defaultValues: ledgerToEdit ? {
      name: ledgerToEdit.name,
      group_id: ledgerToEdit.group_id,
      opening_balance: ledgerToEdit.opening_balance,
      description: defaultDesc,
      classification: ledgerToEdit.classification || 'Nominal',
      phone: ledgerToEdit.phone || '',
      email: ledgerToEdit.email || '',
      vat_number: ledgerToEdit.vat_number || '',
      country: ledgerToEdit.country || 'Oman',
      address: ledgerToEdit.address || '',
      expense_category: defaultCategory || '',
    } : { opening_balance: 0, classification: 'Nominal', country: 'Oman', expense_category: '' },
  })

  const selectedGroupId = watch('group_id')
  const selectedGroup = groups.find(g => g.id === selectedGroupId)

  // Derive classification automatically from group nature — not user-editable
  function deriveClassification(nature?: string): 'Personal' | 'Real' | 'Nominal' {
    if (nature === 'EXPENSE' || nature === 'INCOME') return 'Nominal'
    if (nature === 'LIABILITY' || nature === 'EQUITY') return 'Personal'
    return 'Real' // ASSET default — cash, bank, stock, fixed assets
  }


  // Show contact fields only for party accounts (customers, suppliers, banks, capital)
  const isPartyAccount = selectedGroup?.nature === 'ASSET' || selectedGroup?.nature === 'LIABILITY' || selectedGroup?.nature === 'EQUITY'
  const isExpenseAccount = selectedGroup?.nature === 'EXPENSE'

  async function onSubmit(data: LedgerForm) {
    setApiError(null)
    const isEdit = !!ledgerToEdit
    const url = '/api/ledgers'
    const method = isEdit ? 'PUT' : 'POST'

    const sign = Number(data.opening_balance) < 0 ? 'Cr' : 'Dr'
    const absVal = Math.abs(Number(data.opening_balance))

    const finalDesc = isExpenseAccount && data.expense_category
      ? `[${data.expense_category}] ${data.description || ''}`
      : data.description || ''

    const { expense_category, ...submitData } = data as any
    const autoClassification = deriveClassification(selectedGroup?.nature)

    const payload = {
      ...submitData,
      description: finalDesc,
      opening_balance: absVal,
      opening_type: sign,
      classification: autoClassification,
      id: ledgerToEdit?.id,
      company_id: companyId,
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        onSaved()
      } else {
        const errData = await res.json()
        setApiError(errData.error || 'Failed to save ledger.')
      }
    } catch (e: any) {
      setApiError(e.message || 'An error occurred.')
    }
  }

  // Group the groups by nature for the optgroup dropdown
  const NATURE_ORDER: Nature[] = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY']
  const groupsByNature = NATURE_ORDER.reduce((acc, nat) => {
    acc[nat] = groups.filter(g => g.nature === nat)
    return acc
  }, {} as Record<Nature, Group[]>)

  // Nature badge color
  const NATURE_CHIP: Record<string, { bg: string; color: string; label: string }> = {
    ASSET:     { bg: 'var(--color-teal-pale)',    color: 'var(--color-teal)',          label: 'Asset' },
    LIABILITY: { bg: 'var(--color-warning-pale)', color: 'var(--color-warning-dark)',  label: 'Liability' },
    INCOME:    { bg: 'var(--color-success-pale)', color: 'var(--color-success-dark)',  label: 'Income' },
    EXPENSE:   { bg: 'var(--color-danger-pale)',  color: 'var(--color-danger-dark)',   label: 'Expense' },
    EQUITY:    { bg: 'var(--color-gold-pale)',    color: 'var(--color-gold-dark)',      label: 'Equity' },
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <span className="modal-title">{ledgerToEdit ? 'Edit Account Ledger' : 'Add Account Ledger'}</span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {apiError && (
              <div className="alert alert-danger" style={{ fontSize: '0.85rem' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{apiError}</span>
              </div>
            )}

            {/* Row 1: Account Name */}
            <div className="form-group">
              <label className="form-label required">Account Name</label>
              <input
                className={`form-control ${errors.name ? 'error' : ''}`}
                {...register('name')}
                placeholder="e.g. Bank Muscat, Office Rent, Sales Revenue"
              />
              {errors.name && <span className="form-error">{errors.name.message}</span>}
            </div>

            {/* Row 2: Under Group */}
            <div className="form-group">
              <label className="form-label required">Under Group / Folder</label>
              <select className={`form-control ${errors.group_id ? 'error' : ''}`} {...register('group_id')}>
                <option value="">— Select a Group —</option>
                {NATURE_ORDER.map(nat => groupsByNature[nat].length > 0 && (
                  <optgroup key={nat} label={`── ${NATURE_LABELS[nat]} ──`}>
                    {groupsByNature[nat].map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedGroup && NATURE_CHIP[selectedGroup.nature] && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 6,
                  padding: '2px 10px',
                  borderRadius: 20,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  background: NATURE_CHIP[selectedGroup.nature].bg,
                  color: NATURE_CHIP[selectedGroup.nature].color,
                }}>
                  {NATURE_CHIP[selectedGroup.nature].label} account
                </span>
              )}
              {errors.group_id && <span className="form-error">{errors.group_id.message}</span>}
            </div>

            {/* Row 3: Opening Balance (full width) */}
            <div className="form-group">
              <label className="form-label">Opening Balance (OMR)</label>
              <input
                type="number"
                step="0.001"
                className="form-control"
                placeholder="0.000"
                {...register('opening_balance')}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>
                Positive = Dr (Assets / Expenses) · Negative = Cr (Liabilities / Income)
              </span>
            </div>

            {/* Expense Direct / Indirect — only for EXPENSE groups */}
            {isExpenseAccount && (
              <div className="form-group">
                <label className="form-label required">Expense Type</label>
                <select className="form-control" {...register('expense_category')} required>
                  <option value="">— Select Expense Type —</option>
                  <option value="Direct">Direct Expense (COGS, Direct Labour, Raw Materials)</option>
                  <option value="Indirect">Indirect Expense (Rent, Utilities, Admin Salaries)</option>
                </select>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: 4, display: 'block' }}>
                  Direct expenses affect <strong>Gross Profit</strong>. Indirect expenses affect <strong>Net Profit</strong>.
                </span>
              </div>
            )}

            {/* Account Code — read only */}
            <div className="form-group">
              <label className="form-label">Account Code</label>
              <input
                className="form-control"
                disabled
                value={ledgerToEdit?.account_code || 'Auto-generated on save'}
                style={{ background: 'var(--color-surface-alt)', cursor: 'not-allowed', fontFamily: 'monospace' }}
              />
            </div>

            {/* Description */}
            <div className="form-group">
              <label className="form-label">Description / Remarks</label>
              <textarea
                className="form-control"
                {...register('description')}
                placeholder="Optional notes about this account..."
                style={{ height: 52, paddingTop: 8 }}
              />
            </div>

            {/* Contact Details — only for party accounts (Asset / Liability / Equity) */}
            {isPartyAccount && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0.25rem 0' }} />
                <h4 style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0, color: 'var(--color-text-secondary)' }}>
                  Contact Details <span style={{ fontWeight: 400 }}>(for Customers / Suppliers / Banks)</span>
                </h4>

                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input className="form-control" {...register('phone')} placeholder="+968 1234 5678" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input type="email" className="form-control" {...register('email')} placeholder="billing@company.com" />
                  </div>
                </div>

                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label className="form-label">VAT / TRN Number</label>
                    <input className="form-control" {...register('vat_number')} placeholder="OM123456789" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Country</label>
                    <input className="form-control" {...register('country')} placeholder="Oman" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Full Address</label>
                  <textarea
                    className="form-control"
                    {...register('address')}
                    placeholder="Building, Street, City, ZIP Code"
                    style={{ height: 52, paddingTop: 8 }}
                  />
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (ledgerToEdit ? 'Update Account' : 'Create Account')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Quick Add Customer / Supplier Modal ----
function QuickPartyModal({ type, groups, companyId, onClose, onSaved }: {
  type: 'customer' | 'supplier'
  groups: Group[]
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [balance, setBalance] = useState(0)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [address, setAddress] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleQuickSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      let targetGroupName = type === 'customer' ? 'Sundry Debtors' : 'Sundry Creditors'
      let targetGroupNature = type === 'customer' ? ('ASSET' as Nature) : ('LIABILITY' as Nature)
      
      let matchedGroup = groups.find(
        g => g.name.toLowerCase().includes(targetGroupName.toLowerCase()) && g.nature === targetGroupNature
      )

      let groupId = matchedGroup?.id

      if (!groupId) {
        let parentGroup = groups.find(
          g => g.name.toLowerCase().includes(type === 'customer' ? 'current asset' : 'current liability')
        )
        
        const grpRes = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: targetGroupName,
            nature: targetGroupNature,
            parent_id: parentGroup ? parentGroup.id : null,
            company_id: companyId,
          }),
        })

        if (!grpRes.ok) {
          const errData = await grpRes.json()
          throw new Error(errData.error || 'Failed to auto-create parent sub-group.')
        }

        const newGrp = await grpRes.json()
        groupId = newGrp.id
      }

      const balanceNum = Number(balance)
      const absVal = Math.abs(balanceNum)
      const sign = balanceNum < 0 ? 'Cr' : (type === 'customer' ? 'Dr' : 'Cr')

      const res = await fetch('/api/ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          group_id: groupId,
          opening_balance: absVal,
          opening_type: sign,
          classification: 'Personal',
          description: desc.trim() || `${type === 'customer' ? 'Customer' : 'Supplier'} ledger`,
          company_id: companyId,
          phone: phone.trim() || null,
          email: email.trim() || null,
          vat_number: vatNumber.trim() || null,
          country: 'Oman',
          address: address.trim() || null,
        }),
      })

      if (res.ok) {
        onSaved()
      } else {
        const errData = await res.json()
        setError(errData.error || 'Failed to create ledger.')
      }

    } catch (err: any) {
      setError(err.message || 'An error occurred during quick setup.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <span className="modal-title">
            Quick Add {type === 'customer' ? 'Customer' : 'Supplier'} Ledger
          </span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleQuickSave}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {error && (
              <div className="alert alert-danger" style={{ fontSize: '0.85rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '0.5rem 0.75rem', background: 'var(--color-teal-pale)', border: '1px solid var(--color-teal-muted)', borderRadius: 'var(--radius-md)' }}>
              Creates a <strong>Personal</strong> ledger under: <br/>
              <strong>{type === 'customer' ? 'Assets > Sundry Debtors' : 'Liabilities > Sundry Creditors'}</strong>
            </div>

            <div className="form-group">
              <label className="form-label required font-semibold">Name</label>
              <input
                className="form-control"
                placeholder={type === 'customer' ? 'ABC Trading' : 'XYZ LLC'}
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label font-semibold">Opening balance (OMR)</label>
              <input
                type="number"
                step="0.001"
                className="form-control"
                placeholder="Positive for Dr, Negative for Cr"
                value={balance || ''}
                onChange={e => setBalance(Number(e.target.value))}
              />
            </div>

            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input className="form-control" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+968 1234 5678" />
              </div>
              <div className="form-group">
                <label className="form-label">VAT ID Number</label>
                <input className="form-control" value={vatNumber} onChange={e => setVatNumber(e.target.value)} placeholder="OM123456789" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} placeholder="billing@domain.com" />
            </div>

            <div className="form-group">
              <label className="form-label">Address</label>
              <input className="form-control" value={address} onChange={e => setAddress(e.target.value)} placeholder="Muscat, Oman" />
            </div>

            <div className="form-group">
              <label className="form-label">Remarks / Description</label>
              <textarea
                className="form-control"
                placeholder="Notes..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
                style={{ height: 48, paddingTop: 8 }}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : `Create ${type === 'customer' ? 'Customer' : 'Supplier'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
