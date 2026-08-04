import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://wwpjsivzxzgduthowtic.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cGpzaXZ6eHpnZHV0aG93dGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyOTUsImV4cCI6MjA5ODc2NzI5NX0.1aP8xxtxHh536LFyHcWE0ua23w5kpwJsSGy76Vlo9dQ'
)

async function run() {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*, journal_lines(*)')
    .eq('voucher_number', 'PUR-00003')
    
  console.log(JSON.stringify(data, null, 2))
}

run().catch(console.error)
