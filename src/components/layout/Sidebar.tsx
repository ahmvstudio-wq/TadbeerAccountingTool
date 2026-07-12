'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  FileText,
  Settings,
  ChevronRight,
  TrendingUp,
  ShoppingCart,
  CreditCard,
  Receipt,
  BookMarked,
  Box,
} from 'lucide-react'

const NAV_SECTIONS = [
  {
    label: 'Setup',
    items: [
      { href: '/masters', label: 'Chart of Accounts', icon: <BookOpen size={18} /> },
      { href: '/items', label: 'Services Registry', icon: <Box size={18} /> },
    ],
  },
  {
    label: 'Vouchers',
    items: [
      { href: '/vouchers/sales', label: 'Sales Voucher', icon: <TrendingUp size={18} /> },
      { href: '/vouchers/purchase', label: 'Purchase Voucher', icon: <ShoppingCart size={18} /> },
      { href: '/vouchers/payment', label: 'Payment Voucher', icon: <CreditCard size={18} /> },
      { href: '/vouchers/receipt', label: 'Receipt Voucher', icon: <Receipt size={18} /> },
      { href: '/vouchers/journal', label: 'Journal Voucher', icon: <BookMarked size={18} /> },
    ],
  },
  {
    label: 'Registry',
    items: [
      { href: '/vouchers', label: 'All Vouchers', icon: <FileText size={18} /> },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', label: 'Company Settings', icon: <Settings size={18} /> },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/masters') return pathname === '/masters' || pathname === '/'
    if (href === '/vouchers') return pathname === '/vouchers'
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
          <span className="sidebar-company-name">Tadbeer Transformations</span>
          <span>Accounting MVP v1.0</span>
        </div>
      </div>
    </aside>
  )
}
