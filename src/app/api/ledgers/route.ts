import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database, Nature } from '@/lib/types'

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase() as any
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
  const supabase = getSupabase() as any
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  // Resolve or Auto-Generate Account Code
  let code = body.account_code
  const { data: grp } = await supabase
    .from('groups')
    .select('name, nature')
    .eq('id', body.group_id)
    .single()

  const nature = grp?.nature || 'ASSET'
  const gName = grp?.name.toLowerCase() || ''

  if (!code || !code.trim()) {
    const prefixMap: Record<Nature, string> = { ASSET: '1', LIABILITY: '2', EQUITY: '3', INCOME: '4', EXPENSE: '5' }
    const pref = prefixMap[nature as Nature] || '9'

    const { data: existingCodes } = await supabase
      .from('ledgers')
      .select('account_code')
      .eq('company_id', companyId)
      .like('account_code', `${pref}%`)

    let maxVal = 0
    for (const l of existingCodes || []) {
      const num = parseInt(l.account_code.replace(/\D/g, ''), 10)
      if (!isNaN(num) && num > maxVal) maxVal = num
    }

    if (maxVal === 0) {
      code = `${pref}001`
    } else {
      code = String(maxVal + 1)
    }
  }

  // Resolve or Auto-Generate Classification
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

  const { data, error } = await supabase
    .from('ledgers')
    .insert({
      name:            body.name,
      group_id:        body.group_id,
      opening_balance: body.opening_balance ?? 0,
      opening_type:    body.opening_type ?? 'Dr',
      description:     body.description ?? null,
      is_system:       false,
      account_code:    code,
      classification:  classification,
      company_id:      companyId,
    })
    .select('*, group:groups(id, name, nature)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabase() as any
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  if (!body.id) {
    return NextResponse.json({ error: 'Ledger ID is required for editing.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('ledgers')
    .update({
      name:            body.name,
      group_id:        body.group_id,
      opening_balance: body.opening_balance ?? 0,
      opening_type:    body.opening_type ?? 'Dr',
      description:     body.description ?? null,
      account_code:    body.account_code,
      classification:  body.classification,
    })
    .eq('id', body.id)
    .eq('company_id', companyId)
    .select('*, group:groups(id, name, nature)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase() as any
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const companyId = url.searchParams.get('company_id') || 'c0de0000-0000-0000-0000-000000000000'

  if (!id) {
    return NextResponse.json({ error: 'Ledger ID is required for deletion.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ledgers')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    return NextResponse.json({ error: 'Cannot delete account. Ensure it has no transaction voucher history linked to it.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
