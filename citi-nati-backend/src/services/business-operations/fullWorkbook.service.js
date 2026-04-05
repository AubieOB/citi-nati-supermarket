'use strict';

const ExcelJS = require('exceljs');
const dataSnapshotService = require('./dataSnapshot.service');

const MAX_CELL_CHARS = 30000;
const PAYROLL_JSON_SHEET = '__PAYROLL_SNAPSHOT_JSON';
const SALES_JSON_SHEET = '__SALES_SNAPSHOT_JSON';

function safeJsonStringify(value) {
  return JSON.stringify(value, (_key, current) => {
    if (typeof current === 'bigint') {
      return current.toString();
    }
    return current;
  });
}

function normalizeReadCellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    if (value.text !== undefined) return String(value.text || '');
    if (value.result !== undefined) return normalizeReadCellValue(value.result);
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item?.text || '').join('');
    }
    return safeJsonStringify(value);
  }
  return value;
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value;
  if (Array.isArray(value) || typeof value === 'object') {
    return safeJsonStringify(value);
  }
  return value;
}

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
      normalized[key] = normalizeCellValue(value);
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

  const payloadText = safeJsonStringify(payload);
  const chunks = chunkString(payloadText);
  chunks.forEach((chunk, index) => {
    sheet.addRow({ chunkIndex: index + 1, jsonChunk: chunk });
  });
}

function readTabularSheet(workbook, title) {
  const sheet = workbook.getWorksheet(safeWorksheetName(title));
  if (!sheet || sheet.rowCount < 2) return [];

  const headerRow = sheet.getRow(1);
  const headers = [];
  for (let col = 1; col <= headerRow.cellCount; col += 1) {
    const header = normalizeReadCellValue(headerRow.getCell(col).value);
    headers.push(String(header || '').trim());
  }

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const item = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const cellValue = normalizeReadCellValue(row.getCell(index + 1).value);
      if (cellValue !== null && cellValue !== '') hasValue = true;
      item[header] = cellValue;
    });

    if (hasValue) rows.push(item);
  }

  return rows;
}

function buildSnapshotsFromTabularSheets(workbook) {
  const payrollData = {
    employees: readTabularSheet(workbook, 'Payroll_Employees'),
    salaryStructures: readTabularSheet(workbook, 'Payroll_SalaryStructures'),
    payrollPeriods: readTabularSheet(workbook, 'Payroll_Periods'),
    payrollEntries: readTabularSheet(workbook, 'Payroll_Entries'),
    loans: readTabularSheet(workbook, 'Payroll_Loans'),
    loanTransactions: readTabularSheet(workbook, 'Payroll_LoanTx'),
    terminations: readTabularSheet(workbook, 'Payroll_Terminations'),
    reengagements: readTabularSheet(workbook, 'Payroll_Reengagements'),
    taxBrackets: readTabularSheet(workbook, 'Payroll_TaxBrackets'),
    incrementPolicies: readTabularSheet(workbook, 'Payroll_IncrementPolicies'),
  };

  const salesData = {
    syncSources: readTabularSheet(workbook, 'Sales_SyncSources'),
    invoices: readTabularSheet(workbook, 'Sales_Invoices'),
    invoiceItems: readTabularSheet(workbook, 'Sales_InvoiceItems'),
    products: readTabularSheet(workbook, 'Sales_Products'),
  };

  const payrollSnapshot = {
    version: '1.0.0',
    type: 'payroll',
    exportedAt: new Date().toISOString(),
    filters: {},
    data: {
      ...payrollData,
      metadata: {
        totalEmployees: payrollData.employees.length,
        totalPeriods: payrollData.payrollPeriods.length,
        totalEntries: payrollData.payrollEntries.length,
        totalLoans: payrollData.loans.length,
        totalTerminations: payrollData.terminations.length,
        totalReengagements: payrollData.reengagements.length,
      },
    },
  };

  const salesSnapshot = {
    version: '1.0.0',
    type: 'sales',
    exportedAt: new Date().toISOString(),
    filters: {},
    data: {
      ...salesData,
      metadata: {
        totalSyncSources: salesData.syncSources.length,
        totalInvoices: salesData.invoices.length,
        totalInvoiceItems: salesData.invoiceItems.length,
        totalProducts: salesData.products.length,
      },
    },
  };

  return { payrollSnapshot, salesSnapshot };
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
    { field: 'Embedded Raw Payload', value: options.includeRawPayload ? 'Yes' : 'No (tabular import fallback enabled)' },
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

  // Hidden raw payload is optional because it can be very large and cause memory pressure.
  if (options.includeRawPayload === true) {
    addEmbeddedJsonSheet(workbook, PAYROLL_JSON_SHEET, payrollSnapshot);
    addEmbeddedJsonSheet(workbook, SALES_JSON_SHEET, salesSnapshot);
  }

  return workbook.xlsx.writeBuffer();
}

async function importFullWorkbook(fileBuffer, options = {}) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('A valid workbook file buffer is required');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  let payrollSnapshot = readEmbeddedJsonSheet(workbook, PAYROLL_JSON_SHEET);
  let salesSnapshot = readEmbeddedJsonSheet(workbook, SALES_JSON_SHEET);

  // Fallback: reconstruct snapshots from visible tabular sheets.
  if (!payrollSnapshot && !salesSnapshot) {
    const rebuilt = buildSnapshotsFromTabularSheets(workbook);
    payrollSnapshot = rebuilt.payrollSnapshot;
    salesSnapshot = rebuilt.salesSnapshot;
  }

  const hasPayrollData = payrollSnapshot && Object.values(payrollSnapshot.data || {}).some((value) => Array.isArray(value) && value.length > 0);
  const hasSalesData = salesSnapshot && Object.values(salesSnapshot.data || {}).some((value) => Array.isArray(value) && value.length > 0);

  if (!hasPayrollData && !hasSalesData) {
    throw new Error('Workbook is missing embedded snapshot payload sheets');
  }

  const importResult = {
    payroll: null,
    sales: null,
  };

  if (hasPayrollData) {
    importResult.payroll = await dataSnapshotService.importPayrollSnapshot(payrollSnapshot, {
      upsert: options.upsert !== false,
      clearExisting: options.clearExisting === true,
      locationId: options.locationId || null,
    });
  }

  if (hasSalesData) {
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
