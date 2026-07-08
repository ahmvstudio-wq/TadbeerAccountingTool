// ============================================================
// DATABASE TYPES — mirrors Supabase schema exactly
// ============================================================

export type Nature = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY'
export type EntryType = 'Dr' | 'Cr'
export type VoucherType =
  | 'PURCHASE'
  | 'SALE'
  | 'RECEIPT'
  | 'PAYMENT'
  | 'JOURNAL'
  | 'PURCHASE_RETURN'
  | 'SALES_RETURN'

export type DbGroup = {
  id: string
  name: string
  parent_id: string | null
  nature: Nature
  is_system: boolean
  sort_order: number
  company_id: string
  created_at: string
  updated_at: string
  created_by?: string | null
}

export type Group = DbGroup & {
  children?: Group[]
  ledgers?: Ledger[]
}

export type Ledger = {
  id: string
  name: string
  group_id: string
  opening_balance: number
  opening_type: EntryType
  is_system: boolean
  description: string | null
  created_at: string
  updated_at: string
  account_code: string
  classification: 'Personal' | 'Real' | 'Nominal'
  company_id: string
  group?: Group
}

export type Voucher = {
  id: string
  type: VoucherType
  voucher_number: string | null
  date: string
  ref: string | null
  party_ledger_id: string | null
  party_name: string | null
  amount: number
  currency: string
  exchange_rate: number
  notes: string | null
  narration: string
  company_id: string
  created_at: string
  updated_at: string
  journal_lines?: JournalLine[]
}

export type JournalLine = {
  id: string
  voucher_id: string
  ledger_id: string
  type: EntryType
  amount: number
  date: string
  narration: string | null
  created_at: string
  ledger?: Ledger
  voucher?: Voucher
}

export type Settings = {
  id: string
  company_name: string
  base_currency: string
  financial_year_start: string
  address: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  company_id: string
  created_at: string
  updated_at: string
}

export type ExchangeRate = {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  effective_date: string
  company_id: string
  created_at: string
}

// ============================================================
// REPORT TYPES
// ============================================================

export interface TrialBalanceRow {
  ledger_id: string
  ledger_name: string
  group_name: string
  nature: Nature
  total_dr: number
  total_cr: number
  balance: number
  balance_type: EntryType
}

export interface PLStatement {
  income: { ledger_name: string; amount: number }[]
  expenses: { ledger_name: string; amount: number }[]
  total_income: number
  total_expenses: number
  net_profit: number
  is_profit: boolean
}

export interface BalanceSheet {
  assets: { group_name: string; ledger_name: string; amount: number }[]
  liabilities: { group_name: string; ledger_name: string; amount: number }[]
  equity: { group_name: string; ledger_name: string; amount: number }[]
  total_assets: number
  total_liabilities_equity: number
  is_balanced: boolean
}

// ============================================================
// FORM TYPES
// ============================================================

export interface VoucherFormData {
  type: VoucherType
  date: string
  party_ledger_id: string
  debit_ledger_id: string
  credit_ledger_id: string
  amount: number
  currency: string
  ref?: string
  notes?: string
  // Journal-specific: multiple lines
  journal_lines?: { ledger_id: string; type: EntryType; amount: number }[]
}

// ============================================================
// CURRENCY LIST
// ============================================================

export const CURRENCIES = [
  { code: 'OMR', name: 'Omani Rial',         symbol: 'ر.ع.' },
  { code: 'USD', name: 'US Dollar',           symbol: '$'    },
  { code: 'EUR', name: 'Euro',                symbol: '€'    },
  { code: 'GBP', name: 'British Pound',       symbol: '£'    },
  { code: 'AED', name: 'UAE Dirham',          symbol: 'د.إ'  },
  { code: 'SAR', name: 'Saudi Riyal',         symbol: '﷼'    },
  { code: 'QAR', name: 'Qatari Riyal',        symbol: 'ر.ق'  },
  { code: 'KWD', name: 'Kuwaiti Dinar',       symbol: 'د.ك'  },
  { code: 'BHD', name: 'Bahraini Dinar',      symbol: 'BD'   },
  { code: 'INR', name: 'Indian Rupee',        symbol: '₹'    },
  { code: 'PKR', name: 'Pakistani Rupee',     symbol: '₨'    },
  { code: 'EGP', name: 'Egyptian Pound',      symbol: 'E£'   },
  { code: 'JPY', name: 'Japanese Yen',        symbol: '¥'    },
  { code: 'CNY', name: 'Chinese Yuan',        symbol: '¥'    },
  { code: 'CHF', name: 'Swiss Franc',         symbol: 'Fr'   },
  { code: 'CAD', name: 'Canadian Dollar',     symbol: 'CA$'  },
  { code: 'AUD', name: 'Australian Dollar',   symbol: 'A$'   },
  { code: 'SGD', name: 'Singapore Dollar',    symbol: 'S$'   },
  { code: 'HKD', name: 'Hong Kong Dollar',    symbol: 'HK$'  },
  { code: 'MYR', name: 'Malaysian Ringgit',   symbol: 'RM'   },
  { code: 'TRY', name: 'Turkish Lira',        symbol: '₺'    },
  { code: 'ZAR', name: 'South African Rand',  symbol: 'R'    },
  { code: 'BDT', name: 'Bangladeshi Taka',    symbol: '৳'    },
  { code: 'LKR', name: 'Sri Lankan Rupee',    symbol: '₨'    },
  { code: 'NGN', name: 'Nigerian Naira',      symbol: '₦'    },
] as const

export type CurrencyCode = typeof CURRENCIES[number]['code']

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? code
}

// ============================================================
// DATABASE SHAPE (for Supabase typed client)
// ============================================================

export type Database = {
  public: {
    Tables: {
      settings: { Row: Settings; Insert: Partial<Settings>; Update: Partial<Settings>; Relationships: [] }
      groups: {
        Row: DbGroup
        Insert: Omit<DbGroup, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<DbGroup>
        Relationships: []
      }
      ledgers: {
        Row: Ledger
        Insert: Omit<Ledger, 'id' | 'created_at' | 'updated_at' | 'group'>
        Update: Partial<Ledger>
        Relationships: []
      }
      vouchers: { Row: Voucher; Insert: Omit<Voucher, 'id' | 'created_at' | 'updated_at' | 'journal_lines'>; Update: Partial<Voucher>; Relationships: [] }
      journal_lines: {
        Row: JournalLine
        Insert: Omit<JournalLine, 'id' | 'created_at' | 'ledger' | 'voucher'>
        Update: Partial<JournalLine>
        Relationships: []
      }
      exchange_rates: { Row: ExchangeRate; Insert: Omit<ExchangeRate, 'id' | 'created_at'>; Update: Partial<ExchangeRate>; Relationships: [] }
      companies: { Row: Company; Insert: Omit<Company, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Company>; Relationships: [] }
      user_companies: { Row: UserCompany; Insert: Omit<UserCompany, 'id' | 'created_at' | 'updated_at'>; Update: Partial<UserCompany>; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      nature: Nature
      entry_type: EntryType
      voucher_type: VoucherType
    }
  }
}

export type UserRole = 'Admin' | 'Finance Mgr' | 'Accountant' | 'Auditor' | 'Viewer'

export interface Company {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface UserCompany {
  id: string
  user_id: string
  company_id: string
  role: UserRole
  created_at: string
  updated_at: string
  company?: Company
}

export const ROLE_PERMISSIONS: Record<UserRole, {
  createVouchers: boolean
  editVouchers: boolean
  deleteVouchers: boolean
  chartOfAccounts: boolean
  viewReports: boolean
  exportReports: boolean
  manageUsers: boolean
}> = {
  Admin: {
    createVouchers: true,
    editVouchers: true,
    deleteVouchers: true,
    chartOfAccounts: true,
    viewReports: true,
    exportReports: true,
    manageUsers: true,
  },
  'Finance Mgr': {
    createVouchers: true,
    editVouchers: true,
    deleteVouchers: true,
    chartOfAccounts: true,
    viewReports: true,
    exportReports: true,
    manageUsers: false,
  },
  Accountant: {
    createVouchers: true,
    editVouchers: false,
    deleteVouchers: false,
    chartOfAccounts: false,
    viewReports: true,
    exportReports: true,
    manageUsers: false,
  },
  Auditor: {
    createVouchers: false,
    editVouchers: false,
    deleteVouchers: false,
    chartOfAccounts: false,
    viewReports: true,
    exportReports: true,
    manageUsers: false,
  },
  Viewer: {
    createVouchers: false,
    editVouchers: false,
    deleteVouchers: false,
    chartOfAccounts: false,
    viewReports: true,
    exportReports: false,
    manageUsers: false,
  },
}

