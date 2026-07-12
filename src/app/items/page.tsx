'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Pencil, Trash2, AlertCircle, ShoppingBag } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Item } from '@/lib/types'
import { useUIStore } from '@/store/ui'
import { ItemFormModal } from '@/components/inventory/ItemFormModal'

export default function ItemsPage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [activeItem, setActiveItem] = useState<Item | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('items')
      .select('*')
      .eq('company_id', currentCompanyId)
      .order('name')
    
    if (error) {
      setError(error.message)
    } else {
      setItems(data ?? [])
    }
    setLoading(false)
  }, [currentCompanyId])

  useEffect(() => { loadItems() }, [loadItems])

  function handleCreate() {
    setActiveItem(null)
    setModal('create')
  }

  function handleEdit(item: Item) {
    setActiveItem(item)
    setModal('edit')
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this service line?')) return
    setError(null)
    try {
      const res = await fetch(`/api/items?id=${id}&company_id=${currentCompanyId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        loadItems()
      } else {
        const err = await res.json()
        setError(err.error || 'Failed to delete service line.')
      }
    } catch {
      setError('Network error.')
    }
  }

  const filtered = items.filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      item.name.toLowerCase().includes(q) ||
      (item.code && item.code.toLowerCase().includes(q))
    )
  })

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Services & Pricing Registry</h1>
          <p className="page-subtitle">Track and configure consulting service lines, standard billing rates, billing units, VAT classes, and default ledgers.</p>
        </div>
        <div>
          <button className="btn btn-primary btn-sm" onClick={handleCreate}>
            <Plus size={16} /> Add Service Line
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={16} /><span>{error}</span>
        </div>
      )}

      {/* Filter and Search */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input className="form-control" placeholder="Search service lines..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, height: 38 }} />
        </div>
      </div>

      {/* Grid or Table list */}
      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Service Code</th>
                <th>Service Name</th>
                <th>Billing Unit / Type</th>
                <th style={{ textAlign: 'right' }}>Default Cost Price</th>
                <th style={{ textAlign: 'right' }}>Default Billing Rate</th>
                <th style={{ textAlign: 'right' }}>VAT %</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Loading services...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    <ShoppingBag size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <p style={{ margin: 0 }}>No service lines registered yet.</p>
                  </td>
                </tr>
              ) : filtered.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{item.code || '—'}</td>
                  <td><strong style={{ fontSize: '0.9rem' }}>{item.name}</strong></td>
                  <td><span className="badge badge-teal" style={{ textTransform: 'capitalize' }}>{item.unit}</span></td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {item.buy_price > 0 ? Number(item.buy_price).toLocaleString('en-US', { minimumFractionDigits: 3 }) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--color-teal)' }}>
                    {Number(item.sell_price).toLocaleString('en-US', { minimumFractionDigits: 3 })}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(item.tax_rate).toFixed(1)}%
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(item)} title="Edit"><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(item.id)} title="Delete" style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item modal */}
      {modal && (
        <ItemFormModal
          companyId={currentCompanyId}
          itemToEdit={activeItem || undefined}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadItems() }}
        />
      )}
    </div>
  )
}
