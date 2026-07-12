import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

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
    .from('items')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'Service Name is required.' }, { status: 400 })
  }

  // 1. Auto-generate Service Code if empty
  let code = body.code?.trim()
  if (!code) {
    // Generate using 'SRV' prefix sequence from database
    const { data: seqNum, error: seqErr } = await supabase.rpc('next_ledger_code', { p_prefix: 'SRV' })
    if (seqErr || !seqNum) {
      // Fallback: use row count or random
      const { count } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
      code = `SRV-${String((count ?? 0) + 1).padStart(4, '0')}`
    } else {
      code = `SRV-${String(seqNum).padStart(4, '0')}`
    }
  }

  // 2. Insert Service Item
  const { data, error } = await supabase
    .from('items')
    .insert({
      company_id:        companyId,
      name:              body.name.trim(),
      code:              code,
      unit:              body.unit?.trim() || 'Fixed / Project',
      buy_price:         Number(body.buy_price ?? 0),
      sell_price:        Number(body.sell_price ?? 0),
      tax_rate:          Number(body.tax_rate ?? 5.00),
      income_ledger_id:  body.income_ledger_id || null,
      expense_ledger_id: body.expense_ledger_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  if (!body.id) {
    return NextResponse.json({ error: 'Service ID is required.' }, { status: 400 })
  }

  let code = body.code?.trim()
  if (!code) {
    // Keep existing code if editing and left empty, or generate
    const { data: existing } = await supabase
      .from('items')
      .select('code')
      .eq('id', body.id)
      .single()
    code = existing?.code || `SRV-${Math.floor(1000 + Math.random() * 9000)}`
  }

  const { data, error } = await supabase
    .from('items')
    .update({
      name:              body.name.trim(),
      code:              code,
      unit:              body.unit?.trim() || 'Fixed / Project',
      buy_price:         Number(body.buy_price ?? 0),
      sell_price:        Number(body.sell_price ?? 0),
      tax_rate:          Number(body.tax_rate ?? 5.00),
      income_ledger_id:  body.income_ledger_id || null,
      expense_ledger_id: body.expense_ledger_id || null,
    })
    .eq('id', body.id)
    .eq('company_id', companyId)
    .select()
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
    return NextResponse.json({ error: 'Service ID is required.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
