const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wwpjsivzxzgduthowtic.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cGpzaXZ6eHpnZHV0aG93dGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyOTUsImV4cCI6MjA5ODc2NzI5NX0.1aP8xxtxHh536LFyHcWE0ua23w5kpwJsSGy76Vlo9dQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: vLines, error: err } = await supabase
    .from('voucher_lines')
    .select('*')
    .limit(10);
  
  console.log("Voucher lines:", vLines);
  console.log("Select Error:", err);

  const testInsert = {
    voucher_id: 'b6620bdc-e4db-4e5b-b4f5-5d7d233d2056', // SAL-00004
    ledger_id: '10000000-0000-0000-0000-000000000013', // Service Income
    description: 'Test Line Description',
    quantity: 2,
    rate: 50,
    amount: 100,
    vat_rate: 5,
    vat_amount: 5
  };

  const { data: insertData, error: insertErr } = await supabase
    .from('voucher_lines')
    .insert([testInsert])
    .select();

  console.log("Insert result:", insertData);
  console.log("Insert error:", insertErr);
}

run();
