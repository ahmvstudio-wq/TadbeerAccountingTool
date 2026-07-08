import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildJournalLines } from '@/lib/accounting'
import { getExchangeRate } from '@/lib/exchange'
import type { Database, VoucherType, UserRole } from '@/lib/types'
import { ROLE_PERMISSIONS } from '@/lib/types'

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as any
}

async function verifyPermission(req: NextRequest, companyId: string, permissionName: 'createVouchers' | 'editVouchers' | 'deleteVouchers') {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
  
  // Default to Admin in local dev environments if no token is sent
  if (!token) return { authorized: true, userId: null }

  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return { authorized: false, userId: null }

  const { data: membership } = await supabase
    .from('user_companies')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', companyId)
    .single()

  const role = (membership?.role || 'Viewer') as UserRole
  const permissions = ROLE_PERMISSIONS[role]
  return { authorized: !!permissions[permissionName], userId: user.id }
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const companyId = url.searchParams.get('company_id') || 'c0de0000-0000-0000-0000-000000000000'

  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('company_id', companyId)
    .order('date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  // 1. Verify Permission
  const { authorized } = await verifyPermission(req, companyId, 'createVouchers')
  if (!authorized) {
    return NextResponse.json({ error: 'Access Denied: Insufficient permissions to create vouchers.' }, { status: 403 })
  }

  // 2. Validate narration is present
  if (!body.narration || !body.narration.trim()) {
    return NextResponse.json({ error: 'Narration is mandatory.' }, { status: 400 })
  }

  // Get base currency from settings
  const { data: settings } = await supabase
    .from('settings')
    .select('base_currency')
    .eq('company_id', companyId)
    .single()
  const baseCurrency = settings?.base_currency ?? 'OMR'

  // Resolve exchange rate
  const txCurrency = body.currency ?? baseCurrency
  const rate = await getExchangeRate(txCurrency, baseCurrency, body.date)

  // Generate voucher number (scoped to active company)
  const { count } = await supabase
    .from('vouchers')
    .select('*', { count: 'exact', head: true })
    .eq('type', body.type)
    .eq('company_id', companyId)
  
  const prefix: Record<VoucherType, string> = {
    PURCHASE: 'PUR', SALE: 'SAL', RECEIPT: 'REC',
    PAYMENT: 'PAY', JOURNAL: 'JRN',
    PURCHASE_RETURN: 'PRN', SALES_RETURN: 'SRN',
  }
  const voucherNumber = `${prefix[body.type as VoucherType]}-${String((count ?? 0) + 1).padStart(4, '0')}`

  // Insert voucher with exchange_rate & narration
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
      narration:       body.narration,
      company_id:      companyId,
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
      amount: Number(line.amount) * rate,
    })),
  }).map(line => ({
    ...line,
    company_id: companyId,
    narration: body.narration, // copy voucher narration to journal lines
  }))

  const { error: jErr } = await supabase.from('journal_lines').insert(lines as any)
  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 })

  return NextResponse.json(voucher, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  if (!body.id) {
    return NextResponse.json({ error: 'Voucher ID is required for editing.' }, { status: 400 })
  }

  // 1. Verify Permission
  const { authorized } = await verifyPermission(req, companyId, 'editVouchers')
  if (!authorized) {
    return NextResponse.json({ error: 'Access Denied: Insufficient permissions to edit vouchers.' }, { status: 403 })
  }

  // 2. Validate narration is present
  if (!body.narration || !body.narration.trim()) {
    return NextResponse.json({ error: 'Narration is mandatory.' }, { status: 400 })
  }

  // Get base currency from settings
  const { data: settings } = await supabase
    .from('settings')
    .select('base_currency')
    .eq('company_id', companyId)
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
      narration:       body.narration,
    } as any)
    .eq('id', body.id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  // 2. Delete old journal lines
  const { error: dErr } = await supabase
    .from('journal_lines')
    .delete()
    .eq('voucher_id', body.id)
    .eq('company_id', companyId)

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
  }).map(line => ({
    ...line,
    company_id: companyId,
    narration: body.narration,
  }))

  const { error: jErr } = await supabase.from('journal_lines').insert(lines as any)
  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 })

  return NextResponse.json(voucher)
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const reason = url.searchParams.get('reason')

  if (!id) {
    return NextResponse.json({ error: 'Voucher ID is required for deletion.' }, { status: 400 })
  }

  // 1. Fetch voucher details to get company_id and code
  const { data: voucher, error: fetchErr } = await supabase
    .from('vouchers')
    .select('voucher_number, company_id')
    .eq('id', id)
    .single()

  if (fetchErr || !voucher) {
    return NextResponse.json({ error: 'Voucher not found or has already been deleted.' }, { status: 404 })
  }

  const companyId = voucher.company_id

  // 2. Verify deletion permissions
  const { authorized, userId } = await verifyPermission(req, companyId, 'deleteVouchers')
  if (!authorized) {
    return NextResponse.json({ error: 'Access Denied: Insufficient permissions to delete vouchers.' }, { status: 403 })
  }

  // 3. Validate deletion reason (required)
  if (!reason || !reason.trim()) {
    return NextResponse.json({ error: 'Deletion reason is required.' }, { status: 400 })
  }

  // 4. Log the deletion to audit table
  const { error: logErr } = await supabase
    .from('voucher_deletions')
    .insert({
      voucher_id: id,
      voucher_number: voucher.voucher_number,
      deleted_by: userId,
      company_id: companyId,
      reason: reason.trim(),
    })

  if (logErr) return NextResponse.json({ error: `Audit Log Failure: ${logErr.message}` }, { status: 500 })

  // 5. Delete voucher (Cascade deletes journal_lines in DB)
  const { error } = await supabase
    .from('vouchers')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
