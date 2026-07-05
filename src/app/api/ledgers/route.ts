import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('ledgers')
    .select('*, group:groups(id, name, nature)')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const { data, error } = await supabase
    .from('ledgers')
    .insert({
      name:            body.name,
      group_id:        body.group_id,
      opening_balance: body.opening_balance ?? 0,
      opening_type:    body.opening_type ?? 'Dr',
      description:     body.description ?? null,
      is_system:       false,
    })
    .select('*, group:groups(id, name, nature)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()

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
    })
    .eq('id', body.id)
    .select('*, group:groups(id, name, nature)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Ledger ID is required for deletion.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ledgers')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Cannot delete account. Ensure it has no transaction voucher history linked to it.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
