'use strict';

const ExcelJS = require('exceljs');
const { PassThrough } = require('stream');
const { finished } = require('stream/promises');
const { PrismaClient } = require('@prisma/client');
const dataSnapshotService = require('./dataSnapshot.service');
const prisma = new PrismaClient();

const MAX_CELL_CHARS = 30000;
const MAX_EXCEL_CELL_TEXT = 32767;
const PAYROLL_JSON_SHEET = '__PAYROLL_SNAPSHOT_JSON';
const SALES_JSON_SHEET = '__SALES_SNAPSHOT_JSON';
const DEFAULT_BATCH_SIZE = Math.max(100, Number(process.env.FULL_WORKBOOK_BATCH_SIZE || 1000));
const MAX_ROWS_PER_SHEET = Math.max(1000, Number(process.env.FULL_WORKBOOK_MAX_ROWS_PER_SHEET || 250000));
const MAX_ROWS_TOTAL = Math.max(5000, Number(process.env.FULL_WORKBOOK_MAX_ROWS_TOTAL || 700000));
const MAX_SALES_RANGE_DAYS = Math.max(1, Number(process.env.FULL_WORKBOOK_MAX_SALES_RANGE_DAYS || 370));

class ExportGuardError extends Error {
  constructor(message, statusCode = 413) {
    super(message);
    this.name = 'ExportGuardError';
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

  while (true) {
    const batch = await model.findMany({
      where: buildCursorWhere(where, cursorField, lastCursor),
      orderBy: { [cursorField]: 'asc' },
      take: batchSize,
      select,
    });

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
        errors: ['No importable payroll rows found in workbook'],
      },
      sales: {
        imported: {
          syncSources: 0,
          invoices: 0,
          invoiceItems: 0,
          products: 0,
        },
        errors: ['No importable sales rows found in workbook'],
      },
    };
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
  streamFullWorkbook,
  importFullWorkbook,
  ExportGuardError,
};
