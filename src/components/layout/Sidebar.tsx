'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  BarChart3,
  Settings,
  ChevronRight,
  Users,
  TrendingUp,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/masters', label: 'Chart of Accounts', icon: <BookOpen size={18} /> },
    ],
  },
  {
    label: 'Transactions',
    items: [
      { href: '/vouchers', label: 'Vouchers', icon: <FileText size={18} /> },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/reports/trial-balance', label: 'Trial Balance',   icon: <BarChart3 size={18} /> },
      { href: '/reports/profit-loss',   label: 'Profit & Loss',   icon: <TrendingUp size={18} /> },
      { href: '/reports/balance-sheet', label: 'Balance Sheet',   icon: <Users size={18} /> },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: <Settings size={18} /> },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{
          width: 36, height: 36,
          background: 'rgba(201,168,76,0.15)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ color: '#C9A84C', fontWeight: 700, fontSize: 18, fontFamily: 'serif' }}>ت</span>
        </div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">Tadbeer</span>
          <span className="sidebar-logo-sub">Accounting</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
                {isActive(item.href) && (
                  <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.7 }} />
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-company">
          <span className="sidebar-company-name">My Company</span>
          <span>Tadbeer Accounting v1.0</span>
        </div>
      </div>
    </aside>
  )
}
