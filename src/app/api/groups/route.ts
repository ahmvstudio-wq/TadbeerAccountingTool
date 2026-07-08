import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

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
    .from('groups')
    .select('*')
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase() as any
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  const { data, error } = await supabase
    .from('groups')
    .insert({
      name:       body.name,
      parent_id:  body.parent_id && body.parent_id !== "" ? body.parent_id : null,
      nature:     body.nature,
      is_system:  false,
      sort_order: body.sort_order ?? 99,
      created_by: body.created_by ?? null,
      company_id: companyId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabase() as any
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'
  
  if (!body.id) {
    return NextResponse.json({ error: 'Group ID is required for editing.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('groups')
    .update({
      name:       body.name,
      parent_id:  body.parent_id && body.parent_id !== "" ? body.parent_id : null,
      nature:     body.nature,
    })
    .eq('id', body.id)
    .eq('company_id', companyId)
    .select()
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
    return NextResponse.json({ error: 'Group ID is required for deletion.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    return NextResponse.json({ error: 'Cannot delete group. Ensure it has no subgroups or accounts linked to it.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
