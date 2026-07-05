'use client'
import { usePathname } from 'next/navigation'
import { Bell, Settings } from 'lucide-react'
import Link from 'next/link'

const PAGE_TITLES: Record<string, { name: string; crumb: string }> = {
  '/dashboard':             { name: 'Dashboard',        crumb: 'Overview' },
  '/masters':               { name: 'Chart of Accounts', crumb: 'Setup → Masters' },
  '/vouchers':              { name: 'Vouchers',          crumb: 'Transactions → All Vouchers' },
  '/vouchers/new':          { name: 'New Voucher',       crumb: 'Transactions → New' },
  '/reports/trial-balance': { name: 'Trial Balance',     crumb: 'Reports' },
  '/reports/profit-loss':   { name: 'Profit & Loss',     crumb: 'Reports' },
  '/reports/balance-sheet': { name: 'Balance Sheet',     crumb: 'Reports' },
  '/settings':              { name: 'Settings',          crumb: 'System' },
}

export function Header() {
  const pathname = usePathname()
  const meta = PAGE_TITLES[pathname] ?? { name: 'Tadbeer', crumb: '' }

  const today = new Date().toLocaleDateString('en-OM', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <header className="header">
      <div className="header-title">
        <span className="header-page-name">{meta.name}</span>
        <span className="header-breadcrumb">{today}</span>
      </div>

      <div className="header-actions">
        <button className="btn btn-ghost btn-sm" style={{ width: 36, height: 36, padding: 0, borderRadius: 8 }}>
          <Bell size={16} />
        </button>
        <Link href="/settings" className="btn btn-ghost btn-sm" style={{ width: 36, height: 36, padding: 0, borderRadius: 8 }}>
          <Settings size={16} />
        </Link>
        <div style={{
          width: 36, height: 36,
          background: 'var(--color-teal)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 600, fontSize: 14,
        }}>
          T
        </div>
      </div>
    </header>
  )
}
