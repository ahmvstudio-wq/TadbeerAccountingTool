import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database, EntryType } from '@/lib/types'

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as any
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const {
    id,
    company_id,
    date,
    ref,
    narration,
    notes,
    amount,
    subtotal,
    vat_total,
    grand_total,
    journal_lines,
  } = body

  if (!id) {
    return NextResponse.json({ error: 'Voucher ID is required.' }, { status: 400 })
  }

  if (!company_id) {
    return NextResponse.json({ error: 'Company ID is required.' }, { status: 400 })
  }

  // 1. Validate journal lines balance
  const drTotal = journal_lines.filter((l: any) => l.type === 'Dr').reduce((sum: number, l: any) => sum + Number(l.amount), 0)
  const crTotal = journal_lines.filter((l: any) => l.type === 'Cr').reduce((sum: number, l: any) => sum + Number(l.amount), 0)

  // Floating point comparison safeguard
  if (Math.abs(drTotal - crTotal) > 0.001) {
    return NextResponse.json({ error: `Journal lines do not balance. Dr: ${drTotal}, Cr: ${crTotal}` }, { status: 400 })
  }

  // 2. Update Voucher
  const { error: vErr } = await supabase
    .from('vouchers')
    .update({
      date,
      ref: ref ?? null,
      narration,
      notes: notes ?? null,
      amount: Number(amount),
      subtotal: Number(subtotal ?? amount),
      vat_total: Number(vat_total ?? 0),
      grand_total: Number(grand_total ?? amount),
    })
    .eq('id', id)
    .eq('company_id', company_id)

  if (vErr) {
    return NextResponse.json({ error: vErr.message }, { status: 500 })
  }

  // 3. Update Journal Lines (Delete and re-insert)
  const { error: delErr } = await supabase
    .from('journal_lines')
    .delete()
    .eq('voucher_id', id)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  const linesToInsert = journal_lines.map((l: any) => ({
    voucher_id: id,
    ledger_id: l.ledger_id,
    type: l.type as EntryType,
    amount: Number(l.amount),
    date: date,
    narration: l.narration ?? null,
  }))

  const { error: insErr } = await supabase
    .from('journal_lines')
    .insert(linesToInsert)

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
