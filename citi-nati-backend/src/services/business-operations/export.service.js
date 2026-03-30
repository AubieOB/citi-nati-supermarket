'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const { resolvePeriod, formatDateRange } = require('../../utils/reportingPeriod');
const { extractFilters, buildInvoiceWhere, buildItemWhere } = require('../../utils/reportingFilters');
const {
  querySalesSummary,
  queryInvoiceList,
  queryProductReport,
  queryUserReport,
  queryPaymentReport,
} = require('../salesReporting.service');
const expensesService = require('./expenses.service');
const suppliersService = require('./suppliers.service');
const payrollService = require('./payroll.service');
const employeesService = require('./employees.service');

const COMPANY_NAME = 'Citi-Nati Supermarket';
const COMPANY_CONTACT = process.env.EXPORT_COMPANY_CONTACT || 'Lilongwe, Malawi';
const MWK_FORMAT = '"MWK" #,##0.00';

function money(value) {
  return Number(value || 0);
}

function toDateString(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sanitizeFilePart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'report';
}

function logoPathCandidates() {
  return [
    process.env.EXPORT_LOGO_PATH,
    path.resolve(__dirname, '../../../../citi-nati-frontend/src/assets/citi-nati-logo.png.png'),
    path.resolve(__dirname, '../../../../citi-nati-frontend/src/assets/citi-nati-logo.png'),
  ].filter(Boolean);
}

function resolveLogoPath() {
  return logoPathCandidates().find((candidate) => fs.existsSync(candidate)) || null;
}

function chunkRows(rows, maxRowsPerPage = 32) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += maxRowsPerPage) {
    chunks.push(rows.slice(i, i + maxRowsPerPage));
  }
  return chunks.length ? chunks : [[]];
}

function ensurePeriodFilters(filters = {}) {
  const now = new Date();
  return {
    periodType: filters.periodType || 'month',
    date: filters.date,
    month: filters.month || String(now.getMonth() + 1),
    year: filters.year || String(now.getFullYear()),
    quarter: filters.quarter,
    startDate: filters.startDate,
    endDate: filters.endDate,
    branchCode: filters.branchCode,
    syncSourceCode: filters.syncSourceCode,
    locationCode: filters.locationCode,
    locationId: filters.locationId,
    userName: filters.userName,
    productCode: filters.productCode,
    productName: filters.productName,
    payMethod: filters.payMethod,
    invoiceType: filters.invoiceType,
  };
}

function resolveMonthlyRange(filters = {}) {
  const now = new Date();
  const periodType = filters.periodType === 'custom' ? 'custom' : 'month';

  if (periodType === 'custom') {
    const startDate = filters.startDate;
    const endDate = filters.endDate;
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required for monthly-summary custom range export');
    }
    return {
      periodType: 'custom',
      startDate,
      endDate,
      label: `${startDate} to ${endDate}`,
    };
  }

  const year = Number(filters.year || now.getFullYear());
  const month = Number(filters.month || now.getMonth() + 1);
  const startDate = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
  return {
    periodType: 'month',
    month,
    year,
    startDate,
    endDate,
    label: `${String(month).padStart(2, '0')}/${year}`,
  };
}

async function collectPaged(fetchPage, pageSize = 500) {
  const rows = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const pagination = { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
    const result = await fetchPage(pagination);
    const data = Array.isArray(result.data) ? result.data : [];
    const total = Number(result.total || 0);

    rows.push(...data);
    totalPages = Math.max(1, Math.ceil(total / pageSize));
    page += 1;
  }

  return rows;
}

function setWorksheetColumns(sheet, columns) {
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 18,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function appendRows(sheet, columns, rows) {
  rows.forEach((row) => {
    const excelRow = sheet.addRow(row);
    columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      if (column.type === 'currency') {
        cell.numFmt = MWK_FORMAT;
      }
      if (column.type === 'number') {
        cell.numFmt = '#,##0.00';
      }
      if (column.type === 'integer') {
        cell.numFmt = '#,##0';
      }
      if (column.type === 'date') {
        cell.numFmt = 'yyyy-mm-dd';
      }
      cell.alignment = { vertical: 'top', horizontal: column.align || 'left' };
    });
  });
}

function addTotalsRow(sheet, columns, totals = {}) {
  if (!totals || !Object.keys(totals).length) return;
  const row = sheet.addRow(totals);
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    if (column.type === 'currency') cell.numFmt = MWK_FORMAT;
    if (column.type === 'number') cell.numFmt = '#,##0.00';
    if (column.type === 'integer') cell.numFmt = '#,##0';
  });
}

function drawPdfHeader(doc, title, subtitle) {
  const logoPath = resolveLogoPath();
  if (logoPath) {
    doc.image(logoPath, 50, 35, { fit: [70, 70] });
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(COMPANY_NAME, 130, 38)
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#4B5563')
    .text(COMPANY_CONTACT, 130, 60)
    .fillColor('#111827')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(title, 50, 102)
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#374151')
    .text(subtitle, 50, 122)
    .text(`Generated: ${new Date().toLocaleString('en-GB')}`, 50, 136)
    .fillColor('#111827');

  doc.moveTo(50, 154).lineTo(545, 154).strokeColor('#D1D5DB').stroke();
}

function drawPdfSectionTitle(doc, title) {
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(title);
  doc.moveDown(0.2);
}

function drawPdfKeyValues(doc, rows) {
  rows.forEach((row) => {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#374151')
      .text(`${row.label}:`, { continued: true })
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(` ${row.value}`);
  });
}

function drawPdfTable(doc, columns, rows) {
  const pageWidth = 545 - 50;
  const totalWeight = columns.reduce((sum, col) => sum + (col.weight || 1), 0);
  const widths = columns.map((col) => (pageWidth * (col.weight || 1)) / totalWeight);
  const startX = 50;

  const drawHeader = () => {
    let x = startX;
    const y = doc.y;
    columns.forEach((column, idx) => {
      doc.rect(x, y, widths[idx], 20).fillAndStroke('#F3F4F6', '#E5E7EB');
      doc
        .fillColor('#111827')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(column.header, x + 4, y + 6, { width: widths[idx] - 8, ellipsis: true });
      x += widths[idx];
    });
    doc.y = y + 22;
  };

  const rowHeight = 20;
  drawHeader();

  rows.forEach((row) => {
    if (doc.y + rowHeight > doc.page.height - 50) {
      doc.addPage();
      drawHeader();
    }

    let x = startX;
    const y = doc.y;
    columns.forEach((column, idx) => {
      const value = row[column.key] === null || row[column.key] === undefined ? '' : String(row[column.key]);
      doc.rect(x, y, widths[idx], rowHeight).stroke('#E5E7EB');
      doc
        .fillColor('#111827')
        .font('Helvetica')
        .fontSize(8.5)
        .text(value, x + 4, y + 5, { width: widths[idx] - 8, ellipsis: true });
      x += widths[idx];
    });
    doc.y = y + rowHeight;
  });
}

async function buildSalesReport(type, filters) {
  const query = ensurePeriodFilters(filters);
  const period = resolvePeriod(query);
  if (period.error) {
    throw new Error(period.error);
  }

  const reportFilters = extractFilters(query);
  const invoiceWhere = buildInvoiceWhere(period, reportFilters);
  const itemWhere = buildItemWhere(period, reportFilters);
  const dateRange = formatDateRange(period.startDate, period.endDate);

  const includeSummary = type === 'summary' || type === 'all';
  const includeInvoices = type === 'invoices' || type === 'all';
  const includeProducts = type === 'products' || type === 'all';
  const includeUsers = type === 'users' || type === 'all';
  const includePayments = type === 'payments' || type === 'all';

  const data = { summary: null, invoices: [], products: [], users: [], payments: [] };

  if (includeSummary) {
    data.summary = await querySalesSummary(invoiceWhere);
  }

  if (includeInvoices) {
    data.invoices = await collectPaged((pagination) => queryInvoiceList(invoiceWhere, pagination, { sortBy: 'invoiceDate', sortOrder: 'desc' }));
  }

  if (includeProducts) {
    data.products = await collectPaged((pagination) => queryProductReport(itemWhere, pagination, { sortBy: 'totalQuantitySold', sortOrder: 'desc' }));
  }

  if (includeUsers) {
    data.users = await collectPaged((pagination) => queryUserReport(invoiceWhere, pagination, { sortBy: 'totalInvoices', sortOrder: 'desc' }));
  }

  if (includePayments) {
    data.payments = await queryPaymentReport(invoiceWhere);
  }

  return {
    module: 'sales',
    title: 'Sales Report',
    type,
    dateRange,
    filters: query,
    data,
  };
}

async function buildExpensesReport(type, filters = {}) {
  const listFilters = {
    search: filters.search ? String(filters.search).trim() : null,
    expenseCategoryId: Number(filters.expenseCategoryId) || null,
    locationId: Number(filters.locationId) || null,
    reportingPeriodId: Number(filters.reportingPeriodId) || null,
    startDate: filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null,
    endDate: filters.endDate ? new Date(`${filters.endDate}T23:59:59`) : null,
  };

  const includeList = type === 'list' || type === 'all';
  const includeSummary = type === 'summary' || type === 'all';
  const includeCategories = type === 'category-summary' || type === 'all';

  const data = { expenses: [], summary: null, categories: [] };

  if (includeList) {
    data.expenses = await collectPaged((pagination) => expensesService.listExpenses({
      ...listFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'expenseDate',
      sortOrder: 'desc',
    }));
  }

  if (includeSummary || includeCategories) {
    data.summary = await expensesService.getExpenseSummary(listFilters);
  }

  if (includeCategories) {
    data.categories = await collectPaged((pagination) => expensesService.listExpenseCategories({
      search: null,
      isActive: null,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'name',
      sortOrder: 'asc',
    }));
  }

  return {
    module: 'expenses',
    title: 'Expense Report',
    type,
    filters,
    data,
  };
}

async function buildSuppliersReport(type, filters = {}) {
  const supplierFilters = {
    search: filters.search ? String(filters.search).trim() : null,
    status: filters.status ? String(filters.status).trim().toLowerCase() : null,
  };

  const includeList = type === 'list' || type === 'all';
  const includeTransactions = type === 'transactions' || type === 'all';
  const includeBalances = type === 'balances' || type === 'all';

  const data = {
    suppliers: [],
    transactions: [],
    balances: {
      totalSuppliers: 0,
      activeSuppliers: 0,
      totalDebt: 0,
      totalCredit: 0,
    },
  };

  if (includeList || includeBalances) {
    data.suppliers = await collectPaged((pagination) => suppliersService.listSuppliers({
      ...supplierFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));

    data.balances.totalSuppliers = data.suppliers.length;
    data.balances.activeSuppliers = data.suppliers.filter((supplier) => String(supplier.status || '').toLowerCase() === 'active').length;
    data.balances.totalDebt = data.suppliers.reduce((sum, supplier) => {
      const balance = Number(supplier.currentBalance || 0);
      return sum + (balance > 0 ? balance : 0);
    }, 0);
    data.balances.totalCredit = Math.abs(data.suppliers.reduce((sum, supplier) => {
      const balance = Number(supplier.currentBalance || 0);
      return sum + (balance < 0 ? balance : 0);
    }, 0));
  }

  if (includeTransactions) {
    const txFilters = {
      supplierId: Number(filters.supplierId) || null,
      reportingPeriodId: Number(filters.reportingPeriodId) || null,
      transactionType: filters.transactionType ? String(filters.transactionType).toLowerCase() : null,
      paymentMethod: filters.paymentMethod ? String(filters.paymentMethod).toLowerCase() : null,
      startDate: filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null,
      endDate: filters.endDate ? new Date(`${filters.endDate}T23:59:59`) : null,
      search: filters.search ? String(filters.search).trim() : null,
    };

    data.transactions = await collectPaged((pagination) => suppliersService.listSupplierTransactions({
      ...txFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'transactionDate',
      sortOrder: 'desc',
    }));
  }

  return {
    module: 'suppliers',
    title: 'Supplier Report',
    type,
    filters,
    data,
  };
}

async function buildPayrollReport(type, filters = {}) {
  const periodFilters = {
    search: filters.search ? String(filters.search).trim() : null,
    status: filters.status ? String(filters.status).trim() : null,
    payrollMode: filters.payrollMode ? String(filters.payrollMode).trim() : null,
    reportingPeriodId: Number(filters.reportingPeriodId) || null,
  };

  const includePeriods = type === 'periods' || type === 'all' || type === 'period';
  const includeEntries = type === 'entries' || type === 'all' || type === 'period';

  const data = {
    periods: [],
    selectedPeriod: null,
    entries: [],
    totals: {
      grossPay: 0,
      deductions: 0,
      netPay: 0,
      employeeCount: 0,
    },
  };

  if (includePeriods) {
    data.periods = await collectPaged((pagination) => payrollService.listPayrollPeriods({
      ...periodFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));
  }

  const selectedPeriodId = Number(filters.payrollPeriodId) || Number(data.periods?.[0]?.id) || null;
  if (selectedPeriodId) {
    data.selectedPeriod = data.periods.find((period) => Number(period.id) === selectedPeriodId) || null;
  }

  if (includeEntries && selectedPeriodId) {
    data.entries = await collectPaged((pagination) => payrollService.listPayrollEntries({
      payrollPeriodId: selectedPeriodId,
      employeeId: null,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));

    const employeeIds = new Set();
    data.entries.forEach((entry) => {
      employeeIds.add(entry.employeeId);
      data.totals.grossPay += Number(entry.grossPay || 0);
      data.totals.deductions += Number(entry.totalDeductions || 0);
      data.totals.netPay += Number(entry.netPay || 0);
    });
    data.totals.employeeCount = employeeIds.size;
  }

  return {
    module: 'payroll',
    title: 'Payroll Report',
    type,
    filters,
    data,
  };
}

async function buildEmployeesReport(type, filters = {}) {
  const listFilters = {
    search: filters.search ? String(filters.search).trim() : null,
    status: filters.status ? String(filters.status).trim() : null,
    department: filters.department ? String(filters.department).trim() : null,
    locationId: Number(filters.locationId) || null,
  };

  const includeList = type === 'list' || type === 'all';
  const data = { employees: [] };

  if (includeList) {
    data.employees = await collectPaged((pagination) => employeesService.listEmployees({
      ...listFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));
  }

  return {
    module: 'employees',
    title: 'Employees Report',
    type,
    filters,
    data,
  };
}

function inRange(dateValue, start, end) {
  if (!dateValue) return false;
  const value = new Date(dateValue);
  if (Number.isNaN(value.getTime())) return false;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T23:59:59`);
  return value >= startDate && value <= endDate;
}

async function buildMonthlySummaryReport(filters = {}) {
  const monthlyRange = resolveMonthlyRange(filters);

  const salesPeriodParams = monthlyRange.periodType === 'month'
    ? {
        periodType: 'month',
        month: String(monthlyRange.month),
        year: String(monthlyRange.year),
      }
    : {
        periodType: 'custom',
        startDate: monthlyRange.startDate,
        endDate: monthlyRange.endDate,
      };

  const salesFilters = extractFilters({
    locationCode: filters.locationCode || null,
  });
  const salesPeriod = resolvePeriod(salesPeriodParams);
  if (salesPeriod.error) {
    throw new Error(salesPeriod.error);
  }

  const salesWhere = buildInvoiceWhere(salesPeriod, salesFilters);
  const salesSummary = await querySalesSummary(salesWhere);
  const paymentRows = await queryPaymentReport(salesWhere);

  const locationId = Number(filters.locationCode);
  const expensesSummary = await expensesService.getExpenseSummary({
    search: null,
    expenseCategoryId: null,
    locationId: Number.isInteger(locationId) && locationId > 0 ? locationId : null,
    reportingPeriodId: null,
    startDate: new Date(`${monthlyRange.startDate}T00:00:00`),
    endDate: new Date(`${monthlyRange.endDate}T23:59:59`),
  });

  const payrollPeriods = await collectPaged((pagination) => payrollService.listPayrollPeriods({
    search: null,
    status: null,
    payrollMode: null,
    reportingPeriodId: null,
    skip: pagination.skip,
    take: pagination.take,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }));

  const relevantPeriods = payrollPeriods.filter((period) => inRange(period.createdAt, monthlyRange.startDate, monthlyRange.endDate));
  const payrollEntries = [];
  for (const period of relevantPeriods) {
    const rows = await collectPaged((pagination) => payrollService.listPayrollEntries({
      payrollPeriodId: period.id,
      employeeId: null,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));
    payrollEntries.push(...rows);
  }

  const payrollTotals = payrollEntries.reduce((acc, entry) => {
    acc.totalBasicSalary += Number(entry.basicSalary || 0);
    acc.totalDeductions += Number(entry.totalDeductions || 0);
    acc.totalNetPay += Number(entry.netPay || 0);
    return acc;
  }, {
    totalBasicSalary: 0,
    totalDeductions: 0,
    totalNetPay: 0,
  });

  const suppliers = await collectPaged((pagination) => suppliersService.listSuppliers({
    search: null,
    status: null,
    skip: pagination.skip,
    take: pagination.take,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }));

  const supplierPayments = await collectPaged((pagination) => suppliersService.listSupplierTransactions({
    supplierId: null,
    reportingPeriodId: null,
    transactionType: 'payment',
    paymentMethod: null,
    startDate: new Date(`${monthlyRange.startDate}T00:00:00`),
    endDate: new Date(`${monthlyRange.endDate}T23:59:59`),
    search: null,
    skip: pagination.skip,
    take: pagination.take,
    sortBy: 'transactionDate',
    sortOrder: 'desc',
  }));

  const salesTotal = Number(salesSummary.netSales || 0);
  const expensesTotal = Number(expensesSummary?.totals?.totalAmount || 0);
  const payrollTotal = Number(payrollTotals.totalNetPay || 0);
  const supplierPaymentTotal = supplierPayments.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const supplierDebtTotal = suppliers.reduce((sum, supplier) => {
    const balance = Number(supplier.currentBalance || 0);
    return sum + (balance > 0 ? balance : 0);
  }, 0);

  const netPosition = salesTotal - expensesTotal - payrollTotal - supplierPaymentTotal;

  return {
    module: 'monthly-summary',
    title: 'Monthly Business Summary',
    type: 'summary',
    filters,
    range: monthlyRange,
    data: {
      salesTotal,
      expensesTotal,
      payrollTotal,
      supplierPaymentTotal,
      supplierDebtTotal,
      netPosition,
      salesSummary,
      expensesSummary,
      payrollTotals,
      supplierPayments,
      paymentRows,
      payrollPeriodsCount: relevantPeriods.length,
    },
  };
}

async function getReportData(moduleName, type, filters) {
  if (moduleName === 'sales') return buildSalesReport(type || 'summary', filters);
  if (moduleName === 'expenses') return buildExpensesReport(type || 'list', filters);
  if (moduleName === 'suppliers') return buildSuppliersReport(type || 'list', filters);
  if (moduleName === 'payroll') return buildPayrollReport(type || 'period', filters);
  if (moduleName === 'employees') return buildEmployeesReport(type || 'list', filters);
  if (moduleName === 'monthly-summary') return buildMonthlySummaryReport(filters);
  throw new Error(`Unsupported export module: ${moduleName}`);
}

async function buildExcelBuffer(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  workbook.created = new Date();
  workbook.modified = new Date();

  if (report.module === 'sales') {
    if (report.data.summary) {
      const sheet = workbook.addWorksheet('Summary');
      const columns = [
        { header: 'Metric', key: 'metric', width: 34 },
        { header: 'Value', key: 'value', width: 24, type: 'currency' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, [
        { metric: 'Total Invoices', value: money(report.data.summary.totalInvoices) },
        { metric: 'Total Items Sold', value: money(report.data.summary.totalItemsSold) },
        { metric: 'Gross Sales', value: money(report.data.summary.grossSales) },
        { metric: 'VAT Total', value: money(report.data.summary.vatTotal) },
        { metric: 'Discount Total', value: money(report.data.summary.discountTotal) },
        { metric: 'Net Sales', value: money(report.data.summary.netSales) },
        { metric: 'Levy Total', value: money(report.data.summary.levyTotal) },
        { metric: 'Average Invoice Value', value: money(report.data.summary.averageInvoiceValue) },
      ]);
    }

    if (report.data.invoices.length) {
      const sheet = workbook.addWorksheet('Invoices');
      const columns = [
        { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
        { header: 'Invoice No', key: 'invoiceNo', width: 20 },
        { header: 'Branch', key: 'branchCode', width: 12 },
        { header: 'Location', key: 'locationCode', width: 12 },
        { header: 'Cashier', key: 'userName', width: 20 },
        { header: 'Payment 1', key: 'payMethod1', width: 14 },
        { header: 'Payment 2', key: 'payMethod2', width: 14 },
        { header: 'Net Sale', key: 'netSale', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.invoices.map((row) => ({
        invoiceDate: toDateString(row.invoiceDate),
        invoiceNo: row.sourceInvoiceNo || row.refNo || row.id,
        branchCode: row.branchCode || '',
        locationCode: row.locationCode || '',
        userName: row.userName || '',
        payMethod1: row.payMethod1 || '',
        payMethod2: row.payMethod2 || '',
        netSale: money(row.netSale),
      })));
      addTotalsRow(sheet, columns, {
        invoiceDate: 'TOTAL',
        netSale: report.data.invoices.reduce((sum, row) => sum + money(row.netSale), 0),
      });
    }

    if (report.data.products.length) {
      const sheet = workbook.addWorksheet('Products');
      const columns = [
        { header: 'Product Code', key: 'productCode', width: 18 },
        { header: 'Product Name', key: 'productName', width: 30 },
        { header: 'Qty Sold', key: 'totalQuantitySold', width: 14, type: 'number', align: 'right' },
        { header: 'Total Sales', key: 'totalSales', width: 16, type: 'currency', align: 'right' },
        { header: 'Tax', key: 'totalTax', width: 14, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.products);
      addTotalsRow(sheet, columns, {
        productCode: 'TOTAL',
        totalQuantitySold: report.data.products.reduce((sum, row) => sum + money(row.totalQuantitySold), 0),
        totalSales: report.data.products.reduce((sum, row) => sum + money(row.totalSales), 0),
        totalTax: report.data.products.reduce((sum, row) => sum + money(row.totalTax), 0),
      });
    }

    if (report.data.users.length) {
      const sheet = workbook.addWorksheet('Users');
      const columns = [
        { header: 'User', key: 'userName', width: 28 },
        { header: 'Invoices', key: 'totalInvoices', width: 12, type: 'integer', align: 'right' },
        { header: 'Gross Sales', key: 'grossSales', width: 16, type: 'currency', align: 'right' },
        { header: 'Net Sales', key: 'totalSales', width: 16, type: 'currency', align: 'right' },
        { header: 'Avg Invoice', key: 'averageInvoiceValue', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.users);
    }

    if (report.data.payments.length) {
      const sheet = workbook.addWorksheet('Payments');
      const columns = [
        { header: 'Payment Method', key: 'payMethod', width: 22 },
        { header: 'Invoice Count', key: 'invoiceCount', width: 14, type: 'integer', align: 'right' },
        { header: 'Amount', key: 'totalAmount', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.payments);
      addTotalsRow(sheet, columns, {
        payMethod: 'TOTAL',
        invoiceCount: report.data.payments.reduce((sum, row) => sum + Number(row.invoiceCount || 0), 0),
        totalAmount: report.data.payments.reduce((sum, row) => sum + money(row.totalAmount), 0),
      });
    }
  }

  if (report.module === 'expenses') {
    if (report.data.expenses.length) {
      const sheet = workbook.addWorksheet('Expenses');
      const columns = [
        { header: 'Date', key: 'expenseDate', width: 14 },
        { header: 'Category', key: 'category', width: 24 },
        { header: 'Description', key: 'description', width: 38 },
        { header: 'Payment Method', key: 'paymentMethod', width: 16 },
        { header: 'Reference', key: 'referenceNo', width: 18 },
        { header: 'Amount', key: 'amount', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.expenses.map((row) => ({
        expenseDate: toDateString(row.expenseDate),
        category: row.expenseCategory?.name || '',
        description: row.description || '',
        paymentMethod: row.paymentMethod || '',
        referenceNo: row.referenceNo || '',
        amount: money(row.amount),
      })));
      addTotalsRow(sheet, columns, {
        expenseDate: 'TOTAL',
        amount: report.data.expenses.reduce((sum, row) => sum + money(row.amount), 0),
      });
    }

    if (report.data.summary) {
      const sheet = workbook.addWorksheet('Summary');
      const columns = [
        { header: 'Metric', key: 'metric', width: 28 },
        { header: 'Value', key: 'value', width: 24, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, [
        { metric: 'Total Expenses', value: money(report.data.summary?.totals?.totalExpenses || 0) },
        { metric: 'Total Amount', value: money(report.data.summary?.totals?.totalAmount || 0) },
        { metric: 'Average Amount', value: money(report.data.summary?.totals?.averageAmount || 0) },
      ]);
    }

    if (report.data.summary?.topCategories?.length) {
      const sheet = workbook.addWorksheet('Top Categories');
      const columns = [
        { header: 'Category', key: 'categoryName', width: 28 },
        { header: 'Expense Count', key: 'expenseCount', width: 16, type: 'integer', align: 'right' },
        { header: 'Total Amount', key: 'totalAmount', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.summary.topCategories.map((row) => ({
        categoryName: row.category?.name || 'Uncategorized',
        expenseCount: row.expenseCount,
        totalAmount: money(row.totalAmount),
      })));
    }
  }

  if (report.module === 'suppliers') {
    if (report.data.suppliers.length) {
      const sheet = workbook.addWorksheet('Suppliers');
      const columns = [
        { header: 'Supplier Code', key: 'supplierCode', width: 18 },
        { header: 'Supplier Name', key: 'name', width: 30 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Phone', key: 'phone', width: 18 },
        { header: 'Current Balance', key: 'currentBalance', width: 18, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.suppliers.map((row) => ({
        supplierCode: row.supplierCode || '',
        name: row.name || '',
        status: row.status || '',
        phone: row.phone || '',
        currentBalance: money(row.currentBalance),
      })));
    }

    if (report.data.transactions.length) {
      const sheet = workbook.addWorksheet('Transactions');
      const columns = [
        { header: 'Date', key: 'transactionDate', width: 14 },
        { header: 'Supplier', key: 'supplierName', width: 30 },
        { header: 'Type', key: 'transactionType', width: 14 },
        { header: 'Method', key: 'paymentMethod', width: 14 },
        { header: 'Reference', key: 'referenceNo', width: 18 },
        { header: 'Amount', key: 'amount', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.transactions.map((row) => ({
        transactionDate: toDateString(row.transactionDate),
        supplierName: row.supplier?.name || '',
        transactionType: titleCase(row.transactionType),
        paymentMethod: titleCase(row.paymentMethod),
        referenceNo: row.referenceNo || '',
        amount: money(row.amount),
      })));
      addTotalsRow(sheet, columns, {
        transactionDate: 'TOTAL',
        amount: report.data.transactions.reduce((sum, row) => sum + money(row.amount), 0),
      });
    }

    const summarySheet = workbook.addWorksheet('Balances');
    const summaryColumns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 24, type: 'currency', align: 'right' },
    ];
    setWorksheetColumns(summarySheet, summaryColumns);
    appendRows(summarySheet, summaryColumns, [
      { metric: 'Total Suppliers', value: money(report.data.balances.totalSuppliers) },
      { metric: 'Active Suppliers', value: money(report.data.balances.activeSuppliers) },
      { metric: 'Outstanding Debt', value: money(report.data.balances.totalDebt) },
      { metric: 'Supplier Credit', value: money(report.data.balances.totalCredit) },
    ]);
  }

  if (report.module === 'payroll') {
    if (report.data.periods.length) {
      const sheet = workbook.addWorksheet('Periods');
      const columns = [
        { header: 'ID', key: 'id', width: 10, type: 'integer', align: 'right' },
        { header: 'Mode', key: 'payrollMode', width: 14 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Description', key: 'description', width: 28 },
        { header: 'Entries', key: 'entryCount', width: 12, type: 'integer', align: 'right' },
        { header: 'Gross', key: 'totalGrossPay', width: 16, type: 'currency', align: 'right' },
        { header: 'Deductions', key: 'totalDeductions', width: 16, type: 'currency', align: 'right' },
        { header: 'Net', key: 'totalNetPay', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.periods);
    }

    if (report.data.entries.length) {
      const sheet = workbook.addWorksheet('Entries');
      const columns = [
        { header: 'Employee No', key: 'employeeNo', width: 14 },
        { header: 'Employee Name', key: 'employeeName', width: 30 },
        { header: 'Basic Salary', key: 'basicSalary', width: 16, type: 'currency', align: 'right' },
        { header: 'Gross Pay', key: 'grossPay', width: 16, type: 'currency', align: 'right' },
        { header: 'Deductions', key: 'totalDeductions', width: 16, type: 'currency', align: 'right' },
        { header: 'Net Pay', key: 'netPay', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.entries.map((row) => ({
        employeeNo: row.employee?.employeeNo || '',
        employeeName: `${row.employee?.firstName || ''} ${row.employee?.surname || ''}`.trim(),
        basicSalary: money(row.basicSalary),
        grossPay: money(row.grossPay),
        totalDeductions: money(row.totalDeductions),
        netPay: money(row.netPay),
      })));
      addTotalsRow(sheet, columns, {
        employeeNo: 'TOTAL',
        grossPay: money(report.data.totals.grossPay),
        totalDeductions: money(report.data.totals.deductions),
        netPay: money(report.data.totals.netPay),
      });
    }
  }

  if (report.module === 'monthly-summary') {
    const summarySheet = workbook.addWorksheet('Summary');
    const columns = [
      { header: 'Metric', key: 'metric', width: 34 },
      { header: 'Amount', key: 'value', width: 22, type: 'currency', align: 'right' },
    ];
    setWorksheetColumns(summarySheet, columns);
    appendRows(summarySheet, columns, [
      { metric: 'Sales', value: money(report.data.salesTotal) },
      { metric: 'Expenses', value: money(report.data.expensesTotal) },
      { metric: 'Payroll', value: money(report.data.payrollTotal) },
      { metric: 'Supplier Payments', value: money(report.data.supplierPaymentTotal) },
      { metric: 'Supplier Debt', value: money(report.data.supplierDebtTotal) },
      { metric: 'Net Position', value: money(report.data.netPosition) },
    ]);

    if (report.data.paymentRows?.length) {
      const paymentSheet = workbook.addWorksheet('Sales Payments');
      const paymentColumns = [
        { header: 'Method', key: 'payMethod', width: 22 },
        { header: 'Invoice Count', key: 'invoiceCount', width: 14, type: 'integer', align: 'right' },
        { header: 'Amount', key: 'totalAmount', width: 18, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(paymentSheet, paymentColumns);
      appendRows(paymentSheet, paymentColumns, report.data.paymentRows);
    }
  }

  if (report.module === 'employees') {
    const sheet = workbook.addWorksheet('Employees');
    const columns = [
      { header: 'Employee No', key: 'employeeNo', width: 16 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Position', key: 'position', width: 20 },
      { header: 'Contact', key: 'contactNumber', width: 18 },
      { header: 'Current Salary', key: 'currentSalary', width: 16, type: 'currency', align: 'right' },
    ];
    setWorksheetColumns(sheet, columns);
    appendRows(sheet, columns, report.data.employees.map((row) => ({
      employeeNo: row.employeeNo || '',
      name: `${row.firstName || ''} ${row.surname || ''}`.trim(),
      status: row.status || '',
      department: row.department || '',
      position: row.position || '',
      contactNumber: row.contactNumber || '',
      currentSalary: money(row.salaryStructures?.[0]?.agreedSalaryPerMonth || 0),
    })));
  }

  return workbook.xlsx.writeBuffer();
}

async function buildPdfBuffer(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawPdfHeader(doc, report.title, `${titleCase(report.module)} • ${titleCase(report.type || 'summary')}`);

    if (report.module === 'sales' && report.data.summary) {
      drawPdfSectionTitle(doc, 'Sales Summary');
      drawPdfKeyValues(doc, [
        { label: 'Date Range', value: `${report.dateRange.startDate} to ${report.dateRange.endDate}` },
        { label: 'Total Invoices', value: Number(report.data.summary.totalInvoices || 0).toLocaleString('en-US') },
        { label: 'Net Sales', value: `MWK ${Number(report.data.summary.netSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
        { label: 'Gross Sales', value: `MWK ${Number(report.data.summary.grossSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      ]);
    }

    if (report.module === 'sales' && report.data.invoices.length) {
      drawPdfSectionTitle(doc, 'Invoices');
      const rows = report.data.invoices.map((row) => ({
        invoiceDate: toDateString(row.invoiceDate),
        invoiceNo: row.sourceInvoiceNo || row.refNo || String(row.id),
        userName: row.userName || '',
        netSale: `MWK ${Number(row.netSale || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      }));
      drawPdfTable(doc, [
        { header: 'Date', key: 'invoiceDate', weight: 1 },
        { header: 'Invoice', key: 'invoiceNo', weight: 1.8 },
        { header: 'Cashier', key: 'userName', weight: 1.5 },
        { header: 'Net Sale', key: 'netSale', weight: 1.4 },
      ], rows);
    }

    if (report.module === 'expenses') {
      drawPdfSectionTitle(doc, 'Expense Totals');
      drawPdfKeyValues(doc, [
        { label: 'Total Expenses', value: Number(report.data.summary?.totals?.totalExpenses || 0).toLocaleString('en-US') },
        { label: 'Total Amount', value: `MWK ${Number(report.data.summary?.totals?.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
        { label: 'Average Amount', value: `MWK ${Number(report.data.summary?.totals?.averageAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      ]);

      if (report.data.expenses.length) {
        drawPdfSectionTitle(doc, 'Expense List');
        const rows = report.data.expenses.map((row) => ({
          expenseDate: toDateString(row.expenseDate),
          category: row.expenseCategory?.name || '',
          description: row.description || '',
          amount: `MWK ${Number(row.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        }));

        drawPdfTable(doc, [
          { header: 'Date', key: 'expenseDate', weight: 1 },
          { header: 'Category', key: 'category', weight: 1.2 },
          { header: 'Description', key: 'description', weight: 2.1 },
          { header: 'Amount', key: 'amount', weight: 1.1 },
        ], rows);
      }
    }

    if (report.module === 'suppliers') {
      drawPdfSectionTitle(doc, 'Supplier Balances');
      drawPdfKeyValues(doc, [
        { label: 'Total Suppliers', value: Number(report.data.balances.totalSuppliers || 0).toLocaleString('en-US') },
        { label: 'Active Suppliers', value: Number(report.data.balances.activeSuppliers || 0).toLocaleString('en-US') },
        { label: 'Outstanding Debt', value: `MWK ${Number(report.data.balances.totalDebt || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
        { label: 'Supplier Credit', value: `MWK ${Number(report.data.balances.totalCredit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      ]);

      if (report.data.transactions.length) {
        drawPdfSectionTitle(doc, 'Supplier Transactions');
        const rows = report.data.transactions.map((row) => ({
          transactionDate: toDateString(row.transactionDate),
          supplierName: row.supplier?.name || '',
          transactionType: titleCase(row.transactionType),
          amount: `MWK ${Number(row.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        }));

        drawPdfTable(doc, [
          { header: 'Date', key: 'transactionDate', weight: 1 },
          { header: 'Supplier', key: 'supplierName', weight: 1.7 },
          { header: 'Type', key: 'transactionType', weight: 1 },
          { header: 'Amount', key: 'amount', weight: 1.2 },
        ], rows);
      }
    }

    if (report.module === 'payroll') {
      drawPdfSectionTitle(doc, 'Payroll Totals');
      drawPdfKeyValues(doc, [
        { label: 'Employees', value: Number(report.data.totals.employeeCount || 0).toLocaleString('en-US') },
        { label: 'Gross Pay', value: `MWK ${Number(report.data.totals.grossPay || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
        { label: 'Deductions', value: `MWK ${Number(report.data.totals.deductions || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
        { label: 'Net Pay', value: `MWK ${Number(report.data.totals.netPay || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      ]);

      if (report.data.entries.length) {
        drawPdfSectionTitle(doc, 'Payroll Entries');
        const rows = report.data.entries.map((row) => ({
          employeeName: `${row.employee?.firstName || ''} ${row.employee?.surname || ''}`.trim(),
          grossPay: `MWK ${Number(row.grossPay || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          deductions: `MWK ${Number(row.totalDeductions || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          netPay: `MWK ${Number(row.netPay || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        }));

        drawPdfTable(doc, [
          { header: 'Employee', key: 'employeeName', weight: 1.8 },
          { header: 'Gross', key: 'grossPay', weight: 1.1 },
          { header: 'Deductions', key: 'deductions', weight: 1.1 },
          { header: 'Net', key: 'netPay', weight: 1.1 },
        ], rows);
      }
    }

    if (report.module === 'monthly-summary') {
      drawPdfSectionTitle(doc, 'Monthly Summary');
      drawPdfKeyValues(doc, [
        { label: 'Range', value: `${report.range.startDate} to ${report.range.endDate}` },
        { label: 'Sales', value: `MWK ${Number(report.data.salesTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
        { label: 'Expenses', value: `MWK ${Number(report.data.expensesTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
        { label: 'Payroll', value: `MWK ${Number(report.data.payrollTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
        { label: 'Supplier Payments', value: `MWK ${Number(report.data.supplierPaymentTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
        { label: 'Net Position', value: `MWK ${Number(report.data.netPosition || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      ]);
    }

    if (report.module === 'employees') {
      drawPdfSectionTitle(doc, 'Employee Register');
      const rows = report.data.employees.map((row) => ({
        employeeNo: row.employeeNo || '-',
        name: `${row.firstName || ''} ${row.surname || ''}`.trim(),
        status: titleCase(row.status),
        department: row.department || '-',
      }));
      drawPdfTable(doc, [
        { header: 'Employee No', key: 'employeeNo', weight: 1.2 },
        { header: 'Name', key: 'name', weight: 2 },
        { header: 'Status', key: 'status', weight: 1 },
        { header: 'Department', key: 'department', weight: 1.4 },
      ], rows);
    }

    doc
      .fontSize(8)
      .fillColor('#6B7280')
      .text(`Generated by ${COMPANY_NAME} Business Operations`, 50, doc.page.height - 30);

    doc.end();
  });
}

function createFileName(moduleName, type, format, filters = {}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');

  if (filters.month && filters.year) {
    return `${sanitizeFilePart(moduleName)}_${sanitizeFilePart(type || 'report')}_${filters.year}_${String(filters.month).padStart(2, '0')}.${format}`;
  }

  return `${sanitizeFilePart(moduleName)}_${sanitizeFilePart(type || 'report')}_${y}_${m}.${format}`;
}

async function generateReportExport({ module: moduleName, type, filters = {}, format }) {
  const safeModule = sanitizeFilePart(moduleName);
  const safeType = sanitizeFilePart(type || 'summary');

  const report = await getReportData(moduleName, type || 'summary', filters);
  const fileName = createFileName(safeModule, safeType, format, filters);

  if (format === 'excel') {
    const buffer = await buildExcelBuffer(report);
    return {
      fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    };
  }

  if (format === 'pdf') {
    const buffer = await buildPdfBuffer(report);
    return {
      fileName,
      mimeType: 'application/pdf',
      buffer,
    };
  }

  throw new Error(`Unsupported export format: ${format}`);
}

module.exports = {
  generateReportExport,
};
