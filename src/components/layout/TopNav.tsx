'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/dashboard',             label: 'Dashboard' },
  { href: '/masters',               label: 'Chart of Accounts' },
  { href: '/vouchers',              label: 'Vouchers' },
  { href: '/reports/trial-balance', label: 'Trial Balance' },
  { href: '/reports/profit-loss',   label: 'Profit & Loss' },
  { href: '/reports/balance-sheet', label: 'Balance Sheet' },
]

export function TopNav() {
  const pathname = usePathname()
  const [companyName, setCompanyName] = useState('Tadbeer')

  useEffect(() => {
    import('@/lib/supabase/client').then(({ supabase }) => {
      supabase.from('settings').select('company_name').single().then(({ data }) => {
        if (data?.company_name) {
          setCompanyName(data.company_name)
        }
      })
    })
  }, [])

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname.startsWith(href)
  }

  // Split name for display
  const words = companyName.split(' ')
  const logoName = words[0] || 'Tadbeer'
  const logoSub = words.slice(1).join(' ') || 'transformations'

  return (
    <header className="topnav">
      {/* Logo */}
      <Link href="/dashboard" className="topnav-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Tadbeer"
          style={{
            width: 54,
            height: 54,
            objectFit: 'contain',
            objectPosition: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            display: 'block',
            mixBlendMode: 'multiply',
          }}
        />
        <div className="topnav-logo-text">
          <span className="topnav-logo-name">{logoName}</span>
          <span className="topnav-logo-sub">{logoSub}</span>
        </div>
      </Link>

      {/* Right actions */}
      <div className="topnav-actions">
        <Link href="/settings" className="topnav-action-btn">
          <Settings size={15} />
          <span>Settings</span>
        </Link>

        <div className="topnav-user">
          <div className="topnav-user-avatar">T</div>
          <div className="topnav-user-info">
            <span className="topnav-user-name">Admin</span>
            <span className="topnav-user-role">ADMIN</span>
          </div>
        </div>

        <button className="topnav-logout" onClick={() => supabase.auth.signOut()} title="Sign Out">
          <LogOut size={16} />
        </button>
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
