import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://wwpjsivzxzgduthowtic.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cGpzaXZ6eHpnZHV0aG93dGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyOTUsImV4cCI6MjA5ODc2NzI5NX0.1aP8xxtxHh536LFyHcWE0ua23w5kpwJsSGy76Vlo9dQ'
)

async function run() {
  const missing = [
    { name: "TheHub & Hurmuz", amount: 45.00, desc: "Sales Forecast & Projection" },
    { name: "Oud Al Kabir", amount: 524.00, desc: "Website Development" },
    { name: "Fortune Oman", amount: 2025.00, desc: "Visitor Management System" },
    { name: "Bidiya Burgers", amount: 224.00, desc: "Recruitment 1 Cook & 1 Helper" },
    { name: "Bidiya Burgers", amount: 112.00, desc: "Recruitment 1 Helper" }
  ]

  console.log('Fetching ledgers...')
  let { data: ledgers, error: lErr } = await supabase
    .from('ledgers')
    .select('id, name, company_id, group:groups(id, name)')
  
  if (lErr) throw lErr

  const { data: groups } = await supabase.from('groups').select('*')
  const debtorGroup = groups?.find(g => g.name.toLowerCase().includes('debtor') || g.name.toLowerCase().includes('customer'))
  
  const cashLedger = ledgers!.find(l => l.name.toLowerCase().includes('cash in hand') || l.name.toLowerCase().includes('cash'))
  const companyId = cashLedger!.company_id

  for (const item of missing) {
    let customerLedger = ledgers!.find(l => l.name.toLowerCase() === item.name.toLowerCase())

    if (!customerLedger) {
      console.log(`Creating new ledger for: ${item.name}`)
      const { data: newLedger, error: insErr } = await supabase.from('ledgers').insert({
        company_id: companyId,
        name: item.name,
        group_id: debtorGroup!.id,
        classification: 'Personal', // FIXED!
        account_code: 'NEW-' + Math.floor(Math.random() * 10000),
        opening_balance: 0,
        opening_type: 'Dr'
      }).select().single()
      
      if (insErr) {
        console.error(`Failed to create ledger for ${item.name}`, insErr)
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
      amount: item.amount,
      grand_total: item.amount,
      subtotal: item.amount,
      bank_cash_ledger_id: cashLedger!.id,
      narration: `Receipt for: ${item.desc}`
    }

    const res = await fetch('http://localhost:3001/api/vouchers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const err = await res.json()
      console.error(`❌ Failed to book receipt for ${item.name}:`, err)
    } else {
      console.log(`✅ Booked ${item.amount.toFixed(3)} OMR Receipt for ${item.name}`)
    }
  }

  console.log(`\nDONE with missing customers!`)
}

run().catch(console.error)
