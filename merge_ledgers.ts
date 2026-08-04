import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://wwpjsivzxzgduthowtic.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cGpzaXZ6eHpnZHV0aG93dGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyOTUsImV4cCI6MjA5ODc2NzI5NX0.1aP8xxtxHh536LFyHcWE0ua23w5kpwJsSGy76Vlo9dQ'
)

async function mergeLedgers(sourceName: string, targetName: string) {
  const { data: ledgers } = await supabase.from('ledgers').select('*').in('name', [sourceName, targetName])
  if (!ledgers) return console.error('Failed to fetch ledgers')

  const source = ledgers.find(l => l.name === sourceName)
  const target = ledgers.find(l => l.name === targetName)

  if (!source || !target) {
    console.error(`Could not find both ${sourceName} and ${targetName}`)
    console.log('Found:', ledgers.map(l => l.name))
    return
  }

  console.log(`Merging ${source.name} (${source.id}) -> ${target.name} (${target.id})`)

  // Update vouchers where party_ledger_id is source
  const { error: vErr } = await supabase.from('vouchers')
    .update({ party_ledger_id: target.id, party_name: target.name })
    .eq('party_ledger_id', source.id)
  if (vErr) console.error('Error updating vouchers:', vErr)
  else console.log(`Vouchers updated for ${source.name}`)

  // Update journal_lines where ledger_id is source
  const { error: jlErr } = await supabase.from('journal_lines')
    .update({ ledger_id: target.id })
    .eq('ledger_id', source.id)
  if (jlErr) console.error('Error updating journal_lines:', jlErr)
  else console.log(`Journal lines updated for ${source.name}`)

  // Update settlements where party_ledger_id is source
  const { error: sErr } = await supabase.from('settlements')
    .update({ party_ledger_id: target.id })
    .eq('party_ledger_id', source.id)
  if (sErr) console.error('Error updating settlements:', sErr)
  else console.log(`Settlements updated for ${source.name}`)

  // Delete source ledger
  const { error: dErr } = await supabase.from('ledgers').delete().eq('id', source.id)
  if (dErr) console.error('Error deleting source ledger:', dErr)
  else console.log(`Source ledger deleted for ${source.name}`)
}

async function run() {
  await mergeLedgers("Laila's exceptional projects", "Laila's Exceptional Projects")
  await mergeLedgers("Burger Restaurant – Bidiya", "Bidiya Burgers")
  await mergeLedgers("Fortune Oman", "Fortune Technology Solutions LLC")
}

run()
