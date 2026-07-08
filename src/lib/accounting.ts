import { supabase as rawSupabase } from '@/lib/supabase/client'
const supabase = rawSupabase as any
import { useUIStore } from '@/store/ui'
import type {
  Group,
  Ledger,
  Voucher,
  JournalLine,
  VoucherType,
  EntryType,
  TrialBalanceRow,
  PLStatement,
  BalanceSheet,
  Nature,
} from '@/lib/types'

// ============================================================
// VOUCHER → JOURNAL ENTRY RULES
// ============================================================

interface VoucherJournalInput {
  type: VoucherType
  debit_ledger_id: string
  credit_ledger_id: string
  amount: number
  date: string
  journal_lines?: { ledger_id: string; type: EntryType; amount: number }[]
}

export function buildJournalLines(
  voucherId: string,
  input: VoucherJournalInput
): Omit<JournalLine, 'id' | 'created_at' | 'ledger' | 'voucher'>[] {
  if (input.type === 'JOURNAL' && input.journal_lines) {
    return input.journal_lines.map(line => ({
      voucher_id: voucherId,
      ledger_id: line.ledger_id,
      type: line.type,
      amount: line.amount,
      date: input.date,
      narration: null,
    }))
  }

  return [
    {
      voucher_id: voucherId,
      ledger_id: input.debit_ledger_id,
      type: 'Dr' as EntryType,
      amount: input.amount,
      date: input.date,
      narration: null,
    },
    {
      voucher_id: voucherId,
      ledger_id: input.credit_ledger_id,
      type: 'Cr' as EntryType,
      amount: input.amount,
      date: input.date,
      narration: null,
    },
  ]
}

// ============================================================
// TRIAL BALANCE
// ============================================================

export async function getTrialBalance(
  fromDate?: string,
  toDate?: string
): Promise<TrialBalanceRow[]> {
  const companyId = useUIStore.getState().activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  let query = supabase
    .from('journal_lines')
    .select(`
      ledger_id,
      type,
      amount,
      date,
      ledger:ledgers(
        id,
        name,
        opening_balance,
        opening_type,
        company_id,
        group:groups(id, name, nature)
      )
    `)
    .eq('company_id', companyId)

  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)

  const { data, error } = await query
  if (error) throw error

  const map: Record<string, {
    ledger_id: string
    ledger_name: string
    group_name: string
    nature: Nature
    total_dr: number
    total_cr: number
    opening_balance: number
    opening_type: EntryType
  }> = {}

  // Backfill: Make sure we fetch all ledgers in case they have opening balance but no transactions
  const { data: allLedgers } = await supabase
    .from('ledgers')
    .select('*, group:groups(id, name, nature)')
    .eq('company_id', companyId)

  for (const l of allLedgers || []) {
    map[l.id] = {
      ledger_id: l.id,
      ledger_name: l.name,
      group_name: l.group?.name || '',
      nature: l.group?.nature || 'ASSET',
      total_dr: 0,
      total_cr: 0,
      opening_balance: Number(l.opening_balance ?? 0),
      opening_type: l.opening_type ?? 'Dr',
    }
  }

  // Aggregate transaction journal lines
  for (const line of data ?? []) {
    const l = line.ledger as unknown as Ledger & { group: Group }
    if (!l) continue
    const key = line.ledger_id
    if (!map[key]) {
      map[key] = {
        ledger_id: key,
        ledger_name: l.name,
        group_name: l.group?.name ?? '',
        nature: l.group?.nature ?? 'ASSET',
        total_dr: 0,
        total_cr: 0,
        opening_balance: Number(l.opening_balance ?? 0),
        opening_type: l.opening_type ?? 'Dr',
      }
    }
    if (line.type === 'Dr') map[key].total_dr += Number(line.amount)
    else map[key].total_cr += Number(line.amount)
  }

  return Object.values(map).map(row => {
    const openingDr = row.opening_type === 'Dr' ? row.opening_balance : 0
    const openingCr = row.opening_type === 'Cr' ? row.opening_balance : 0
    const dr = row.total_dr + openingDr
    const cr = row.total_cr + openingCr
    const balance = Math.abs(dr - cr)
    const balance_type: EntryType = dr >= cr ? 'Dr' : 'Cr'
    return {
      ledger_id: row.ledger_id,
      ledger_name: row.ledger_name,
      group_name: row.group_name,
      nature: row.nature,
      total_dr: dr,
      total_cr: cr,
      balance,
      balance_type,
    }
  })
}

// ============================================================
// PROFIT & LOSS
// ============================================================

export async function getProfitAndLoss(
  fromDate?: string,
  toDate?: string
): Promise<PLStatement> {
  const tb = await getTrialBalance(fromDate, toDate)

  const income = tb
    .filter(r => r.nature === 'INCOME')
    .map(r => ({ ledger_name: r.ledger_name, amount: r.balance_type === 'Cr' ? r.balance : -r.balance }))

  const expenses = tb
    .filter(r => r.nature === 'EXPENSE')
    .map(r => ({ ledger_name: r.ledger_name, amount: r.balance_type === 'Dr' ? r.balance : -r.balance }))

  const total_income = income.reduce((s, r) => s + r.amount, 0)
  const total_expenses = expenses.reduce((s, r) => s + r.amount, 0)
  const net_profit = total_income - total_expenses

  return {
    income,
    expenses,
    total_income,
    total_expenses,
    net_profit,
    is_profit: net_profit >= 0,
  }
}

// ============================================================
// BALANCE SHEET
// ============================================================

export async function getBalanceSheet(
  asOfDate?: string
): Promise<BalanceSheet> {
  const tb = await getTrialBalance(undefined, asOfDate)

  const assets = tb
    .filter(r => r.nature === 'ASSET')
    .map(r => ({ group_name: r.group_name, ledger_name: r.ledger_name, amount: r.balance_type === 'Dr' ? r.balance : -r.balance }))

  const liabilities = tb
    .filter(r => r.nature === 'LIABILITY')
    .map(r => ({ group_name: r.group_name, ledger_name: r.ledger_name, amount: r.balance_type === 'Cr' ? r.balance : -r.balance }))

  const equity = tb
    .filter(r => r.nature === 'EQUITY')
    .map(r => ({ group_name: r.group_name, ledger_name: r.ledger_name, amount: r.balance_type === 'Cr' ? r.balance : -r.balance }))

  const total_assets = assets.reduce((s, r) => s + r.amount, 0)
  const total_liabilities_equity =
    liabilities.reduce((s, r) => s + r.amount, 0) +
    equity.reduce((s, r) => s + r.amount, 0)

  return {
    assets,
    liabilities,
    equity,
    total_assets,
    total_liabilities_equity,
    is_balanced: Math.abs(total_assets - total_liabilities_equity) < 0.01,
  }
}

// ============================================================
// DASHBOARD KPIs
// ============================================================

export async function getDashboardKPIs(fromDate: string, toDate: string) {
  const pl = await getProfitAndLoss(fromDate, toDate)
  const companyId = useUIStore.getState().activeCompanyId || 'c0de0000-0000-0000-0000-000000000000'

  // Cash + Bank balance scoped
  const { data: cashLines } = await supabase
    .from('journal_lines')
    .select('type, amount, ledger:ledgers(group_id)')
    .eq('company_id', companyId)
    .lte('date', toDate)

  let cashBalance = 0
  for (const line of cashLines ?? []) {
    if (line.type === 'Dr') cashBalance += Number(line.amount)
    else cashBalance -= Number(line.amount)
  }

  return {
    total_income: pl.total_income,
    total_expenses: pl.total_expenses,
    net_profit: pl.net_profit,
    is_profit: pl.is_profit,
    cash_balance: cashBalance,
  }
}
