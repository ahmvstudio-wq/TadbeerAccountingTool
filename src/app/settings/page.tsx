'use client'
import { useEffect, useState } from 'react'
import { Save, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { CURRENCIES } from '@/lib/types'
import type { Settings } from '@/lib/types'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('*').single().then(({ data }) => {
      setSettings(data)
      setLoading(false)
    })
  }, [])

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
    await supabase.from('settings').update(updates).eq('id', settings.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <div className="skeleton" style={{ height: 400, borderRadius: 16 }} />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Company profile and accounting preferences</p>
        </div>
      </div>

      <div style={{ maxWidth: 640 }}>
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={18} style={{ color: 'var(--color-teal)' }} />
              <div className="card-title">Company Information</div>
            </div>
          </div>
          <form onSubmit={handleSave}>
            <div className="card-body">
              {saved && (
                <div className="alert alert-success">Settings saved successfully!</div>
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
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
