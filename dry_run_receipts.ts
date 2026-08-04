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
  const { data: ledgers, error: lErr } = await supabase
    .from('ledgers')
    .select('id, name, group:groups(id, name)')
  
  if (lErr) throw lErr
  
  const cashLedger = ledgers.find(l => l.name.toLowerCase().includes('cash in hand') || l.name.toLowerCase().includes('cash'))
  if (!cashLedger) {
    console.error("Could not find a Cash ledger to debit!")
    return
  }

  const raw = fs.readFileSync(path.join(__dirname, 'raw_receipts.tsv'), 'utf-8')
  const lines = raw.split('\n').filter(l => l.trim().length > 0)

  let totalToReceipt = 0
  let receiptCount = 0

  console.log(`\n--- Dry Run: Processing ${lines.length} rows ---`)

  for (const line of lines) {
    const cols = line.split('\t')
    if (cols.length < 5) continue
    
    const customer = cols[0].trim()
    const description = cols[1].trim()
    
    // We handle the possibility of weird tabs (e.g. empty columns)
    // Looking at the data, the 'paid' column is usually the 5th non-empty numerical column
    // but splitting by tab might give empty strings for missing values.
    // In TSV: col 0 = customer, col 1 = description, col 2 = total, col 3 = billed, col 4 = paid
    const paidAmount = parseAmount(cols[4])

    if (paidAmount <= 0) continue // Skip un-paid items

    // Match customer ledger
    const customerLedger = ledgers.find(l => 
      l.name.toLowerCase() === customer.toLowerCase() ||
      customer.toLowerCase().includes(l.name.toLowerCase()) ||
      l.name.toLowerCase().includes(customer.toLowerCase())
    )

    if (!customerLedger) {
      console.log(`❌ FAILED TO MATCH CUSTOMER: "${customer}"`)
      continue
    }

    console.log(`✅ WILL BOOK: ${paidAmount.toFixed(3)} OMR from [${customerLedger.name}]`)
    console.log(`   Narration: Receipt for - ${description}`)
    totalToReceipt += paidAmount
    receiptCount++
  }

  console.log(`\n--- Summary ---`)
  console.log(`Total Receipts to Book: ${receiptCount}`)
  console.log(`Total Amount: ${totalToReceipt.toFixed(3)} OMR`)
  console.log(`Debit Ledger: ${cashLedger.name}`)
}

run().catch(console.error)
