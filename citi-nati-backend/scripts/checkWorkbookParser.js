'use strict';

const fs = require('fs');
const path = require('path');
const { parseWorkbook } = require('../src/services/business-operations/workbookImport.service');

async function main() {
  const fileArg = process.argv[2];
  const workbookType = String(process.argv[3] || 'payroll').toLowerCase();

  if (!fileArg) {
    console.error('Usage: npm run check:workbook-parser -- <path-to-xlsx> [payroll|business]');
    process.exit(1);
  }

  if (!['payroll', 'business'].includes(workbookType)) {
    console.error("Workbook type must be 'payroll' or 'business'");
    process.exit(1);
  }

  const resolvedPath = path.resolve(fileArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(resolvedPath);
  const parsed = await parseWorkbook(buffer, workbookType);

  const report = {
    workbookType: parsed.workbookType,
    detectedSheets: parsed.detectedSheets,
    summary: parsed.summary,
    confidence: parsed.confidence || null,
    warnings: parsed.warnings,
    errors: parsed.errors,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('[checkWorkbookParser] failed:', err.message);
  process.exit(1);
});
