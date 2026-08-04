import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabase = createClient(
  'https://wwpjsivzxzgduthowtic.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cGpzaXZ6eHpnZHV0aG93dGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyOTUsImV4cCI6MjA5ODc2NzI5NX0.1aP8xxtxHh536LFyHcWE0ua23w5kpwJsSGy76Vlo9dQ'
)

function parseAmount(val: string): number {
  if (!val || val.trim() === '-' || val.trim() === '') return 0
  const clean = val.replace(/,/g, '').replace(/[a-zA-Z]/g, '').trim()
  if (clean.startsWith('(') && clean.endsWith(')')) {
    return -Number(clean.slice(1, -1))
  }
  return Number(clean)
}

async function run() {
  console.log('Fetching ledgers...')
  let { data: ledgers, error: lErr } = await supabase
    .from('ledgers')
    .select('id, name, company_id, group:groups(id, name)')
  
  if (lErr) throw lErr

  const { data: groups } = await supabase.from('groups').select('*')
  const debtorGroup = groups?.find(g => g.name.toLowerCase().includes('debtor') || g.name.toLowerCase().includes('customer'))
  if (!debtorGroup) throw new Error("Could not find Sundry Debtors group")
  
  const cashLedger = ledgers!.find(l => l.name.toLowerCase().includes('cash in hand') || l.name.toLowerCase().includes('cash'))
  if (!cashLedger) throw new Error("Could not find a Cash ledger to debit!")

  const companyId = cashLedger.company_id

  const raw = fs.readFileSync(path.join(__dirname, 'raw_receipts.tsv'), 'utf-8')
  const lines = raw.split('\n').filter(l => l.trim().length > 0)

  let successCount = 0

  for (const line of lines) {
    const cols = line.split('\t')
    if (cols.length < 5) continue
    
    const customer = cols[0].trim()
    const description = cols[1].trim()
    const paidAmount = parseAmount(cols[4])

    if (paidAmount <= 0) continue

    let customerLedger = ledgers!.find(l => 
      l.name.toLowerCase() === customer.toLowerCase() ||
      customer.toLowerCase().includes(l.name.toLowerCase()) ||
      l.name.toLowerCase().includes(customer.toLowerCase())
    )

    if (!customerLedger) {
      console.log(`Creating new ledger for: ${customer}`)
      const { data: newLedger, error: insErr } = await supabase.from('ledgers').insert({
        company_id: companyId,
        name: customer,
        group_id: debtorGroup.id,
        account_code: 'NEW-' + Math.floor(Math.random() * 10000),
        opening_balance: 0,
        opening_type: 'Dr'
      }).select().single()
      
      if (insErr) {
        console.error("Failed to create ledger", insErr)
        continue
      }
      customerLedger = newLedger
      ledgers!.push(newLedger as any)
    }

    // Now book receipt voucher using the local Next.js API
    const body = {
      company_id: companyId,
      type: 'RECEIPT',
      date: '2026-08-04',
      party_ledger_id: customerLedger.id,
      party_name: customerLedger.name,
      amount: paidAmount,
      grand_total: paidAmount,
      subtotal: paidAmount,
      bank_cash_ledger_id: cashLedger.id,
      narration: `Receipt for: ${description}`
    }

    const res = await fetch('http://localhost:3001/api/vouchers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const err = await res.json()
      console.error(`❌ Failed to book receipt for ${customer}:`, err)
    } else {
      console.log(`✅ Booked ${paidAmount.toFixed(3)} OMR Receipt for ${customer}`)
      successCount++
    }
  }

  console.log(`\nDONE. Successfully booked ${successCount} receipts.`)
}

run().catch(console.error)
