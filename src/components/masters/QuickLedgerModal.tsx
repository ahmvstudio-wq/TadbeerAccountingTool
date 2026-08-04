'use client'

import React, { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'

export type QuickLedgerType = 'customer' | 'supplier' | 'general'

type Nature = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'

export function QuickLedgerModal({ type, companyId, onClose, onSaved }: {
  type: QuickLedgerType
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [balance, setBalance] = useState(0)
  const [openingType, setOpeningType] = useState('Dr')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [address, setAddress] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState<any[]>([])
  
  React.useEffect(() => {
    fetch('/api/groups')
      .then(res => res.json())
      .then(data => setGroups(data))
      .catch(err => console.error('Failed to load groups for quick modal:', err))
  }, [])

  const isParty = type === 'customer' || type === 'supplier'

  async function handleQuickSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    
    if (!isParty && !groupId) {
      setError('Please select a parent group.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      let finalGroupId = groupId

      if (isParty) {
        let targetGroupName = type === 'customer' ? 'Sundry Debtors' : 'Sundry Creditors'
        let targetGroupNature = type === 'customer' ? ('ASSET' as Nature) : ('LIABILITY' as Nature)
        
        let matchedGroup = groups.find(
          (g: any) => g.name.toLowerCase().includes(targetGroupName.toLowerCase()) && g.nature === targetGroupNature
        )
  
        finalGroupId = matchedGroup?.id
  
        if (!finalGroupId) {
          let parentGroup = groups.find(
            (g: any) => g.name.toLowerCase().includes(type === 'customer' ? 'current asset' : 'current liability')
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
          finalGroupId = newGrp.id
        }
      }

      const balanceNum = Number(balance)
      const absVal = Math.abs(balanceNum)
      let sign = openingType
      
      if (isParty) {
        sign = balanceNum < 0 ? 'Cr' : (type === 'customer' ? 'Dr' : 'Cr')
      }

      const res = await fetch('/api/ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          group_id: finalGroupId,
          opening_balance: absVal,
          opening_type: sign,
          classification: isParty ? 'Personal' : 'Real', // Or let user choose for general
          description: desc.trim() || (isParty ? `${type === 'customer' ? 'Customer' : 'Supplier'} ledger` : 'General ledger'),
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

  // Filter groups for dropdown if general
  const groupOptions = groups.filter(g => !g.is_ledger).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, zIndex: 10000 }}>
        <div className="modal-header">
          <span className="modal-title">
            Quick Add {type === 'customer' ? 'Customer' : type === 'supplier' ? 'Supplier' : 'Ledger'}
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
            
            {isParty ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '0.5rem 0.75rem', background: 'var(--color-teal-pale)', border: '1px solid var(--color-teal-muted)', borderRadius: 'var(--radius-md)' }}>
                Creates a <strong>Personal</strong> ledger under: <br/>
                <strong>{type === 'customer' ? 'Assets > Sundry Debtors' : 'Liabilities > Sundry Creditors'}</strong>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label required font-semibold">Parent Group</label>
                <select className="form-control" value={groupId} onChange={e => setGroupId(e.target.value)} required>
                  <option value="">-- Select Group --</option>
                  {groupOptions.map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.nature})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label required font-semibold">Name</label>
              <input
                className="form-control"
                placeholder={isParty ? (type === 'customer' ? 'ABC Trading' : 'XYZ LLC') : 'e.g., Office Supplies'}
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label font-semibold">Opening Balance (Optional)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  step="0.001"
                  className="form-control"
                  placeholder="0.000"
                  value={balance || ''}
                  onChange={e => setBalance(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                {!isParty && (
                  <select className="form-control" style={{ width: '80px' }} value={openingType} onChange={e => setOpeningType(e.target.value)}>
                    <option value="Dr">Dr</option>
                    <option value="Cr">Cr</option>
                  </select>
                )}
              </div>
            </div>
            
            {isParty && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div className="form-group">
                  <label className="form-label font-semibold">Phone</label>
                  <input className="form-control" placeholder="+968..." value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label font-semibold">VAT Number</label>
                  <input className="form-control" placeholder="Tax ID" value={vatNumber} onChange={e => setVatNumber(e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label font-semibold">Email</label>
                  <input type="email" className="form-control" placeholder="contact@company.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label font-semibold">Address</label>
                  <input className="form-control" placeholder="Muscat, Oman" value={address} onChange={e => setAddress(e.target.value)} />
                </div>
              </div>
            )}
            
            <div className="form-group">
              <label className="form-label font-semibold">Description (Optional)</label>
              <input className="form-control" placeholder="Internal notes" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Ledger'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
