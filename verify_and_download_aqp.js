const http = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer');

const SUPABASE_URL = 'https://wwpjsivzxzgduthowtic.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cGpzaXZ6eHpnZHV0aG93dGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyOTUsImV4cCI6MjA5ODc2NzI5NX0.1aP8xxtxHh536LFyHcWE0ua23w5kpwJsSGy76Vlo9dQ';

function supabaseFetch(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    http.get(url, { headers }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve([]); } });
    }).on('error', reject);
  });
}

// The 19 AQP entries from the screenshot (project name → expected amount)
const SCREENSHOT_ENTRIES = [
  { project: 'Training Need Analysis & Customer Survey', total: 1400.00 },
  { project: "Marketing Managt. & Digi Maintenance - NOV'25", total: 510.00 },
  { project: "Marketing Managt. & Digi Maintenance - DEC'25", total: 510.00 },
  { project: "Marketing Managt. & Digi Maintenance - JAN'26", total: 510.00 },
  { project: "Marketing Managt. & Digi Maintenance - FEB'26", total: 510.00 },
  { project: "Marketing Managt. & Digi Maintenance - MAR'26", total: 510.00 },
  { project: "Marketing Managt. & Digi Maintenance - APR'26", total: 510.00 },
  { project: 'AQP Training & Development - NOV\'25', total: 300.00 },
  { project: 'AQP Training & Development - DEC\'25', total: 300.00 },
  { project: 'AQP Training & Development - JAN\'26', total: 300.00 },
  { project: 'AQP Training & Development - FEB\'26', total: 300.00 },
  { project: 'AQP Training & Development - MAR\'26', total: 300.00 },
  { project: 'AQP Training & Development - APR\'26', total: 300.00 },
  { project: 'AQP HR Policy & Attendance Framework', total: 425.00 },
  { project: 'Website Development', total: 120.00 },
  { project: 'Branding Kits for Digital Marketing', total: 249.00 },
  { project: 'AQP Direct Cost for Marketing - Digital Production', total: 500.00 },
  { project: 'AQP Direct Cost for Marketing - FEB', total: 253.00 },
  { project: 'AQP Direct Cost for Marketing - Santa Décor', total: 620.00 },
];

// DB narration → screenshot project mapping
const NARRATION_MAP = {
  'Training Need Analysis & Customer Survey':                       'Training Need Analysis & Customer Survey',
  'Marketing Management & Digital Maintenance':                     'Marketing',
  'Marketing Management & Digital Maintenance - Direct Cost':       'AQP Direct Cost',
  'Employee Retention & Recognition Plan':                          'AQP Training & Development',
  'CRM Solutions and WhatsApp Business':                            'CRM',
  'Website Development':                                            'Website Development',
  'Branding Kits for Digital Marketing':                            'Branding Kits for Digital Marketing',
  'AQP HR Policy & Attendance Framework':                           'AQP HR Policy & Attendance Framework',
};

async function main() {
  console.log('=== REAL-TIME CROSS-CHECK OF SCREENSHOT ENTRIES ===\n');

  // Fetch all AQP vouchers
  const aqpVouchers = await supabaseFetch(
    encodeURI('vouchers?type=eq.SALE&party_name=eq.Al Qurum Perfume&select=id,voucher_number,ref,date,amount,narration,notes&order=date.asc')
  );

  console.log(`DB has ${aqpVouchers.length} Al Qurum Perfume vouchers`);
  console.log('');

  // Group by semantic meaning to match screenshot entries
  // Training = SAL-00001 (1120) + SAL-00002 (280) = 1400
  const training = aqpVouchers.filter(v => v.narration.includes('Training Need Analysis'));
  const trainingTotal = training.reduce((s, v) => s + Number(v.amount), 0);

  const marketing = aqpVouchers.filter(v => v.narration === 'Marketing Management & Digital Maintenance');
  const directCostEntries = aqpVouchers.filter(v => v.narration.includes('Direct Cost'));
  const trainingDev = aqpVouchers.filter(v => v.narration === 'Employee Retention & Recognition Plan');
  const hrPolicy = aqpVouchers.filter(v => v.narration.includes('HR Policy'));
  const website = aqpVouchers.filter(v => v.narration === 'Website Development');
  const branding = aqpVouchers.filter(v => v.narration === 'Branding Kits for Digital Marketing');
  const crm = aqpVouchers.filter(v => v.narration.includes('CRM'));

  console.log('=== CROSS-CHECK RESULTS ===\n');

  const checks = [
    { label: 'Training Need Analysis & Customer Survey', expected: 1400, actual: trainingTotal, vouchers: training },
    { label: "Marketing Managt. & Digi Maintenance - NOV'25", expected: 510, actual: marketing[0]?.amount, vouchers: marketing.slice(0,1) },
    { label: "Marketing Managt. & Digi Maintenance - DEC'25", expected: 510, actual: marketing[1]?.amount, vouchers: marketing.slice(1,2) },
    { label: "Marketing Managt. & Digi Maintenance - JAN'26", expected: 510, actual: marketing[2]?.amount, vouchers: marketing.slice(2,3) },
    { label: "Marketing Managt. & Digi Maintenance - FEB'26", expected: 510, actual: marketing[3]?.amount, vouchers: marketing.slice(3,4) },
    { label: "Marketing Managt. & Digi Maintenance - MAR'26", expected: 510, actual: marketing[4]?.amount, vouchers: marketing.slice(4,5) },
    { label: "Marketing Managt. & Digi Maintenance - APR'26", expected: 510, actual: marketing[5]?.amount, vouchers: marketing.slice(5,6) },
    { label: "AQP Training & Development - NOV'25", expected: 300, actual: trainingDev[0]?.amount, vouchers: trainingDev.slice(0,1) },
    { label: "AQP Training & Development - DEC'25", expected: 300, actual: trainingDev[1]?.amount, vouchers: trainingDev.slice(1,2) },
    { label: "AQP Training & Development - JAN'26", expected: 300, actual: trainingDev[2]?.amount, vouchers: trainingDev.slice(2,3) },
    { label: "AQP Training & Development - FEB'26", expected: 300, actual: trainingDev[3]?.amount, vouchers: trainingDev.slice(3,4) },
    { label: "AQP Training & Development - MAR'26", expected: 300, actual: trainingDev[4]?.amount, vouchers: trainingDev.slice(4,5) },
    { label: "AQP Training & Development - APR'26", expected: 300, actual: trainingDev[5]?.amount, vouchers: trainingDev.slice(5,6) },
    { label: 'AQP HR Policy & Attendance Framework', expected: 425, actual: hrPolicy[0]?.amount, vouchers: hrPolicy },
    { label: 'Website Development', expected: 120, actual: website[0]?.amount, vouchers: website },
    { label: 'Branding Kits for Digital Marketing', expected: 249, actual: branding[0]?.amount, vouchers: branding },
    { label: 'AQP Direct Cost - Digital Production', expected: 500, actual: directCostEntries.find(v=>v.amount==500)?.amount, vouchers: directCostEntries.filter(v=>v.amount==500) },
    { label: 'AQP Direct Cost - FEB', expected: 253, actual: directCostEntries.find(v=>v.amount==253)?.amount, vouchers: directCostEntries.filter(v=>v.amount==253) },
    { label: 'AQP Direct Cost - Santa Décor', expected: 620, actual: directCostEntries.find(v=>v.amount==620)?.amount, vouchers: directCostEntries.filter(v=>v.amount==620) },
  ];

  let allOk = true;
  const voucherIdsToDownload = [];

  for (const c of checks) {
    const ok = Math.abs(Number(c.actual) - c.expected) < 0.01;
    const icon = ok ? '✅' : '❌';
    if (!ok) allOk = false;
    const vNums = c.vouchers.map(v => v.voucher_number).join(', ');
    console.log(`${icon} ${c.label}`);
    console.log(`   Expected: ${c.expected} | DB: ${Number(c.actual || 0).toFixed(3)} | Voucher(s): ${vNums || 'MISSING'}`);
    c.vouchers.forEach(v => { if (!voucherIdsToDownload.find(x => x.id === v.id)) voucherIdsToDownload.push(v); });
  }

  console.log('');
  console.log(allOk ? '✅ ALL ENTRIES VERIFIED - DATA IS CORRECT' : '⚠️  SOME ENTRIES NEED ATTENTION');
  console.log(`\nVouchers to download: ${voucherIdsToDownload.length}`);
  voucherIdsToDownload.forEach(v => console.log(`  ${v.voucher_number} | ${v.ref} | ${v.amount} OMR | ${v.narration}`));

  // Now generate PDFs using Puppeteer
  await generatePDFs(voucherIdsToDownload);
}

// Fetch full voucher data including lines for PDF rendering
async function fetchVoucherFull(voucherId) {
  const [voucher, journalLines, voucherLines, settings] = await Promise.all([
    supabaseFetch(`vouchers?id=eq.${voucherId}&select=*`).then(r => r[0]),
    supabaseFetch(`journal_lines?voucher_id=eq.${voucherId}&select=*`),
    supabaseFetch(`voucher_lines?voucher_id=eq.${voucherId}&select=*`),
    supabaseFetch('company_settings?select=*&limit=1').then(r => r[0]),
  ]);
  return { voucher, journalLines, voucherLines, settings };
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtAmt(n) {
  return `OMR ${Number(n || 0).toFixed(3)}`;
}

function amountInWords(num) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
    return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + convert(n%100) : '');
  }
  const total = Math.round(num * 1000);
  const omr = Math.floor(total / 1000);
  const baisa = total % 1000;
  let result = omr > 0 ? convert(omr) + ' Omani Rial' : '';
  if (baisa > 0) result += (result ? ' and ' : '') + convert(baisa) + ' Baisa';
  return result + ' Only';
}

function buildInvoiceHTML(voucher, voucherLines, settings) {
  const company = settings || {};
  const compName = company.company_name || 'Tadbeer Transformations L.L.C';
  const address1 = company.address_line1 || 'P.O. Box 10, PC 131';
  const address2 = company.address_line2 || 'Hamriya, Muscat, Sultanate of Oman';
  const phone = company.phone || '+968 9999 9999';
  const email = company.email || 'operation@tadbeertt.com';
  const vatNum = company.vat_number || 'OM1100354052';
  const logo = company.logo_url || '';

  const date = fmtDate(voucher.date);
  const dueDate = voucher.due_date ? fmtDate(voucher.due_date) : date;
  const invoiceNum = voucher.ref || voucher.voucher_number;
  const party = voucher.party_name || '';
  const amount = Number(voucher.amount || 0);
  const vatTotal = Number(voucher.vat_total || 0);
  const grandTotal = Number(voucher.grand_total || amount);

  // Build line items rows
  const lines = voucherLines && voucherLines.length > 0 ? voucherLines : [
    { description: voucher.narration, quantity: 1, rate: amount, amount: amount, vat_rate: 0, vat_amount: 0 }
  ];

  const lineRows = lines.map((l, i) => `
    <tr>
      <td style="padding:8px;border:1px solid #e2e8f0;text-align:center;font-size:12px;">${i + 1}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;font-size:12px;">${l.description || voucher.narration}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;text-align:center;font-size:12px;">${Number(l.quantity || 1).toFixed(2)}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;text-align:right;font-size:12px;">${Number(l.rate || l.amount || 0).toFixed(3)}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;text-align:center;font-size:12px;">${Number(l.vat_rate || 0).toFixed(1)}%</td>
      <td style="padding:8px;border:1px solid #e2e8f0;text-align:right;font-size:12px;">${Number(l.vat_amount || 0).toFixed(3)}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:600;">${Number(l.amount || 0).toFixed(3)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; background: #fff; color: #1a1a1a; padding: 20px; font-size: 13px; }
  @page { size: A4 portrait; margin: 10mm; }
  @media print { body { padding: 0; } }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #0d7c5f; }
  .logo-section { display: flex; flex-direction: column; }
  .company-name { font-size: 20px; font-weight: 800; color: #0d7c5f; }
  .company-sub { font-size: 10px; color: #666; margin-top: 2px; }
  .invoice-badge { background: #0d7c5f; color: #fff; padding: 8px 20px; border-radius: 6px; font-size: 18px; font-weight: 700; text-align: center; }
  .invoice-meta { font-size: 11px; color: #666; text-align: right; margin-top: 4px; }
  .parties { display: flex; gap: 20px; margin-bottom: 20px; }
  .party-box { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
  .party-label { font-size: 10px; font-weight: 700; color: #0d7c5f; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .party-name { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
  .party-detail { font-size: 11px; color: #666; margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead th { background: #0d7c5f; color: #fff; padding: 8px; text-align: left; font-size: 11px; font-weight: 600; }
  thead th:last-child, thead th:nth-child(4), thead th:nth-child(6) { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .totals-table { width: 280px; }
  .totals-table td { padding: 5px 8px; font-size: 12px; border: 1px solid #e2e8f0; }
  .totals-table .grand td { background: #0d7c5f; color: #fff; font-weight: 700; font-size: 13px; }
  .words-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
  .words-label { font-size: 10px; font-weight: 700; color: #0d7c5f; text-transform: uppercase; letter-spacing: 1px; }
  .words-text { font-size: 12px; font-weight: 600; margin-top: 2px; }
  .footer { display: flex; gap: 20px; margin-top: 16px; }
  .bank-box { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
  .bank-title { font-size: 11px; font-weight: 700; color: #0d7c5f; margin-bottom: 6px; }
  .bank-row { font-size: 11px; color: #444; margin-top: 2px; }
  .sign-box { width: 200px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; min-height: 90px; }
  .sign-label { font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 4px; width: 100%; text-align: center; }
  .notes-box { background: #fffbeb; border: 1px dashed #f59e0b; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; font-size: 11px; }
  .vat-notice { font-size: 10px; color: #888; text-align: center; margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
</style>
</head>
<body>

<div class="header">
  <div class="logo-section">
    <div class="company-name">${compName}</div>
    <div class="company-sub">Transforming Businesses. Delivering Results.</div>
    <div style="font-size:10px;color:#666;margin-top:6px;">${address1} | ${address2}</div>
    <div style="font-size:10px;color:#666;">Tel: ${phone} | Email: ${email}</div>
    <div style="font-size:10px;color:#666;">VAT Reg. No.: ${vatNum}</div>
  </div>
  <div style="text-align:right;">
    <div class="invoice-badge">TAX INVOICE</div>
    <div class="invoice-meta">Invoice No: <strong>${invoiceNum}</strong></div>
    <div class="invoice-meta">Date: <strong>${date}</strong></div>
    <div class="invoice-meta">Due Date: <strong>${dueDate}</strong></div>
  </div>
</div>

<div class="parties">
  <div class="party-box">
    <div class="party-label">Invoice To</div>
    <div class="party-name">${party}</div>
    <div class="party-detail">Muscat, Sultanate of Oman</div>
  </div>
  <div class="party-box">
    <div class="party-label">Invoice From</div>
    <div class="party-name">${compName}</div>
    <div class="party-detail">${address1}</div>
    <div class="party-detail">${address2}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:40px;text-align:center;">#</th>
      <th>Description of Services</th>
      <th style="width:60px;text-align:center;">Qty</th>
      <th style="width:90px;text-align:right;">Rate (OMR)</th>
      <th style="width:60px;text-align:center;">VAT%</th>
      <th style="width:80px;text-align:right;">VAT Amt</th>
      <th style="width:100px;text-align:right;">Amount (OMR)</th>
    </tr>
  </thead>
  <tbody>
    ${lineRows}
  </tbody>
</table>

<div class="totals">
  <table class="totals-table">
    <tr><td>Subtotal</td><td style="text-align:right;">${fmtAmt(amount)}</td></tr>
    <tr><td>VAT (${vatTotal > 0 ? '5%' : '0%'})</td><td style="text-align:right;">${fmtAmt(vatTotal)}</td></tr>
    <tr class="grand"><td><strong>Grand Total</strong></td><td style="text-align:right;"><strong>${fmtAmt(grandTotal)}</strong></td></tr>
  </table>
</div>

<div class="words-box">
  <div class="words-label">Amount in Words</div>
  <div class="words-text">${amountInWords(grandTotal)}</div>
</div>

${voucher.notes ? `<div class="notes-box"><strong>Note:</strong> ${voucher.notes}</div>` : ''}

<div class="footer">
  <div class="bank-box">
    <div class="bank-title">Payment Details — Bank Muscat</div>
    <div class="bank-row"><strong>Account Name:</strong> Tadbeer Transformations L.L.C</div>
    <div class="bank-row"><strong>Account No:</strong> 0706061856040010</div>
    <div class="bank-row"><strong>IBAN:</strong> OM040021070606185604001</div>
    <div class="bank-row"><strong>Branch:</strong> Hamriya Branch, Muscat</div>
  </div>
  <div class="sign-box">
    <div style="flex:1;"></div>
    <div class="sign-label">Authorised Signature &amp; Stamp</div>
  </div>
</div>

<div class="vat-notice">
  This is a computer-generated invoice. VAT Registration No: ${vatNum} | Tadbeer Transformations L.L.C
</div>

</body>
</html>`;
}

async function generatePDFs(vouchers) {
  const OUT_DIR = 'C:\\Users\\Mohammed_Rehan\\Downloads\\Tadbeer(Accountign Tool)\\tadbeer-accounting\\public\\AQP_Invoices';
  const ZIP_PATH = 'C:\\Users\\Mohammed_Rehan\\Downloads\\Tadbeer(Accountign Tool)\\tadbeer-accounting\\public\\AQP_All_Invoices.zip';

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n=== GENERATING ${vouchers.length} PDFs ===`);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  let ok = 0;
  for (const v of vouchers) {
    try {
      const { voucher, voucherLines, settings } = await fetchVoucherFull(v.id);
      const html = buildInvoiceHTML(voucher, voucherLines, settings);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 300));
      const refClean = (voucher.ref || voucher.voucher_number).replace(/[\/\\]/g, '_');
      const fname = `Invoice_${refClean}_${v.voucher_number}.pdf`;
      await page.pdf({ path: path.join(OUT_DIR, fname), format: 'A4', printBackground: true, margin: { top: '8mm', bottom: '8mm', left: '10mm', right: '10mm' } });
      await page.close();
      console.log(`  ✅ ${fname}`);
      ok++;
    } catch(err) {
      console.error(`  ❌ ${v.voucher_number}: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\n✅ Generated ${ok}/${vouchers.length} PDFs in ${OUT_DIR}`);

  if (ok > 0) {
    execSync(`powershell -Command "Compress-Archive -Force -Path '${OUT_DIR}\\*' -DestinationPath '${ZIP_PATH}'"`, { stdio: 'inherit' });
    console.log(`🎉 ZIP ready: ${ZIP_PATH}`);
    console.log(`🌐 Download at: http://localhost:3000/AQP_All_Invoices.zip`);
  }
}

main().catch(console.error);
