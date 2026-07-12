// ============================================================
// TADBEER MVP V1 — TYPE DEFINITIONS
// ============================================================

export type Nature = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY'
export type EntryType = 'Dr' | 'Cr'
export type VoucherType = 'PURCHASE' | 'SALE' | 'RECEIPT' | 'PAYMENT' | 'JOURNAL'

// ---- Groups ----
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

// ---- Ledgers ----
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
  // Contact fields (MVP V1)
  phone: string | null
  email: string | null
  vat_number: string | null
  country: string | null
  address: string | null
  // Joined
  group?: Group
}

// ---- Inventory (Stock Item) ----
export type Item = {
  id: string
  company_id: string
  name: string
  code: string | null
  unit: string
  buy_price: number
  sell_price: number
  tax_rate: number
  stock_quantity: number
  opening_quantity: number
  opening_rate: number
  opening_value: number
  inventory_ledger_id: string | null
  income_ledger_id: string | null
  expense_ledger_id: string | null
  created_at: string
  updated_at: string
}

// ---- Vouchers ----
export type Voucher = {
  id: string
  type: VoucherType
  voucher_number: string | null
  date: string
  ref: string | null
  party_ledger_id: string | null
  party_name: string | null
  amount: number
  subtotal: number
  vat_total: number
  grand_total: number
  currency: string
  exchange_rate: number
  notes: string | null
  narration: string
  company_id: string
  created_at: string
  updated_at: string
  journal_lines?: JournalLine[]
}

// ---- Journal Lines ----
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

// ---- Settings ----
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
  vat_number: string | null
  created_at: string
  updated_at: string
}

// ---- Voucher Line (for multi-line Sales/Purchase) ----
export interface VoucherLineItem {
  ledger_id: string
  description: string
  amount: number
  vat_rate: number
  vat_amount: number
}

// ---- Form Types ----
export interface VoucherFormData {
  type: VoucherType
  date: string
  party_ledger_id: string
  amount: number
  currency: string
  ref?: string
  notes?: string
  narration: string
  // Multi-line items (Sales/Purchase)
  lines?: VoucherLineItem[]
  // Payment/Receipt specific
  bank_cash_ledger_id?: string
  // Journal-specific: multiple lines
  journal_lines?: { ledger_id: string; type: EntryType; amount: number }[]
}

// ---- Currency ----
export const CURRENCIES = [
  { code: 'SAR', name: 'Saudi Riyal',         symbol: '﷼'    },
  { code: 'OMR', name: 'Omani Rial',          symbol: 'ر.ع.' },
  { code: 'AED', name: 'UAE Dirham',          symbol: 'د.إ'  },
  { code: 'USD', name: 'US Dollar',           symbol: '$'    },
  { code: 'EUR', name: 'Euro',                symbol: '€'    },
  { code: 'GBP', name: 'British Pound',       symbol: '£'    },
  { code: 'QAR', name: 'Qatari Riyal',        symbol: 'ر.ق'  },
  { code: 'KWD', name: 'Kuwaiti Dinar',       symbol: 'د.ك'  },
  { code: 'BHD', name: 'Bahraini Dinar',      symbol: 'BD'   },
  { code: 'INR', name: 'Indian Rupee',        symbol: '₹'    },
] as const

export type CurrencyCode = typeof CURRENCIES[number]['code']

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? code
}

// ---- Company (minimal) ----
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
  role: string
  created_at: string
  updated_at: string
  company?: Company
}

// ---- Database Shape ----
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
