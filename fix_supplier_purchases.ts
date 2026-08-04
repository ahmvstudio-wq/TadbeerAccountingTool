import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://wwpjsivzxzgduthowtic.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cGpzaXZ6eHpnZHV0aG93dGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyOTUsImV4cCI6MjA5ODc2NzI5NX0.1aP8xxtxHh536LFyHcWE0ua23w5kpwJsSGy76Vlo9dQ'
)

async function run() {
  console.log('Fetching ledgers...')
  const { data: ledgers, error: lErr } = await supabase
    .from('ledgers')
    .select('id, name, group:groups(id, name)')
  
  if (lErr) throw lErr
  
  const suppliers = ledgers.filter(l => l.group?.name?.toLowerCase().includes('creditor') || l.group?.name?.toLowerCase().includes('supplier') || l.name === 'Sundry Creditors')
  
  const rootCreditorLedger = suppliers.find(s => s.name === 'Sundry Creditors')
  if (!rootCreditorLedger) {
    console.error("Could not find root Sundry Creditors ledger")
    return
  }

  console.log('Fetching PURCHASE vouchers...')
  const { data: purchases, error: pErr } = await supabase
    .from('vouchers')
    .select('*, journal_lines(*)')
    .eq('type', 'PURCHASE')
    
  if (pErr) throw pErr
  
  let fixedCount = 0
  
  for (const p of purchases) {
    const crLine = p.journal_lines.find((l: any) => l.type === 'Cr' && l.ledger_id === rootCreditorLedger.id)
    
    if (crLine && p.party_name) {
      // Find matching specific supplier
      const match = suppliers.find(s => s.name.toLowerCase() === p.party_name.toLowerCase() && s.id !== rootCreditorLedger.id)
      
      if (match) {
        console.log(`Fixing Voucher ${p.voucher_number} - Matching party_name "${p.party_name}" to ledger ID ${match.id}`)
        
        // 1. Update Voucher's party_ledger_id
        const { error: vErr } = await supabase
          .from('vouchers')
          .update({ party_ledger_id: match.id })
          .eq('id', p.id)
          
        if (vErr) {
          console.error(`Failed to update voucher ${p.voucher_number}:`, vErr)
          continue
        }
        
        // 2. Update Journal Line's ledger_id
        const { error: jlErr } = await supabase
          .from('journal_lines')
          .update({ ledger_id: match.id })
          .eq('id', crLine.id)
          
        if (jlErr) {
          console.error(`Failed to update journal line for ${p.voucher_number}:`, jlErr)
        } else {
          fixedCount++
          console.log(`✅ Fixed ${p.voucher_number}`)
        }
      }
    }
  }
  
  console.log(`Done! Fixed ${fixedCount} vouchers.`)
}

run().catch(console.error)
