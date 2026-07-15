'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Settings, BarChart3, BookOpen, FileText, LayoutDashboard, Box, HelpCircle } from 'lucide-react'
import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import { useUIStore } from '@/store/ui'

const NAV_ITEMS = [
  { href: '/masters',               label: 'Chart of Accounts', icon: <BookOpen size={14} /> },
  { href: '/items',                 label: 'Services Registry', icon: <Box size={14} /> },
  { href: '/vouchers/sales',        label: 'Sales Voucher', icon: <FileText size={14} /> },
  { href: '/vouchers/purchase',     label: 'Purchase Voucher', icon: <FileText size={14} /> },
  { href: '/vouchers/payment',      label: 'Payment Voucher', icon: <FileText size={14} /> },
  { href: '/vouchers/receipt',      label: 'Receipt Voucher', icon: <FileText size={14} /> },
  { href: '/vouchers/journal',      label: 'Journal Voucher', icon: <FileText size={14} /> },
  { href: '/vouchers',              label: 'Voucher Registry', icon: <FileText size={14} /> },
]

export function TopNav() {
  const pathname = usePathname()
  const activeCompanyId = useUIStore(state => state.activeCompanyId)
  const activeCompanyName = useUIStore(state => state.activeCompanyName)
  const userRole = useUIStore(state => state.userRole)
  const setActiveCompany = useUIStore(state => state.setActiveCompany)

  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])

  // Load companies
  useEffect(() => {
    async function loadCompanies() {
      const { data } = await supabase.from('companies').select('id, name')
      if (data) {
        setCompanies(data)
        // Fallback active company if null
        if (!activeCompanyId && data.length > 0) {
          setActiveCompany(data[0].id, data[0].name)
        }
      }
    }
    loadCompanies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname.startsWith(href)
  }

  // Split name for display
  const words = (activeCompanyName || 'Tadbeer Transformations').split(' ')
  const logoName = words[0] || 'Tadbeer'
  const logoSub = words.slice(1).join(' ') || 'Transformations'

  return (
    <header className="topnav" style={{ display: 'flex', flexDirection: 'column', height: 'auto', padding: '0.15rem 2rem 0.5rem' }}>
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '0.5rem' }}>
        {/* Logo */}
        <Link href="/dashboard" className="topnav-logo" style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Logo .png"
            alt="Tadbeer"
            style={{
              height: 68,
              width: 'auto',
              objectFit: 'contain',
              background: 'transparent',
            }}
          />
        </Link>

        {/* Center: Company Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Active Entity:</span>
          <select
            value={activeCompanyId || ''}
            onChange={e => {
              const selected = companies.find(c => c.id === e.target.value)
              if (selected) {
                setActiveCompany(selected.id, selected.name)
              }
            }}
            style={{
              height: 34,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              padding: '0 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--color-teal)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Right actions */}
        <div className="topnav-actions" style={{ gap: '0.75rem' }}>
          <Link href="/settings" className="topnav-action-btn" style={{ height: 34, borderRadius: 'var(--radius-md)' }}>
            <Settings size={14} />
            <span>Settings</span>
          </Link>

          <div className="topnav-user" style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-md)' }}>
            <div className="topnav-user-avatar" style={{ width: 26, height: 26, fontSize: '0.75rem' }}>
              {(userRole || 'A').substring(0, 1)}
            </div>
            <div className="topnav-user-info">
              <span className="topnav-user-name" style={{ fontSize: '0.75rem' }}>User Context</span>
              <span className="topnav-user-role" style={{ fontSize: '0.6rem' }}>{userRole || 'ADMIN'}</span>
            </div>
          </div>

          <button className="topnav-logout" style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)' }} onClick={() => supabase.auth.signOut()} title="Sign Out">
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Row 2) */}
      <div style={{ width: '100%', display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.4rem 0 0.1rem', scrollbarWidth: 'none' }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.35rem 0.85rem',
                fontSize: '0.75rem',
                fontWeight: active ? 700 : 500,
                color: active ? '#fff' : 'var(--color-text-secondary)',
                backgroundColor: active ? 'var(--color-teal)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--t-fast)',
                border: active ? '1px solid var(--color-teal)' : '1px solid transparent',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'var(--color-border-light)'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </header>
  )
}

export function PageTabs({
  title,
  subtitle,
  tabs,
  activeTab,
}: {
  title: string
  subtitle?: string
  tabs?: { label: string; value: string; icon?: React.ReactNode }[]
  activeTab?: string
}) {
  return (
    <div className="page-tabs-bar">
      <div className="page-tabs-left">
        <h1 className="page-tabs-title">{title}</h1>
        {subtitle && <p className="page-tabs-subtitle">{subtitle}</p>}
      </div>
      {tabs && tabs.length > 0 && (
        <div className="page-tabs-right">
          {tabs.map(tab => (
            <button
              key={tab.value}
              className={`page-tab ${activeTab === tab.value ? 'active' : ''}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Sub-nav for reports
export function SubNav() {
  const pathname = usePathname()
  const REPORT_TABS = [
    { href: '/reports/ledgers',       label: 'General Ledger' },
    { href: '/reports/trial-balance', label: 'Trial Balance' },
    { href: '/reports/profit-loss',   label: 'Profit & Loss' },
    { href: '/reports/balance-sheet', label: 'Balance Sheet' },
  ]
  const isReport = pathname.startsWith('/reports')
  if (!isReport) return null

  return (
    <div className="subnav">
      {REPORT_TABS.map(t => (
        <Link key={t.href} href={t.href} className={`subnav-tab ${pathname === t.href ? 'active' : ''}`}>
          {t.label}
        </Link>
      ))}
    </div>
  )
}
