'use strict';

const ExcelJS = require('exceljs');
const dataSnapshotService = require('./dataSnapshot.service');

const MAX_CELL_CHARS = 30000;
const PAYROLL_JSON_SHEET = '__PAYROLL_SNAPSHOT_JSON';
const SALES_JSON_SHEET = '__SALES_SNAPSHOT_JSON';

function chunkString(value, chunkSize = MAX_CELL_CHARS) {
  const text = String(value || '');
  if (!text) return [''];

  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

function safeWorksheetName(name) {
  return String(name).replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
}

function addTabularSheet(workbook, title, rows) {
  const sheet = workbook.addWorksheet(safeWorksheetName(title));
  const dataRows = Array.isArray(rows) ? rows : [];

  if (!dataRows.length) {
    sheet.columns = [{ header: 'info', key: 'info', width: 50 }];
    sheet.addRow({ info: 'No records in this section' });
    return;
  }

  const headerSet = new Set();
  dataRows.forEach((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      Object.keys(row).forEach((key) => headerSet.add(key));
    }
  });

  const headers = Array.from(headerSet);
  sheet.columns = headers.map((key) => ({
    header: key,
    key,
    width: Math.min(40, Math.max(14, String(key).length + 4)),
  }));

  dataRows.forEach((row) => {
    const normalized = {};
    headers.forEach((key) => {
      const value = row[key];
      if (value && typeof value === 'object') {
        normalized[key] = JSON.stringify(value);
      } else {
        normalized[key] = value;
      }
    });
    sheet.addRow(normalized);
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
}

function addEmbeddedJsonSheet(workbook, sheetName, payload) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.state = 'veryHidden';
  sheet.columns = [
    { header: 'chunkIndex', key: 'chunkIndex', width: 12 },
    { header: 'jsonChunk', key: 'jsonChunk', width: 120 },
  ];

  const payloadText = JSON.stringify(payload);
  const chunks = chunkString(payloadText);
  chunks.forEach((chunk, index) => {
    sheet.addRow({ chunkIndex: index + 1, jsonChunk: chunk });
  });
}

function readEmbeddedJsonSheet(workbook, sheetName) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return null;

  const parts = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const chunkIndex = Number(row.getCell(1).value || 0);
    const jsonChunk = String(row.getCell(2).value || '');
    if (chunkIndex > 0 && jsonChunk) {
      parts.push({ chunkIndex, jsonChunk });
    }
  });

  if (!parts.length) return null;

  parts.sort((a, b) => a.chunkIndex - b.chunkIndex);
  const fullText = parts.map((part) => part.jsonChunk).join('');
  return JSON.parse(fullText);
}

async function exportFullWorkbook(options = {}) {
  const payrollSnapshot = await dataSnapshotService.exportPayrollSnapshot(options.payrollFilters || {});
  const salesSnapshot = await dataSnapshotService.exportSalesSnapshot(options.salesFilters || {});

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Citi-Nati Supermarket';
  workbook.created = new Date();

  const overview = workbook.addWorksheet('Overview');
  overview.columns = [
    { header: 'Field', key: 'field', width: 34 },
    { header: 'Value', key: 'value', width: 80 },
  ];
  overview.getRow(1).font = { bold: true };
  overview.addRows([
    { field: 'Workbook Type', value: 'Full Business Data Workbook (Payroll + Sales)' },
    { field: 'Version', value: payrollSnapshot.version || '1.0.0' },
    { field: 'Exported At', value: new Date().toISOString() },
    { field: 'Restore', value: 'Use POST /api/business-operations/payroll/import/full-workbook with field name workbook' },
    { field: 'Payroll Employees', value: Number(payrollSnapshot.data?.metadata?.totalEmployees || 0) },
    { field: 'Payroll Entries', value: Number(payrollSnapshot.data?.metadata?.totalEntries || 0) },
    { field: 'Sales Invoices', value: Number(salesSnapshot.data?.metadata?.totalInvoices || 0) },
    { field: 'Sales Invoice Items', value: Number(salesSnapshot.data?.metadata?.totalInvoiceItems || 0) },
  ]);

  addTabularSheet(workbook, 'Payroll_Employees', payrollSnapshot.data?.employees || []);
  addTabularSheet(workbook, 'Payroll_SalaryStructures', payrollSnapshot.data?.salaryStructures || []);
  addTabularSheet(workbook, 'Payroll_Periods', payrollSnapshot.data?.payrollPeriods || []);
  addTabularSheet(workbook, 'Payroll_Entries', payrollSnapshot.data?.payrollEntries || []);
  addTabularSheet(workbook, 'Payroll_Loans', payrollSnapshot.data?.loans || []);
  addTabularSheet(workbook, 'Payroll_LoanTx', payrollSnapshot.data?.loanTransactions || []);
  addTabularSheet(workbook, 'Payroll_Terminations', payrollSnapshot.data?.terminations || []);
  addTabularSheet(workbook, 'Payroll_Reengagements', payrollSnapshot.data?.reengagements || []);
  addTabularSheet(workbook, 'Payroll_TaxBrackets', payrollSnapshot.data?.taxBrackets || []);
  addTabularSheet(workbook, 'Payroll_IncrementPolicies', payrollSnapshot.data?.incrementPolicies || []);

  addTabularSheet(workbook, 'Sales_SyncSources', salesSnapshot.data?.syncSources || []);
  addTabularSheet(workbook, 'Sales_Invoices', salesSnapshot.data?.invoices || []);
  addTabularSheet(workbook, 'Sales_InvoiceItems', salesSnapshot.data?.invoiceItems || []);
  addTabularSheet(workbook, 'Sales_Products', salesSnapshot.data?.products || []);

  // Keep exact payloads in hidden sheets so the workbook can be re-imported with full fidelity.
  addEmbeddedJsonSheet(workbook, PAYROLL_JSON_SHEET, payrollSnapshot);
  addEmbeddedJsonSheet(workbook, SALES_JSON_SHEET, salesSnapshot);

  return workbook.xlsx.writeBuffer();
}

async function importFullWorkbook(fileBuffer, options = {}) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('A valid workbook file buffer is required');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const payrollSnapshot = readEmbeddedJsonSheet(workbook, PAYROLL_JSON_SHEET);
  const salesSnapshot = readEmbeddedJsonSheet(workbook, SALES_JSON_SHEET);

  if (!payrollSnapshot && !salesSnapshot) {
    throw new Error('Workbook is missing embedded snapshot payload sheets');
  }

  const importResult = {
    payroll: null,
    sales: null,
  };

  if (payrollSnapshot) {
    importResult.payroll = await dataSnapshotService.importPayrollSnapshot(payrollSnapshot, {
      upsert: options.upsert !== false,
      clearExisting: options.clearExisting === true,
      locationId: options.locationId || null,
    });
  }

  if (salesSnapshot) {
    importResult.sales = await dataSnapshotService.importSalesSnapshot(salesSnapshot, {
      upsert: options.upsert !== false,
    });
  }

  return importResult;
}

module.exports = {
  exportFullWorkbook,
  importFullWorkbook,
};
