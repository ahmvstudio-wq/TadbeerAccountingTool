'use client'
import { useEffect, useState, useCallback } from 'react'
import { Save, Building2, Users, UserCheck, Trash2, AlertCircle } from 'lucide-react'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import { CURRENCIES } from '@/lib/types'
import type { Settings } from '@/lib/types'
import { useUIStore } from '@/store/ui'

export default function SettingsPage() {
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const currentCompanyId = activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'
  const userRole = useUIStore(state => state.userRole)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // User list states
  const [memberships, setMemberships] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserRole, setNewUserRole] = useState<'Admin' | 'Finance Mgr' | 'Accountant' | 'Auditor' | 'Viewer'>('Accountant')
  const [memberError, setMemberError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('settings')
      .select('*')
      .eq('company_id', currentCompanyId)
      .maybeSingle()

    if (data) {
      setSettings(data)
    } else {
      // Create settings record if none exists for this company
      const { data: newRec } = await supabase
        .from('settings')
        .insert({
          company_name: 'Tadbeer Entity',
          base_currency: 'OMR',
          company_id: currentCompanyId,
        } as any)
        .select()
        .single()
      if (newRec) setSettings(newRec)
    }
    setLoading(false)
  }, [currentCompanyId])

  const loadMembers = useCallback(async () => {
    if (userRole !== 'Admin') return
    setLoadingMembers(true)
    // Fetch user mappings
    const { data } = await supabase
      .from('user_companies')
      .select('*')
      .eq('company_id', currentCompanyId)
    setMemberships(data || [])
    setLoadingMembers(false)
  }, [currentCompanyId, userRole])

  useEffect(() => {
    loadSettings()
    loadMembers()
  }, [loadSettings, loadMembers])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    const form = e.currentTarget
    const fd = new FormData(form)
    const updates = {
      company_name:          fd.get('company_name') as string,
      base_currency:         fd.get('base_currency') as string,
      financial_year_start:  fd.get('financial_year_start') as string,
      address:               fd.get('address') as string,
      phone:                 fd.get('phone') as string,
      email:                 fd.get('email') as string,
    }
    await supabase
      .from('settings')
      .update(updates)
      .eq('company_id', currentCompanyId)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Update member role
  async function updateMemberRole(userId: string, newRole: string) {
    setMemberError(null)
    const { error } = await supabase
      .from('user_companies')
      .update({ role: newRole })
      .eq('company_id', currentCompanyId)
      .eq('user_id', userId)

    if (error) {
      setMemberError(error.message)
    } else {
      loadMembers()
    }
  }

  // Remove member membership
  async function removeMember(userId: string) {
    setMemberError(null)
    const { error } = await supabase
      .from('user_companies')
      .delete()
      .eq('company_id', currentCompanyId)
      .eq('user_id', userId)

    if (error) {
      setMemberError(error.message)
    } else {
      loadMembers()
    }
  }

  // Add Member helper
  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    setMemberError(null)
    if (!newUserEmail.trim()) return

    // Note: Since Supabase Client cannot directly look up auth.users by email without Admin keys,
    // we query a mock user registration lookup or let users use a predefined whitelist ID
    // For demo/UX consistency, we find the current user's session or search for user_companies rows
    // To allow adding, we look up if that user exists or we insert a new membership using the provided ID.
    // If the input is a valid UUID, we insert it. If it is an email, we search if we can match or throw a friendly tip.
    let userId = newUserEmail.trim()
    
    // Check if user is one of the whitelisted emails, resolve to predefined IDs in seed
    if (userId.toLowerCase() === 'operation@tadbeertt.com') {
      userId = 'a8b9c1d2-e3f4-5678-abcd-1234567890a1'
    } else if (userId.toLowerCase() === 'w.taufiqq@gmail.com') {
      userId = 'a8b9c1d2-e3f4-5678-abcd-1234567890a2'
    }

    const { error } = await supabase
      .from('user_companies')
      .insert({
        user_id: userId,
        company_id: currentCompanyId,
        role: newUserRole,
      } as any)

    if (error) {
      setMemberError('Failed to associate user. Ensure you entered a valid User UUID or authorized email.')
    } else {
      setNewUserEmail('')
      loadMembers()
    }
  }

  const emailMapping: Record<string, string> = {
    'a8b9c1d2-e3f4-5678-abcd-1234567890a1': 'operation@tadbeertt.com',
    'a8b9c1d2-e3f4-5678-abcd-1234567890a2': 'w.taufiqq@gmail.com',
  }

  if (loading) return <div className="skeleton" style={{ height: 400, borderRadius: 16 }} />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Corporate Settings</h1>
          <p className="page-subtitle">Configure company profiles, accounting standard preferences, and user access permissions.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '2rem' }}>
        {/* Company Settings card */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={18} style={{ color: 'var(--color-teal)' }} />
              <div className="card-title">Company Profile</div>
            </div>
          </div>
          <form onSubmit={handleSave}>
            <div className="card-body">
              {saved && (
                <div className="alert alert-success">Company settings saved successfully!</div>
              )}
              <div className="form-group">
                <label className="form-label required">Company Name</label>
                <input name="company_name" className="form-control" defaultValue={settings?.company_name} required />
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label required">Base Currency</label>
                  <select name="base_currency" className="form-control" defaultValue={settings?.base_currency ?? 'OMR'}>
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Financial Year Start</label>
                  <input type="date" name="financial_year_start" className="form-control" defaultValue={settings?.financial_year_start?.split('T')[0]} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea name="address" className="form-control" defaultValue={settings?.address ?? ''} placeholder="Company address..." />
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input name="phone" className="form-control" defaultValue={settings?.phone ?? ''} placeholder="+968 xxxx xxxx" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" name="email" className="form-control" defaultValue={settings?.email ?? ''} placeholder="info@company.com" />
                </div>
              </div>
            </div>
            <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>

        {/* User Management card (RBAC) */}
        {userRole === 'Admin' && (
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} style={{ color: 'var(--color-gold-dark)' }} />
                <div className="card-title">User Permissions (RBAC)</div>
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {memberError && (
                <div className="alert alert-danger" style={{ fontSize: '0.8rem' }}>
                  <AlertCircle size={16} />
                  <span>{memberError}</span>
                </div>
              )}

              {/* Members Table */}
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>User Account</th>
                      <th>Assigned Role</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMembers ? (
                      <tr><td colSpan={3} style={{ textAlign: 'center', padding: '1rem' }}>Syncing users...</td></tr>
                    ) : memberships.map(m => (
                      <tr key={m.id}>
                        <td style={{ fontSize: '0.8rem' }}>
                          <strong>{emailMapping[m.user_id] || 'External Associate'}</strong> <br/>
                          <span className="text-muted" style={{ fontSize: '0.7rem' }}>ID: {m.user_id.substring(0,8)}...</span>
                        </td>
                        <td>
                          <select
                            className="form-control"
                            value={m.role}
                            onChange={e => updateMemberRole(m.user_id, e.target.value)}
                            style={{ height: 32, fontSize: '0.75rem', padding: '0 0.5rem', width: 'auto' }}
                          >
                            <option value="Admin">Admin</option>
                            <option value="Finance Mgr">Finance Mgr</option>
                            <option value="Accountant">Accountant</option>
                            <option value="Auditor">Auditor</option>
                            <option value="Viewer">Viewer</option>
                          </select>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeMember(m.user_id)}
                            style={{ color: 'var(--color-danger)', width: 28, height: 28, padding: 0 }}
                            title="Revoke access"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add User Panel */}
              <form onSubmit={handleAddMember} style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '1.25rem' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  Associate New Corporate Member
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="Enter User ID or Authorized Email"
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    style={{ flex: 1, minWidth: 160, height: 36, fontSize: '0.8rem' }}
                  />
                  <select
                    className="form-control"
                    value={newUserRole}
                    onChange={e => setNewUserRole(e.target.value as any)}
                    style={{ width: 120, height: 36, fontSize: '0.8rem' }}
                  >
                    <option value="Admin">Admin</option>
                    <option value="Finance Mgr">Finance Mgr</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Auditor">Auditor</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ height: 36 }}>
                    <UserCheck size={14} /> Add
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
