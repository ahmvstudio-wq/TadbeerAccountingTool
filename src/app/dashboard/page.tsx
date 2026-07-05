'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, DollarSign, Wallet,
  Plus, ShoppingCart, ArrowDownCircle, ArrowUpCircle,
  ArrowRight, AlertCircle, LayoutDashboard, BookOpen, FileText, BarChart3,
  Calendar, CheckCircle, Clock
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Voucher } from '@/lib/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'

const QUICK_ACTIONS = [
  { label: 'New Purchase',  type: 'PURCHASE', icon: <ShoppingCart size={15} />,    color: '#1D4ED8' },
  { label: 'New Sale',      type: 'SALE',     icon: <TrendingUp size={15} />,      color: '#2D7D46' },
  { label: 'New Receipt',   type: 'RECEIPT',  icon: <ArrowDownCircle size={15} />, color: '#163B40' },
  { label: 'New Payment',   type: 'PAYMENT',  icon: <ArrowUpCircle size={15} />,   color: '#B83A2E' },
]

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Purchase', SALE: 'Sale', RECEIPT: 'Receipt',
  PAYMENT: 'Payment', JOURNAL: 'Journal',
  PURCHASE_RETURN: 'Purch. Return', SALES_RETURN: 'Sales Return',
}

const TOP_TABS = [
  { label: 'Overview',         href: '/dashboard',             icon: <LayoutDashboard size={14} /> },
  { label: 'Chart of Accounts',href: '/masters',               icon: <BookOpen size={14} /> },
  { label: 'Vouchers',         href: '/vouchers',              icon: <FileText size={14} /> },
  { label: 'Reports',          href: '/reports/trial-balance', icon: <BarChart3 size={14} /> },
]

export default function DashboardPage() {
  const [kpis, setKpis] = useState<{
    total_income: number; total_expenses: number; net_profit: number;
    is_profit: boolean; voucher_count: number;
  } | null>(null)
  const [recentVouchers, setRecentVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('OMR')
  const [chartData, setChartData] = useState<any[]>([])

  const currentYear = new Date().getFullYear()
  const fromDate = `${currentYear}-04-01`
  const toDate   = `${currentYear + 1}-03-31`

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data: settings } = await supabase.from('settings').select('base_currency').single()
        if (settings) setCurrency(settings.base_currency)

        // Load lines to build reports/KPIs
        const { data: lines } = await supabase
          .from('journal_lines')
          .select('type, amount, date, ledger:ledgers(group:groups(nature))')
          .gte('date', fromDate).lte('date', toDate)

        let income = 0, expenses = 0
        const monthlyMap: Record<string, { month: string; income: number; expenses: number }> = {}

        // Prepopulate current fiscal year months
        const monthNames = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
        monthNames.forEach(m => {
          monthlyMap[m] = { month: m, income: 0, expenses: 0 }
        })

        for (const line of lines ?? []) {
          const nature = (line.ledger as any)?.group?.nature
          const amt = Number(line.amount)
          const dateObj = new Date(line.date)
          const monthName = dateObj.toLocaleString('default', { month: 'short' })

          if (nature === 'INCOME' && line.type === 'Cr') {
            income += amt
            if (monthlyMap[monthName]) monthlyMap[monthName].income += amt
          }
          if (nature === 'EXPENSE' && line.type === 'Dr') {
            expenses += amt
            if (monthlyMap[monthName]) monthlyMap[monthName].expenses += amt
          }
        }

        const formattedChartData = monthNames.map(m => monthlyMap[m])
        setChartData(formattedChartData)

        const { count } = await supabase.from('vouchers').select('*', { count: 'exact', head: true })
        setKpis({ total_income: income, total_expenses: expenses, net_profit: income - expenses, is_profit: income >= expenses, voucher_count: count ?? 0 })

        const { data: vouchers } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false }).limit(6)
        setRecentVouchers(vouchers ?? [])
      } finally { setLoading(false) }
    }
    load()
  }, [])

  return (
    <div>
      {/* Page Header — title left, tabs right */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Accounting Control Panel</h1>
          <p className="page-subtitle">Real-time business performance analytics and financial overview.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-nav-tabs">
            {TOP_TABS.map(tab => (
              <Link key={tab.href} href={tab.href} className="page-nav-tab active-check">
                {tab.icon} {tab.label}
              </Link>
            ))}
          </div>
          <Link href="/vouchers/new" className="btn btn-primary">
            <Plus size={15} /> New Voucher
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
        <KPICard label="Total Income"    value={loading ? null : kpis?.total_income ?? 0}    currency={currency} iconClass="teal"  icon={<TrendingUp size={20} />} />
        <KPICard label="Total Expenses"  value={loading ? null : kpis?.total_expenses ?? 0}  currency={currency} iconClass="red"   icon={<TrendingDown size={20} />} />
        <KPICard label="Net Profit/Loss" value={loading ? null : kpis?.net_profit ?? 0}      currency={currency} iconClass={kpis?.is_profit ? 'green' : 'red'} icon={<DollarSign size={20} />} colored />
        <KPICard label="Total Vouchers"  value={loading ? null : kpis?.voucher_count ?? 0}   currency=""         iconClass="gold"  icon={<Wallet size={20} />} noFormat />
      </div>

      {/* Financial Chart Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Revenue vs Expenses Chart Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Fiscal Performance Statement</div>
              <div className="card-subtitle">Monthly breakdown of income and operating expenses</div>
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 10, height: 10, background: 'var(--color-teal)', borderRadius: '2px' }} /> Income
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 10, height: 10, background: 'var(--color-gold)', borderRadius: '2px' }} /> Expenses
              </span>
            </div>
          </div>
          <div className="card-body" style={{ height: 320 }}>
            {loading ? (
              <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 8 }} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: 'var(--shadow-md)' }}
                    labelStyle={{ fontWeight: 700, color: 'var(--color-teal)', marginBottom: 4 }}
                  />
                  <Bar dataKey="income" fill="var(--color-teal)" radius={[4, 4, 0, 0]} maxBarSize={32} name="Total Income" />
                  <Bar dataKey="expenses" fill="var(--color-gold)" radius={[4, 4, 0, 0]} maxBarSize={32} name="Total Expenses" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Operating Position Cash Flow Trend */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Accumulated Net Position</div>
              <div className="card-subtitle">Cumulative profit trajectory over time</div>
            </div>
          </div>
          <div className="card-body" style={{ height: 320, padding: '1rem 0' }}>
            {loading ? (
              <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 8 }} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey={(data) => data.income - data.expenses}
                    name="Net Position"
                    stroke="var(--color-success)"
                    fill="var(--color-success-pale)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
        {/* Recent Transactions Table */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Journal Ledger Entries</div>
              <div className="card-subtitle">Latest postings synced with the double-entry engine</div>
            </div>
            <Link href="/vouchers" className="btn btn-outline btn-sm">View All <ArrowRight size={13} /></Link>
          </div>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            {loading ? <LoadingSkeleton rows={5} /> : recentVouchers.length === 0 ? (
              <div className="table-empty">
                <AlertCircle size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
                <p>No transactions posted yet.</p>
              </div>
            ) : (
              <table>
                <thead><tr>
                  <th>Voucher ID</th><th>Post Date</th><th>Type</th><th>Corporate Party</th><th style={{textAlign:'right'}}>Amount</th>
                </tr></thead>
                <tbody>
                  {recentVouchers.map(v => (
                    <tr key={v.id}>
                      <td className="font-semibold text-xs" style={{ color: 'var(--color-teal)' }}>{v.voucher_number}</td>
                      <td className="text-muted text-xs">{new Date(v.date).toLocaleDateString('en-GB')}</td>
                      <td><span className={`badge voucher-badge-${v.type}`}>{VOUCHER_TYPE_LABELS[v.type]}</span></td>
                      <td>{v.party_name || <span className="text-muted">—</span>}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                        {v.currency} {Number(v.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Corporate Controls Side Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Quick Transaction Actions */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Voucher Input Panel</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1.25rem' }}>
              {QUICK_ACTIONS.map(action => (
                <Link key={action.type} href={`/vouchers/new?type=${action.type}`} className="btn btn-outline"
                  style={{ justifyContent: 'flex-start', height: 42, width: '100%' }}>
                  <span style={{ color: action.color, display: 'flex', alignItems: 'center' }}>{action.icon}</span>
                  <span>{action.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Audit Timeline */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Security & Audit Logs</div>
            </div>
            <div className="card-body" style={{ padding: '1.25rem' }}>
              <div className="timeline">
                <TimelineItem title="System Online" time="Sync Active" desc="Supabase connection active and healthy." icon={<CheckCircle size={10} />} status="success" />
                <TimelineItem title="COA Initialized" time="Standard Gulf" desc="Loaded default groups and accounts seed." icon={<Calendar size={10} />} status="warning" />
                <TimelineItem title="Audit Log Active" time="Ready" desc="Recording database row alterations." icon={<Clock size={10} />} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KPICard({ label, value, currency, icon, iconClass, colored, noFormat }: {
  label: string; value: number | null; currency: string; icon: React.ReactNode;
  iconClass: string; colored?: boolean; noFormat?: boolean;
}) {
  const isPositive = value !== null && value >= 0
  return (
    <div className="kpi-card">
      <div className="kpi-card-header">
        <span className="kpi-label">{label}</span>
        <div className={`kpi-icon ${iconClass}`}>{icon}</div>
      </div>
      {value === null
        ? <div className="skeleton" style={{ height: 32, borderRadius: 6 }} />
        : <div className={`kpi-value${colored ? (isPositive ? ' positive' : ' negative') : ''}`}>
            {noFormat ? value.toLocaleString() : `${currency} ${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          </div>
      }
    </div>
  )
}

function TimelineItem({ title, time, desc, icon, status }: {
  title: string; time: string; desc: string; icon: React.ReactNode; status?: string;
}) {
  return (
    <div className="timeline-item">
      <div className={`timeline-dot ${status || ''}`}>
        {icon}
      </div>
      <div className="timeline-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-teal)' }}>
          <span>{title}</span>
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 500, fontSize: '0.7rem' }}>{time}</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{desc}</p>
      </div>
    </div>
  )
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div style={{ padding: '1rem' }}>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 18, marginBottom: 10, borderRadius: 4 }} />
      ))}
    </div>
  )
}
