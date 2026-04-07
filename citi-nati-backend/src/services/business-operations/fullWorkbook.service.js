'use strict';

const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const { PassThrough } = require('stream');
const { finished } = require('stream/promises');
const { PrismaClient } = require('@prisma/client');
const dataSnapshotService = require('./dataSnapshot.service');
const { readWorkbookFromBuffer, getSheetRows } = require('./parsers/commonWorkbook.utils');
const prisma = new PrismaClient();

const MAX_CELL_CHARS = 30000;
const MAX_EXCEL_CELL_TEXT = 32767;
const PAYROLL_JSON_SHEET = '__PAYROLL_SNAPSHOT_JSON';
const SALES_JSON_SHEET = '__SALES_SNAPSHOT_JSON';
const DEFAULT_BATCH_SIZE = Math.max(100, Number(process.env.FULL_WORKBOOK_BATCH_SIZE || 1000));
const MAX_ROWS_PER_SHEET = Math.max(1000, Number(process.env.FULL_WORKBOOK_MAX_ROWS_PER_SHEET || 250000));
const MAX_ROWS_TOTAL = Math.max(5000, Number(process.env.FULL_WORKBOOK_MAX_ROWS_TOTAL || 700000));
const MAX_SALES_RANGE_DAYS = Math.max(1, Number(process.env.FULL_WORKBOOK_MAX_SALES_RANGE_DAYS || 370));
const MAX_IMPORT_WORKBOOK_FILE_BYTES = Math.max(1 * 1024 * 1024, Number(process.env.FULL_WORKBOOK_IMPORT_MAX_FILE_BYTES || 20 * 1024 * 1024));
const MAX_IMPORT_HEAP_SOFT_MB = Math.max(128, Number(process.env.FULL_WORKBOOK_IMPORT_MAX_HEAP_MB || 220));
const MAX_IMPORT_HEAP_HARD_MB = Math.max(MAX_IMPORT_HEAP_SOFT_MB + 10, Number(process.env.FULL_WORKBOOK_IMPORT_HARD_HEAP_MB || 245));
const IMPORT_BATCH_SIZE = Math.max(25, Number(process.env.FULL_WORKBOOK_IMPORT_BATCH_SIZE || 100));
const MAX_IMPORT_ROWS_PER_SHEET = Math.max(1000, Number(process.env.FULL_WORKBOOK_IMPORT_MAX_ROWS_PER_SHEET || 250000));
const MAX_IMPORT_ROWS_TOTAL = Math.max(5000, Number(process.env.FULL_WORKBOOK_IMPORT_MAX_ROWS_TOTAL || 700000));

class ExportGuardError extends Error {
  constructor(message, statusCode = 413) {
    super(message);
    this.name = 'ExportGuardError';
    this.statusCode = statusCode;
  }
}

class ImportGuardError extends Error {
  constructor(message, statusCode = 413) {
    super(message);
    this.name = 'ImportGuardError';
    this.statusCode = statusCode;
  }
}

function memorySnapshot() {
  const usage = process.memoryUsage();
  return {
    rssMB: Math.round(usage.rss / 1024 / 1024),
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
  };
}

function logExportProgress(logLabel, message, extra = {}) {
  console.log(`[FULL-WORKBOOK] ${logLabel} ${message}`, {
    ...extra,
    memory: memorySnapshot(),
  });
}

function logImportProgress(message, extra = {}) {
  console.log('[FULL-WORKBOOK][IMPORT]', {
    message,
    ...extra,
    memory: memorySnapshot(),
  });
}

function maybeRunGc() {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

function normalizeWriteValue(value) {
  if (value === null || value === undefined) return value;
  let normalized = value;

  if (normalized instanceof Date) normalized = normalized.toISOString();
  if (typeof normalized === 'bigint') normalized = normalized.toString();
  if (Array.isArray(normalized) || typeof normalized === 'object') {
    normalized = safeJsonStringify(normalized);
  }

  if (typeof normalized === 'string') {
    return sanitizeExcelString(normalized);
  }

  return normalized;
}

function createStreamWorksheet(workbook, title, columns) {
  const sheet = workbook.addWorksheet(safeWorksheetName(title));
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 20,
  }));
  return sheet;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function camelToSnake(value) {
  return String(value || '').replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function extractMissingColumn(error) {
  const message = String(error?.message || '');
  const match = message.match(/The column `([^`]+)` does not exist in the current database/i);
  return match?.[1] || null;
}

function findMissingColumnField(columns = [], missingColumn = null) {
  if (!missingColumn) return null;
  const normalizedMissing = String(missingColumn).toLowerCase();
  const missingLeaf = normalizedMissing.split('.').pop();

  for (const column of columns) {
    const key = String(column?.key || '');
    if (!key) continue;
    const snake = camelToSnake(key).toLowerCase();
    if (normalizedMissing.endsWith(`.${snake}`) || missingLeaf === snake || missingLeaf === key.toLowerCase()) {
      return key;
    }
  }
  return null;
}

function buildCursorWhere(baseWhere, cursorField, lastCursorValue) {
  if (lastCursorValue === null || lastCursorValue === undefined) return baseWhere;
  const cursorClause = { [cursorField]: { gt: lastCursorValue } };
  if (!baseWhere || !Object.keys(baseWhere).length) return cursorClause;
  return { AND: [baseWhere, cursorClause] };
}

function assertSalesRange(filters = {}) {
  const start = toDate(filters.startDate);
  const end = toDate(filters.endDate);
  if (!start && !end) return;
  if (!start || !end) {
    throw new ExportGuardError('Both startDate and endDate are required when scoping full workbook sales export by date range.', 400);
  }

  const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days < 1) {
    throw new ExportGuardError('endDate must be on or after startDate.', 400);
  }
  if (days > MAX_SALES_RANGE_DAYS) {
    throw new ExportGuardError(`Date range too large for safe synchronous export (${days} days). Please reduce to <= ${MAX_SALES_RANGE_DAYS} days or run multiple scoped exports.`, 413);
  }
}

function assertImportGuards(fileBuffer) {
  const fileBytes = Number(fileBuffer?.length || 0);
  if (fileBytes <= 0) {
    throw new ImportGuardError('Workbook file appears empty. Please upload a valid .xlsx workbook.', 400);
  }

  if (fileBytes > MAX_IMPORT_WORKBOOK_FILE_BYTES) {
    const maxMb = Math.round(MAX_IMPORT_WORKBOOK_FILE_BYTES / (1024 * 1024));
    const actualMb = Math.round(fileBytes / (1024 * 1024));
    throw new ImportGuardError(
      `Workbook too large for safe import on this server (${actualMb}MB). Max allowed is ${maxMb}MB. Reduce workbook scope (location/date) and retry.`,
      413,
    );
  }

  const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  if (heapUsedMB >= MAX_IMPORT_HEAP_SOFT_MB) {
    throw new ImportGuardError(
      `Server memory is currently constrained (${heapUsedMB}MB heap in use). Retry shortly or reduce workbook size.`,
      503,
    );
  }
}

function assertImportHeapHeadroom() {
  const beforeGcMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  if (beforeGcMB < MAX_IMPORT_HEAP_SOFT_MB) return;

  maybeRunGc();
  const afterGcMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  if (afterGcMB >= MAX_IMPORT_HEAP_HARD_MB) {
    throw new ImportGuardError(
      `Server memory is critically constrained (${afterGcMB}MB heap in use). Retry shortly or reduce workbook size.`,
      503,
    );
  }

  if (afterGcMB >= MAX_IMPORT_HEAP_SOFT_MB) {
    logImportProgress('continuing import under memory pressure', {
      heapUsedMB: afterGcMB,
      softLimitMB: MAX_IMPORT_HEAP_SOFT_MB,
      hardLimitMB: MAX_IMPORT_HEAP_HARD_MB,
    });
  }
}

async function streamModelSheet({
  workbook,
  title,
  columns,
  model,
  where,
  select,
  cursorField = 'id',
  mapRow,
  batchSize,
  maxRows,
  logLabel,
}) {
  const sheet = createStreamWorksheet(workbook, title, columns);
  let lastCursor = null;
  let rowsWritten = 0;
  let activeColumns = [...columns];

  while (true) {
    let batch = null;
    while (true) {
      const select = activeColumns.reduce((acc, column) => {
        acc[column.key] = true;
        return acc;
      }, {});

      try {
        batch = await model.findMany({
          where: buildCursorWhere(where, cursorField, lastCursor),
          orderBy: { [cursorField]: 'asc' },
          take: batchSize,
          select,
        });
        break;
      } catch (error) {
        const missingColumn = extractMissingColumn(error);
        const missingField = findMissingColumnField(activeColumns, missingColumn);

        if (!missingField) {
          throw error;
        }

        activeColumns = activeColumns.filter((column) => column.key !== missingField);
        logExportProgress(logLabel, `skipping missing column for ${title}`, { missingColumn, missingField });

        if (!activeColumns.length) {
          batch = [];
          break;
        }
      }
    }

    if (!batch.length) break;

    for (const item of batch) {
      const mapped = mapRow(item);
      const normalized = {};
      columns.forEach((column) => {
        normalized[column.key] = normalizeWriteValue(mapped[column.key]);
      });
      sheet.addRow(normalized).commit();
      rowsWritten += 1;
      if (rowsWritten > maxRows) {
        throw new ExportGuardError(`Sheet ${title} exceeded safe export row limit (${maxRows}). Apply filters and try again.`);
      }
    }

    lastCursor = batch[batch.length - 1][cursorField];
    logExportProgress(logLabel, `processed batch for ${title}`, { batchSize: batch.length, rowsWritten });
  }

  sheet.commit();
  logExportProgress(logLabel, `completed sheet ${title}`, { rowsWritten });
  return rowsWritten;
}

function buildInvoiceWhere(filters = {}) {
  const start = toDate(filters.startDate);
  const end = toDate(filters.endDate);

  return {
    ...(filters.branchCode ? { branchCode: String(filters.branchCode) } : {}),
    ...(filters.syncSourceCode ? { syncSourceCode: String(filters.syncSourceCode) } : {}),
    ...(start && end ? { invoiceDate: { gte: start, lte: end } } : {}),
  };
}

async function streamFullWorkbook({ writable, options = {}, requestId = null }) {
  if (!writable) {
    throw new Error('Writable stream is required for streaming workbook export');
  }

  const logLabel = requestId ? `request=${requestId}` : 'request=unknown';
  const batchSize = Math.max(100, Number(options.batchSize || DEFAULT_BATCH_SIZE));
  const perSheetLimit = Math.max(1000, Number(options.maxRowsPerSheet || MAX_ROWS_PER_SHEET));
  const totalLimit = Math.max(5000, Number(options.maxRowsTotal || MAX_ROWS_TOTAL));

  assertSalesRange(options.salesFilters || {});

  let totalRows = 0;
  const sheetStats = [];

  const countingStream = new PassThrough();
  let bytesWritten = 0;
  countingStream.on('data', (chunk) => {
    bytesWritten += chunk.length;
  });
  countingStream.pipe(writable);

  logExportProgress(logLabel, 'starting full workbook stream', {
    batchSize,
    perSheetLimit,
    totalLimit,
    includeRawPayload: options.includeRawPayload === true,
    salesFilters: options.salesFilters || {},
    payrollFilters: options.payrollFilters || {},
  });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: countingStream,
    useStyles: false,
    useSharedStrings: false,
  });
  workbook.creator = 'Citi-Nati Supermarket';
  workbook.created = new Date();

  const manifestSheet = createStreamWorksheet(workbook, 'Backup_Manifest', [
    { header: 'key', key: 'key', width: 34 },
    { header: 'value', key: 'value', width: 120 },
  ]);
  manifestSheet.addRow({ key: 'workbookType', value: 'full-business-backup' }).commit();
  manifestSheet.addRow({ key: 'exportedAt', value: new Date().toISOString() }).commit();
  manifestSheet.addRow({ key: 'includeRawPayload', value: options.includeRawPayload === true ? 'true' : 'false' }).commit();
  manifestSheet.addRow({ key: 'notes', value: 'This workbook is generated with streaming mode for memory safety.' }).commit();
  manifestSheet.commit();

  const payrollLocationId = options.payrollFilters?.locationId ? Number(options.payrollFilters.locationId) : null;
  const invoiceWhere = buildInvoiceWhere(options.salesFilters || {});

  const registerSheet = (name, rows) => {
    totalRows += rows;
    sheetStats.push({ name, rows });
    if (totalRows > totalLimit) {
      throw new ExportGuardError(`Backup row volume ${totalRows} exceeded safe global limit (${totalLimit}). Narrow filters (location/branch/date) and retry.`);
    }
  };

  registerSheet('Payroll_Employees', await streamModelSheet({
    workbook,
    title: 'Payroll_Employees',
    columns: [
      { header: 'id', key: 'id' }, { header: 'employeeNo', key: 'employeeNo' }, { header: 'firstName', key: 'firstName' },
      { header: 'surname', key: 'surname' }, { header: 'middleName', key: 'middleName' }, { header: 'gender', key: 'gender' },
      { header: 'dateOfBirth', key: 'dateOfBirth' }, { header: 'districtOfOrigin', key: 'districtOfOrigin' },
      { header: 'village', key: 'village' }, { header: 'traditionalAuthority', key: 'traditionalAuthority' },
      { header: 'nationalId', key: 'nationalId' }, { header: 'nationalIdExpiryDate', key: 'nationalIdExpiryDate' },
      { header: 'contactNumber', key: 'contactNumber' }, { header: 'dateOfEmployment', key: 'dateOfEmployment' },
      { header: 'position', key: 'position' }, { header: 'department', key: 'department' },
      { header: 'locationId', key: 'locationId' }, { header: 'employmentType', key: 'employmentType' },
      { header: 'status', key: 'status' }, { header: 'notes', key: 'notes' },
    ],
    model: prisma.employee,
    where: payrollLocationId ? { locationId: payrollLocationId } : undefined,
    select: {
      id: true, employeeNo: true, firstName: true, surname: true, middleName: true, gender: true,
      dateOfBirth: true, districtOfOrigin: true, village: true, traditionalAuthority: true,
      nationalId: true, nationalIdExpiryDate: true, contactNumber: true, dateOfEmployment: true,
      position: true, department: true, locationId: true, employmentType: true, status: true, notes: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Payroll_SalaryStructures', await streamModelSheet({
    workbook,
    title: 'Payroll_SalaryStructures',
    columns: [
      { header: 'id', key: 'id' }, { header: 'employeeId', key: 'employeeId' }, { header: 'agreedSalaryPerMonth', key: 'agreedSalaryPerMonth' },
      { header: 'annualIncrementAmount', key: 'annualIncrementAmount' }, { header: 'salaryAfterIncrement', key: 'salaryAfterIncrement' },
      { header: 'currency', key: 'currency' }, { header: 'effectiveFrom', key: 'effectiveFrom' }, { header: 'effectiveTo', key: 'effectiveTo' },
      { header: 'isCurrent', key: 'isCurrent' },
    ],
    model: prisma.employeeSalaryStructure,
    where: payrollLocationId ? { employee: { locationId: payrollLocationId } } : undefined,
    select: {
      id: true, employeeId: true, agreedSalaryPerMonth: true, annualIncrementAmount: true, salaryAfterIncrement: true,
      currency: true, effectiveFrom: true, effectiveTo: true, isCurrent: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Payroll_Periods', await streamModelSheet({
    workbook,
    title: 'Payroll_Periods',
    columns: [
      { header: 'id', key: 'id' }, { header: 'reportingPeriodId', key: 'reportingPeriodId' }, { header: 'payrollMode', key: 'payrollMode' },
      { header: 'locationId', key: 'locationId' }, { header: 'payrollMonth', key: 'payrollMonth' }, { header: 'payrollYear', key: 'payrollYear' },
      { header: 'payrollPositionInMonth', key: 'payrollPositionInMonth' }, { header: 'description', key: 'description' },
      { header: 'status', key: 'status' }, { header: 'createdBy', key: 'createdBy' }, { header: 'runStartedAt', key: 'runStartedAt' },
      { header: 'finalizedAt', key: 'finalizedAt' },
    ],
    model: prisma.payrollPeriod,
    where: payrollLocationId ? { locationId: payrollLocationId } : undefined,
    select: {
      id: true, reportingPeriodId: true, payrollMode: true, locationId: true, payrollMonth: true, payrollYear: true,
      payrollPositionInMonth: true, description: true, status: true, createdBy: true, runStartedAt: true, finalizedAt: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Payroll_Entries', await streamModelSheet({
    workbook,
    title: 'Payroll_Entries',
    columns: [
      { header: 'id', key: 'id' }, { header: 'payrollPeriodId', key: 'payrollPeriodId' }, { header: 'employeeId', key: 'employeeId' },
      { header: 'basicSalary', key: 'basicSalary' }, { header: 'incrementAmount', key: 'incrementAmount' }, { header: 'grossPay', key: 'grossPay' },
      { header: 'totalDeductions', key: 'totalDeductions' }, { header: 'netPay', key: 'netPay' }, { header: 'daysWorked', key: 'daysWorked' },
      { header: 'daysAbsent', key: 'daysAbsent' }, { header: 'overtimeHours', key: 'overtimeHours' }, { header: 'overtimeNormalHours', key: 'overtimeNormalHours' },
      { header: 'overtimeDoubleHours', key: 'overtimeDoubleHours' }, { header: 'overtimeAmount', key: 'overtimeAmount' },
      { header: 'overtimeNormalAmount', key: 'overtimeNormalAmount' }, { header: 'overtimeDoubleAmount', key: 'overtimeDoubleAmount' },
      { header: 'loanDeductionAmount', key: 'loanDeductionAmount' }, { header: 'absenceDeductionAmount', key: 'absenceDeductionAmount' },
      { header: 'otherDeductionAmount', key: 'otherDeductionAmount' }, { header: 'bonusAmount', key: 'bonusAmount' },
      { header: 'giftAmount', key: 'giftAmount' }, { header: 'leavePayAmount', key: 'leavePayAmount' }, { header: 'payeAmount', key: 'payeAmount' },
      { header: 'loanBalanceAtPayroll', key: 'loanBalanceAtPayroll' }, { header: 'accruedInterestAtPayroll', key: 'accruedInterestAtPayroll' },
      { header: 'netPayMidPortion', key: 'netPayMidPortion' }, { header: 'netPayEndPortion', key: 'netPayEndPortion' }, { header: 'notes', key: 'notes' },
    ],
    model: prisma.payrollEntry,
    where: payrollLocationId ? { payrollPeriod: { locationId: payrollLocationId } } : undefined,
    select: {
      id: true, payrollPeriodId: true, employeeId: true, basicSalary: true, incrementAmount: true, grossPay: true,
      totalDeductions: true, netPay: true, daysWorked: true, daysAbsent: true, overtimeHours: true, overtimeNormalHours: true,
      overtimeDoubleHours: true, overtimeAmount: true, overtimeNormalAmount: true, overtimeDoubleAmount: true,
      loanDeductionAmount: true, absenceDeductionAmount: true, otherDeductionAmount: true, bonusAmount: true,
      giftAmount: true, leavePayAmount: true, payeAmount: true, loanBalanceAtPayroll: true, accruedInterestAtPayroll: true,
      netPayMidPortion: true, netPayEndPortion: true, notes: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Payroll_Loans', await streamModelSheet({
    workbook,
    title: 'Payroll_Loans',
    columns: [
      { header: 'id', key: 'id' }, { header: 'employeeId', key: 'employeeId' }, { header: 'loanReference', key: 'loanReference' },
      { header: 'principalAmount', key: 'principalAmount' }, { header: 'balanceAmount', key: 'balanceAmount' },
      { header: 'interestRate', key: 'interestRate' }, { header: 'accruedInterest', key: 'accruedInterest' },
      { header: 'loanGrantedMonth', key: 'loanGrantedMonth' }, { header: 'loanGrantedYear', key: 'loanGrantedYear' },
      { header: 'monthlyDeductionAmount', key: 'monthlyDeductionAmount' }, { header: 'repaymentEndMonth', key: 'repaymentEndMonth' },
      { header: 'repaymentEndYear', key: 'repaymentEndYear' }, { header: 'reason', key: 'reason' },
      { header: 'startDate', key: 'startDate' }, { header: 'endDate', key: 'endDate' }, { header: 'status', key: 'status' }, { header: 'notes', key: 'notes' },
    ],
    model: prisma.employeeLoan,
    where: payrollLocationId ? { employee: { locationId: payrollLocationId } } : undefined,
    select: {
      id: true, employeeId: true, loanReference: true, principalAmount: true, balanceAmount: true, interestRate: true,
      accruedInterest: true, loanGrantedMonth: true, loanGrantedYear: true, monthlyDeductionAmount: true,
      repaymentEndMonth: true, repaymentEndYear: true, reason: true, startDate: true, endDate: true, status: true, notes: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Payroll_LoanTx', await streamModelSheet({
    workbook,
    title: 'Payroll_LoanTx',
    columns: [
      { header: 'id', key: 'id' }, { header: 'employeeLoanId', key: 'employeeLoanId' }, { header: 'payrollPeriodId', key: 'payrollPeriodId' },
      { header: 'transactionType', key: 'transactionType' }, { header: 'amount', key: 'amount' },
      { header: 'principalComponent', key: 'principalComponent' }, { header: 'interestComponent', key: 'interestComponent' },
      { header: 'notes', key: 'notes' },
    ],
    model: prisma.employeeLoanTransaction,
    where: payrollLocationId ? { employeeLoan: { employee: { locationId: payrollLocationId } } } : undefined,
    select: {
      id: true, employeeLoanId: true, payrollPeriodId: true, transactionType: true, amount: true,
      principalComponent: true, interestComponent: true, notes: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Payroll_Terminations', await streamModelSheet({
    workbook,
    title: 'Payroll_Terminations',
    columns: [
      { header: 'id', key: 'id' }, { header: 'employeeId', key: 'employeeId' }, { header: 'terminationDate', key: 'terminationDate' },
      { header: 'terminationType', key: 'terminationType' }, { header: 'reason', key: 'reason' },
      { header: 'daysWorkedInFinalMonth', key: 'daysWorkedInFinalMonth' }, { header: 'halfPayReceived', key: 'halfPayReceived' },
      { header: 'halfPayDueInTerminationMonth', key: 'halfPayDueInTerminationMonth' }, { header: 'amountPaidInTerminationMonth', key: 'amountPaidInTerminationMonth' },
      { header: 'leavePayAccruedDays', key: 'leavePayAccruedDays' }, { header: 'leavePayAmount', key: 'leavePayAmount' },
      { header: 'outstandingLoanObligations', key: 'outstandingLoanObligations' }, { header: 'grossSettlementAmount', key: 'grossSettlementAmount' },
      { header: 'netSettlementAmount', key: 'netSettlementAmount' }, { header: 'settlementAmount', key: 'settlementAmount' }, { header: 'notes', key: 'notes' },
    ],
    model: prisma.employeeTermination,
    where: payrollLocationId ? { employee: { locationId: payrollLocationId } } : undefined,
    select: {
      id: true, employeeId: true, terminationDate: true, terminationType: true, reason: true, daysWorkedInFinalMonth: true,
      halfPayReceived: true, halfPayDueInTerminationMonth: true, amountPaidInTerminationMonth: true,
      leavePayAccruedDays: true, leavePayAmount: true, outstandingLoanObligations: true, grossSettlementAmount: true,
      netSettlementAmount: true, settlementAmount: true, notes: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Payroll_Reengagements', await streamModelSheet({
    workbook,
    title: 'Payroll_Reengagements',
    columns: [
      { header: 'id', key: 'id' }, { header: 'employeeId', key: 'employeeId' }, { header: 'linkedTerminationId', key: 'linkedTerminationId' },
      { header: 'wageAtRetrenchment', key: 'wageAtRetrenchment' }, { header: 'previousWage', key: 'previousWage' },
      { header: 'reengagementWage', key: 'reengagementWage' }, { header: 'occupation', key: 'occupation' },
      { header: 'effectiveDate', key: 'effectiveDate' }, { header: 'contractExpiryDate', key: 'contractExpiryDate' }, { header: 'notes', key: 'notes' },
    ],
    model: prisma.employeeReengagement,
    where: payrollLocationId ? { employee: { locationId: payrollLocationId } } : undefined,
    select: {
      id: true, employeeId: true, linkedTerminationId: true, wageAtRetrenchment: true, previousWage: true,
      reengagementWage: true, occupation: true, effectiveDate: true, contractExpiryDate: true, notes: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Payroll_TaxBrackets', await streamModelSheet({
    workbook,
    title: 'Payroll_TaxBrackets',
    columns: [
      { header: 'id', key: 'id' }, { header: 'locationId', key: 'locationId' }, { header: 'effectiveFrom', key: 'effectiveFrom' },
      { header: 'effectiveTo', key: 'effectiveTo' }, { header: 'minIncome', key: 'minIncome' }, { header: 'maxIncome', key: 'maxIncome' },
      { header: 'ratePercent', key: 'ratePercent' }, { header: 'fixedTaxAmount', key: 'fixedTaxAmount' },
      { header: 'description', key: 'description' }, { header: 'isActive', key: 'isActive' },
    ],
    model: prisma.payrollTaxBracket,
    where: payrollLocationId ? { locationId: payrollLocationId } : undefined,
    select: {
      id: true, locationId: true, effectiveFrom: true, effectiveTo: true, minIncome: true, maxIncome: true,
      ratePercent: true, fixedTaxAmount: true, description: true, isActive: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Payroll_IncrementPolicies', await streamModelSheet({
    workbook,
    title: 'Payroll_IncrementPolicies',
    columns: [
      { header: 'id', key: 'id' }, { header: 'locationId', key: 'locationId' }, { header: 'minServiceMonths', key: 'minServiceMonths' },
      { header: 'maxServiceMonths', key: 'maxServiceMonths' }, { header: 'incrementPercent', key: 'incrementPercent' },
      { header: 'incrementAmount', key: 'incrementAmount' }, { header: 'effectiveFrom', key: 'effectiveFrom' },
      { header: 'effectiveTo', key: 'effectiveTo' }, { header: 'notes', key: 'notes' }, { header: 'isActive', key: 'isActive' },
    ],
    model: prisma.payrollIncrementPolicy,
    where: payrollLocationId ? { locationId: payrollLocationId } : undefined,
    select: {
      id: true, locationId: true, minServiceMonths: true, maxServiceMonths: true, incrementPercent: true,
      incrementAmount: true, effectiveFrom: true, effectiveTo: true, notes: true, isActive: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Sales_SyncSources', await streamModelSheet({
    workbook,
    title: 'Sales_SyncSources',
    columns: [
      { header: 'id', key: 'id' }, { header: 'branchCode', key: 'branchCode' }, { header: 'branchName', key: 'branchName' },
      { header: 'locationId', key: 'locationId' }, { header: 'syncSourceCode', key: 'syncSourceCode' }, { header: 'lastSeenAt', key: 'lastSeenAt' },
    ],
    model: prisma.salesSyncSource,
    where: options.salesFilters?.branchCode ? { branchCode: String(options.salesFilters.branchCode) } : undefined,
    select: { id: true, branchCode: true, branchName: true, locationId: true, syncSourceCode: true, lastSeenAt: true },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Sales_Invoices', await streamModelSheet({
    workbook,
    title: 'Sales_Invoices',
    columns: [
      { header: 'id', key: 'id' }, { header: 'syncSourceId', key: 'syncSourceId' }, { header: 'branchCode', key: 'branchCode' },
      { header: 'branchName', key: 'branchName' }, { header: 'locationId', key: 'locationId' }, { header: 'syncSourceCode', key: 'syncSourceCode' },
      { header: 'sourceInvoiceNo', key: 'sourceInvoiceNo' }, { header: 'sourceInvoiceSerialNo', key: 'sourceInvoiceSerialNo' },
      { header: 'sourceCashSaleNo', key: 'sourceCashSaleNo' }, { header: 'refNo', key: 'refNo' }, { header: 'invoiceDate', key: 'invoiceDate' },
      { header: 'invoiceTime', key: 'invoiceTime' }, { header: 'customerCode', key: 'customerCode' }, { header: 'customerDetails', key: 'customerDetails' },
      { header: 'locationCode', key: 'locationCode' }, { header: 'grossSale', key: 'grossSale' }, { header: 'vatAmount', key: 'vatAmount' },
      { header: 'discount', key: 'discount' }, { header: 'netSale', key: 'netSale' }, { header: 'invoiceType', key: 'invoiceType' },
      { header: 'tillId', key: 'tillId' }, { header: 'payMethod1', key: 'payMethod1' }, { header: 'tenderAmount1', key: 'tenderAmount1' },
      { header: 'chqNo1', key: 'chqNo1' }, { header: 'payMethod2', key: 'payMethod2' }, { header: 'tenderAmount2', key: 'tenderAmount2' },
      { header: 'chqNo2', key: 'chqNo2' }, { header: 'userName', key: 'userName' }, { header: 'priceTypeCode', key: 'priceTypeCode' },
      { header: 'repCode', key: 'repCode' }, { header: 'uploadStatus', key: 'uploadStatus' }, { header: 'levyAmount', key: 'levyAmount' },
      { header: 'reserved', key: 'reserved' }, { header: 'discountAmount', key: 'discountAmount' }, { header: 'fiscalReceiptNo', key: 'fiscalReceiptNo' },
      { header: 'bankCode', key: 'bankCode' }, { header: 'bankName', key: 'bankName' }, { header: 'bankCardHolder', key: 'bankCardHolder' },
      { header: 'bankCardNo', key: 'bankCardNo' }, { header: 'bankCardExpiry', key: 'bankCardExpiry' }, { header: 'quoteNo', key: 'quoteNo' },
      { header: 'sourceSyncedAt', key: 'sourceSyncedAt' }, { header: 'firstReceivedAt', key: 'firstReceivedAt' }, { header: 'lastReceivedAt', key: 'lastReceivedAt' },
    ],
    model: prisma.salesInvoice,
    where: invoiceWhere,
    select: {
      id: true, syncSourceId: true, branchCode: true, branchName: true, locationId: true, syncSourceCode: true,
      sourceInvoiceNo: true, sourceInvoiceSerialNo: true, sourceCashSaleNo: true, refNo: true, invoiceDate: true,
      invoiceTime: true, customerCode: true, customerDetails: true, locationCode: true, grossSale: true, vatAmount: true,
      discount: true, netSale: true, invoiceType: true, tillId: true, payMethod1: true, tenderAmount1: true, chqNo1: true,
      payMethod2: true, tenderAmount2: true, chqNo2: true, userName: true, priceTypeCode: true, repCode: true,
      uploadStatus: true, levyAmount: true, reserved: true, discountAmount: true, fiscalReceiptNo: true, bankCode: true,
      bankName: true, bankCardHolder: true, bankCardNo: true, bankCardExpiry: true, quoteNo: true,
      sourceSyncedAt: true, firstReceivedAt: true, lastReceivedAt: true,
    },
    cursorField: 'id',
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Sales_InvoiceItems', await streamModelSheet({
    workbook,
    title: 'Sales_InvoiceItems',
    columns: [
      { header: 'id', key: 'id' }, { header: 'salesInvoiceId', key: 'salesInvoiceId' }, { header: 'syncSourceCode', key: 'syncSourceCode' },
      { header: 'sourceInvDetailId', key: 'sourceInvDetailId' }, { header: 'sourceInvoiceCode', key: 'sourceInvoiceCode' },
      { header: 'productCode', key: 'productCode' }, { header: 'productName', key: 'productName' }, { header: 'qty', key: 'qty' },
      { header: 'priceTypeCode', key: 'priceTypeCode' }, { header: 'unitPrice', key: 'unitPrice' }, { header: 'bulkPrice', key: 'bulkPrice' },
      { header: 'discount', key: 'discount' }, { header: 'amount', key: 'amount' }, { header: 'startSerialNo', key: 'startSerialNo' },
      { header: 'endSerialNo', key: 'endSerialNo' }, { header: 'taxRate', key: 'taxRate' }, { header: 'taxAmount', key: 'taxAmount' },
      { header: 'fPrice', key: 'fPrice' }, { header: 'uploadStatus', key: 'uploadStatus' }, { header: 'locationCode', key: 'locationCode' },
      { header: 'levyRate', key: 'levyRate' }, { header: 'levyAmount', key: 'levyAmount' }, { header: 'printed', key: 'printed' },
      { header: 'subQty', key: 'subQty' }, { header: 'discountAmount', key: 'discountAmount' }, { header: 'costPrice', key: 'costPrice' },
      { header: 'grnDate', key: 'grnDate' }, { header: 'firstReceivedAt', key: 'firstReceivedAt' }, { header: 'lastReceivedAt', key: 'lastReceivedAt' },
    ],
    model: prisma.salesInvoiceItem,
    where: {
      ...(options.salesFilters?.syncSourceCode ? { syncSourceCode: String(options.salesFilters.syncSourceCode) } : {}),
      ...(Object.keys(invoiceWhere || {}).length ? { salesInvoice: invoiceWhere } : {}),
    },
    select: {
      id: true, salesInvoiceId: true, syncSourceCode: true, sourceInvDetailId: true, sourceInvoiceCode: true,
      productCode: true, productName: true, qty: true, priceTypeCode: true, unitPrice: true, bulkPrice: true,
      discount: true, amount: true, startSerialNo: true, endSerialNo: true, taxRate: true, taxAmount: true,
      fPrice: true, uploadStatus: true, locationCode: true, levyRate: true, levyAmount: true, printed: true,
      subQty: true, discountAmount: true, costPrice: true, grnDate: true, firstReceivedAt: true, lastReceivedAt: true,
    },
    cursorField: 'id',
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  registerSheet('Sales_Products', await streamModelSheet({
    workbook,
    title: 'Sales_Products',
    columns: [
      { header: 'id', key: 'id' }, { header: 'sourceCode', key: 'sourceCode' }, { header: 'name', key: 'name' },
      { header: 'price', key: 'price' }, { header: 'originalPrice', key: 'originalPrice' }, { header: 'discountPrice', key: 'discountPrice' },
      { header: 'isOnSale', key: 'isOnSale' }, { header: 'stock', key: 'stock' }, { header: 'category', key: 'category' },
      { header: 'description', key: 'description' }, { header: 'barcode', key: 'barcode' }, { header: 'expiryDate', key: 'expiryDate' },
      { header: 'expiryBatchCount', key: 'expiryBatchCount' }, { header: 'image', key: 'image' }, { header: 'isActive', key: 'isActive' },
      { header: 'hideFromProductsPage', key: 'hideFromProductsPage' }, { header: 'enabled', key: 'enabled' }, { header: 'lowStockThreshold', key: 'lowStockThreshold' },
    ],
    model: prisma.product,
    where: undefined,
    select: {
      id: true, sourceCode: true, name: true, price: true, originalPrice: true, discountPrice: true,
      isOnSale: true, stock: true, category: true, description: true, barcode: true, expiryDate: true,
      expiryBatchCount: true, image: true, isActive: true, hideFromProductsPage: true, enabled: true, lowStockThreshold: true,
    },
    mapRow: (row) => row,
    batchSize,
    maxRows: perSheetLimit,
    logLabel,
  }));

  const statsSheet = createStreamWorksheet(workbook, 'Backup_Stats', [
    { header: 'sheet', key: 'sheet', width: 34 },
    { header: 'rows', key: 'rows', width: 16 },
  ]);
  sheetStats.forEach((stat) => statsSheet.addRow({ sheet: stat.name, rows: stat.rows }).commit());
  statsSheet.addRow({ sheet: 'TOTAL_ROWS', rows: totalRows }).commit();
  statsSheet.commit();

  await workbook.commit();
  await finished(countingStream);

  logExportProgress(logLabel, 'completed full workbook stream', {
    totalRows,
    bytesWritten,
    sheets: sheetStats.length,
  });

  return {
    totalRows,
    bytesWritten,
    sheetStats,
  };
}

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
  let normalized = value;

  if (typeof normalized === 'bigint') normalized = normalized.toString();
  if (normalized instanceof Date) normalized = normalized.toISOString();
  if (Array.isArray(normalized) || typeof normalized === 'object') {
    normalized = safeJsonStringify(normalized);
  }

  if (typeof normalized === 'string') {
    return sanitizeExcelString(normalized);
  }

  return normalized;
}

function sanitizeExcelString(value) {
  const raw = String(value || '');
  // Strip XML-invalid control characters that can corrupt XLSX files.
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  if (cleaned.length <= MAX_EXCEL_CELL_TEXT) return cleaned;
  return cleaned.slice(0, MAX_EXCEL_CELL_TEXT);
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
    const chunkIndexRaw = normalizeReadCellValue(row.getCell(1).value);
    const jsonChunkRaw = normalizeReadCellValue(row.getCell(2).value);
    const chunkIndex = Number(chunkIndexRaw || 0);
    const jsonChunk = String(jsonChunkRaw || '');
    if (chunkIndex > 0 && jsonChunk) {
      parts.push({ chunkIndex, jsonChunk });
    }
  });

  if (!parts.length) return null;

  parts.sort((a, b) => a.chunkIndex - b.chunkIndex);
  const fullText = parts.map((part) => part.jsonChunk).join('');
  return JSON.parse(fullText);
}

function readEmbeddedJsonSheetFromBufferWorkbook(workbook, sheetName) {
  const rows = getSheetRows(workbook, sheetName);
  if (!rows.length) return null;

  const parts = [];
  rows.slice(1).forEach((row) => {
    const chunkIndex = Number(row?.[0] || 0);
    const jsonChunk = String(row?.[1] || '');
    if (chunkIndex > 0 && jsonChunk) {
      parts.push({ chunkIndex, jsonChunk });
    }
  });

  if (!parts.length) return null;
  parts.sort((a, b) => a.chunkIndex - b.chunkIndex);
  return JSON.parse(parts.map((part) => part.jsonChunk).join(''));
}

function readTabularSheetFromBufferWorkbook(workbook, title) {
  const rows = getSheetRows(workbook, safeWorksheetName(title));
  if (rows.length < 2) return [];

  const headers = (rows[0] || []).map((header) => String(header || '').trim());
  return rows.slice(1).reduce((items, row) => {
    const item = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const value = row?.[index] ?? null;
      if (value !== null && value !== '') hasValue = true;
      item[header] = value;
    });

    if (hasValue) {
      items.push(item);
    }
    return items;
  }, []);
}

function buildPayrollSnapshotFromBufferWorkbook(workbook) {
  const payrollData = {
    employees: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_Employees'),
    salaryStructures: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_SalaryStructures'),
    payrollPeriods: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_Periods'),
    payrollEntries: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_Entries'),
    loans: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_Loans'),
    loanTransactions: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_LoanTx'),
    terminations: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_Terminations'),
    reengagements: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_Reengagements'),
    taxBrackets: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_TaxBrackets'),
    incrementPolicies: readTabularSheetFromBufferWorkbook(workbook, 'Payroll_IncrementPolicies'),
  };

  return {
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
}

function buildSalesSnapshotFromBufferWorkbook(workbook) {
  const salesData = {
    syncSources: readTabularSheetFromBufferWorkbook(workbook, 'Sales_SyncSources'),
    invoices: readTabularSheetFromBufferWorkbook(workbook, 'Sales_Invoices'),
    invoiceItems: readTabularSheetFromBufferWorkbook(workbook, 'Sales_InvoiceItems'),
    products: readTabularSheetFromBufferWorkbook(workbook, 'Sales_Products'),
  };

  return {
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
}

function snapshotHasImportableRows(snapshot) {
  return Boolean(
    snapshot && Object.values(snapshot.data || {}).some((value) => Array.isArray(value) && value.length > 0)
  );
}

function emptyImportSummary() {
  return {
    payroll: {
      imported: {
        employees: 0,
        salaryStructures: 0,
        payrollPeriods: 0,
        payrollEntries: 0,
        loans: 0,
        loanTransactions: 0,
        terminations: 0,
        reengagements: 0,
        taxBrackets: 0,
        incrementPolicies: 0,
      },
      skipped: [],
      errors: [],
    },
    sales: {
      imported: {
        syncSources: 0,
        invoices: 0,
        invoiceItems: 0,
        products: 0,
      },
      skipped: [],
      errors: [],
    },
  };
}

function mergeDomainResult(target, incoming) {
  if (!incoming) return;
  const imported = incoming.imported || {};
  Object.keys(imported).forEach((key) => {
    target.imported[key] = Number(target.imported[key] || 0) + Number(imported[key] || 0);
  });
  if (Array.isArray(incoming.skipped) && incoming.skipped.length) {
    target.skipped.push(...incoming.skipped);
  }
  if (Array.isArray(incoming.errors) && incoming.errors.length) {
    target.errors.push(...incoming.errors);
  }
}

function normalizeWorksheetRow(headers, values) {
  const item = {};
  let hasValue = false;
  headers.forEach((header, index) => {
    if (!header) return;
    const value = values[index] ?? null;
    if (value !== null && value !== '') hasValue = true;
    item[header] = normalizeReadCellValue(value);
  });
  return hasValue ? item : null;
}

function toRowValuesArray(row) {
  if (!row || row.values == null) return [];
  if (Array.isArray(row.values)) {
    return row.values.slice(1);
  }

  // Streaming reader can expose sparse/object row values depending on source.
  if (typeof row.values === 'object') {
    const numericKeys = Object.keys(row.values)
      .map((key) => Number(key))
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((a, b) => a - b);

    if (!numericKeys.length) return [];
    const maxKey = numericKeys[numericKeys.length - 1];
    const values = [];
    for (let index = 1; index <= maxKey; index += 1) {
      values.push(row.values[index]);
    }
    return values;
  }

  return [];
}

const FULL_WORKBOOK_IMPORT_SHEET_MAP = {
  Payroll_Employees: { domain: 'payroll', key: 'employees' },
  Payroll_SalaryStructures: { domain: 'payroll', key: 'salaryStructures' },
  Payroll_Periods: { domain: 'payroll', key: 'payrollPeriods' },
  Payroll_Entries: { domain: 'payroll', key: 'payrollEntries' },
  Payroll_Loans: { domain: 'payroll', key: 'loans' },
  Payroll_LoanTx: { domain: 'payroll', key: 'loanTransactions' },
  Payroll_Terminations: { domain: 'payroll', key: 'terminations' },
  Payroll_Reengagements: { domain: 'payroll', key: 'reengagements' },
  Payroll_TaxBrackets: { domain: 'payroll', key: 'taxBrackets' },
  Payroll_IncrementPolicies: { domain: 'payroll', key: 'incrementPolicies' },
  Sales_SyncSources: { domain: 'sales', key: 'syncSources' },
  Sales_Invoices: { domain: 'sales', key: 'invoices' },
  Sales_InvoiceItems: { domain: 'sales', key: 'invoiceItems' },
  Sales_Products: { domain: 'sales', key: 'products' },
};

async function importSheetBatch({ domain, key, rows, options, shouldClearExisting }) {
  if (!rows.length) return null;

  if (domain === 'payroll') {
    return dataSnapshotService.importPayrollSnapshot(
      {
        data: {
          [key]: rows,
        },
      },
      {
        upsert: options.upsert !== false,
        clearExisting: shouldClearExisting,
        locationId: options.locationId || null,
      },
    );
  }

  return dataSnapshotService.importSalesSnapshot(
    {
      data: {
        [key]: rows,
      },
    },
    {
      upsert: options.upsert !== false,
    },
  );
}

async function importWorkbookByStreamingTabularSheets(fileBuffer, options = {}) {
  const result = emptyImportSummary();

  // Use a single-chunk stream. Readable.from(buffer) yields per-byte chunks and can break XLSX parsing.
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([fileBuffer]), {
    entries: 'emit',
    worksheets: 'emit',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
  });

  let sawAnyImportableRows = false;
  let totalRows = 0;
  let payrollCleared = false;

  for await (const worksheetReader of workbookReader) {
    if (worksheetReader.type !== 'worksheet') continue;
    const sheetTitle = safeWorksheetName(worksheetReader.name || '');
    const target = FULL_WORKBOOK_IMPORT_SHEET_MAP[sheetTitle];
    if (!target) {
      continue;
    }

    let headers = null;
    let rowsInSheet = 0;
    let batch = [];

    const flushBatch = async () => {
      if (!batch.length) return;
      assertImportHeapHeadroom();
      const imported = await importSheetBatch({
        domain: target.domain,
        key: target.key,
        rows: batch,
        options,
        shouldClearExisting: target.domain === 'payroll' && options.clearExisting === true && payrollCleared === false,
      });
      if (target.domain === 'payroll' && options.clearExisting === true && payrollCleared === false) {
        payrollCleared = true;
      }
      mergeDomainResult(result[target.domain], imported);
      batch = [];
      maybeRunGc();
    };

    for await (const row of worksheetReader) {
      const rawValues = toRowValuesArray(row);
      if (!headers) {
        headers = rawValues.map((header) => String(normalizeReadCellValue(header) || '').trim());
        continue;
      }

      const normalized = normalizeWorksheetRow(headers, rawValues);
      if (!normalized) continue;

      sawAnyImportableRows = true;
      rowsInSheet += 1;
      totalRows += 1;

      if (rowsInSheet > MAX_IMPORT_ROWS_PER_SHEET) {
        throw new ImportGuardError(
          `Sheet ${sheetTitle} exceeded safe import row limit (${MAX_IMPORT_ROWS_PER_SHEET}). Split workbook and retry.`,
          413,
        );
      }
      if (totalRows > MAX_IMPORT_ROWS_TOTAL) {
        throw new ImportGuardError(
          `Workbook exceeded safe total import row limit (${MAX_IMPORT_ROWS_TOTAL}). Split workbook and retry.`,
          413,
        );
      }

      batch.push(normalized);
      if (batch.length >= IMPORT_BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();
    logImportProgress('completed streaming sheet import', {
      sheet: sheetTitle,
      rowsInSheet,
      importBatchSize: IMPORT_BATCH_SIZE,
    });
  }

  if (!sawAnyImportableRows) {
    throw new ImportGuardError('Workbook was parsed but no importable rows were detected. Ensure this is a full workbook export and not a damaged file.', 400);
  }

  return result;
}

async function importWorkbookByBufferedTabularSheets(fileBuffer, options = {}) {
  const result = emptyImportSummary();
  let workbook;
  try {
    assertImportHeapHeadroom();
    workbook = readWorkbookFromBuffer(fileBuffer);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('heap out of memory') || message.includes('allocation failed')) {
      throw new ImportGuardError('Workbook import exceeded available server memory. Reduce workbook scope (location/date) and retry.', 413);
    }
    throw error;
  }

  let sawAnyImportableRows = false;
  let totalRows = 0;
  let payrollCleared = false;

  for (const [sheetTitle, target] of Object.entries(FULL_WORKBOOK_IMPORT_SHEET_MAP)) {
    const normalizedSheetName = safeWorksheetName(sheetTitle);
    const rows = getSheetRows(workbook, normalizedSheetName);
    if (!rows || rows.length < 2) continue;

    const headers = (rows[0] || []).map((header) => String(normalizeReadCellValue(header) || '').trim());
    let rowsInSheet = 0;
    let batch = [];

    const flushBatch = async () => {
      if (!batch.length) return;
      assertImportHeapHeadroom();
      const imported = await importSheetBatch({
        domain: target.domain,
        key: target.key,
        rows: batch,
        options,
        shouldClearExisting: target.domain === 'payroll' && options.clearExisting === true && payrollCleared === false,
      });
      if (target.domain === 'payroll' && options.clearExisting === true && payrollCleared === false) {
        payrollCleared = true;
      }
      mergeDomainResult(result[target.domain], imported);
      batch = [];
      maybeRunGc();
    };

    for (let i = 1; i < rows.length; i += 1) {
      const normalized = normalizeWorksheetRow(headers, rows[i] || []);
      if (!normalized) continue;

      sawAnyImportableRows = true;
      rowsInSheet += 1;
      totalRows += 1;

      if (rowsInSheet > MAX_IMPORT_ROWS_PER_SHEET) {
        throw new ImportGuardError(
          `Sheet ${sheetTitle} exceeded safe import row limit (${MAX_IMPORT_ROWS_PER_SHEET}). Split workbook and retry.`,
          413,
        );
      }
      if (totalRows > MAX_IMPORT_ROWS_TOTAL) {
        throw new ImportGuardError(
          `Workbook exceeded safe total import row limit (${MAX_IMPORT_ROWS_TOTAL}). Split workbook and retry.`,
          413,
        );
      }

      batch.push(normalized);
      if (batch.length >= IMPORT_BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();
    logImportProgress('completed buffered sheet import', {
      sheet: sheetTitle,
      rowsInSheet,
      importBatchSize: IMPORT_BATCH_SIZE,
    });

    // Free processed sheet memory before moving to the next heavy sheet.
    if (workbook?.Sheets?.[normalizedSheetName]) {
      delete workbook.Sheets[normalizedSheetName];
    }
    if (Array.isArray(workbook?.SheetNames)) {
      workbook.SheetNames = workbook.SheetNames.filter((name) => name !== normalizedSheetName);
    }
    maybeRunGc();
  }

  if (!sawAnyImportableRows) {
    throw new ImportGuardError('Workbook was parsed but no importable rows were detected. Ensure this is a full workbook export and not a damaged file.', 400);
  }

  return result;
}

async function exportFullWorkbook(options = {}) {
  const warnings = [];

  const emptyPayrollSnapshot = {
    version: '1.0.0',
    type: 'payroll',
    exportedAt: new Date().toISOString(),
    filters: options.payrollFilters || {},
    data: {
      employees: [],
      salaryStructures: [],
      payrollPeriods: [],
      payrollEntries: [],
      loans: [],
      loanTransactions: [],
      terminations: [],
      reengagements: [],
      taxBrackets: [],
      incrementPolicies: [],
      metadata: {},
    },
  };

  const emptySalesSnapshot = {
    version: '1.0.0',
    type: 'sales',
    exportedAt: new Date().toISOString(),
    filters: options.salesFilters || {},
    data: {
      syncSources: [],
      invoices: [],
      invoiceItems: [],
      products: [],
      metadata: {},
    },
  };

  let payrollSnapshot = emptyPayrollSnapshot;
  let salesSnapshot = emptySalesSnapshot;

  try {
    payrollSnapshot = await dataSnapshotService.exportPayrollSnapshot(options.payrollFilters || {});
  } catch (error) {
    warnings.push(`Payroll snapshot export failed: ${error.message}`);
  }

  try {
    salesSnapshot = await dataSnapshotService.exportSalesSnapshot(options.salesFilters || {});
  } catch (error) {
    warnings.push(`Sales snapshot export failed: ${error.message}`);
  }

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
    { field: 'Warnings Count', value: warnings.length },
  ]);

  if (warnings.length > 0) {
    addTabularSheet(workbook, 'Export_Warnings', warnings.map((warning, index) => ({
      index: index + 1,
      message: warning,
    })));
  }

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

  assertImportGuards(fileBuffer);

  logImportProgress('loading workbook buffer for full import', {
    fileBytes: fileBuffer.length,
    upsert: options.upsert !== false,
    clearExisting: options.clearExisting === true,
    locationId: options.locationId || null,
  });

  try {
    return await importWorkbookByStreamingTabularSheets(fileBuffer, options);
  } catch (error) {
    if (error instanceof ImportGuardError && error.statusCode === 400) {
      logImportProgress('streaming import detected no rows; retrying via buffered parser fallback');
      return importWorkbookByBufferedTabularSheets(fileBuffer, options);
    }

    const message = String(error?.message || '').toLowerCase();
    if (message.includes('heap out of memory') || message.includes('allocation failed')) {
      throw new ImportGuardError('Workbook import exceeded available server memory. Reduce workbook scope (location/date) and retry.', 413);
    }
    throw error;
  }
}

module.exports = {
  exportFullWorkbook,
  streamFullWorkbook,
  importFullWorkbook,
  ExportGuardError,
};
