const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000';

// All 23 Al Qurum Perfume voucher IDs (from DB)
const QURUM_VOUCHERS = [
  { id: '6f94d106-52a0-428a-8e81-ea75d72229c1', num: 'SAL-00001', ref: 'TTT_25_070111' },
  { id: 'f7ab46e0-5bf2-4c57-b813-2a30ad5a7de1', num: 'SAL-00002', ref: 'TTT_25_070112' },
  { id: 'cbd93387-595d-476c-af7a-28f93a319ad6', num: 'SAL-00026', ref: 'TTT_25_070136' },
  { id: '061755f8-a0ae-445a-b1aa-bcdc092dc671', num: 'SAL-00027', ref: 'TTT_25_070137' },
  { id: '813c8718-a9bc-4f2d-ab79-9c83920fe11b', num: 'SAL-00028', ref: 'TTT_25_070138' },
  { id: '53f8a4ad-fc0e-4068-98db-09010d776933', num: 'SAL-00029', ref: 'TTT_25_070139' },
  { id: '531f9f1d-e001-456e-a2a0-49fcdce54c46', num: 'SAL-00031', ref: 'TTT_25_070141' },
  { id: 'c2b62eff-a60d-43cf-a209-7c90a012c7f8', num: 'SAL-00035', ref: 'TTT_25_070145' },
  { id: 'd09847cf-434a-402b-9af7-65fe6fe11f03', num: 'SAL-00037', ref: 'TTT_25_070147' },
  { id: '831b79cf-ced2-4f6c-bd8d-4059b9f77309', num: 'SAL-00036', ref: 'TTT_25_070146' },
  { id: 'cb9d89d0-4ca8-48a4-9ea2-2ac8cb67f028', num: 'SAL-00045', ref: 'TTT_25_070156' },
  { id: '6e91d6cb-5cc6-462d-8065-d4ddec363759', num: 'SAL-00046', ref: 'TTT_25_070157' },
  { id: 'a8531429-eaed-4d0e-8c04-eaddde5693e1', num: 'SAL-00051', ref: 'TTT_25_070162' },
  { id: '445a840d-b97c-49ac-8443-43dda68e8ca8', num: 'SAL-00052', ref: 'TTT_25_070163' },
  { id: 'c577c362-35a3-4a01-9228-7c6222b47c6d', num: 'SAL-00053', ref: 'TTT_25_070164' },
  { id: '79fe7000-b328-446b-9f98-47a3f6db63ba', num: 'SAL-00056', ref: 'TTT_25_070167' },
  { id: '40b27d21-03fe-471e-9921-1f5330d04659', num: 'SAL-00057', ref: 'TTT_25_070168' },
  { id: 'c4341c5e-c00a-4c62-96b8-a5084c33f773', num: 'SAL-00058', ref: 'TTT_25_070169' },
  { id: '1ab071b0-92aa-4748-8884-2e98e6c6daf2', num: 'SAL-00059', ref: 'TTT_25_070170' },
  { id: '0b2fbe5d-2d56-40b5-8ac4-d1b1c4c9d632', num: 'SAL-00062', ref: 'TTT_25_070173' },
  { id: '155f2bd0-06d3-4318-b33e-39e3361422af', num: 'SAL-00063', ref: 'TTT_25_070174' },
  { id: 'ae6da772-0af3-4080-a6fb-f1fe9a6370e1', num: 'SAL-00067', ref: 'TTT_25_070178' },
  { id: 'e600e7bd-8767-46fb-82a0-fa841e420f68', num: 'SAL-00068', ref: 'TTT_25_070179' },
];

const OUT_DIR = 'C:\\Users\\Mohammed_Rehan\\Downloads\\Tadbeer(Accountign Tool)\\tadbeer-accounting\\public\\Al_Qurum_PDFs';
const ZIP_PATH = 'C:\\Users\\Mohammed_Rehan\\Downloads\\Tadbeer(Accountign Tool)\\tadbeer-accounting\\public\\Al_Qurum_Perfume_Invoices.zip';

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('🚀 Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  // First, open the vouchers page to warm up the session
  const mainPage = await browser.newPage();
  await mainPage.setViewport({ width: 1280, height: 900 });
  console.log('📂 Loading vouchers page...');
  await mainPage.goto(`${BASE_URL}/vouchers`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  let success = 0;

  for (const v of QURUM_VOUCHERS) {
    try {
      console.log(`\n📄 Processing ${v.num} (${v.ref})...`);

      // Click the eye icon for this specific voucher row
      // The voucher rows should have data-id or we can find them by voucher number text
      const clicked = await mainPage.evaluate((voucherId) => {
        // Find all rows and look for one containing this voucher's row
        // Try clicking the eye/view button in the row with this ID
        const rows = document.querySelectorAll('tr, [data-id]');
        for (const row of rows) {
          if (row.textContent && row.textContent.includes(voucherId)) {
            const btn = row.querySelector('button[title*="iew"], button[title*="Print"], button svg');
            if (btn) { btn.closest('button').click(); return true; }
          }
        }
        return false;
      }, v.num);

      if (!clicked) {
        // Try finding by voucher number in table and clicking first button in that row
        await mainPage.evaluate((vNum) => {
          const tds = document.querySelectorAll('td');
          for (const td of tds) {
            if (td.textContent.trim() === vNum) {
              const row = td.closest('tr');
              if (row) {
                const btn = row.querySelector('button');
                if (btn) btn.click();
              }
              break;
            }
          }
        }, v.num);
      }

      // Wait for the PrintableVoucher to appear in the modal
      await mainPage.waitForSelector('#printable-voucher', { timeout: 8000 });
      await new Promise(r => setTimeout(r, 800));

      // Grab the full HTML of the printable voucher + all styles
      const printHTML = await mainPage.evaluate(() => {
        const el = document.getElementById('printable-voucher');
        if (!el) return null;

        // Collect all stylesheets
        let styles = '';
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules || []) {
              styles += rule.cssText + '\n';
            }
          } catch(e) {}
        }

        return `<!DOCTYPE html><html><head>
          <meta charset="UTF-8"/>
          <style>
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { margin: 0; padding: 20px; font-family: 'Inter', Arial, sans-serif; background: white; }
            @media print { body { padding: 0; } }
            ${styles}
          </style>
        </head><body>${el.outerHTML}</body></html>`;
      });

      if (!printHTML) {
        console.log(`  ❌ Could not get printable voucher HTML for ${v.num}`);
        // Close modal if open
        await mainPage.keyboard.press('Escape');
        continue;
      }

      // Open new page with that HTML and print to PDF
      const printPage = await browser.newPage();
      await printPage.setContent(printHTML, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 500));

      const pdfPath = path.join(OUT_DIR, `Invoice_${v.ref}_${v.num}.pdf`);
      await printPage.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
      });

      await printPage.close();
      console.log(`  ✅ Saved: Invoice_${v.ref}_${v.num}.pdf`);
      success++;

      // Close modal (press Escape or click X)
      await mainPage.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.error(`  ❌ Error on ${v.num}: ${err.message}`);
      try { await mainPage.keyboard.press('Escape'); } catch(e) {}
      await new Promise(r => setTimeout(r, 500));
    }
  }

  await browser.close();
  console.log(`\n✅ Generated ${success}/${QURUM_VOUCHERS.length} PDFs`);

  // ZIP them
  if (success > 0) {
    try {
      execSync(`powershell -Command "Compress-Archive -Force -Path '${OUT_DIR}\\*' -DestinationPath '${ZIP_PATH}'"`, { stdio: 'inherit' });
      console.log(`🎉 ZIP ready: ${ZIP_PATH}`);
      console.log(`🌐 Download at: http://localhost:3000/Al_Qurum_Perfume_Invoices.zip`);
    } catch(e) {
      console.error('ZIP error:', e.message);
    }
  }
}

main().catch(console.error);
