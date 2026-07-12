import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildSalesJournalLines,
  buildPurchaseJournalLines,
  buildPaymentJournalLines,
  buildReceiptJournalLines,
  buildManualJournalLines,
  VOUCHER_PREFIX,
  formatVoucherNumber,
} from '@/lib/accounting'
import type { Database, VoucherType } from '@/lib/types'

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as any
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const companyId = url.searchParams.get('company_id') || 'c0de0000-0000-0000-0000-000000000000'
  const type = url.searchParams.get('type')

  let q = supabase
    .from('vouchers')
    .select('*')
    .eq('company_id', companyId)
    .order('date', { ascending: false })

  if (type) q = q.eq('type', type)
  
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'
  const vType = body.type as VoucherType

  // 1. Validate narration
  if (!body.narration || !body.narration.trim()) {
    return NextResponse.json({ error: 'Narration is mandatory.' }, { status: 400 })
  }

  // 2. Generate voucher number using sequence (NEVER reuse)
  const { data: seqNum, error: seqErr } = await supabase.rpc('next_voucher_number', { p_type: vType })
  
  let voucherNumber: string
  if (seqErr || !seqNum) {
    // Fallback
    const { count } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('type', vType)
      .eq('company_id', companyId)
    voucherNumber = formatVoucherNumber(VOUCHER_PREFIX[vType], (count ?? 0) + 1)
  } else {
    voucherNumber = formatVoucherNumber(VOUCHER_PREFIX[vType], seqNum)
  }

  // 3. Compute totals
  const subtotal = Number(body.subtotal ?? body.amount ?? 0)
  const vatTotal = Number(body.vat_total ?? 0)
  const grandTotal = Number(body.grand_total ?? subtotal + vatTotal)

  // 4. Get base currency
  const { data: settings } = await supabase
    .from('settings')
    .select('base_currency')
    .eq('company_id', companyId)
    .single()
  const baseCurrency = settings?.base_currency ?? 'SAR'

  // 5. Insert voucher
  const { data: voucher, error: vErr } = await supabase
    .from('vouchers')
    .insert({
      type:            vType,
      voucher_number:  voucherNumber,
      date:            body.date,
      ref:             body.ref ?? null,
      party_ledger_id: body.party_ledger_id ?? null,
      party_name:      body.party_name ?? null,
      amount:          grandTotal,
      subtotal:        subtotal,
      vat_total:       vatTotal,
      grand_total:     grandTotal,
      currency:        body.currency ?? baseCurrency,
      exchange_rate:   1,
      notes:           body.notes ?? null,
      narration:       body.narration,
      company_id:      companyId,
    })
    .select()
    .single()

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  // 6. Build journal lines based on voucher type
  let journalLines: any[] = []

  switch (vType) {
    case 'SALE': {
      const lines = (body.lines || []).map((l: any) => ({
        ledger_id: l.ledger_id,
        amount: Number(l.amount),
      }))
      journalLines = buildSalesJournalLines(
        voucher.id,
        body.party_ledger_id,
        lines,
        body.vat_ledger_id || null,
        vatTotal,
        grandTotal,
        body.date,
        body.narration,
        companyId
      )
      break
    }
    case 'PURCHASE': {
      const lines = (body.lines || []).map((l: any) => ({
        ledger_id: l.ledger_id,
        amount: Number(l.amount),
      }))
      journalLines = buildPurchaseJournalLines(
        voucher.id,
        body.party_ledger_id,
        lines,
        body.vat_ledger_id || null,
        vatTotal,
        grandTotal,
        body.date,
        body.narration,
        companyId
      )
      break
    }
    case 'PAYMENT': {
      const payeeLines = (body.lines || []).map((l: any) => ({
        ledger_id: l.ledger_id,
        amount: Number(l.amount),
      }))
      // If no lines provided, use single party_ledger_id
      const finalPayeeLines = payeeLines.length > 0 ? payeeLines : [{ ledger_id: body.party_ledger_id, amount: grandTotal }]
      journalLines = buildPaymentJournalLines(
        voucher.id,
        finalPayeeLines,
        body.bank_cash_ledger_id,
        grandTotal,
        body.date,
        body.narration,
        companyId
      )
      break
    }
    case 'RECEIPT': {
      journalLines = buildReceiptJournalLines(
        voucher.id,
        body.bank_cash_ledger_id,
        body.party_ledger_id,
        grandTotal,
        body.date,
        body.narration,
        companyId
      )
      break
    }
    case 'JOURNAL': {
      const jLines = (body.journal_lines || []).map((l: any) => ({
        ledger_id: l.ledger_id,
        type: l.type,
        amount: Number(l.amount),
      }))
      journalLines = buildManualJournalLines(
        voucher.id,
        jLines,
        body.date,
        body.narration,
        companyId
      )
      break
    }
  }

  // 7. Insert journal lines
  if (journalLines.length > 0) {
    const { error: jErr } = await supabase.from('journal_lines').insert(journalLines)
    if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 })
  }

  return NextResponse.json(voucher, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const reason = url.searchParams.get('reason') || 'Deleted'

  if (!id) {
    return NextResponse.json({ error: 'Voucher ID is required.' }, { status: 400 })
  }

  // 1. Fetch voucher
  const { data: voucher, error: fetchErr } = await supabase
    .from('vouchers')
    .select('voucher_number, company_id')
    .eq('id', id)
    .single()

  if (fetchErr || !voucher) {
    return NextResponse.json({ error: 'Voucher not found.' }, { status: 404 })
  }

  // 2. Log deletion (audit trail)
  await supabase.from('voucher_deletions').insert({
    voucher_id: id,
    voucher_number: voucher.voucher_number,
    company_id: voucher.company_id,
    reason: reason.trim(),
  })

  // 3. Delete voucher (cascade deletes journal_lines)
  const { error } = await supabase
    .from('vouchers')
    .delete()
    .eq('id', id)
    .eq('company_id', voucher.company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  // NOTE: Voucher number is NOT recycled — sequence stays advanced
  return NextResponse.json({ success: true })
}
