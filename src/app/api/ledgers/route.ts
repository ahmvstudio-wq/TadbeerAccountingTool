import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database, Nature } from '@/lib/types'
import { NATURE_CODE_PREFIX } from '@/lib/accounting'

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

  const { data, error } = await supabase
    .from('ledgers')
    .select('*, group:groups(id, name, nature)')
    .eq('company_id', companyId)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  // 1. Resolve group nature for code prefix
  const { data: grp } = await supabase
    .from('groups')
    .select('name, nature')
    .eq('id', body.group_id)
    .single()

  const nature = (grp?.nature || 'ASSET') as Nature
  const gName = (grp?.name || '').toLowerCase()

  // 2. Auto-generate account code using sequence table (NEVER reuse)
  const prefix = NATURE_CODE_PREFIX[nature] || '9'
  
  const { data: seqData, error: seqErr } = await supabase.rpc('next_ledger_code', { p_prefix: prefix })
  
  let code: string
  if (seqErr || !seqData) {
    // Fallback: manual increment
    const { data: existingCodes } = await supabase
      .from('ledgers')
      .select('account_code')
      .eq('company_id', companyId)
      .like('account_code', `${prefix}%`)

    let maxVal = parseInt(`${prefix}000`, 10)
    for (const l of existingCodes || []) {
      const num = parseInt(l.account_code.replace(/\D/g, ''), 10)
      if (!isNaN(num) && num > maxVal) maxVal = num
    }
    code = String(maxVal + 1)
  } else {
    code = String(seqData)
  }

  // 3. Auto-classify based on group nature/name
  let classification = body.classification
  if (!classification) {
    if (
      gName.includes('debtor') ||
      gName.includes('creditor') ||
      gName.includes('bank') ||
      gName.includes('customer') ||
      gName.includes('supplier') ||
      nature === 'EQUITY'
    ) {
      classification = 'Personal'
    } else if (
      gName.includes('cash') ||
      nature === 'ASSET'
    ) {
      classification = 'Real'
    } else {
      classification = 'Nominal'
    }
  }

  // 4. Smart opening balance: positive = Dr, negative = Cr
  let openingBalance = Number(body.opening_balance ?? 0)
  let openingType: 'Dr' | 'Cr' = body.opening_type || 'Dr'
  
  // Auto-infer from sign if no explicit type given
  if (!body.opening_type || body.opening_type === undefined) {
    if (openingBalance < 0) {
      openingType = 'Cr'
      openingBalance = Math.abs(openingBalance)
    } else {
      openingType = 'Dr'
    }
  }

  const { data, error } = await supabase
    .from('ledgers')
    .insert({
      name:            body.name,
      group_id:        body.group_id,
      opening_balance: openingBalance,
      opening_type:    openingType,
      description:     body.description ?? null,
      is_system:       false,
      account_code:    code,
      classification:  classification,
      company_id:      companyId,
      phone:           body.phone ?? null,
      email:           body.email ?? null,
      vat_number:      body.vat_number ?? null,
      country:         body.country ?? 'Oman',
      address:         body.address ?? null,
    })
    .select('*, group:groups(id, name, nature)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  if (!body.id) {
    return NextResponse.json({ error: 'Ledger ID is required for editing.' }, { status: 400 })
  }

  // Smart opening balance
  let openingBalance = Number(body.opening_balance ?? 0)
  let openingType: 'Dr' | 'Cr' = body.opening_type || 'Dr'
  
  if (!body.opening_type) {
    if (openingBalance < 0) {
      openingType = 'Cr'
      openingBalance = Math.abs(openingBalance)
    } else {
      openingType = 'Dr'
    }
  }

  const { data, error } = await supabase
    .from('ledgers')
    .update({
      name:            body.name,
      group_id:        body.group_id,
      opening_balance: openingBalance,
      opening_type:    openingType,
      description:     body.description ?? null,
      classification:  body.classification,
      phone:           body.phone ?? null,
      email:           body.email ?? null,
      vat_number:      body.vat_number ?? null,
      country:         body.country ?? null,
      address:         body.address ?? null,
      // NOTE: account_code is NOT updatable — never change after creation
    })
    .eq('id', body.id)
    .eq('company_id', companyId)
    .select('*, group:groups(id, name, nature)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const companyId = url.searchParams.get('company_id') || 'c0de0000-0000-0000-0000-000000000000'

  if (!id) {
    return NextResponse.json({ error: 'Ledger ID is required for deletion.' }, { status: 400 })
  }

  // Check for linked journal lines
  const { count } = await supabase
    .from('journal_lines')
    .select('*', { count: 'exact', head: true })
    .eq('ledger_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Cannot delete: this account has transactions.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ledgers')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    return NextResponse.json({ error: 'Cannot delete account. It may have linked transactions.' }, { status: 500 })
  }
  // NOTE: The account code is NOT recycled — sequence counter stays advanced
  return NextResponse.json({ success: true })
}
