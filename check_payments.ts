import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://wwpjsivzxzgduthowtic.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cGpzaXZ6eHpnZHV0aG93dGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyOTUsImV4cCI6MjA5ODc2NzI5NX0.1aP8xxtxHh536LFyHcWE0ua23w5kpwJsSGy76Vlo9dQ'
)

async function run() {
  console.log('Fetching ledgers...')
  const { data: ledgers, error: lErr } = await supabase
    .from('ledgers')
    .select('id, name, group:groups(id, name, nature)')
  
  if (lErr) throw lErr
  
  const suppliers = ledgers.filter(l => {
    const gn = l.group?.name?.toLowerCase() || ''
    return gn.includes('creditor') || gn.includes('supplier') || gn.includes('payable')
  })
  
  console.log('Found suppliers/creditors:', suppliers.map(s => s.name))
  
  console.log('Fetching PAYMENT vouchers...')
  const { data: payments, error: pErr } = await supabase
    .from('vouchers')
    .select('*, journal_lines(*)')
    .eq('type', 'PAYMENT')
    
  if (pErr) throw pErr
  
  console.log(`Found ${payments.length} payment vouchers.`)
  
  let matches = 0
  for (const p of payments) {
    if (p.party_name) {
      const match = suppliers.find(s => s.name.toLowerCase() === p.party_name.toLowerCase())
      if (match) {
        matches++
        console.log(`Match found! Voucher ${p.voucher_number} has party_name "${p.party_name}" which matches ledger "${match.name}" (ID: ${match.id})`)
        console.log(`Current party_ledger_id: ${p.party_ledger_id}`)
        const drLine = p.journal_lines.find((l: any) => l.type === 'Dr')
        console.log(`Current Dr ledger_id: ${drLine?.ledger_id}`)
      }
    }
  }
  
  console.log(`Total matches needing possible fix: ${matches}`)
}

run().catch(console.error)
