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
  const content = fs.readFileSync(path.join(__dirname, 'raw_payments.tsv'), 'utf-8')
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  
  const headers = lines[0].split('\t') // Supplier, Project, TOTAL, COGS, PAID, BALANCE
  const rows = lines.slice(1).map(l => l.split('\t'))
  
  const companyId = 'c0de0000-0000-0000-0000-000000000000'

  console.log('Fetching ledgers...')
  const { data: ledgers, error: ledgersErr } = await supabase
    .from('ledgers')
    .select('*')
  
  if (ledgersErr) throw ledgersErr

  const { data: groups, error: groupsErr } = await supabase
    .from('groups')
    .select('*')

  if (groupsErr) throw groupsErr

  const supplierGroup = groups.find(g => g.name === 'Sundry Creditors')
  if (!supplierGroup) throw new Error("Could not find Sundry Creditors group!")
  const cashLedger = ledgers.find(l => l.name.toLowerCase().includes('cash in hand') || l.name.toLowerCase().includes('cash'))
  if (!cashLedger) throw new Error("Could not find Cash in Hand ledger!")

  let totalToReceipt = 0
  let receiptCount = 0

  console.log(`\n--- Dry Run: Processing ${rows.length} rows ---`)

  for (const row of rows) {
    const supplierName = row[0]?.trim() || ''
    const project = row[1]?.trim() || ''
    let paidStr = row[4]?.trim() || ''

    if (paidStr === '-' || paidStr === '—') paidStr = '0'
    const paidAmount = parseFloat(paidStr.replace(/,/g, '')) || 0

    if (paidAmount <= 0) {
      console.log(`Skipping zero payment for ${supplierName} (${project})`)
      continue
    }

    let supplierLedger = ledgers.find(l => l.name.toLowerCase() === supplierName.toLowerCase())

    if (!supplierLedger) {
      console.log(`Creating new ledger for: ${supplierName}`)
      const { data: newL, error: insErr } = await supabase.from('ledgers').insert({
        company_id: companyId,
        name: supplierName,
        group_id: supplierGroup.id,
        classification: 'Personal',
        account_code: 'NEW-' + Math.floor(Math.random() * 10000),
        opening_balance: 0,
        opening_type: 'Cr'
      }).select().single()

      if (insErr) {
        console.error(`Failed to create ${supplierName}:`, insErr)
        continue
      }
      supplierLedger = newL
      ledgers.push(newL)
    }

    // Book PAYMENT
    const vNo = 'PAY-' + Math.floor(Math.random() * 1000000).toString().padStart(5, '0')
    const { data: v, error: vErr } = await supabase.from('vouchers').insert({
      company_id: companyId,
      voucher_number: vNo,
      type: 'PAYMENT',
      date: '2026-08-04',
      amount: paidAmount,
      grand_total: paidAmount,
      currency: 'OMR',
      narration: `Payment for: ${project}`,
      party_name: supplierLedger.name,
      party_ledger_id: supplierLedger.id
    }).select().single()

    if (vErr) {
      console.error(`Failed to create voucher for ${supplierName}:`, vErr)
      continue
    }

    // Journal lines: Debit Supplier, Credit Cash
    await supabase.from('journal_lines').insert([
      {
        voucher_id: v.id,
        ledger_id: supplierLedger.id,
        type: 'Dr',
        amount: paidAmount
      },
      {
        voucher_id: v.id,
        ledger_id: cashLedger.id,
        type: 'Cr',
        amount: paidAmount
      }
    ])

    console.log(`✅ BOOKED: ${paidAmount.toFixed(3)} OMR to [${supplierLedger.name}]`)
    totalToReceipt += paidAmount
    receiptCount++
  }

  console.log(`\n--- Summary ---`)
  console.log(`Total Payments Booked: ${receiptCount}`)
  console.log(`Total Amount: ${totalToReceipt.toFixed(3)} OMR`)
  console.log(`Debit Ledger: ${cashLedger.name}`)
}

run().catch(console.error)
