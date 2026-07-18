import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as any
}

// GET: Fetch settlements or outstanding invoices
export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const companyId = url.searchParams.get('company_id') || 'c0de0000-0000-0000-0000-000000000000'
  const action = url.searchParams.get('action') || 'list'
  const partyLedgerId = url.searchParams.get('party_ledger_id')
  const voucherId = url.searchParams.get('voucher_id')
  const voucherType = url.searchParams.get('voucher_type') // SALE or PURCHASE

  if (action === 'outstanding' && partyLedgerId && voucherType) {
    // Fetch outstanding invoices for a party
    // For SALE type: find unsettled sales invoices
    // For PURCHASE type: find unsettled purchase vouchers
    const { data: invoices, error } = await supabase
      .from('vouchers')
      .select('*')
      .eq('company_id', companyId)
      .eq('party_ledger_id', partyLedgerId)
      .eq('type', voucherType)
      .order('date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fetch all settlements for these invoices
    const invoiceIds = (invoices || []).map((inv: any) => inv.id)
    
    let settlements: any[] = []
    if (invoiceIds.length > 0) {
      const { data: sett } = await supabase
        .from('settlements')
        .select('*')
        .in('target_voucher_id', invoiceIds)
      settlements = sett || []
    }

    // Calculate outstanding for each invoice
    const result = (invoices || []).map((invoice: any) => {
      const settled = settlements
        .filter(s => s.target_voucher_id === invoice.id)
        .reduce((sum, s) => sum + Number(s.allocated_amount), 0)
      const total = Number(invoice.grand_total || invoice.amount || 0)
      const outstanding = Math.round((total - settled) * 1000) / 1000

      return {
        ...invoice,
        total_amount: total,
        settled_amount: settled,
        outstanding_amount: outstanding > 0 ? outstanding : 0,
        is_fully_settled: outstanding <= 0.001,
      }
    }).filter((inv: any) => inv.outstanding_amount > 0.001) // Only show unsettled invoices

    return NextResponse.json(result)
  }

  if (action === 'settlements' && voucherId) {
    // Fetch settlements for a specific voucher (either as source or target)
    const { data: asSource } = await supabase
      .from('settlements')
      .select('*')
      .eq('source_voucher_id', voucherId)
      .order('created_at', { ascending: true })

    const { data: asTarget } = await supabase
      .from('settlements')
      .select('*')
      .eq('target_voucher_id', voucherId)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      as_source: asSource || [],
      as_target: asTarget || [],
    })
  }

  // Default: list all settlements
  let q = supabase
    .from('settlements')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (partyLedgerId) q = q.eq('party_ledger_id', partyLedgerId)
  if (voucherId) q = q.eq('source_voucher_id', voucherId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: Create settlements (allocate receipt/payment to invoices)
export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const companyId = body.company_id || 'c0de0000-0000-0000-0000-000000000000'

  const {
    source_voucher_id,
    source_voucher_number,
    source_type, // RECEIPT or PAYMENT
    party_ledger_id,
    party_name,
    allocations, // [{ target_voucher_id, target_voucher_number, target_type, amount }]
    on_account_amount, // any unallocated amount
  } = body

  if (!source_voucher_id) {
    return NextResponse.json({ error: 'Source voucher is required.' }, { status: 400 })
  }

  const settlementInserts: any[] = []

  // Create settlement records for each allocation
  if (allocations && allocations.length > 0) {
    for (const alloc of allocations) {
      if (!alloc.target_voucher_id || alloc.amount <= 0) continue
      
      settlementInserts.push({
        company_id: companyId,
        source_voucher_id,
        source_voucher_number: source_voucher_number || '',
        source_type: source_type || 'RECEIPT',
        target_voucher_id: alloc.target_voucher_id,
        target_voucher_number: alloc.target_voucher_number || '',
        target_type: alloc.target_type || (source_type === 'RECEIPT' ? 'SALE' : 'PURCHASE'),
        party_ledger_id,
        party_name: party_name || null,
        allocated_amount: Number(alloc.amount),
        is_on_account: false,
      })
    }
  }

  // Create on-account record for any unallocated amount
  if (on_account_amount && Number(on_account_amount) > 0) {
    settlementInserts.push({
      company_id: companyId,
      source_voucher_id,
      source_voucher_number: source_voucher_number || '',
      source_type: source_type || 'RECEIPT',
      target_voucher_id: null,
      target_voucher_number: null,
      target_type: null,
      party_ledger_id,
      party_name: party_name || null,
      allocated_amount: Number(on_account_amount),
      is_on_account: true,
    })
  }

  if (settlementInserts.length === 0) {
    // Mark entire receipt/payment as on-account if no allocations provided
    settlementInserts.push({
      company_id: companyId,
      source_voucher_id,
      source_voucher_number: source_voucher_number || '',
      source_type: source_type || 'RECEIPT',
      target_voucher_id: null,
      target_voucher_number: null,
      target_type: null,
      party_ledger_id,
      party_name: party_name || null,
      allocated_amount: Number(body.source_amount || 0),
      is_on_account: true,
    })
  }

  // Validate: total allocations must not exceed source amount
  const totalAllocated = settlementInserts.reduce((sum, s) => sum + Number(s.allocated_amount), 0)
  const sourceAmount = Number(body.source_amount || 0)
  
  if (sourceAmount > 0 && totalAllocated > sourceAmount + 0.001) {
    return NextResponse.json({ 
      error: `Total allocation (${totalAllocated.toFixed(3)}) cannot exceed source amount (${sourceAmount.toFixed(3)}).` 
    }, { status: 400 })
  }

  // Validate: allocations must not exceed outstanding amounts
  if (allocations && allocations.length > 0) {
    const targetIds = allocations.map((a: any) => a.target_voucher_id).filter(Boolean)
    if (targetIds.length > 0) {
      // Fetch current settlements for these targets
      const { data: existingSettlements } = await supabase
        .from('settlements')
        .select('target_voucher_id, allocated_amount')
        .in('target_voucher_id', targetIds)

      // Fetch the target invoices
      const { data: targets } = await supabase
        .from('vouchers')
        .select('id, grand_total, amount')
        .in('id', targetIds)

      for (const alloc of allocations) {
        if (!alloc.target_voucher_id) continue
        const invoice = (targets || []).find((t: any) => t.id === alloc.target_voucher_id)
        if (!invoice) continue

        const alreadySettled = (existingSettlements || [])
          .filter((s: any) => s.target_voucher_id === alloc.target_voucher_id)
          .reduce((sum: number, s: any) => sum + Number(s.allocated_amount), 0)

        const invoiceTotal = Number(invoice.grand_total || invoice.amount || 0)
        const remaining = invoiceTotal - alreadySettled

        if (Number(alloc.amount) > remaining + 0.001) {
          return NextResponse.json({
            error: `Allocation of ${Number(alloc.amount).toFixed(3)} exceeds outstanding balance of ${remaining.toFixed(3)} for invoice.`
          }, { status: 400 })
        }
      }
    }
  }

  // Insert settlement records
  const { data, error } = await supabase
    .from('settlements')
    .insert(settlementInserts)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE: Reverse a settlement
export async function DELETE(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const companyId = url.searchParams.get('company_id') || 'c0de0000-0000-0000-0000-000000000000'

  if (!id) {
    return NextResponse.json({ error: 'Settlement ID required.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('settlements')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
