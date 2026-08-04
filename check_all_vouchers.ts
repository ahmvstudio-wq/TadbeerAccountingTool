import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://wwpjsivzxzgduthowtic.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cGpzaXZ6eHpnZHV0aG93dGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyOTUsImV4cCI6MjA5ODc2NzI5NX0.1aP8xxtxHh536LFyHcWE0ua23w5kpwJsSGy76Vlo9dQ'
)

async function run() {
  const { data: vouchers, error } = await supabase
    .from('vouchers')
    .select('id, voucher_number, type, party_name, party_ledger_id, amount')
    
  if (error) throw error
  
  console.log(`Found ${vouchers.length} total vouchers.`)
  for (const v of vouchers) {
    console.log(`- ${v.voucher_number} | Type: ${v.type} | Party: ${v.party_name} | LedgerID: ${v.party_ledger_id} | Amount: ${v.amount}`)
  }
}

run().catch(console.error)
