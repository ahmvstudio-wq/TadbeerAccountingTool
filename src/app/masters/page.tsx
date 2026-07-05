'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, AlertCircle, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Group, Ledger, Nature } from '@/lib/types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

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

// ---- Schemas ----
const groupSchema = z.object({
  name:      z.string().min(2, 'Name is required'),
  parent_id: z.string().optional().nullable(),
  nature:    z.enum(['ASSET','LIABILITY','INCOME','EXPENSE','EQUITY']),
})
const ledgerSchema = z.object({
  name:            z.string().min(2, 'Name is required'),
  group_id:        z.string().min(1, 'Select a group'),
  opening_balance: z.coerce.number().min(0),
  opening_type:    z.enum(['Dr','Cr']),
  description:     z.string().optional(),
})

type GroupForm  = z.infer<typeof groupSchema>
type LedgerForm = z.infer<typeof ledgerSchema>

export default function MastersPage() {
  const [groups,  setGroups]  = useState<Group[]>([])
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<'group' | 'ledger' | 'edit-group' | 'edit-ledger' | null>(null)
  
  const [activeGroup, setActiveGroup] = useState<Group | null>(null)
  const [activeLedger, setActiveLedger] = useState<Ledger | null>(null)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: g }, { data: l }] = await Promise.all([
      supabase.from('groups').select('*').order('sort_order'),
      supabase.from('ledgers').select('*, group:groups(id,name,nature)').order('name'),
    ])
    setGroups(g ?? [])
    setLedgers(l ?? [])
    setLoading(false)
  }, [])

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
    const res = await fetch(`/api/groups?id=${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      setError(err.error || 'Failed to delete group.')
    } else {
      loadData()
    }
  }

  async function deleteLedger(id: string) {
    const { count } = await supabase
      .from('journal_lines')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_id', id)
    if ((count ?? 0) > 0) {
      setError('Cannot delete: this account has transaction records posted to it.')
      return
    }
    const res = await fetch(`/api/ledgers?id=${id}`, { method: 'DELETE' })
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
          <button className="btn btn-outline" onClick={() => { setActiveGroup(null); setModal('group') }}>
            <Plus size={15} /> Add Group Folder
          </button>
          <button className="btn btn-primary" onClick={() => { setActiveLedger(null); setModal('ledger') }}>
            <Plus size={15} /> Add Account Ledger
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

      {/* Group Modal (Create) */}
      {modal === 'group' && (
        <GroupFormModal
          groups={groups}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData() }}
        />
      )}

      {/* Group Modal (Edit) */}
      {modal === 'edit-group' && activeGroup && (
        <GroupFormModal
          groups={groups}
          groupToEdit={activeGroup}
          onClose={() => { setModal(null); setActiveGroup(null) }}
          onSaved={() => { setModal(null); setActiveGroup(null); loadData() }}
        />
      )}

      {/* Ledger Modal (Create) */}
      {modal === 'ledger' && (
        <LedgerFormModal
          groups={groups}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData() }}
        />
      )}

      {/* Ledger Modal (Edit) */}
      {modal === 'edit-ledger' && activeLedger && (
        <LedgerFormModal
          groups={groups}
          ledgerToEdit={activeLedger}
          onClose={() => { setModal(null); setActiveLedger(null) }}
          onSaved={() => { setModal(null); setActiveLedger(null); loadData() }}
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
  const isOpen   = expanded[group.id] !== false // open by default
  const hasItems = children.length > 0 || ledgers.length > 0

  if (depth === 0) {
    // Root level cards
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{ledger.name}</span>
                      {Number(ledger.opening_balance) > 0 && (
                        <span className="text-muted text-xs">
                          (Start: {ledger.opening_type === 'Dr' ? '(+)' : '(-)'} {Number(ledger.opening_balance).toLocaleString()})
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.85rem' }}>{ledger.name}</span>
                  {Number(ledger.opening_balance) > 0 && (
                    <span className="text-muted text-xs">
                      (Start: {ledger.opening_type === 'Dr' ? '(+)' : '(-)'} {Number(ledger.opening_balance).toLocaleString()})
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
function GroupFormModal({ groups, groupToEdit, onClose, onSaved }: {
  groups: Group[]
  groupToEdit?: Group
  onClose: () => void
  onSaved: () => void
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<GroupForm>({
    resolver: zodResolver(groupSchema),
    defaultValues: groupToEdit ? {
      name: groupToEdit.name,
      parent_id: groupToEdit.parent_id,
      nature: groupToEdit.nature,
    } : { nature: 'ASSET' },
  })

  async function onSubmit(data: GroupForm) {
    const isEdit = !!groupToEdit
    const url = '/api/groups'
    const method = isEdit ? 'PUT' : 'POST'
    const payload = isEdit ? { ...data, id: groupToEdit.id } : data

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) onSaved()
  }

  // Prevent selecting self or own children as parent group
  const parentCandidates = groups.filter(g => !groupToEdit || g.id !== groupToEdit.id)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{groupToEdit ? 'Edit Folder Settings' : 'Create New Folder'}</span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label required">Folder / Category Name</label>
              <input className={`form-control ${errors.name ? 'error' : ''}`} {...register('name')} placeholder="e.g. Office Supplies" />
              {errors.name && <span className="form-error">{errors.name.message}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Parent Group (optional)</label>
              <select className="form-control" {...register('parent_id')}>
                <option value="">— None (Root Group) —</option>
                {parentCandidates.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
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
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Ledger Form Modal ----
function LedgerFormModal({ groups, ledgerToEdit, onClose, onSaved }: {
  groups: Group[]
  ledgerToEdit?: Ledger
  onClose: () => void
  onSaved: () => void
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LedgerForm>({
    resolver: zodResolver(ledgerSchema) as any,
    defaultValues: ledgerToEdit ? {
      name: ledgerToEdit.name,
      group_id: ledgerToEdit.group_id,
      opening_balance: ledgerToEdit.opening_balance,
      opening_type: ledgerToEdit.opening_type,
      description: ledgerToEdit.description || '',
    } : { opening_balance: 0, opening_type: 'Dr' },
  })

  async function onSubmit(data: LedgerForm) {
    const isEdit = !!ledgerToEdit
    const url = '/api/ledgers'
    const method = isEdit ? 'PUT' : 'POST'
    const payload = isEdit ? { ...data, id: ledgerToEdit.id } : data

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{ledgerToEdit ? 'Edit Account Settings' : 'Create New Account'}</span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label required">Account Name</label>
              <input className={`form-control ${errors.name ? 'error' : ''}`} {...register('name')} placeholder="e.g. Bank Muscat" />
              {errors.name && <span className="form-error">{errors.name.message}</span>}
            </div>
            <div className="form-group">
              <label className="form-label required">Under Group / Folder</label>
              <select className={`form-control ${errors.group_id ? 'error' : ''}`} {...register('group_id')}>
                <option value="">— Select Group —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {errors.group_id && <span className="form-error">{errors.group_id.message}</span>}
            </div>
            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label className="form-label">Starting Balance</label>
                <input type="number" step="0.01" className="form-control" {...register('opening_balance')} />
              </div>
              <div className="form-group">
                <label className="form-label">Starting Balance Value</label>
                <select className="form-control" {...register('opening_type')}>
                  <option value="Dr">Positive Balance (+)</option>
                  <option value="Cr">Due / Owing (-) </option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <textarea className="form-control" {...register('description')} placeholder="Add descriptive notes..." />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
