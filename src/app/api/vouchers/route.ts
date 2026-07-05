import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildJournalLines } from '@/lib/accounting'
import { getExchangeRate } from '@/lib/exchange'
import type { Database, VoucherType } from '@/lib/types'

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .order('date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()

  // Get base currency from settings
  const { data: settings } = await supabase
    .from('settings')
    .select('base_currency')
    .single()
  const baseCurrency = settings?.base_currency ?? 'OMR'

  // Resolve exchange rate from transaction currency to base currency
  const txCurrency = body.currency ?? baseCurrency
  const rate = await getExchangeRate(txCurrency, baseCurrency, body.date)

  // Generate voucher number
  const { count } = await supabase
    .from('vouchers')
    .select('*', { count: 'exact', head: true })
    .eq('type', body.type)
  const prefix: Record<VoucherType, string> = {
    PURCHASE: 'PUR', SALE: 'SAL', RECEIPT: 'REC',
    PAYMENT: 'PAY', JOURNAL: 'JRN',
    PURCHASE_RETURN: 'PRN', SALES_RETURN: 'SRN',
  }
  const voucherNumber = `${prefix[body.type as VoucherType]}-${String((count ?? 0) + 1).padStart(4, '0')}`

  // Insert voucher with exchange_rate
  const { data: voucher, error: vErr } = await supabase
    .from('vouchers')
    .insert({
      type:            body.type,
      voucher_number:  voucherNumber,
      date:            body.date,
      ref:             body.ref ?? null,
      party_ledger_id: body.party_ledger_id ?? null,
      party_name:      body.party_name ?? null,
      amount:          body.amount,
      currency:        txCurrency,
      exchange_rate:   rate,
      notes:           body.notes ?? null,
    } as any)
    .select()
    .single()

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  // Convert amount to base currency for the journal lines (General Ledger)
  const baseAmount = Number(body.amount) * rate

  // Build + insert journal lines
  const lines = buildJournalLines(voucher.id, {
    type:              body.type,
    debit_ledger_id:   body.debit_ledger_id,
    credit_ledger_id:  body.credit_ledger_id,
    amount:            baseAmount,
    date:              body.date,
    journal_lines:     body.journal_lines?.map((line: any) => ({
      ...line,
      amount: Number(line.amount) * rate, // convert multi-line journal segments
    })),
  })

  const { error: jErr } = await supabase.from('journal_lines').insert(lines)
  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 })

  return NextResponse.json(voucher, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()

  if (!body.id) {
    return NextResponse.json({ error: 'Voucher ID is required for editing.' }, { status: 400 })
  }

  // Get base currency from settings
  const { data: settings } = await supabase
    .from('settings')
    .select('base_currency')
    .single()
  const baseCurrency = settings?.base_currency ?? 'OMR'

  // Resolve exchange rate
  const txCurrency = body.currency ?? baseCurrency
  const rate = await getExchangeRate(txCurrency, baseCurrency, body.date)

  // 1. Update Voucher
  const { data: voucher, error: vErr } = await supabase
    .from('vouchers')
    .update({
      date:            body.date,
      ref:             body.ref ?? null,
      party_ledger_id: body.party_ledger_id ?? null,
      party_name:      body.party_name ?? null,
      amount:          body.amount,
      currency:        txCurrency,
      exchange_rate:   rate,
      notes:           body.notes ?? null,
    } as any)
    .eq('id', body.id)
    .select()
    .single()

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  // 2. Delete old journal lines
  const { error: dErr } = await supabase
    .from('journal_lines')
    .delete()
    .eq('voucher_id', body.id)

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })

  // 3. Post new journal lines
  const baseAmount = Number(body.amount) * rate
  const lines = buildJournalLines(body.id, {
    type:              body.type,
    debit_ledger_id:   body.debit_ledger_id,
    credit_ledger_id:  body.credit_ledger_id,
    amount:            baseAmount,
    date:              body.date,
    journal_lines:     body.journal_lines?.map((line: any) => ({
      ...line,
      amount: Number(line.amount) * rate,
    })),
  })

  const { error: jErr } = await supabase.from('journal_lines').insert(lines)
  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 })

  return NextResponse.json(voucher)
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Voucher ID is required for deletion.' }, { status: 400 })
  }

  // Delete voucher (Cascade deletes journal_lines in DB)
  const { error } = await supabase
    .from('vouchers')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
